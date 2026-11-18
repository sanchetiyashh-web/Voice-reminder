# Platform decision

## Comparison

| Requirement | Native iOS app (SwiftUI) | PWA / mobile website |
|---|---|---|
| **Listening accuracy** | Apple Speech framework (`SFSpeechRecognizer`) with explicit `en-IN` and `hi-IN` locales, live partial results, on-device mode where the locale supports it, punctuation, contextual hints. The app — not the recognizer — decides when to stop, so thinking pauses don't end the recording. | Safari's `webkitSpeechRecognition` is unreliable in installed (home-screen) PWAs, gives little control over locale/on-device mode, and tends to stop on pauses. The alternative (uploading audio to Whisper etc.) needs a paid or self-hosted server. |
| **Understanding** | Same engine either way (deterministic, on-device JavaScript run through Apple's JavaScriptCore). | Same. |
| **Calendar** | **EventKit** writes straight into the iPhone Calendar (iCloud, Google or Outlook calendars already on the phone). The app can read the event back to update or reschedule it. | No browser calendar API. Options: an `.ics` download (manual import every time, can't update) or the Google Calendar API (OAuth plus a Google account, and it only appears on the iPhone if that account syncs). |
| **Reminders** | Local notifications (`UNUserNotificationCenter`) and Calendar alarms (`EKAlarm`). The OS delivers them with the app closed, offline, no server. | Web Push works only for home-screen PWAs (iOS 16.4+). Scheduled pushes need an always-on server with a scheduler and a stored push subscription. Delivery needs internet. |
| **Free use** | $0 at runtime: no server, no API keys. **Conflict:** installing a self-built app without the $99/yr Apple Developer Program means a free Apple ID signature that **expires every 7 days** and must be refreshed. Building needs macOS, provided free by a GitHub Actions macOS runner if you have no Mac. | Free hosting tiers (Cloudflare/GitHub Pages) plus a free scheduler. Free tiers change, and there are more accounts to manage. |
| **Install effort** | One-time: GitHub account + Sideloadly/AltStore on Windows + Developer Mode on the iPhone. Then a weekly refresh (AltStore can do it automatically over Wi-Fi). | Easiest: open URL → Add to Home Screen. |

## Decision: native iOS app

Native wins clearly on your top two priorities (listening, plus calendar and reminder reliability). The web option fails "reminders must not depend on a browser tab" unless you run a server, and it has no real iPhone Calendar integration.

**The one free-use conflict.** Apple only lets free Apple IDs sign apps for 7 days (max 3 sideloaded apps, 10 app IDs per 7 days). Closest free workaround:
- **AltStore + AltServer on your Windows PC** refreshes the app automatically in the background when your iPhone and PC are on the same Wi-Fi, or
- **Sideloadly**: re-install manually once a week (about 1 minute). Your data is kept on refresh. If the app expires, data stays on the phone and returns after re-signing; only an uninstall deletes it.

The only paid way to remove the 7-day limit is the Apple Developer Program ($99/year, 1-year signing, TestFlight). It is **not required**.

## Everything you need (all free)

| Item | Why | Cost |
|---|---|---|
| iPhone running iOS 17 or newer | EventKit full-access API, modern Speech | — |
| Apple ID (your normal one) | Free signing | Free |
| GitHub account | Free macOS build runner (public repo: free; private repo: 2,000 free min/month, macOS minutes count 10×, so ≈200 macOS min ≈ 20+ builds) | Free |
| Windows PC + USB cable | Sideloadly/AltServer to install and refresh | Free |
| *Optional* Mac with Xcode | Build and run directly instead of GitHub Actions | Free (same 7-day limit) |

No AI API keys, no server, no subscriptions, no payment card.
