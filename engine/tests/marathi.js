/*
 * Marathi + mixed Marathi/Hindi/English cases.
 * Same "now" as cases.js (Wed 18 Nov 2026, 5:30 PM).
 * Roman-script lines are how an English(India) recognizer or a person typing might write them;
 * Devanagari lines are how typing or a Marathi-capable recognizer would write them.
 */
(function (root) {
  var MARATHI = [
    // ---- Roman-script Marathi
    { id: 'mr01', text: 'Udya sakali 10 vajta mala supplier la call karaycha aahe, aathvan karun de',
      expect: { items: [{ kind: 'task', date: '2026-11-19', time: '10:00', reminder: true, q: [] }] } },
    { id: 'mr02', text: 'Parva sandhyakali 5 vajta dentist chi appointment aahe',
      expect: { items: [{ kind: 'appointment', title: 'Dentist chi appointment', date: '2026-11-20', time: '17:00', q: [] }] } },
    { id: 'mr03', text: '15 divsanni light bill bharaycha aahe, aathvan karun de',
      expect: { items: [{ kind: 'task', date: '2026-12-03', q: ['time'] }] } },
    { id: 'mr04', text: 'Saade chaar vajta meeting aahe udya',
      expect: { items: [{ kind: 'appointment', title: 'Meeting', date: '2026-11-19', q: ['ampm'] }] } },
    { id: 'mr05', text: 'Pudhchya somvari dupari 3 vajta bank madhe bhet aahe',
      expect: { items: [{ kind: 'appointment', date: '2026-11-23', time: '15:00', q: [] }] } },
    { id: 'mr06', text: 'Majhi kalpana, aapan navin packaging try karu ani customers la vicharu',
      expect: { items: [{ kind: 'idea', date: null, q: [] }] } },
    { id: 'mr07', text: 'Shukravari ratri 8 vajta mitransobat dinner aahe',
      expect: { items: [{ kind: 'appointment', date: '2026-11-20', time: '20:00', q: [] }] } },
    { id: 'mr08', text: 'Udya meeting aahe',
      expect: { items: [{ kind: 'appointment', date: '2026-11-19', q: ['time'] }] } },

    // ---- Devanagari Marathi
    { id: 'mr09', text: 'उद्या दुपारी 3 वाजता डॉक्टरांची भेट आहे',
      expect: { items: [{ kind: 'appointment', title: 'डॉक्टरांची भेट', date: '2026-11-19', time: '15:00', q: [] }] } },
    { id: 'mr10', text: 'पुढच्या सोमवारी 11 वाजता मीटिंग आहे',
      expect: { items: [{ kind: 'appointment', date: '2026-11-23', q: ['ampm'] }] } },
    { id: 'mr11', text: 'परवा सकाळी नऊ वाजता मला बँकेत जायचं आहे, आठवण करून दे',
      expect: { items: [{ kind: 'task', date: '2026-11-20', time: '09:00', q: [] }] } },
    { id: 'mr12', text: 'माझी कल्पना: दुकानात नवीन पॅकेजिंग वापरूया',
      expect: { items: [{ kind: 'idea', q: [] }] } },

    // ---- mixed Marathi + Hindi + English
    { id: 'mx01', text: 'Tomorrow sakali 9 vajta Rahul la call karna hai',
      expect: { items: [{ kind: 'task', date: '2026-11-19', time: '09:00', q: [] }] } },
    { id: 'mx02', text: 'Kal shaam 6 baje client meeting aahe',
      expect: { items: [{ kind: 'appointment', date: '2026-11-19', time: '18:00', q: [] }] } },
    { id: 'mx03', text: 'Remind me udya 11 AM la GST file karaycha',
      expect: { items: [{ kind: 'task', date: '2026-11-19', time: '11:00', q: [] }] } },
    { id: 'mx04', text: 'I have a dentist appointment parva at 3 PM',
      expect: { items: [{ kind: 'appointment', title: 'Dentist appointment', date: '2026-11-20', time: '15:00', q: [] }] } },
    { id: 'mx05', text: 'Remind me to call the supplier udya at 11 AM. Aur parso shaam 5 baje dentist ka appointment hai.',
      expect: { items: [{ kind: 'task', title: 'Call the supplier', date: '2026-11-19', time: '11:00', q: [] }, { kind: 'appointment', date: '2026-11-20', time: '17:00', q: [] }] } },
    { id: 'mx06', text: 'Meeting with Rahul udya at 4, sorry, 5 PM',
      expect: { items: [{ kind: 'appointment', title: 'Meeting with Rahul', date: '2026-11-19', time: '17:00', q: [] }] } },
    { id: 'mx07', text: 'Kaal doctor kade gelo hoto',
      expect: { items: [{ q: ['past'] }] }, note: 'past statement (yesterday): must ask, not create an item (expectation changed after first run)' }
  ];
  root.VP_MARATHI = MARATHI;
  if (typeof module !== 'undefined' && module.exports) module.exports = MARATHI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
