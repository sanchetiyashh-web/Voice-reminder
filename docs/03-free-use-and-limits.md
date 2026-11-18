# Free use: costs, accounts and limits

## Ongoing cost: ₹0

| Part | Where it runs | Cost |
|---|---|---|
| Speech-to-text | Apple Speech framework, **on your iPhone** | Free |
| Marathi / mixed speech | Whisper (OpenAI, MIT) via WhisperKit (MIT), **on your iPhone** | Free; one-time model download (216 or 547 MB) from Hugging Face, no account needed |
| Understanding | Bundled JavaScript run by Apple's JavaScriptCore, **on your iPhone** | Free, no network |
| Storage | JSON file in the app's private folder on your iPhone | Free |
| Calendar | EventKit → your existing Calendar (iCloud/Google/Outlook) | Free |
| Reminders/alerts | iOS local notifications or Calendar alarms | Free, work offline with the app closed |
| Hosting/servers | None | — |
| AI APIs | None | — |
| Building | GitHub Actions macOS runner | Free (limits below) |
| Installing | Sideloadly or AltStore + your free Apple ID | Free |

No payment card, no subscription, no trial.

## Accounts and equipment
- iPhone on **iOS 17 or later**
- Free **Apple ID**: your normal one is fine. You type its password into Sideloadly/AltStore yourself; this app never sees it.
- Free **GitHub** account
- **Windows PC** (you have one) plus a USB cable for the first install
- Optional: a Mac, to build in Xcode instead of GitHub

## Free-tier limits (as of Nov 2026; providers can change these)
| Limit | Effect |
|---|---|
| **Free Apple ID signing expires after 7 days** | The app stops opening until re-signed. Re-sign weekly with Sideloadly (about 1 min) or let AltStore/AltServer refresh it automatically over Wi-Fi. **Your data is kept**; only deleting the app deletes it. |
| Free Apple ID: max 3 sideloaded apps at once, 10 new app IDs per 7 days | Only matters if you sideload other apps too |
| iPhone must have **Developer Mode** on (iOS 16+) | One-time toggle in Settings › Privacy & Security |
| GitHub Actions | Public repo: free minutes. Private repo: 2,000 min/month, and macOS minutes count 10×, so about 200 macOS minutes, or about 20 builds. You only rebuild when the code changes. |
| iOS local notifications | Max **64 pending** per app. Plenty for personal use, but more than ~60 future reminders at once won't all be scheduled. Calendar alarms (the default for appointments) don't count against this. |
| Siri "Add to Voice Planner" | Siri does that dictation itself, possibly on Apple's servers, depending on your Siri settings |

## The one conflict with "free"
Apple only allows a permanent install (TestFlight or 1-year signing) through the **Apple Developer Program at $99/year**. Free alternatives all carry the 7-day re-sign. **Closest free option:** AltStore with AltServer running on your PC, which refreshes automatically whenever the iPhone and PC share Wi-Fi. Only consider the paid program if weekly refreshing becomes a nuisance. Nothing in the app depends on it.

## Feature limits (honest list)
- **Repeating reminders** ("every day") are not supported. The app saves them once and tells you.
- **No background or always-on listening, no custom wake word, no recording from the locked screen.** These are iOS restrictions. Use the mic button, Siri, the Action button, Back Tap or a Control Center shortcut.
- **Languages.** Speech: English (India) and Hindi via Apple (live). Apple has no Marathi recognizer, so **Marathi and Mixed/auto-detect use on-device Whisper** (see below). Understanding covers English, Hindi and Marathi in Roman or Devanagari script, mixed in one sentence. Apple's recognizer listens in one language at a time; switch with the globe button.
- Voice **edits** ("move my appointment…", "cancel…") are understood in English only.
- **Whisper (Marathi/Mixed):** no live text, the transcript appears after you stop (expect a few seconds; longer on older iPhones and with *Large*). It needs 216–547 MB of storage (excluded from iCloud backup) and noticeable memory while transcribing. The first preparation after download can take minutes. Accuracy for Marathi is below English. Whisper can occasionally invent text on silence; such text is shown for you to check, never saved silently as something else.
- Understanding is rule-based, not an LLM. It is predictable, private and free, but unusual phrasings may need a follow-up question or a quick edit.
- **Importing a backup doesn't recreate Calendar events** automatically. Open an appointment and tap Retry.
- No app icon yet (iOS shows a blank icon).
