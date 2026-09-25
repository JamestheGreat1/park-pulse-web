# ParkPulse

**Less refreshing. More riding.**

ParkPulse is basically the Walt Disney World wait-time app I wanted while actually in the parks.

Open it, see what looks good right now, save the rides you care about, and let ParkPulse keep an eye on the rest. The whole point is to spend less time staring at wait times and more time actually doing stuff.

A short wait is not always a *good* wait. A 45-minute line can be great for one ride and terrible for another. ParkPulse tries to give that number some context.

**[Open ParkPulse](https://app.useparkpulse.com/) · [Visit the site](https://useparkpulse.com/) · Version 1.8.7**

## What ParkPulse does

- **Live waits and ride status** for Magic Kingdom, EPCOT, Hollywood Studios, and Animal Kingdom.
- **Best Now** compares the current wait with what is normally expected for that ride around the same time of day.
- **Wait comparisons** quickly show when something is running better or worse than typical.
- **Favorites** let you save rides without turning on notifications.
- **Next Up** suggests one useful open ride at a time using current waits, normal wait context, and your favorites.
- **Wait history** shows how a ride has moved today, over the past 7 days, or over the past 30 days.
- **Ride watches** can notify you when a ride reopens, hits your wait-time target, or both. Watched rides use a solid bell so they’re easy to spot at a glance.
- **Crowd pressure** gives each park a simple 1–10 estimate plus a trend when enough data is available.
- **Park context** includes today's hours, closing information, ticketed events, and observed ride downtime.
- **Customization** includes light, dark, and system themes, eight accent colors, Frosted or Liquid Glass, and optional seasonal effects.
- **Mobile-friendly controls** include pull-to-refresh and pull-down-to-close ride sheets.
- **D1-efficient diagnostics** keep backend health checks lightweight instead of repeatedly scanning the full wait-history table.

No giant vacation planner. No twenty-step setup process. Just the stuff that helps answer:

> **What should I ride next?**

## Getting started

### 1. Open ParkPulse

You can use ParkPulse right in your browser:

**[app.useparkpulse.com](https://app.useparkpulse.com/)**

You do not have to install anything just to check waits.

If you want the more app-like experience, you can add ParkPulse to your Home Screen.

**iPhone / iPad:** in ParkPulse Settings, tap **Add** for a quick two-step guide. It shows you exactly where to use Safari’s **Share → Add to Home Screen**, then you can launch ParkPulse from the new icon.

**Android:** tap **Install** in ParkPulse Settings. When the browser supports the native PWA prompt, ParkPulse opens it directly; otherwise use the browser’s **Install app / Add to Home screen** option.

**Desktop:** just open it in your browser. ParkPulse automatically uses a wider layout when it has the room.

On iPhone and iPad, the Home Screen version is also the one you should use for push notifications.

### 2. Pick a park

Choose **MK**, **EPCOT**, **DHS**, or **AK** at the top.

The default **Best Now** sort is usually the easiest place to start. Instead of only sorting by the smallest number, it asks whether a ride's current wait is actually good *for that ride*.

So if you see:

**↓ 24% vs typical**

that means the posted wait is about 24% lower than ParkPulse's comparison for that ride around this time.

That does **not** mean ParkPulse can predict exactly how long you will stand in line. It is just useful context for the posted wait.

If you want something simpler, you can switch to **Lowest wait** or **A–Z**, search for a ride, show only open rides, or combine **Favorites + Best Now** for a personalized shortlist.

### 3. Save the stuff you care about

Tap the **star** on a ride to add it to Favorites.

Favorites stay on that device and do not create notifications.

If there is something you really care about, favorite it. The **Favorites** filter keeps those rides easy to narrow down, while **Next Up** can give favorites a little extra weight when the current wait also looks good.

That keeps the personalization useful without turning ParkPulse into a spreadsheet wearing Mickey ears.

## Watching a ride

This is where ParkPulse becomes genuinely useful.

Open a ride and choose either or both:

- **Notify when it reopens**
- **Notify when the wait drops to or below your target**

Then choose how long you want ParkPulse to keep watching:

- **Today**
- **3 hours**
- **Until disabled**

Tap **Start watching**, and you are good to go.

For example, if Space Mountain is down but you would also ride it at 40 minutes or less, you can turn on the reopening alert *and* set a 40-minute target.

Then go do literally anything else.

Your active watches live in the **Watching** tab. You can open one at any time to change it or stop watching.

Temporary watches expire on their own.

## Wait history

Open a ride and scroll to **Wait history**.

You can switch between:

- **Today**
- **7 Days**
- **30 Days**

The chart shows real collected posted waits.

Continuous samples are connected so the trend is easier to read. If the ride was closed, the wait was unknown, or ParkPulse was missing data, the line breaks instead of pretending it knows what happened.

You will also see:

- **Low**
- **Average**
- **High**
- an average reference line
- time or date labels depending on the range

The goal is not to turn you into a data analyst on vacation. It is just a quick way to answer things like:

> "Has this ride actually been getting better?"

## Reading the crowd meter

ParkPulse can show a **1–10 crowd-pressure estimate** for the current park.

| Rating | What it means |
| --- | --- |
| 1–2 | Very Light |
| 3–4 | Light |
| 5–6 | Moderate |
| 7–8 | Busy |
| 9 | Very Busy |
| 10 | Extremely Busy |

When enough data is available, you may also see:

- **↗ Building** — waits are trending upward
- **→ Steady** — waits are holding pretty steady
- **↘ Easing** — waits are trending downward

This is based on ride waits, not a literal count of how many people are inside the park.

A low crowd rating also does not mean every single ride will have a short line. Cosmic Rewind can still choose violence.

ParkPulse hides the normal crowd estimate when the park is closed, when current operating hours are unavailable, or during an active ticketed event where the normal comparison would not make much sense.

If there is not enough reliable history yet, ParkPulse will say so instead of inventing a number.

## A few nice mobile things

On a phone:

- **Pull down from the top of the main screen** to refresh ride data.
- **Pull down on a ride sheet when you are already scrolled to the top** to close it.
- Ride pages are designed as bottom sheets so you can check something quickly and get back to the park list.
- The bottom navigation keeps Explore, Watching, and Settings easy to reach.

Small stuff, but it makes ParkPulse feel a lot less like "website pretending to be an app."

## Make it yours

Go to **Settings → Customization**.

You can choose:

- **Appearance:** System, Dark, or Light
- **Accent color:** Blue, Cyan, Violet, Pink, Orange, Green, Red, or Gold
- **Glass style:** Frosted or Liquid
- **Seasonal effects:** On or Off

**Frosted** is the softer, blurrier glass style. **Liquid** is clearer and more refractive, with stronger edge highlights and more of the background showing through.

In dark mode, both styles sit on a black base so the color comes from your accent instead of everything being permanently tinted blue.

Your accent changes the highlights, buttons, glow, and parts of the glass treatment while ride-status colors still keep their actual meaning.

Purely vibes. As it should be.

## Seasonal effects

ParkPulse can quietly dress itself up for a few times of year without changing how the actual ride information works.

The current automatic windows are:

- **Halloween:** October 1–31
- **Fall / Thanksgiving:** November 1 through Thanksgiving Day
- **Christmas:** the day after Thanksgiving through December 31
- **Easter:** 10 days before Easter through Easter Monday
- **Fourth of July:** July 1–5

Depending on the season, that can mean rain and distant lightning, falling leaves, snow, spring petals, or fireworks.

They are background effects only. ParkPulse does not replace meaningful open / closed / warning colors with holiday colors, and **Reduced Motion** removes the moving particle effects.

If you would rather keep ParkPulse plain year-round, turn **Seasonal effects** off in Settings.

## Push notifications

If you want ride alerts, open **Settings** and enable **Push notifications**.

Once notifications are enabled, ParkPulse can send ride alerts even while the app is closed.

There are a few things worth knowing:

**Alerts are not instant to the second.** ParkPulse checks rides on a schedule, and delivery also depends on when the source data updates and when your device receives the push.

**Make sure your watches are synced.** Settings will tell you whether push is connected and whether your watches made it to the backend.

**Send test** checks whether a notification can reach your device. It does not simulate an actual ride reopening or wait-time change.

**New phone or reinstall?** Turn notifications on again for that installation.

## If something looks weird

ParkPulse tries pretty hard not to fake certainty.

**Stale** means the latest ride data is old enough that ParkPulse no longer wants to present it as confidently live.

**Down 22m** means ParkPulse has observed that ride being reported down for about 22 minutes. It is not claiming to know the exact second the ride stopped.

If you are offline, ParkPulse may still open using its cached app and last-known ride data, but it obviously cannot pull fresh waits from the void. Once you are back online, refresh and let any pending watch changes sync.

Settings keeps the everyday health check compact with **System**, **Notifications**, **History**, and **App version**. If something seems off, open **Show diagnostics** for the Worker, data source, alert engine, and history details.

## Updates

ParkPulse checks for a new version when it opens, when you return to it, and periodically while it stays active.

When an update is ready, the in-app update banner appears. You normally should not need to fully quit the PWA just to make it notice a new version.

If an installed copy ever does seem stuck, accept the update, fully close ParkPulse, and open it again.

Release notes are kept in the **[changelog](CHANGELOG.md)**.

## Data

ParkPulse currently uses:

- **[ThemeParks.wiki](https://www.themeparks.wiki/)** for primary live ride data
- **[Queue-Times](https://queue-times.com/)** as a fallback source

Historical comparisons need enough usable data before they are worth showing, so newer or less-consistent rides may take longer to build a good baseline.

For backend setup and deployment details, see the **[Worker README](worker/README.md)**.

## About

ParkPulse is a personal independent project built because I wanted something simpler and more useful while actually walking around Walt Disney World.

It is not affiliated with, sponsored by, or endorsed by Disney.

**Less refreshing. More riding.**
