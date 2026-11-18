# Evaluation report

Speech recognition and understanding are evaluated **separately**. Status labels:

- **Tested**: actually executed, with results below.
- **Implemented, unverified**: code written, not yet compiled or run on an iPhone.

## 1. Understanding (transcript → structured action): **tested**

Run with the same `engine/understanding.js` the app bundles, in a Chromium/V8 browser on Windows (`engine/tests/test.html`). On iPhone it runs in JavaScriptCore instead, so the engine has not yet run on a device. Fixed clock: Wed 18 Nov 2026, 5:30 PM.

### Corpus (`engine/tests/cases.js`, 53 utterances + 6 follow-up flows)
Covers the brief's examples, fillers/pauses ("Um, so, I have a, uh, meeting…", "Remind me to… call the… bank"), corrections ("Tuesday—sorry, Wednesday", "not 3 PM, make it 5 PM", names: "Rahul, sorry, Rohit", no-punctuation "Thursday sorry Friday"), relative dates (tomorrow, day after tomorrow, next Monday, in 15 days, within 3 days, this weekend, in 2 hours, tonight, the 25th, 25 December, 5/12 as dd/mm), ranges and durations, multi-item recordings, Hinglish ("Kal subah 10 baje … yaad dilana", "Parson shaam 5 baje …"), Devanagari ("कल शाम 5 बजे डॉक्टर का अपॉइंटमेंट है"), edits (move, cancel, mark done, postpone by 2 hours, ambiguous target), and cases where it must **ask** (missing time, AM/PM, vague "next week", 31 February, a time already past, wrong old value).

| Run | Result |
|---|---|
| First run | 42/53 cases. Every date was right; the failures were in titles, segmentation and edit-target matching |
| After fixes | **53/53 cases, 6/6 flows** |

These cases were used for tuning, so 53/53 **overstates** real-world accuracy.

### Held-out set (`engine/tests/heldout.js`, 20 new utterances written after tuning)
| Run | Result |
|---|---|
| **First run, before any fix (the honest estimate)** | **16/20 (80%)** |
| After fixes | 20/20 (now also tuned, so no longer unbiased) |

Errors seen on the first held-out run:
1. **Wrong time saved (serious):** "half past 4 in the afternoon" → 4:00 PM instead of 4:30 PM. Fixed.
2. "on 3rd at 5 PM" (no "the") → date not recognised, so it asked a question (safe failure). Fixed.
3. "buy a gift for Riya before Sunday" → title kept "before". Fixed.
4. "Remind me to call the plumber at 9, and also to buy bulbs" → merged into one task. Fixed for "and also to <verb>".
5. Not a test failure but a gap: "every day" saves a **one-time** reminder. The app now says so; repeating reminders are not implemented.

**Expect roughly 1 in 5 new phrasings to need a correction or an extra question at first.** The design favours asking over guessing, and every save shows the resolved date and time with Undo.

### Marathi and mixed Marathi/Hindi/English (`engine/tests/marathi.js`, 19 utterances)
Roman-script Marathi ("Udya sakali 10 vajta … aathvan karun de", "15 divsanni …", "Pudhchya somvari dupari 3 vajta …"), Devanagari Marathi ("उद्या दुपारी 3 वाजता डॉक्टरांची भेट आहे", "परवा सकाळी नऊ वाजता … आठवण करून दे"), and mixes ("Tomorrow sakali 9 vajta Rahul la call karna hai", "I have a dentist appointment parva at 3 PM", an English sentence followed by a Hindi one).

| Run | Result |
|---|---|
| **First run** | **17/19**. One wrong merge: a second Hindi sentence was glued onto the first task, so the task asked for a date and time it already had. One past-tense sentence ("Kaal doctor kade gelo hoto") asked for a time instead of first saying the date has passed. |
| After fixes | 19/19. I changed the expectation for the past-tense case after the first run, from "no question" to "asks that the date is past". |

Ambiguities it handles by asking or by noting: Marathi **"kaal"/काल = yesterday** (asks), Hindi **"kal" = tomorrow** in planning context (noted on save), **"parva"** = day after tomorrow (noted). Edits ("move…", "cancel…") are still recognised in **English only**.

### Response time (understanding only)
1,460 parses: **0.14 ms average**, max 10 ms, in desktop V8. Not measured in iPhone JavaScriptCore. It should be in the low milliseconds; the in-app Speech test screen shows it per run.

### String API round-trip: tested
The exact JSON calls the iOS app makes (`VP.parseJSON` / `VP.answerJSON`) were run with null fields stripped, as Swift's encoder drops them. All follow-up flows, the edit-target flow and the "No, don't change it" flow passed. Malformed input returns an error object instead of throwing.

## 2. Speech recognition (audio → text): **not tested yet**

There is no iPhone or macOS here, and Apple's recognizer runs only on Apple devices. **No WER or latency numbers exist yet.** The app has a built-in harness for this: **Settings › Speech accuracy test**.
- 10 reference sentences (English, Indian-English phrasing, Hinglish, a correction, multiple items).
- For each recording: what it heard, **word error rate**, seconds from Stop to final text, and what the engine understood from it (so you can see whether a speech error caused a wrong action).
- Export as CSV.

The procedure is in [04-iphone-testing.md](04-iphone-testing.md).

What to expect, from Apple's docs and general knowledge, unverified for your voice:
- `en-IN` on-device is the best choice for Indian-accented English and light Hinglish. Hindi words may come back in Latin script or be mis-heard.
- `hi-IN` returns Devanagari; English words may be transliterated. The engine maps common Devanagari date/time words, but **mixed-language accuracy is the weakest area**.
- Whether on-device `hi-IN` is available depends on your iPhone and iOS version; the app shows this in Settings and never silently falls back to Apple's servers.
- **Marathi (`mr-IN`) is not offered by Apple's speech recognition** (checked against Apple's iOS 27 feature-availability page, Dictation section, Nov 2026). The app says so if you pick it, and offers English (India) or typing instead.

## 2b. Whisper for Marathi / mixed speech: **implemented, not tested**
WhisperKit 1.1.1 (Core ML) with OpenAI Whisper *large-v3 (547 MB)* or *small (216 MB)*, language forced to Marathi (`mr`) or auto-detected. Nothing has been measured yet. Published results suggest Whisper's Marathi accuracy is clearly below its English accuracy, and *small* is much weaker than *large-v3*. Expect some mis-heard words; the transcript is always shown and editable before you rely on it. The Speech test screen includes 4 Marathi sentences and reports WER and "text ready N s after stop". Note: Whisper may write numbers as words (दहा) or digits (10). The engine understands both, but WER counts the difference as an error.

Understanding of Whisper-style Devanagari output (loanwords like कॉल, अपॉइंटमेंट, मिटिंग): 4 new cases, **4/4 on first run** (Marathi set now 23/23).

## 3. App (Swift): **implemented, unverified**
Not compiled yet: no macOS here. The first compile happens in the GitHub Actions workflow. I reviewed the code and fixed one definite compile error, but expect a few compile errors on the first run; send me the build log.
