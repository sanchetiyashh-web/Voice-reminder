# Voice Planner

A personal, free, voice-first assistant for iPhone. Speak naturally and it saves **ideas** (with structured points), **tasks** (with reminders) and **appointments** (in your iPhone Calendar, with alerts 24 h and 4 h before by default). It asks a short question when something is missing instead of guessing.

Everything runs on the iPhone: Apple's on-device speech recognition, a bundled understanding engine, EventKit and local notifications. No servers, no API keys, no subscriptions.

- Why native and not a website: [docs/01-platform-decision.md](docs/01-platform-decision.md)
- Measured accuracy and what is still untested: [docs/02-evaluation.md](docs/02-evaluation.md)
- Costs, accounts, free-tier limits: [docs/03-free-use-and-limits.md](docs/03-free-use-and-limits.md)
- iPhone test plan: [docs/04-iphone-testing.md](docs/04-iphone-testing.md)

## Status

| Part | Status |
|---|---|
| Understanding engine (`engine/understanding.js`) | **Tested**: 53/53 corpus cases, 6/6 follow-up flows; held-out set **16/20 on first run**; Marathi/mixed **17/19 on first run** (all fixed afterwards) |
| Languages | Understands English, Hindi, Marathi (Roman or Devanagari, mixed). Speech: English (India) and Hindi via Apple (live); **Marathi and Mixed/auto-detect via on-device Whisper** (text after you stop; one-time model download). Whisper is implemented but untested on a device. |
| iOS app (`VoicePlanner/`, SwiftUI) | **Compiles** (GitHub Actions, Xcode on macOS, unsigned IPA produced). Not yet run on a device. |
| Speech accuracy on your voice | **Not tested**; use the in-app Speech test |
| Calendar, notifications, Siri, Undo, export | Implemented, unverified on a device |

## Setup without a Mac (one-time, ~30 min)

### 1. Build the app for free on GitHub
1. Create a free account at github.com and a **new repository** (public = unlimited free build minutes; private also works within the limits).
2. Upload this whole folder to it (GitHub's "uploading an existing file" page, or `git push`).
3. Open the repository's **Actions** tab → workflow **build**. It starts on every push, or click **Run workflow**.
4. When it is green, open the run and download **VoicePlanner-unsigned-ipa**. Unzip it to get `VoicePlanner-unsigned.ipa`.
   If it fails, download the **build-log** artifact and send it to me.

### 2. Prepare the iPhone
- Install **iTunes** (or Apple Devices) on Windows so the PC can see the iPhone. Connect by USB and tap **Trust**.

### 3. Install with Sideloadly (simplest) or AltStore (auto-refresh)
**Sideloadly:** install from sideloadly.io → drag in the `.ipa` → enter your Apple ID → Start. You type the Apple ID password into Sideloadly yourself. If it complains about the bundle ID, enable its option to change the bundle ID automatically.
**AltStore:** install AltServer on Windows (altstore.io) → install AltStore on the iPhone → open the `.ipa` from AltStore. Keep AltServer running and on the same Wi-Fi, and it refreshes the 7-day signature automatically.

### 4. On the iPhone
1. Settings › Privacy & Security › **Developer Mode** → On (the phone restarts).
2. Settings › General › VPN & Device Management → trust your Apple ID.
3. Open **Voice Planner** and tap the mic. Allow Microphone, Speech Recognition, Calendar (**Full Access**) and Notifications when asked.
4. In the app's Settings, choose your language (English (India) recommended) and the calendar for appointments.

### Marathi speech (one time)
In the app: Settings › **Marathi & mixed speech** › pick *Large v3* (547 MB, best) or *Small* (216 MB, faster) › **Download** on Wi-Fi › **Prepare now**. The first preparation can take a few minutes. Then choose **मरा** (Marathi) or **Mix** with the globe button on the capture screen.

### Every 7 days: make it automatic
Free Apple ID installs expire after 7 days. **Recommended: install through SideStore and add a daily Shortcuts automation.** It then renews on the iPhone with no PC; see [docs/05-no-weekly-reinstall.md](docs/05-no-weekly-reinstall.md). The app also shows its expiry date in Settings and notifies you a day before. Your data always stays.

## Setup with a Mac (alternative)
`brew install xcodegen && xcodegen generate`, open `VoicePlanner.xcodeproj`, set Signing → Team to your Apple ID ("Personal Team"), choose your iPhone, Run. It has the same 7-day limit.

## Daily use
- **Big mic button** → talk → **Stop** (or pause 8 s; changeable in Settings, or set it to stop only when you tap). Thinking pauses are fine.
- You see the words live, then a confirmation with the resolved date and time, Calendar status and alerts. **Undo** is right there.
- If something is missing ("What time is the dentist appointment?"), tap an option, type, or answer by voice.
- Edit the transcript and tap **Redo with this text** if the speech was misheard. Or tap **Type** to skip speech.
- Edit with your voice: "Not 3 PM, make it 5 PM", "Move my dentist appointment to Friday", "Cancel the meeting with Rahul", "Mark call the supplier as done".
- Ideas, Tasks and Appointments tabs; search; swipe to complete or delete; tap to edit.
- Siri: "Record in Voice Planner" (opens and listens) and "Add to Voice Planner" (Siri asks, saves in the background). Action button and Back Tap work through the Shortcuts app.

## Privacy
- Speech is recognised on the iPhone. Apple's servers are used **only** if on-device isn't available for your language **and** you switch on "Allow Apple server recognition".
- Audio is kept only in a temporary file until the recording is processed (so a failed transcription can be retried), then deleted. You can turn this off.
- Data lives in the app's private storage. **Export backup** writes a JSON file you can save to Files or iCloud Drive.

## Project layout
```
engine/understanding.js      understanding engine (runs on iPhone via JavaScriptCore)
engine/tests/                corpus, held-out set, runner (browser: test.html, CI: node run-node.js)
VoicePlanner/                SwiftUI app
  Speech/SpeechRecorder.swift    live recognition, pause handling, retry from temp audio
  Engine/UnderstandingEngine.swift  JavaScriptCore bridge
  Services/Executor.swift        save → Calendar → alerts, dedup, undo, retry
  Services/CalendarService.swift EventKit create/update/delete
  Services/NotificationService.swift local notifications
  Intents/PlannerIntents.swift   Siri / Shortcuts
project.yml                  XcodeGen project definition
.github/workflows/build.yml  free cloud build → unsigned .ipa
```

## Running the engine tests on Windows
Use any static web server on `engine/`, for example `python -m http.server 8765 --directory engine`. Then open http://localhost:8765/tests/test.html. There is a "try a sentence" box at the top.
