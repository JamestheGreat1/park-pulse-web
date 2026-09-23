# ParkPulse

ParkPulse is basically the Walt Disney World app I wanted while actually in the parks: open it, see what's worth riding, set a watch, and get on with your day.

No giant itinerary planner. No constantly refreshing wait times. Just the useful stuff.

**Current version: 1.6.2**

[Open ParkPulse](https://app.useparkpulse.com/)

## What ParkPulse does

- **History health diagnostics** in Settings so you can see whether five-minute samples are still coming in and how many ride baselines are ready.
- **First-run quick start** that explains Best Now and ride watches once, then gets out of the way.
- **Shareable ride links** that open the exact attraction in ParkPulse.
- **Cleaner update and recovery UX** for app updates, offline use, and failed live-data refreshes.
- **Live ride waits and statuses** for Magic Kingdom, EPCOT, Hollywood Studios, and Animal Kingdom.
- **Best Now sorting** that looks at the current wait compared with what is normal for that ride at that time of day.
- **Better-than-typical badges** like `↓ 24% vs typical` when a ride is genuinely a good deal right now.
- **Crowd levels from 1–10** based on live wait pressure across the park instead of pretending we know exact attendance.
- **Crowd trend** so you can see whether the park is `↗ building`, `→ steady`, or `↘ easing`.
- **Park hours** directly under the park name.
- **Closing countdowns** during the final few hours of the regular park day.
- **Same-day ticketed events** when the park schedule actually lists one for today.
- **Downtime duration** when a ride is explicitly reported as temporarily down.
- **Ride watches** for reopenings and/or a wait-time target.
- **Background push notifications** even when ParkPulse is closed.
- **Pull-to-refresh on mobile** — drag down from the very top and release to refresh live park data without reloading the app.
- **Temporary watches** for Today, 3 hours, or Until Disabled.
- **Freshness protection** so old data is not quietly passed off as live.
- **iPhone and Android installation** as a PWA.
- **Desktop layout** that automatically uses a wider two-column ride view, desktop navigation, and centered ride dialogs without changing the phone layout.
- **Light, dark, or system appearance** plus six accent colors: Blue, Cyan, Violet, Pink, Orange, and Green.

## How to use it

### 1. Install ParkPulse

You can use ParkPulse in a normal browser, but installing it gives you the best experience and makes background notifications much nicer.

On desktop, just open ParkPulse in your browser. The layout automatically expands for larger screens; there is nothing separate to install unless you want the PWA as a desktop app.

**iPhone / iPad**

1. Open ParkPulse in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Open ParkPulse from the new Home Screen icon.
5. Go to **Settings → Push notifications → Enable**.

Web Push on iPhone works from the installed Home Screen app.

**Android**

1. Open ParkPulse in Chrome or another supported browser.
2. Use the **Install ParkPulse** option in Settings, or choose **Install app / Add to Home screen** from the browser menu.
3. Open the installed app.
4. Go to **Settings → Push notifications → Enable**.

If your browser supports the native PWA install prompt, ParkPulse will use it automatically.

### Pull to refresh

On iPhone and Android, when you're already at the top of the page, pull down until ParkPulse says **Release to refresh**, then let go.

It refreshes the same live data as the refresh button — rides, park hours, crowd info, downtime, and ticketed-event schedule data — without reloading the whole PWA or touching your watches.

### 2. Pick a park

Use the four park buttons at the top:

- 🏰 **MK** — Magic Kingdom
- 🌐 **EPCOT**
- 🎬 **DHS** — Hollywood Studios
- 🌿 **AK** — Animal Kingdom

The park header shows today's regular hours, crowd level when enough data is available, and any separately ticketed event that is actually scheduled for the current park day.

Near closing, the hours line changes into something more useful, like:

> **Closes in 2h 18m · 9:00 AM–10:00 PM**

### 3. Find what's worth riding

The default sort is **Best Now**.

Instead of only asking “what has the shortest wait?”, ParkPulse compares each ride with its own normal wait for that time of day.

So a 45-minute wait can still be a great option if that ride is usually 70 minutes right now.

When the data is strong enough, you may see:

> **↓ 24% vs typical**

That means the current posted wait is meaningfully better than the ride's historical baseline for this time of day.

You can also sort by:

- **Lowest wait**
- **A–Z**

And **Open only** hides rides that are not currently operating.

### 4. Read the crowd level

ParkPulse crowd levels run from **1–10**:

| Level | What it means |
| --- | --- |
| 1–2 | Very Light |
| 3–4 | Light |
| 5–6 | Moderate |
| 7–8 | Busy |
| 9 | Very Busy |
| 10 | Extremely Busy |

You may also see:

- **↗ building** — waits are getting busier
- **→ steady** — overall pressure is about the same
- **↘ easing** — waits are trending down

The crowd level is a **ParkPulse wait-pressure estimate**, not an attendance count. It compares fresh operating rides with what is typical for those same rides at the current time of day.

If there is not enough reliable history yet, ParkPulse will simply say the crowd estimate is still building.

During an active separately ticketed event, the normal-day crowd estimate pauses instead of comparing party waits with a normal park day.

### 5. Watch a ride

Tap any ride to open its details.

You can turn on either or both of these:

- **Notify when it reopens**
- **Notify when the wait drops to or below your target**

Then choose how long you want the watch to last:

- **Today**
- **3 hours**
- **Until disabled**

Tap **Start watching** and you're done.

ParkPulse keeps checking from the backend, so you do **not** need to leave the app open.

A good example:

> Space Mountain is down, but I'd ride it at 40 minutes or less.

Turn on **reopening**, set the wait target to **40 min**, choose **Today**, and close ParkPulse. It'll handle the rest.

### 6. Check your watches

The **Watching** tab shows everything you're currently monitoring.

From there you can:

- see the latest ride state
- open a ride to change the alert
- remove a watch
- see how long a temporary watch has left

Expired temporary watches clean themselves up automatically.

### 7. Customize ParkPulse

Go to **Settings → Customization**.

You can choose:

**Appearance**
- System
- Dark
- Light

**Accent color**
- Blue
- Cyan
- Violet
- Pink
- Orange
- Green

The accent changes the highlights, controls, glow, and general Liquid Glass vibe without changing how the app works.

## A few useful labels

**Down 22m**  
The ride is explicitly being reported as temporarily down, and ParkPulse has seen the current downtime for about 22 minutes.

**Stale**  
Neither live source currently has fresh enough data for that ride. ParkPulse may show the last known state, but it clearly marks it as stale instead of pretending it is current.

**Open**  
The ride is operating, but there is not a useful numeric standby wait to show.

**↓ X% vs typical**  
The current wait is lower than ParkPulse's historical expectation for that ride at this time.

**Crowd estimate building**  
There are not enough mature ride baselines available right now to give you a crowd number that ParkPulse actually trusts.

## Notifications

Once push notifications are enabled, ParkPulse can send alerts for your watches while the PWA is closed.

There is a **Send test** button in Settings if you want to make sure everything is working before relying on it in the park.

If you change phones or reinstall the PWA, enable notifications again on the new installation.

## The basic idea

If you only remember three things:

1. Leave the ride list on **Best Now**.
2. Watch anything you really want to ride.
3. Let ParkPulse tell you when the timing gets better.

That's pretty much the whole point.

## Data

ParkPulse uses [ThemeParks.wiki](https://www.themeparks.wiki/) as its primary live source and [Queue-Times](https://queue-times.com/) as a fallback.

A fresh fallback result is treated as normal live data. ParkPulse only marks a ride stale when neither source can provide something fresh enough to trust.

ParkPulse is an independent project and is not affiliated with or endorsed by Disney.
