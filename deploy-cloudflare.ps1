[CmdletBinding()]
param(
    [switch]$SkipGitPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$WorkerDir = Join-Path $RepoRoot "worker"
$WranglerConfig = Join-Path $WorkerDir "wrangler.toml"
$FrontendConfig = Join-Path $RepoRoot "assets\js\config.js"
$VapidKeyFile = Join-Path $RepoRoot ".parkpulse-vapid-keys.json"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-LastCommand([string]$Label) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' was not found. Install Node.js LTS and Git, then run this script again."
    }
}

function New-UrlSafeToken([int]$ByteCount = 32) {
    $Bytes = New-Object byte[] $ByteCount
    $Generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $Generator.GetBytes($Bytes)
    }
    finally {
        $Generator.Dispose()
    }

    return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Read-ParkPulseDatabase {
    $Json = (& npx wrangler d1 list --json 2>$null | Out-String)
    Assert-LastCommand "Reading Cloudflare D1 databases"
    if ([string]::IsNullOrWhiteSpace($Json)) {
        return $null
    }

    $Parsed = $Json | ConvertFrom-Json
    $Databases = @()

    if ($null -eq $Parsed) {
        return $null
    }
    elseif ($Parsed -is [array]) {
        $Databases = @($Parsed)
    }
    elseif ($Parsed.PSObject.Properties.Name -contains "result") {
        $Databases = @($Parsed.result)
    }
    elseif ($Parsed.PSObject.Properties.Name -contains "databases") {
        $Databases = @($Parsed.databases)
    }
    elseif ($Parsed.PSObject.Properties.Name -contains "name") {
        $Databases = @($Parsed)
    }

    foreach ($Database in $Databases) {
        if (
            $null -ne $Database -and
            $Database.PSObject.Properties.Name -contains "name" -and
            [string]$Database.name -eq "parkpulse"
        ) {
            return $Database
        }
    }

    return $null
}

Require-Command "node"
Require-Command "npm"
Require-Command "npx"
Require-Command "git"

if (-not (Test-Path $WranglerConfig)) {
    throw "Run this script from the ParkPulse repository root. worker\wrangler.toml is missing."
}

Push-Location $WorkerDir
try {
    Write-Step "Installing the Worker dependencies"
    & npm install
    Assert-LastCommand "npm install"

    Write-Step "Checking Cloudflare authorization"
    $WhoAmI = (& npx wrangler whoami 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $WhoAmI -match "not authenticated") {
        Write-Host "Your normal browser will open. Sign into Cloudflare and approve Wrangler." -ForegroundColor Yellow
        & npx wrangler login
        Assert-LastCommand "Cloudflare login"
    }
    else {
        Write-Host $WhoAmI.Trim()
    }

    Write-Step "Creating or reusing the ParkPulse D1 database"
    $Database = Read-ParkPulseDatabase
    if ($null -eq $Database) {
        & npx wrangler d1 create parkpulse
        Assert-LastCommand "Creating the ParkPulse D1 database"
        $Database = Read-ParkPulseDatabase
    }

    if ($null -eq $Database) {
        throw "Cloudflare did not return the ParkPulse D1 database after creation."
    }

    $DatabaseId = if ($Database.PSObject.Properties.Name -contains "uuid") {
        [string]$Database.uuid
    }
    elseif ($Database.PSObject.Properties.Name -contains "id") {
        [string]$Database.id
    }
    else {
        throw "Cloudflare returned the database without an ID."
    }

    $Toml = [IO.File]::ReadAllText($WranglerConfig)
    $Toml = [regex]::Replace(
        $Toml,
        '(?m)^database_id\s*=\s*"[^"]*"',
        "database_id = `"$DatabaseId`""
    )

    Write-Step "Loading or generating the VAPID key pair used for Web Push"
    if (Test-Path $VapidKeyFile) {
        $SavedKeys = [IO.File]::ReadAllText($VapidKeyFile) | ConvertFrom-Json
        $PublicKey = [string]$SavedKeys.publicKey
        $PrivateKey = [string]$SavedKeys.privateKey
    }
    else {
        $VapidOutput = @(& node .\scripts\generate-vapid.mjs)
        Assert-LastCommand "Generating VAPID keys"
        $PublicLine = $VapidOutput | Where-Object { $_ -like "VAPID_SERVER_PUBLIC_KEY=*" } | Select-Object -First 1
        $PrivateLine = $VapidOutput | Where-Object { $_ -like "VAPID_SERVER_PRIVATE_KEY=*" } | Select-Object -First 1
        if (-not $PublicLine -or -not $PrivateLine) {
            throw "The VAPID generator did not return both keys."
        }

        $PublicKey = $PublicLine.Substring("VAPID_SERVER_PUBLIC_KEY=".Length)
        $PrivateKey = $PrivateLine.Substring("VAPID_SERVER_PRIVATE_KEY=".Length)
        $SavedKeys = @{
            publicKey = $PublicKey
            privateKey = $PrivateKey
        } | ConvertTo-Json -Compress
        [IO.File]::WriteAllText($VapidKeyFile, $SavedKeys + [Environment]::NewLine, $Utf8NoBom)
    }

    if ([string]::IsNullOrWhiteSpace($PublicKey) -or [string]::IsNullOrWhiteSpace($PrivateKey)) {
        throw "The saved VAPID key file is incomplete. Delete .parkpulse-vapid-keys.json and run the script again."
    }
    $Toml = [regex]::Replace(
        $Toml,
        '(?m)^VAPID_SERVER_PUBLIC_KEY\s*=\s*"[^"]*"',
        "VAPID_SERVER_PUBLIC_KEY = `"$PublicKey`""
    )
    [IO.File]::WriteAllText($WranglerConfig, $Toml, $Utf8NoBom)

    Write-Step "Creating the D1 tables"
    & npx wrangler d1 execute parkpulse --remote --file=.\schema.sql
    Assert-LastCommand "Applying the D1 schema"

    Write-Step "Deploying the ParkPulse Worker and its secrets"

    $SecretFile = [IO.Path]::GetTempFileName()
    try {
        $SecretJson = @{
            VAPID_SERVER_PRIVATE_KEY = $PrivateKey
        } | ConvertTo-Json -Compress
        [IO.File]::WriteAllText($SecretFile, $SecretJson, $Utf8NoBom)

        $DeployLines = @(& npx wrangler deploy --secrets-file $SecretFile 2>&1)
        $DeployLines | ForEach-Object { Write-Host $_ }
        Assert-LastCommand "Deploying the Worker"
        $DeployText = $DeployLines | Out-String
    }
    finally {
        if (Test-Path $SecretFile) {
            Remove-Item -Force $SecretFile
        }
    }
}
finally {
    Pop-Location
}

$WorkerUrlMatch = [regex]::Match($DeployText, 'https://[A-Za-z0-9.-]+\.workers\.dev')
if ($WorkerUrlMatch.Success) {
    $WorkerUrl = $WorkerUrlMatch.Value.TrimEnd("/")
}
else {
    $WorkerUrl = (Read-Host "Paste the workers.dev URL printed by Wrangler above").Trim().TrimEnd("/")
}

if ($WorkerUrl -notmatch '^https://[A-Za-z0-9.-]+\.workers\.dev$') {
    throw "That does not look like a valid workers.dev URL: $WorkerUrl"
}

Write-Step "Connecting the GitHub Pages app to $WorkerUrl"
$ConfigText = [IO.File]::ReadAllText($FrontendConfig)
$ConfigText = [regex]::Replace(
    $ConfigText,
    'WORKER_BASE:\s*"[^"]*"',
    "WORKER_BASE: `"$WorkerUrl`""
)
[IO.File]::WriteAllText($FrontendConfig, $ConfigText, $Utf8NoBom)

Write-Step "Testing the live Worker"
$Health = $null
for ($Attempt = 1; $Attempt -le 6; $Attempt++) {
    try {
        $Health = Invoke-RestMethod -Uri "$WorkerUrl/health" -Method Get -TimeoutSec 20
        break
    }
    catch {
        if ($Attempt -eq 6) {
            throw "The Worker deployed, but its health check failed: $($_.Exception.Message)"
        }
        Start-Sleep -Seconds 2
    }
}

if (-not $Health.ok -or $Health.service -ne "parkpulse-api") {
    throw "The Worker health endpoint returned an unexpected response."
}

if (-not $Health.themeParksApiKeyConfigured) {
    throw "The Worker is online, but THEMEPARKS_API_KEY is missing. Historical baselines and crowd estimates cannot finish building until that secret is configured."
}

Write-Step "Checking ParkPulse history collection"
$Analytics = Invoke-RestMethod -Uri "$WorkerUrl/api/analytics/status" -Method Get -TimeoutSec 20
if (-not $Analytics.ok) {
    throw "The Worker is online, but the history diagnostics endpoint is not ready."
}

if ($Analytics.historyCollecting) {
    Write-Host ("History sampler: Collecting ({0} rides in the last {1} minutes; latest sample {2})" -f $Analytics.recentHistoryRides, $Analytics.historyHealthWindowMinutes, $Analytics.latestHistorySample) -ForegroundColor Green
}
elseif ($Analytics.latestHistorySample) {
    Write-Warning ("History sampler is not current. Last D1 sample: {0}. The five-minute cron may need attention." -f $Analytics.latestHistorySample)
}
else {
    Write-Warning "No D1 history samples exist yet. The Worker cron runs every five minutes; check Settings again after the first cron run."
}

Write-Host ("Trend baselines: {0}/{1} rides ready" -f $Analytics.baselineRides, $Analytics.totalRides)
if ($Analytics.errorRides -gt 0) {
    Write-Warning ("{0} historical baseline backfill jobs are currently in an error state." -f $Analytics.errorRides)
}

if (-not $SkipGitPush) {
    Write-Step "Publishing the Worker configuration to GitHub Pages"
    Push-Location $RepoRoot
    try {
        & git rev-parse --is-inside-work-tree *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "This folder is not a Git clone. Clone the GitHub repository, then run the script from that copy."
        }

        & git add -- assets/js/config.js worker/wrangler.toml
        Assert-LastCommand "Staging the deployment configuration"

        & git diff --cached --quiet
        if ($LASTEXITCODE -ne 0) {
            & git commit -m "Configure ParkPulse push backend"
            Assert-LastCommand "Committing the deployment configuration"
            & git push origin main
            Assert-LastCommand "Pushing the deployment configuration"
        }
        else {
            Write-Host "The GitHub configuration is already current."
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host ""
Write-Host "ParkPulse push deployment is complete." -ForegroundColor Green
Write-Host "Worker: $WorkerUrl"
Write-Host "PWA: https://jamesthegreat1.github.io/park-pulse-web/"
Write-Host "The reusable VAPID key pair is stored locally in .parkpulse-vapid-keys.json. Keep it private and do not commit it."
Write-Host "GitHub Pages may take a minute or two to publish the updated Worker URL."
