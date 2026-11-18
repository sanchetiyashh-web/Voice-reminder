# Physical iPhone test plan

Write down your iPhone model and iOS version first. Tick each item; note anything that fails, with what you said.

## A. Install and permissions
1. App opens. First mic tap asks for **Microphone** and **Speech Recognition**.
2. Deny Microphone → a clear message offers typing instead; typing a task still saves.
3. First appointment asks for **Calendar** (choose Full Access) and **Notifications**.
4. Settings › Calendar shows "Full access"; pick the calendar you want.
5. Settings › Listening shows whether **on-device** recognition is available for English (India) and Hindi.

## B. Speech recognition (separate from understanding)
Settings › **Speech accuracy test**. For each of the 10 phrases:
- Read naturally, with a 2–3 second thinking pause mid-sentence. **Check the recording does not stop during the pause.**
- Do it once in a quiet room and once with a fan/TV on.
- Repeat with language **Hindi** for the two Hinglish phrases.
- Share the CSV with me. It gives WER, seconds to final text, and what the engine understood.

## B2. Marathi with Whisper
1. Settings › Marathi & mixed speech › Download (Wi-Fi). Note download time, then **Prepare now** and note how long preparation takes.
2. Globe button → **मरा**. Say: "उद्या सकाळी दहा वाजता सप्लायरला कॉल करायचा आहे, आठवण करून दे" → expected: task tomorrow 10:00 AM. Note the "Whisper transcription N s" timing shown.
3. "परवा संध्याकाळी पाच वाजता डेंटिस्टची अपॉइंटमेंट आहे" → appointment day after tomorrow 5 PM in Calendar.
4. Globe → **Mix**. Say a Marathi-English mix ("Udya sakali 9 vajta Rahul la call karaycha aahe").
5. Run the 4 Marathi phrases in the Speech test (with Marathi · Whisper selected) and share the CSV.
6. Try Small vs Large if you have the space: compare WER and time.
7. Airplane mode after download: Marathi still works (fully offline).

## C. Core flow: speak → transcribe → understand → save → calendar/task → alerts
| # | Say | Expected |
|---|---|---|
| C1 | "I have an idea. We should convert product A into product B, change the packaging, and test it with existing customers." | Idea; title "Convert product A into product B"; 3 points; **no** Calendar event |
| C2 | "Remind me to call the supplier tomorrow at 11 AM." | Task, tomorrow 11:00 AM; notification arrives at 11:00 with the app closed |
| C3 | "I have a dentist appointment day after tomorrow at 3 PM." | Appointment in the chosen calendar, 3–4 PM; event shows alerts 1 day and 4 hours before; confirmation lists them |
| C4 | Same as C3, but "…today at <time 3 hours from now>" | 24-hour alert **skipped**; confirmation says which future alert remains |
| C5 | "I have a doctor appointment tomorrow" | Asks "What time…?" — **no** all-day event created |
| C6 | "Meeting with the CA at 5" | Asks which day, then AM or PM |
| C7 | "Remind me to call mom" | Asks what time; "Save without this" saves an undated task |
| C8 | "I have a meeting on Tuesday, sorry, Wednesday at 4 PM" | Wednesday 4 PM; shows "Corrections applied: Tuesday → Wednesday" |
| C9 | After C3: "Not 3 PM, make it 5 PM" | **Same** Calendar event moves to 5 PM; no duplicate; alerts move too |
| C10 | "Move my dentist appointment to Monday" | Same event moves to Monday |
| C11 | With two meetings saved: "Change the meeting to 6 PM" | Asks which meeting; nothing changes until you pick |
| C12 | Three items in one recording (task + idea + appointment) | Three separate items |
| C13 | "Kal subah 10 baje mujhe supplier ko call karna yaad dilana" (English India) | Task tomorrow 10:00 AM |
| C14 | Tap **Undo** after C3 | Item and Calendar event removed |
| C15 | Tap Done twice quickly / save the same sentence twice | Only one item and one event ("Already saved") |

## D. Reliability
1. Airplane mode → record a task → it saves and its notification still arrives.
2. Turn Calendar access off in iPhone Settings → add an appointment → item saved, marked "Not in Calendar yet", app notifications scheduled instead. Turn access on → reopen the app → event appears (automatic retry), with no duplicate alerts.
3. Force-quit and reopen → all items still there; unanswered questions still waiting.
4. Speak nothing and tap Stop → "I didn't catch any words", plus Retry transcription / type options.
5. Phone call during recording → recording stops, transcript kept.
6. Settings › Export backup → save to Files → Import backup → no duplicates.

## E. Activation
1. "Hey Siri, record in Voice Planner" → app opens and starts listening.
2. "Hey Siri, add to Voice Planner" → Siri asks what to save → item saved without opening the app.
3. Action button / Back Tap set to the "Start listening" shortcut.

## F. Seven-day expiry
Note the install date. Refresh before day 7 (AltStore auto or Sideloadly) and confirm the data is still there.
