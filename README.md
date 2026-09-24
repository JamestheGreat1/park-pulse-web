# ParkPulse

Less refreshing. More riding.

ParkPulse is basically the Walt Disney World app I wanted while actually in the parks: open it, see what's worth riding, watch a few favorites, and get on with your day.

A short wait isn't always a good wait. And standing around refreshing Space Mountain every two minutes is not exactly the vacation plan.

**[Open ParkPulse](https://app.useparkpulse.com/) · [Visit the site](https://useparkpulse.com/) · Version 1.7.1**

## The useful stuff

- **Live waits and ride status** for Magic Kingdom, EPCOT, Hollywood Studios, and Animal Kingdom.
- **Best Now** compares a ride's current wait with what's typical for that ride around the same time of day. A 45-minute wait might actually be a pretty good deal.
- **Wait comparison badges** call out waits that are lower or higher than typical, when enough history is available. Green means a better-than-typical wait; amber and red flag busier conditions.
- **Favorites without the buzzing.** Star rides to save them, then use the Favorites filter. No notification permission needed.
- **For me** puts your must-dos and favorites first among fresh, open rides, then compares waits with normal. Best Now keeps its usual ranking.
- **Shared wait history** lets you check today, the past 7 days, or the past 30 days on a ride’s page. Each dot is a collected wait, not a prediction.
- **Smart watches** let you follow a ride for a reopening, a wait-time target, or both. Background push alerts can reach you with the app closed.
- **Crowd pressure at a glance:** a compact ten-segment meter, a 1–10 rating, and a trend when available. See whether waits are building, holding steady, or easing off.
- **Useful park context:** today's hours, closing countdowns, same-day ticketed events, and observed downtime for rides reported as temporarily down.
- **Made for your screen.** A compact phone layout, a wider desktop view, light/dark/system appearance, and six accent colors.

There's also pull-to-refresh on mobile, ride sharing, a quick first-run explanation, and an update prompt when a new version is ready. No giant itinerary planner. Just the stuff that helps you decide what to do next.

## Get started

### 1. Open it—or add it to your Home Screen

You can browse waits right away at **[app.useparkpulse.com](https://app.useparkpulse.com/)**.

For the app experience:

- **iPhone / iPad:** open the link in Safari, tap **Share → Add to Home Screen**, then launch it from that new icon. Use the installed Home Screen app for push notifications.
- **Android:** open the link in a supported browser such as Chrome, then choose **Install app / Add to Home screen** from the browser menu. You can also use the install option in ParkPulse Settings when available.
- **Desktop:** open the link in your browser. The layout adapts automatically; installation is optional where your browser supports it.

Want alerts? Open **Settings**, enable **Push notifications**, and allow notifications when prompted.

### 2. Pick a park and find your next ride

Choose **MK**, **EPCOT**, **DHS**, or **AK** at the top. Leave the sort on **Best Now** to find waits that look good compared with that attraction's usual wait.

For example, **↓ 24% vs typical** means the posted wait is 24% lower than the historical comparison. An upward badge means it's higher. These are comparisons, not promises about how long you'll actually stand in line.

Prefer the basics? Switch to **Lowest wait** or **A–Z**, search for a ride, or use **Open only**.

Tap the star to save a favorite. Want to prioritize a ride? Open its page, enable **Must-do ride**, then choose **For me** in the sort menu. Favorites and must-dos stay on this browser; they don’t create alerts or sync to your iPhone app.

On mobile, pull down from the very top and release to refresh. Your watches stay put.

### 3. Watch what matters

Tap a ride and choose either or both:

- Notify when it reopens.
- Notify when its wait drops to or below your target.

Choose **Today**, **3 hours**, or **Until disabled**, then tap **Start watching**. Check Settings to make sure your watches have synced.

Say Space Mountain is down, but you'd also ride it at 40 minutes or less. Enable the reopening alert, set a 40-minute target, and choose Today. Once notifications are enabled and the watch is synced, you can close the app and go do literally anything else.

The **Watching** tab keeps your watches together. Open one to edit it or remove it when you're done. Temporary watches expire automatically, and editing a target keeps the existing deadline unless you change the duration.

## Reading the crowd meter

The filled segments show the park's **1–10 crowd-pressure rating**:

| Rating | Label |
| --- | --- |
| 1–2 | Very Light |
| 3–4 | Light |
| 5–6 | Moderate |
| 7–8 | Busy |
| 9 | Very Busy |
| 10 | Extremely Busy |

When a trend is available, **↗ Building**, **→ Steady**, or **↘ Easing** tells you which way waits are moving. The quieter line underneath compares waits with typical conditions. Expand **About this estimate** to see how many rides contributed.

This is an estimate based on wait times—not a count of people in the park. A low rating doesn't mean every ride has a short line.

The meter stays hidden outside the park's current operating hours, or when current hours aren't available. If reliable ride history is still building, you'll see that instead of a made-up number. Normal-day crowd estimates also pause during active ticketed events.

## Make it yours

Head to **Settings → Customization**:

- **Appearance:** System, Dark, or Light.
- **Accent:** Blue, Cyan, Violet, Pink, Orange, or Green.

Pick your color and call it a day. The glass styling, highlights, and controls follow along; crowd and wait warnings keep their meaning.

## A few things worth knowing

**Notifications aren't instant.** The backend checks rides on a five-minute schedule, and alerts also depend on the source data updating and your device delivering the push. A watch alerts on a qualifying change; saving one isn't a promise of an immediate notification.

**Check the ride alert engine too.** Settings shows when the scheduled evaluator last checked rides. “Running” confirms recent checks; it doesn’t guarantee a particular ride will trigger an alert.

**“Send test” checks delivery to your device.** It doesn't test a real ride transition. Make sure Settings also says your watches have synced. Pending watch changes retry while the app is open and online.

**Offline means last-known data.** After a successful load, ParkPulse can reopen its cached app and saved ride data. It can't fetch new waits without a connection. Reopen online to sync any watch changes you made offline.

**“Stale” means the data is too old to trust as live.** “Down 22m” means ParkPulse has observed the current reported downtime for about 22 minutes—not necessarily the exact moment the ride stopped.

**New phone or reinstall?** Enable notifications again on that installation. Accept the app's update prompt when a new version is ready.

## Data and project info

ParkPulse uses [ThemeParks.wiki](https://www.themeparks.wiki/) as its primary live source and [Queue-Times](https://queue-times.com/) as a fallback. Historical comparisons need enough usable data, so some rides may take longer to show insights.

Looking for backend setup or deployment instructions? See the [Worker README](worker/README.md). Release changes live in the [changelog](CHANGELOG.md).

ParkPulse is an independent project and is not affiliated with or endorsed by Disney.
