/*
 * Understanding-engine evaluation corpus.
 * "Now" is fixed at Wed 18 Nov 2026, 5:30 PM (device local time).
 * Each case lists only the fields that must match.
 *   q: [] means "no follow-up question"; q: ['time'] means exactly those question ids.
 */
(function (root) {
  var NOW = { y: 2026, m: 11, d: 18, h: 17, min: 30 };
  var ITEMS = [
    { id: 'a1', title: 'Dentist appointment', kind: 'appointment', date: { y: 2026, m: 11, d: 20 }, time: { h: 15, min: 0 } },
    { id: 'a2', title: 'Meeting with Rahul', kind: 'appointment', date: { y: 2026, m: 11, d: 23 }, time: { h: 16, min: 0 } },
    { id: 'a3', title: 'Meeting with the bank', kind: 'appointment', date: { y: 2026, m: 11, d: 24 }, time: { h: 10, min: 0 } },
    { id: 't1', title: 'Call the supplier', kind: 'task', date: { y: 2026, m: 11, d: 19 }, time: { h: 11, min: 0 } }
  ];

  var CASES = [
    // ---- the three examples from the brief
    { id: 'brief-idea', tags: ['idea', 'pointers'], text: 'I have an idea. We should convert product A into product B, change the packaging, and test it with existing customers.',
      expect: { items: [{ kind: 'idea', title: 'Convert product A into product B', pointers: ['Convert product A into product B.', 'Change the packaging.', 'Test it with existing customers.'], q: [] }] } },
    { id: 'brief-task', tags: ['task', 'relative'], text: 'Remind me to call the supplier tomorrow at 11 AM.',
      expect: { items: [{ kind: 'task', title: 'Call the supplier', date: '2026-11-19', time: '11:00', reminder: true, q: [] }] } },
    { id: 'brief-appt', tags: ['appointment', 'relative'], text: 'I have a dentist appointment day after tomorrow at 3 PM.',
      expect: { items: [{ kind: 'appointment', title: 'Dentist appointment', date: '2026-11-20', time: '15:00', durationMin: 60, q: [] }] } },

    // ---- fillers, pauses, natural speech
    { id: 'fillers-appt', tags: ['fillers', 'appointment'], text: 'Um, so, I have a, uh, meeting with Rahul next Monday at 4 PM',
      expect: { items: [{ kind: 'appointment', title: 'Meeting with Rahul', date: '2026-11-23', time: '16:00', q: [] }] } },
    { id: 'fillers-idea', tags: ['fillers', 'idea', 'pointers'], text: 'Hmm, okay so basically we should, you know, reduce the price and add a free sample',
      expect: { items: [{ kind: 'idea', title: 'Reduce the price', pointers: ['Reduce the price.', 'Add a free sample.'], q: [] }] } },
    { id: 'pause-ellipsis', tags: ['pause', 'task'], text: 'Remind me to... call the... bank tomorrow at 10 AM',
      expect: { items: [{ kind: 'task', title: 'Call the bank', date: '2026-11-19', time: '10:00', q: [] }] } },
    { id: 'no-at', tags: ['task'], text: 'Call supplier tomorrow 11 AM',
      expect: { items: [{ kind: 'task', title: 'Call supplier', date: '2026-11-19', time: '11:00', reminder: true, q: [] }] } },
    { id: 'word-number', tags: ['task'], text: 'remind me to call the supplier tomorrow at eleven a.m.',
      expect: { items: [{ kind: 'task', title: 'Call the supplier', date: '2026-11-19', time: '11:00', q: [] }] } },

    // ---- relative / absolute dates
    { id: 'in-15-days', tags: ['relative', 'missing-time'], text: 'Remind me to pay the electricity bill in 15 days',
      expect: { items: [{ kind: 'task', title: 'Pay the electricity bill', date: '2026-12-03', reminder: true, q: ['time'] }] } },
    { id: 'dec-25', tags: ['absolute', 'appointment'], text: 'Dinner with Priya on 25 December at 4 PM',
      expect: { items: [{ kind: 'appointment', title: 'Dinner with Priya', date: '2026-12-25', time: '16:00', q: [] }] } },
    { id: 'the-25th', tags: ['absolute', 'appointment'], text: 'Schedule a meeting with Neha on the 25th at 2:30 PM',
      expect: { items: [{ kind: 'appointment', title: 'Meeting with Neha', date: '2026-11-25', time: '14:30', q: [] }] } },
    { id: 'dd-mm', tags: ['absolute', 'appointment'], text: 'Doctor appointment on 5/12 at 10 AM',
      expect: { items: [{ kind: 'appointment', title: 'Doctor appointment', date: '2026-12-05', time: '10:00', q: [] }] } },
    { id: 'next-friday', tags: ['relative', 'appointment'], text: 'Next Friday I have a flight to Delhi at 6:45 AM',
      expect: { items: [{ kind: 'appointment', title: 'Flight to Delhi', date: '2026-11-20', time: '06:45', q: [] }] } },
    { id: 'by-friday', tags: ['task', 'undated-time'], text: 'I need to submit the report by Friday',
      expect: { items: [{ kind: 'task', title: 'Submit the report', date: '2026-11-20', time: null, reminder: false, q: [] }] } },
    { id: 'within-3-days', tags: ['relative', 'missing-time'], text: 'Remind me to submit GST return within 3 days',
      expect: { items: [{ kind: 'task', title: 'Submit GST return', date: '2026-11-21', q: ['time'] }] } },
    { id: 'weekend', tags: ['relative', 'missing-time'], text: 'Remind me to water the plants this weekend',
      expect: { items: [{ kind: 'task', title: 'Water the plants', date: '2026-11-21', q: ['time'] }] } },
    { id: 'in-2-hours', tags: ['relative', 'task'], text: 'Remind me in 2 hours to check the oven',
      expect: { items: [{ kind: 'task', title: 'Check the oven', date: '2026-11-18', time: '19:30', q: [] }] } },
    { id: 'tonight', tags: ['relative', 'appointment'], text: 'I have a meeting at 9 tonight',
      expect: { items: [{ kind: 'appointment', title: 'Meeting', date: '2026-11-18', time: '21:00', q: [] }] } },
    { id: 'range', tags: ['duration', 'appointment'], text: 'Team call from 3 to 4 PM tomorrow',
      expect: { items: [{ kind: 'appointment', title: 'Team call', date: '2026-11-19', time: '15:00', durationMin: 60, q: [] }] } },

    // ---- spoken corrections
    { id: 'corr-weekday', tags: ['correction'], text: 'I have a meeting on Tuesday, sorry, Wednesday at 4 PM',
      expect: { items: [{ kind: 'appointment', title: 'Meeting', date: '2026-11-25', time: '16:00', q: [] }] } },
    { id: 'corr-weekday-dash', tags: ['correction'], text: 'Dentist appointment Tuesday—sorry, Wednesday at 11 AM',
      expect: { items: [{ kind: 'appointment', title: 'Dentist appointment', date: '2026-11-25', time: '11:00', q: [] }] } },
    { id: 'corr-not-make-it', tags: ['correction'], text: 'Dentist appointment tomorrow at 3 PM, not 3 PM, make it 5 PM',
      expect: { items: [{ kind: 'appointment', title: 'Dentist appointment', date: '2026-11-19', time: '17:00', q: [] }] } },
    { id: 'corr-time-sorry', tags: ['correction'], text: 'Meeting with Rahul at 3, sorry, 4 PM tomorrow',
      expect: { items: [{ kind: 'appointment', title: 'Meeting with Rahul', date: '2026-11-19', time: '16:00', q: [] }] } },
    { id: 'corr-date-no', tags: ['correction'], text: 'Tomorrow, no, day after tomorrow, I have a lunch with the vendor at 1 PM',
      expect: { items: [{ kind: 'appointment', title: 'Lunch with the vendor', date: '2026-11-20', time: '13:00', q: [] }] } },
    { id: 'corr-name', tags: ['correction', 'names'], text: 'Remind me to call Rahul, sorry, Rohit tomorrow at 9 AM',
      expect: { items: [{ kind: 'task', title: 'Call Rohit', date: '2026-11-19', time: '09:00', q: [] }] } },
    { id: 'corr-no-punct', tags: ['correction'], text: 'meeting with the CA on Thursday sorry Friday at 5 PM',
      expect: { items: [{ kind: 'appointment', title: 'Meeting with the CA', date: '2026-11-20', time: '17:00', q: [] }] } },

    // ---- multiple items in one recording
    { id: 'multi-3', tags: ['multi'], text: 'Remind me to call the supplier tomorrow at 11 AM. Also I have an idea, we should launch a referral program. And I have a dentist appointment on Friday at 6 PM.',
      expect: { items: [
        { kind: 'task', title: 'Call the supplier', date: '2026-11-19', time: '11:00', q: [] },
        { kind: 'idea', title: 'Launch a referral program', q: [] },
        { kind: 'appointment', title: 'Dentist appointment', date: '2026-11-20', time: '18:00', q: [] }] } },
    { id: 'multi-inner', tags: ['multi'], text: 'Remind me to buy groceries tomorrow at 6 PM and I have a meeting with the bank on Monday at 10 AM',
      expect: { items: [
        { kind: 'task', title: 'Buy groceries', date: '2026-11-19', time: '18:00', q: [] },
        { kind: 'appointment', title: 'Meeting with the bank', date: '2026-11-23', time: '10:00', q: [] }] } },
    { id: 'appt-lead', tags: ['appointment', 'alerts'], text: 'I have a dentist appointment on Friday at 3 PM, remind me 2 hours before',
      expect: { items: [{ kind: 'appointment', title: 'Dentist appointment', date: '2026-11-20', time: '15:00', alertOffsetsMin: [120], q: [] }] } },

    // ---- Hindi / Hinglish
    { id: 'hinglish-task', tags: ['hindi'], text: 'Kal subah 10 baje mujhe supplier ko call karna yaad dilana',
      expect: { items: [{ kind: 'task', title: 'Supplier ko call karna', date: '2026-11-19', time: '10:00', q: [] }] } },
    { id: 'hinglish-appt', tags: ['hindi'], text: 'Parson shaam 5 baje dentist ka appointment hai',
      expect: { items: [{ kind: 'appointment', title: 'Dentist ka appointment', date: '2026-11-20', time: '17:00', q: [] }] } },
    { id: 'devanagari-appt', tags: ['hindi'], text: 'कल शाम 5 बजे डॉक्टर का अपॉइंटमेंट है',
      expect: { items: [{ kind: 'appointment', title: 'डॉक्टर का अपॉइंटमेंट', date: '2026-11-19', time: '17:00', q: [] }] } },
    { id: 'hindi-sade', tags: ['hindi', 'ambiguous'], text: 'Remind me at sade teen baje to call Amit',
      expect: { items: [{ kind: 'task', title: 'Call Amit', q: ['ampm'] }] } },
    { id: 'hindi-days', tags: ['hindi', 'relative'], text: '15 din baad bank jaana hai, yaad dilana subah 9 baje',
      expect: { items: [{ kind: 'task', date: '2026-12-03', time: '09:00', q: [] }] } },

    // ---- missing / ambiguous → ask, don't guess
    { id: 'remind-no-time', tags: ['missing-time'], text: 'Remind me to call mom',
      expect: { items: [{ kind: 'task', title: 'Call mom', reminder: true, q: ['time'] }] } },
    { id: 'appt-no-time', tags: ['missing-time'], text: 'I have a doctor appointment tomorrow',
      expect: { items: [{ kind: 'appointment', title: 'Doctor appointment', date: '2026-11-19', time: null, q: ['time'] }] } },
    { id: 'ampm-and-date', tags: ['ambiguous'], text: 'Meeting with the CA at 5',
      expect: { items: [{ kind: 'appointment', title: 'Meeting with the CA', q: ['date', 'ampm'] }] } },
    { id: 'ampm-7', tags: ['ambiguous'], text: 'Remind me to call mom on Sunday at 7',
      expect: { items: [{ kind: 'task', title: 'Call mom', date: '2026-11-22', q: ['ampm'] }] } },
    { id: 'vague-week', tags: ['ambiguous'], text: 'Interview next week',
      expect: { items: [{ kind: 'appointment', title: 'Interview', q: ['date', 'time'] }] } },
    { id: 'invalid-date', tags: ['ambiguous'], text: 'Remind me to renew passport on 31 February',
      expect: { items: [{ kind: 'task', q: ['date', 'time'] }] } },
    { id: 'past-time', tags: ['ambiguous'], text: 'Dentist appointment today at 3 PM',
      expect: { items: [{ kind: 'appointment', date: '2026-11-18', time: '15:00', q: ['past'] }] } },
    { id: 'duration-ampm', tags: ['duration', 'ambiguous'], text: 'Call with the investor on Friday at 11 for 30 minutes',
      expect: { items: [{ kind: 'appointment', title: 'Call with the investor', date: '2026-11-20', durationMin: 30, q: ['ampm'] }] } },
    { id: 'morning-no-time', tags: ['missing-time'], text: 'Remind me tomorrow morning to take medicine',
      expect: { items: [{ kind: 'task', title: 'Take medicine', date: '2026-11-19', time: null, q: ['time'] }] } },

    // ---- plain notes / undated tasks
    { id: 'buy-milk', tags: ['task', 'undated'], text: 'Buy milk',
      expect: { items: [{ kind: 'task', title: 'Buy milk', date: null, time: null, reminder: false, q: [] }] } },
    { id: 'idea-with-date', tags: ['idea'], text: 'I have an idea for the meeting next Monday: share the sales numbers first',
      expect: { items: [{ kind: 'idea', date: null, q: [] }] } },

    // ---- edits to existing items
    { id: 'edit-not-make-it', tags: ['edit'], text: 'Not 3 PM, make it 5 PM', ctx: { lastItemId: 'a1' },
      expect: { updates: [{ target: 'a1', time: '17:00', q: [] }] } },
    { id: 'edit-move', tags: ['edit'], text: 'Move my dentist appointment to Monday',
      expect: { updates: [{ target: 'a1', date: '2026-11-23', q: [] }] } },
    { id: 'edit-ambiguous-target', tags: ['edit', 'ambiguous'], text: 'Change the meeting to 6 PM',
      expect: { updates: [{ target: null, time: '18:00', q: ['target'] }] } },
    { id: 'edit-cancel', tags: ['edit'], text: 'Cancel the dentist appointment',
      expect: { updates: [{ target: 'a1', remove: true, q: [] }] } },
    { id: 'edit-done', tags: ['edit'], text: 'Mark call the supplier as done',
      expect: { updates: [{ target: 't1', complete: true, q: [] }] } },
    { id: 'edit-wrong-old', tags: ['edit', 'ambiguous'], text: 'Not 4 PM, make it 6 PM', ctx: { lastItemId: 'a1' },
      expect: { updates: [{ target: 'a1', time: '18:00', q: ['notMatch'] }] } },
    { id: 'edit-postpone', tags: ['edit'], text: 'Postpone the dentist appointment by 2 hours',
      expect: { updates: [{ target: 'a1', shiftMin: 120, q: [] }] } },
    { id: 'edit-weekday-corr', tags: ['edit', 'correction'], text: 'Move the meeting with Rahul to Tuesday, sorry, Wednesday',
      expect: { updates: [{ target: 'a2', date: '2026-11-25', q: [] }] } }
  ];

  // follow-up answer flows: parse → answer(s) → expected final fields
  var FLOWS = [
    { id: 'flow-time', text: 'I have a doctor appointment tomorrow', answers: [['time', '4:30 PM']], expect: { date: '2026-11-19', time: '16:30', q: [] } },
    { id: 'flow-ampm', text: 'Remind me to call mom on Sunday at 7', answers: [['ampm', '7 PM']], expect: { date: '2026-11-22', time: '19:00', q: [] } },
    { id: 'flow-bare-then-ampm', text: 'Remind me to call mom', answers: [['time', '8'], ['ampm', 'morning']], expect: { date: '2026-11-19', time: '08:00', q: [] } },
    { id: 'flow-date-option', text: 'Meeting with the CA at 5', answers: [['date', 'Tomorrow'], ['ampm', '5 PM']], expect: { date: '2026-11-19', time: '17:00', q: [] } },
    { id: 'flow-hindi-answer', text: 'I have a doctor appointment tomorrow', answers: [['time', 'shaam 6 baje']], expect: { time: '18:00', q: [] } },
    { id: 'flow-confirm-edit', text: 'Remind me to call Rahul tomorrow at 9 AM', lowConfidence: ['Rahul'], answers: [['confirm', 'Rohit']], expect: { title: 'Call Rohit', q: [] } }
  ];

  var api = { NOW: NOW, ITEMS: ITEMS, CASES: CASES, FLOWS: FLOWS };
  root.VP_TESTS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
