/*
 * Held-out set: written AFTER the engine was tuned on cases.js, and run once
 * before any fixes, to estimate real-world accuracy honestly.
 * Same "now" as cases.js (Wed 18 Nov 2026, 5:30 PM).
 */
(function (root) {
  var HELDOUT = [
    { id: 'h01', text: 'Remind me to send the invoice to Mehta ji on Monday at 10:30 AM', expect: { items: [{ kind: 'task', title: 'Send the invoice to Mehta ji', date: '2026-11-23', time: '10:30', q: [] }] } },
    { id: 'h02', text: "I've got a meeting with the landlord on 2nd December at 6 in the evening", expect: { items: [{ kind: 'appointment', title: 'Meeting with the landlord', date: '2026-12-02', time: '18:00', q: [] }] } },
    { id: 'h03', text: 'Okay so, another idea, we could start a WhatsApp group for regular customers and send weekly offers', expect: { items: [{ kind: 'idea', title: 'Start a WhatsApp group for regular customers', pointers: ['Start a WhatsApp group for regular customers.', 'Send weekly offers.'], q: [] }] } },
    { id: 'h04', text: 'Remind me after 3 days to follow up with the bank', expect: { items: [{ kind: 'task', title: 'Follow up with the bank', date: '2026-11-21', q: ['time'] }] } },
    { id: 'h05', text: "Parents' anniversary dinner on Saturday at 8 PM", expect: { items: [{ kind: 'appointment', title: "Parents' anniversary dinner", date: '2026-11-21', time: '20:00', q: [] }] } },
    { id: 'h06', text: 'Kal 11 baje meeting hai client ke saath', expect: { items: [{ kind: 'appointment', date: '2026-11-19', q: ['ampm'] }] } },
    { id: 'h07', text: 'Remind me to take my BP tablet at 9 PM every day', expect: { items: [{ kind: 'task', date: '2026-11-18', time: '21:00', q: [] }] } },
    { id: 'h08', text: 'I have a call with the CA on Thursday, I mean Friday, at half past 4 in the afternoon', expect: { items: [{ kind: 'appointment', title: 'Call with the CA', date: '2026-11-20', time: '16:30', q: [] }] } },
    { id: 'h09', text: 'Note: the new packaging should be eco-friendly', expect: { items: [{ kind: 'idea', title: 'The new packaging should be eco-friendly', q: [] }] } },
    { id: 'h10', text: 'Remind me to call Suresh in 30 minutes', expect: { items: [{ kind: 'task', title: 'Call Suresh', date: '2026-11-18', time: '18:00', q: [] }] } },
    { id: 'h11', text: "Doctor's appointment on 3rd at 5 PM", expect: { items: [{ kind: 'appointment', date: '2026-12-03', time: '17:00', q: [] }] } },
    { id: 'h12', text: 'Book a table for dinner tomorrow at 8', expect: { items: [{ kind: 'appointment', date: '2026-11-19', q: ['ampm'] }] } },
    { id: 'h13', text: 'I need to buy a gift for Riya before Sunday', expect: { items: [{ kind: 'task', title: 'Buy a gift for Riya', date: '2026-11-22', q: [] }] } },
    { id: 'h14', text: 'Meeting with Ankit and Pooja tomorrow at 12', expect: { items: [{ kind: 'appointment', title: 'Meeting with Ankit and Pooja', date: '2026-11-19', q: ['ampm'] }] } },
    { id: 'h15', text: 'Remind me to pay rent on the 1st', expect: { items: [{ kind: 'task', title: 'Pay rent', date: '2026-12-01', q: ['time'] }] } },
    { id: 'h16', text: 'Shift the bank meeting to 11 AM', expect: { updates: [{ target: 'a3', time: '11:00', q: [] }] } },
    { id: 'h17', text: 'Make it 5 PM', ctx: { lastItemId: 'a1' }, expect: { updates: [{ target: 'a1', time: '17:00', q: [] }] } },
    { id: 'h18', text: 'Remind me to call the plumber tomorrow at 9 AM, and also to buy bulbs', expect: { items: [{ kind: 'task', title: 'Call the plumber', date: '2026-11-19', time: '09:00' }, { kind: 'task', title: 'Buy bulbs' }] } },
    { id: 'h19', text: 'Mujhe parso 4 baje dentist ke paas jaana hai', expect: { items: [{ kind: 'appointment', date: '2026-11-20', q: ['ampm'] }] } },
    { id: 'h20', text: 'Tomorrow at 7 AM gym', expect: { items: [{ kind: 'appointment', title: 'Gym', date: '2026-11-19', time: '07:00', q: [] }] } }
  ];
  root.VP_HELDOUT = HELDOUT;
  if (typeof module !== 'undefined' && module.exports) module.exports = HELDOUT;
})(typeof globalThis !== 'undefined' ? globalThis : this);
