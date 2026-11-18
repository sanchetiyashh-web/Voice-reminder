/*
 * Voice Planner — understanding engine.
 *
 * Turns a transcript into structured items (ideas / tasks / appointments) or
 * edit operations, and asks short follow-up questions when something is
 * missing or ambiguous instead of guessing.
 *
 * Pure JavaScript, no dependencies, no network. Runs on-device on iPhone via
 * Apple's JavaScriptCore, and in any browser / Node for testing.
 *
 * All date math is done on calendar components (y, m, d, h, min) supplied by
 * the device, so results are independent of the JS engine's time zone.
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';

  // ---------------------------------------------------------------- utils
  function R(src, flags) { return new RegExp(src, flags === undefined ? 'gi' : flags); }
  function squash(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function words(s) { return squash(s).split(' ').filter(Boolean); }

  function ymd(y, m, d) { var t = new Date(Date.UTC(y, m - 1, d)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
  function addDays(dt, n) { return ymd(dt.y, dt.m, dt.d + n); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function addMonths(dt, n) {
    var y = dt.y, m = dt.m + n;
    while (m > 12) { m -= 12; y++; }
    while (m < 1) { m += 12; y--; }
    return { y: y, m: m, d: Math.min(dt.d, daysInMonth(y, m)) };
  }
  function weekdayOf(dt) { return new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDay(); }
  function cmpDate(a, b) { return (a.y - b.y) || (a.m - b.m) || (a.d - b.d); }
  function sameDate(a, b) { return a && b && cmpDate(a, b) === 0; }
  function sameTime(a, b) { return a && b && a.h === b.h && a.min === b.min; }
  function absMin(dt, tm) { return Date.UTC(dt.y, dt.m - 1, dt.d, tm ? tm.h : 0, tm ? tm.min : 0) / 60000; }
  function fromAbsMin(x) { var t = new Date(x * 60000); return { date: { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }, time: { h: t.getUTCHours(), min: t.getUTCMinutes() } }; }
  function today(now) { return { y: now.y, m: now.m, d: now.d }; }
  function nowMin(now) { return absMin(today(now), { h: now.h, min: now.min }); }

  var WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(dt, now) { return WD3[weekdayOf(dt)] + ' ' + dt.d + ' ' + MON3[dt.m - 1] + (now && dt.y !== now.y ? ' ' + dt.y : ''); }
  function fmtTime(t) { var h = t.h % 12 === 0 ? 12 : t.h % 12; return h + ':' + (t.min < 10 ? '0' : '') + t.min + (t.h < 12 ? ' AM' : ' PM'); }
  function fmtHour(h, min, mer) { return h + (min ? ':' + (min < 10 ? '0' : '') + min : '') + ' ' + mer; }

  // ---------------------------------------------------------------- vocab
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  var HNUMW = { don: 2, pach: 5, saha: 6, daha: 10, akra: 11, bara: 12, ek: 1, 'do': 2, teen: 3, tin: 3, chaar: 4, char: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10, gyaarah: 11, gyarah: 11, baarah: 12, barah: 12 };
  var CNTW = {
    'a couple of': 2, 'couple of': 2, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    'twenty five': 25, thirty: 30, 'forty five': 45, forty: 40, fifty: 50, sixty: 60, ninety: 90,
    ek: 1, 'do': 2, teen: 3, chaar: 4, char: 4, paanch: 5, panch: 5, saat: 7, das: 10, pandrah: 15, bees: 20, tees: 30,
    don: 2, pach: 5, saha: 6, daha: 10, pandhra: 15, vees: 20
  };
  function alt(obj) { return Object.keys(obj).sort(function (a, b) { return b.length - a.length; }).join('|'); }
  var NUM = '(\\d{1,2}|' + alt(NUMW) + ')';
  var HNUM = '(\\d{1,2}|' + alt(HNUMW) + '|' + alt(NUMW) + ')';
  var CNT = '(\\d{1,3}(?:\\.\\d)?|' + alt(CNTW) + ')';
  var MER = '(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)(?![a-z])';
  var PREP = '(?:(?:at|by|around|about|before|after|from|till|until|for)\\s+)?';
  function num(s) {
    s = String(s).toLowerCase().trim();
    if (/^\d/.test(s)) return parseFloat(s);
    if (NUMW[s] !== undefined) return NUMW[s];
    if (HNUMW[s] !== undefined) return HNUMW[s];
    if (CNTW[s] !== undefined) return CNTW[s];
    return NaN;
  }
  function merOf(s) { if (!s) return null; return /^a/i.test(s) ? 'am' : 'pm'; }

  var MONTHS = { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12 };
  var MONTH = '(' + alt(MONTHS) + ')';
  var WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, ravivar: 0, raviwar: 0, itvaar: 0, itwar: 0, somvar: 1, somwar: 1, mangalvar: 2, mangalwar: 2, budhvar: 3, budhwar: 3, guruvar: 4, guruwar: 4, shukravar: 5, shukrawar: 5, shanivar: 6, shaniwar: 6 };
  var WD = '(' + alt(WEEKDAYS) + ')';

  var AM_CTX = /\b(morning|subah|subha|savere|sawere|sakali|sakaali)\b/i;
  var PM_CTX = /\b(afternoon|evening|tonight|night|shaam|sham|raat|dopahar|dupahar|sandhyakali|sandhyakaali|sandhyakal|ratri|dupari|dupaari)\b/i;
  var CTX_WORDS = '(?:in the morning|in the afternoon|in the evening|at night|this morning|this afternoon|this evening|morning|afternoon|evening|night|subah|subha|savere|shaam|sham|raat|dopahar|dupahar|sakali|sakaali|sandhyakali|sandhyakaali|ratri|dupari|dupaari)(?:\\s+(?:ko|me|mein))?';

  // ---------------------------------------------------------------- Devanagari → roman for date/time/trigger words
  var DEVA = [
    ['सोमवारी', 'somvari'], ['मंगळवारी', 'mangalvari'], ['मंगलवारी', 'mangalvari'], ['बुधवारी', 'budhvari'], ['गुरुवारी', 'guruvari'], ['शुक्रवारी', 'shukravari'], ['शनिवारी', 'shanivari'], ['रविवारी', 'ravivari'], ['मंगळवार', 'mangalvar'],
    ['उद्या', 'udya'], ['परवा', 'parva'], ['काल', 'kaal'], ['वाजता', 'vajta'], ['वाजले', 'vajta'], ['सकाळी', 'sakali'], ['संध्याकाळी', 'sandhyakali'], ['रात्री', 'ratri'], ['दुपारी', 'dupari'],
    ['सव्वा', 'sava'], ['पावणे', 'paune'], ['दीड', 'dedh'], ['अडीच', 'dhai'], ['दिवसांनी', 'divsanni'], ['आठवड्यांनी', 'aathvadyanni'], ['महिन्यांनी', 'mahinyanni'],
    ['आठवण करून देणे', 'aathvan karun de'], ['आठवण करून द्या', 'aathvan karun de'], ['आठवण करून दे', 'aathvan karun de'], ['मला', 'mala'], ['पुढच्या', 'pudhchya'], ['पुढील', 'pudhil'],
    ['आठवड्यात', 'aathvadyat'], ['माझी कल्पना', 'majhi kalpana'], ['कल्पना', 'kalpana'],
    ['दोन', 'don'], ['पाच', 'pach'], ['सहा', 'saha'], ['नऊ', 'nau'], ['दहा', 'daha'], ['अकरा', 'akra'], ['बारा', 'bara'],
    ['परसों', 'parson'], ['परसो', 'parson'], ['आज', 'aaj'], ['कल', 'kal'], ['बजे', 'baje'], ['सुबह', 'subah'], ['शाम', 'shaam'],
    ['रात', 'raat'], ['दोपहर', 'dopahar'], ['साढ़े', 'sade'], ['साढे', 'sade'], ['सवा', 'sava'], ['पौने', 'paune'], ['डेढ़', 'dedh'], ['डेढ', 'dedh'], ['ढाई', 'dhai'],
    ['सोमवार', 'somvar'], ['मंगलवार', 'mangalvar'], ['बुधवार', 'budhvar'], ['गुरुवार', 'guruvar'], ['बृहस्पतिवार', 'guruvar'], ['शुक्रवार', 'shukravar'], ['शनिवार', 'shanivar'], ['रविवार', 'ravivar'],
    ['दिन बाद', 'din baad'], ['हफ्ते बाद', 'hafte baad'], ['महीने बाद', 'mahine baad'], ['मिनट बाद', 'minute baad'], ['घंटे बाद', 'ghante baad'],
    ['याद दिलाना', 'yaad dilana'], ['याद दिला देना', 'yaad dilana'], ['याद दिलाओ', 'yaad dilana'], ['याद दिला', 'yaad dilana'], ['मुझे', 'mujhe'],
    ['एक', 'ek'], ['दो', 'do'], ['तीन', 'teen'], ['चार', 'char'], ['पांच', 'paanch'], ['पाँच', 'paanch'], ['छह', 'chhe'], ['छः', 'chhe'], ['सात', 'saat'], ['आठ', 'aath'], ['नौ', 'nau'], ['दस', 'das'], ['ग्यारह', 'gyarah'], ['बारह', 'barah']
  ];
  var DEVA_NUMS = ['दोन', 'पाच', 'सहा', 'नऊ', 'दहा', 'अकरा', 'बारा', 'एक', 'दो', 'तीन', 'चार', 'पांच', 'पाँच', 'छह', 'छः', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह'];
  function mapDevanagari(s) {
    s = s.replace(/[०-९]/g, function (c) { return String(c.charCodeAt(0) - 0x0966); });
    for (var i = 0; i < DEVA.length; i++) {
      var dv = DEVA[i][0];
      if (DEVA_NUMS.indexOf(dv) >= 0) {
        // number words only when they are part of a time / count expression
        s = s.replace(R('(?<![\\u0900-\\u097F])' + dv + '(?=\\s*(?:बजे|baje|वाजता|vajta|दिन|din|दिवसांनी|divsanni|हफ्ते|hafte|मिनट|minute|घंटे|ghante))', 'g'), DEVA[i][1]);
      } else {
        s = s.replace(R('(?<![\\u0900-\\u097F])' + dv + '(?![\\u0900-\\u097F])', 'g'), DEVA[i][1]);
      }
    }
    return s;
  }

  // ---------------------------------------------------------------- fillers
  var NOISE_RE = /(^|[\s,.;])(?:u+m+|u+h+m*|e+r+m*|a+h+|h+m+|m{2,})(?=[\s,.;!?]|$),?/gi;
  var DISCOURSE_RE = /(^|[\s,])(?:you know|basically|actually|i mean|okay so|ok so|so yeah|matlab|accha|acha|achha|haan|mhanje)(?=[\s,.;!?]|$),?/gi;
  function removeNoise(s) { return s.replace(NOISE_RE, '$1'); }
  function removeDiscourse(s) {
    s = s.replace(DISCOURSE_RE, '$1');
    s = s.replace(/,\s*like,/gi, ',');
    s = s.replace(/\b([a-z]+)(?:\s+\1\b)+/gi, '$1');          // "I I have" → "I have"
    // a comma right after a function word is a thinking pause, not a list separator
    s = s.replace(/\b(a|an|the|my|our|to|of|for|with|is|are|i|we|have|has|should|could|would|can|will|must|need|want)\s*,\s+/gi, '$1 ');
    s = s.replace(/\s+([,.;!?])/g, '$1').replace(/([,;])\s*([,;.])/g, '$2').replace(/^[\s,.;]+/, '');
    var prev; do { prev = s; s = s.replace(/^(?:so|okay|ok|well|hey|listen|right|and|haan)\s*[,.]?\s+/i, ''); } while (s !== prev);
    return squash(s);
  }

  // ---------------------------------------------------------------- phrase patterns
  // cat: 'date' | 'time' | 'dur' | 'lead'
  function T(h, min, mer, extra) { var o = { h: h, min: min || 0, mer: mer || null }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
  function validT(t) { return t && t.h >= 0 && t.h <= 23 && t.min >= 0 && t.min <= 59 && !(t.mer && t.h > 12); }

  function nextWeekday(now, wd, mode) {
    var t = today(now), cur = weekdayOf(t);
    var delta = (wd - cur + 7) % 7;
    if (mode === 'this') return addDays(t, delta);                    // 0..6
    if (delta === 0) delta = 7;                                         // bare / coming: strictly after today
    if (mode === 'following') return addDays(t, delta + 7);
    return addDays(t, delta);
  }
  function weekdayNextWeek(now, wd) {
    var t = today(now), iso = (weekdayOf(t) + 6) % 7;                 // Mon=0
    var mondayNext = addDays(t, 7 - iso);
    return addDays(mondayNext, (wd + 6) % 7);
  }
  function inferYear(now, m, d, y) {
    if (y) { if (y < 100) y += 2000; return { y: y, m: m, d: d, explicitYear: true }; }
    var cand = { y: now.y, m: m, d: d };
    if (validDate(cand) && cmpDate(cand, today(now)) < 0) cand.y++;
    return cand;
  }
  function validDate(dt) { return dt.m >= 1 && dt.m <= 12 && dt.d >= 1 && dt.d <= daysInMonth(dt.y, dt.m); }
  function D(date, extra) { var o = { date: date }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }

  var PATTERNS = [
    // ---------- dates
    { cat: 'date', re: R('\\b(?:on\\s+|by\\s+|for\\s+)?(?:the\\s+)?day after tomorrow\\b|\\b(?:parson|parso|parsoon|parsun|parsõ|parva|paravaa|parwa)\\b'), fn: function (m, now) { var o = D(addDays(today(now), 2)); if (/parv|parw/i.test(m[0])) o.note = '“parva” read as day after tomorrow'; return o; } },
    { cat: 'date', re: R('\\b(?:by\\s+|for\\s+)?(?:tomorrow|tomorow|tommorow|tmrw|kal|udya|udyaa|udhya|udyala)\\b'), fn: function (m, now) {
        var o = D(addDays(today(now), 1)); if (/kal/i.test(m[0])) o.note = '“kal” read as tomorrow'; return o; } },
    { cat: 'date', re: R('\\b(?:by\\s+|for\\s+)?(?:today|aaj|tonight)\\b'), fn: function (m, now) { return D(today(now)); } },
    { cat: 'date', re: R('\\b(?:yesterday|kaal)\\b'), fn: function (m, now) { return D(addDays(today(now), -1)); } },
    { cat: 'date', re: R('\\b(?:(?:on|by|for)\\s+)?(?:(this coming|next|this|coming|upcoming|agle|agla|is|pudhchya|pudhcha|pudhil|ya)\\s+)?(?:(next|this) week\\s+)?' + WD + 'i?(?:\\s+(next week|this week|agle hafte))?\\b'),
      fn: function (m, now, st) {
        var mod = (m[1] || '').toLowerCase().replace(/^(pudhchya|pudhcha|pudhil)$/, 'coming').replace(/^ya$/, 'this'), wk = (m[2] || m[4] || '').toLowerCase(), wd = WEEKDAYS[m[3].toLowerCase()];
        if (/next|agle/.test(wk)) return D(weekdayNextWeek(now, wd));
        if (wk === 'this week' || mod === 'this' || mod === 'is') return D(nextWeekday(now, wd, 'this'));
        if (mod === 'next') {
          var coming = nextWeekday(now, wd, 'coming');
          var following = weekdayNextWeek(now, wd);
          if ((st.nextWeekday || 'coming') === 'following') return D(following);
          var o = D(coming);
          if (!sameDate(coming, following)) o.note = '“next ' + cap(m[3].toLowerCase()) + '” read as ' + fmtDate(coming, now) + ' (the coming one)';
          return o;
        }
        return D(nextWeekday(now, wd, 'coming'));
      } },
    { cat: 'date', re: R('\\b(?:in|after|within)\\s+(?:the next\\s+)?' + CNT + '\\s+(days?|weeks?|months?|years?|din|hafte|hafton|mahine)\\b|\\b' + CNT + '\\s+(days?|weeks?|months?|din|hafte|mahine)\\s+(?:later|baad|bad|from now|from today)\\b'),
      fn: function (m, now) {
        var n = num(m[1] || m[3]), u = (m[2] || m[4]).toLowerCase();
        if (isNaN(n) || n !== Math.floor(n)) return null;
        var t = today(now);
        if (/^(day|din)/.test(u)) return D(addDays(t, n));
        if (/^(week|haft)/.test(u)) return D(addDays(t, 7 * n));
        if (/^(month|mahin)/.test(u)) return D(addMonths(t, n));
        if (/^year/.test(u)) return D(addMonths(t, 12 * n));
        return null;
      } },
    { cat: 'date', re: R('\\b' + CNT + '\\s+(divsanni|divasanni|divsani|divasani|aathvadyanni|aathvadyani|athvadyanni|mahinyanni|mahinyani)\\b'),
      fn: function (m, now) {
        var n = num(m[1]), u = m[2].toLowerCase(); if (isNaN(n) || n !== Math.floor(n)) return null;
        var t = today(now);
        if (/^div/.test(u)) return D(addDays(t, n));
        if (/thv/.test(u)) return D(addDays(t, 7 * n));
        return D(addMonths(t, n));
      } },
    { cat: 'time', pri: 1, re: R('\\b(?:in|after)\\s+' + CNT + '\\s+(hours?|hrs?|minutes?|mins?|ghante|ghanta)\\b|\\b' + CNT + '\\s+(hours?|minutes?|mins?|ghante|ghanta|minute)\\s+(?:baad|bad|later|from now)\\b'),
      fn: function (m, now) {
        var n = num(m[1] || m[3]), u = (m[2] || m[4]).toLowerCase();
        if (isNaN(n)) return null;
        var mins = /^(h|g)/.test(u) ? Math.round(n * 60) : Math.round(n);
        var r = fromAbsMin(nowMin(now) + mins);
        return T(r.time.h, r.time.min, null, { exact: true, date: r.date, relative: true });
      } },
    { cat: 'date', re: R('\\b(?:on\\s+|by\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MONTH + '(?:\\s*,?\\s*(\\d{4}))?\\b'),
      fn: function (m, now) { var d = inferYear(now, MONTHS[m[2].toLowerCase()], +m[1], m[3] ? +m[3] : 0); return validDate(d) ? D({ y: d.y, m: d.m, d: d.d }) : { invalid: m[0] }; } },
    { cat: 'date', re: R('\\b(?:on\\s+|by\\s+)?' + MONTH + '\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b'),
      fn: function (m, now) { var d = inferYear(now, MONTHS[m[1].toLowerCase()], +m[2], m[3] ? +m[3] : 0); return validDate(d) ? D({ y: d.y, m: d.m, d: d.d }) : { invalid: m[0] }; } },
    { cat: 'date', re: R('\\b(?:on\\s+|by\\s+)?(\\d{1,2})[\\/-](\\d{1,2})(?:[\\/-](\\d{2,4}))?\\b'),
      fn: function (m, now) { var d = inferYear(now, +m[2], +m[1], m[3] ? +m[3] : 0); return validDate(d) ? D({ y: d.y, m: d.m, d: d.d }, { note: m[1] + '/' + m[2] + ' read as day/month' }) : { invalid: m[0] }; } },
    { cat: 'date', re: R('\\b(?:on\\s+|by\\s+)?the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b|\\b(\\d{1,2})\\s*(?:tarikh|tareekh|taarikh)\\b|\\b(?:on|by)\\s+(\\d{1,2})(?:st|nd|rd|th)\\b'),
      fn: function (m, now) {
        var dd = +(m[1] || m[2] || m[3]), t = today(now), c = { y: t.y, m: t.m, d: dd };
        if (!validDate(c) || cmpDate(c, t) < 0) { var nm = addMonths({ y: t.y, m: t.m, d: 1 }, 1); c = { y: nm.y, m: nm.m, d: dd }; }
        return validDate(c) ? D(c) : { invalid: m[0] };
      } },
    { cat: 'date', re: R('\\b(?:(?:on|by|this|over the|on the)\\s+)?weekend\\b'),
      fn: function (m, now) { var d = nextWeekday(now, 6, 'this'); return D(d, { note: '“weekend” read as Saturday ' + fmtDate(d, now) }); } },
    { cat: 'date', re: R('\\b(?:pudhchya|pudhil)\\s+(?:aathvadyat|aathavdyat|athvadyat|aathvada|mahinyat)\\b|\\b(?:next|agle|agla)\\s+(week|hafte|month|mahine)\\b|\\blater this week\\b|\\bsometime\\b'),
      fn: function (m) { return { vague: m[0] }; } },

    // ---------- times
    { cat: 'time', pri: 2, re: R('\\b(?:from|between)?\\s*' + NUM + '(?:[:.](\\d{2}))?\\s*' + '(?:' + MER + ')?\\s*(?:to|till|until|and|-|–)\\s*' + NUM + '(?:[:.](\\d{2}))?\\s*' + MER),
      fn: function (m) {
        var sh = num(m[1]), sm = +(m[2] || 0), smer = merOf(m[3]), eh = num(m[4]), em = +(m[5] || 0), emer = merOf(m[6]);
        if (isNaN(sh) || isNaN(eh) || sh > 12 || eh > 12) return null;
        var e24 = (eh % 12) + (emer === 'pm' ? 12 : 0);
        var s24;
        if (smer) s24 = (sh % 12) + (smer === 'pm' ? 12 : 0);
        else { s24 = (sh % 12) + (emer === 'pm' ? 12 : 0); if (s24 * 60 + sm > e24 * 60 + em) s24 -= 12; if (s24 < 0) s24 += 12; }
        var dur = (e24 * 60 + em) - (s24 * 60 + sm); if (dur <= 0) dur += 24 * 60;
        return T(s24, sm, null, { exact: true, durationMin: dur });
      } },
    { cat: 'time', re: R('\\b' + PREP + '(\\d{1,2})[:.](\\d{2})\\s*(?:' + MER + ')?(?!\\s*(?:hours?|hrs?|minutes?|mins?|%|\\d))'),
      fn: function (m) {
        var h = +m[1], mi = +m[2], mer = merOf(m[3]);
        var t = T(h, mi, mer);
        if (!validT(t)) { if (h <= 23 && mi <= 59) t = T(h, mi, null); else return null; }
        if (!mer && (h >= 13 || h === 0 || /^0\d/.test(m[1]))) t.exact = true;
        return t;
      } },
    { cat: 'time', re: R('\\b' + PREP + '(12\\s*)?(noon|midday|midnight)\\b'), fn: function (m) { return /midnight/i.test(m[2]) ? T(0, 0, null, { exact: true }) : T(12, 0, null, { exact: true }); } },
    { cat: 'time', re: R('\\b' + PREP + '(half past|quarter past|quarter to)\\s+' + NUM + '(?:\\s*' + MER + '|\\s+in the\\s+(morning|afternoon|evening|night))?'),
      fn: function (m) {
        var h = num(m[2]), k = m[1].toLowerCase(); if (isNaN(h)) return null;
        var mer = merOf(m[3]) || (m[4] ? (/morning/i.test(m[4]) ? 'am' : 'pm') : null);
        if (k === 'half past') return T(h, 30, mer);
        if (k === 'quarter past') return T(h, 15, mer);
        return T(h === 1 ? 12 : h - 1, 45, mer);
      } },
    { cat: 'time', re: R('\\b' + PREP + NUM + '\\s*' + MER), fn: function (m) { var h = num(m[1]); if (isNaN(h) || h > 12 || h < 1) return null; return T(h, 0, merOf(m[2])); } },
    { cat: 'time', re: R('\\b' + PREP + NUM + "\\s*o'?\\s?clock\\b"), fn: function (m) { var h = num(m[1]); return isNaN(h) || h > 12 ? null : T(h, 0, null); } },
    { cat: 'time', re: R('\\b' + NUM + '(?:[:.](\\d{2}))?\\s+in the\\s+(morning|afternoon|evening|night)\\b'),
      fn: function (m) { var h = num(m[1]); if (isNaN(h) || h > 12) return null; return T(h, +(m[2] || 0), /morning/i.test(m[3]) ? 'am' : 'pm'); } },
    { cat: 'time', re: R('\\b' + PREP + '(sade|saade|sadhe|savaa|sava|sawa|paune|pone)\\s+' + HNUM + '\\s*(?:baje|bje|vajta|vajata|vaajta)?\\b'),
      fn: function (m) {
        var k = m[1].toLowerCase(), h = num(m[2]); if (isNaN(h) || h > 12) return null;
        if (/^s(a|aa)d/.test(k)) return T(h, 30, null);
        if (/^s(a|aw)v|^saw/.test(k)) return T(h, 15, null);
        return T(h === 1 ? 12 : h - 1, 45, null);
      } },
    { cat: 'time', re: R('\\b(dedh|derh|deed|did|dhai|dhaai|adhai|dhaayi|adich|adeech)\\s*(?:baje|bje|vajta|vajata|vaajta)\\b'), fn: function (m) { return /^d(e|i)/i.test(m[1]) ? T(1, 30, null) : T(2, 30, null); } },
    { cat: 'time', re: R('\\b' + PREP + HNUM + '(?:[:.](\\d{2}))?\\s*(?:baje|bje|vajta|vajata|vaajta)\\b'), fn: function (m) { var h = num(m[1]); if (isNaN(h) || h > 23) return null; var t = T(h, +(m[2] || 0), null); if (h >= 13) t.exact = true; return t; } },
    { cat: 'time', re: R('\\b(?:at|by|around|about|till|until|from)\\s+' + NUM + '(?:[:.\\s](\\d{2}|thirty|fifteen|forty[- ]five))?(?!\\s*(?:days?|weeks?|months?|years?|hours?|hrs?|minutes?|mins?|people|persons|percent|%|st|nd|rd|th|\\/|-\\d))\\b'),
      fn: function (m) {
        var h = num(m[1]); if (isNaN(h) || h > 23) return null;
        var mm = m[2] ? (/^\d/.test(m[2]) ? +m[2] : (/thirty/i.test(m[2]) ? 30 : /fifteen/i.test(m[2]) ? 15 : 45)) : 0;
        var t = T(h, mm, null); if (!validT(t)) return null; if (h >= 13 || h === 0) t.exact = true; return t;
      } },

    // ---------- duration
    { cat: 'dur', re: R('\\bfor\\s+(?:about\\s+|around\\s+)?(half an hour|an hour and a half|one and a half hours?|1\\.5 hours?|' + CNT + '\\s*(hours?|hrs?|minutes?|mins?|ghante|ghanta))\\b'),
      fn: function (m) {
        var s = m[1].toLowerCase();
        if (/half an hour/.test(s)) return { durationMin: 30 };
        if (/and a half|1\.5/.test(s)) return { durationMin: 90 };
        var n = num(m[2]); if (isNaN(n)) return null;
        return { durationMin: /^(h|g)/.test(m[3].toLowerCase()) ? Math.round(n * 60) : Math.round(n) };
      } },
    { cat: 'dur', re: R('\\b' + CNT + '[-\\s](hour|minute|min)(?=\\s+(?:meeting|call|appointment|session|slot|class|interview|discussion))'),
      fn: function (m) { var n = num(m[1]); if (isNaN(n)) return null; return { durationMin: /^h/i.test(m[2]) ? n * 60 : n }; } },

    // ---------- custom alert lead ("remind me 2 hours before")
    { cat: 'lead', re: R(',?\\s*\\b(?:and\\s+)?(?:please\\s+)?(?:remind me|alert me|notify me)\\s+' + CNT + '\\s*(minutes?|mins?|hours?|hrs?|days?|ghante|din)\\s+(?:before|earlier|pehle|in advance)(?:\\s+(?:that|it|the appointment|the meeting))?'),
      fn: function (m) {
        var n = num(m[1]), u = m[2].toLowerCase(); if (isNaN(n)) return null;
        return { leadMin: /^(d)/.test(u) ? n * 1440 : /^(h|g)/.test(u) ? n * 60 : n };
      } }
  ];

  function catOf(c) { return c === 'time' ? 'time' : c === 'date' ? 'date' : c; }

  function scan(text, now, st) {
    var found = [];
    for (var i = 0; i < PATTERNS.length; i++) {
      var p = PATTERNS[i];
      p.re.lastIndex = 0;
      var m;
      while ((m = p.re.exec(text))) {
        if (m[0].length === 0) { p.re.lastIndex++; continue; }
        var lead = m[0].match(/^\s*/)[0].length;
        var v = p.fn(m, now, st || {});
        if (v) found.push({ cat: p.cat, start: m.index + lead, end: m.index + m[0].length, value: v, text: m[0].slice(lead), pri: p.pri || 0 });
      }
    }
    found.sort(function (a, b) { return (b.end - b.start) - (a.end - a.start) || b.pri - a.pri || a.start - b.start; });
    var chosen = [];
    for (var j = 0; j < found.length; j++) {
      var f = found[j], clash = false;
      for (var k = 0; k < chosen.length; k++) if (f.start < chosen[k].end && chosen[k].start < f.end) { clash = true; break; }
      if (!clash) chosen.push(f);
    }
    chosen.sort(function (a, b) { return a.start - b.start; });
    return chosen;
  }

  // Resolve a scanned time to 24h, or report AM/PM ambiguity.
  function resolveTime(v, segText) {
    if (v.exact) return { time: { h: v.h, min: v.min } };
    if (v.mer) return { time: { h: (v.h % 12) + (v.mer === 'pm' ? 12 : 0), min: v.min } };
    if (v.h >= 13 || v.h === 0) return { time: { h: v.h, min: v.min } };
    var am = AM_CTX.test(segText), pm = PM_CTX.test(segText);
    if (am && !pm) return { time: { h: v.h % 12, min: v.min } };
    if (pm && !am) {
      if (/\b(night|raat|ratri)\b/i.test(segText) && v.h === 12) return { time: { h: 0, min: v.min } };
      return { time: { h: (v.h % 12) + 12, min: v.min } };
    }
    return { ambiguous: { h: v.h, min: v.min } };
  }

  // ---------------------------------------------------------------- corrections
  var STRONG_MARK = 'sorry|no wait|wait no|no no|i mean|i meant|correction|or rather|make it|make that|change it to|change that to|nahi nahi|nahin nahin';
  var WEAK_MARK = 'no|actually|rather|nahi|nahin|matlab';
  var MARK_RE = R('(\\s*[,;.!—–-]+\\s*|\\s+)(' + STRONG_MARK + '|' + WEAK_MARK + ')\\b\\s*[,;:.!—–-]*\\s*');

  function applyCorrections(text, now, st, notes) {
    var guard = 0, from = 0;
    while (guard++ < 8) {
      MARK_RE.lastIndex = from;
      var m = MARK_RE.exec(text);
      if (!m) break;
      var punct = /[,;.!—–-]/.test(m[1]);
      var marker = m[2].toLowerCase();
      var strong = R('^(?:' + STRONG_MARK + ')$', 'i').test(marker);
      var before = text.slice(0, m.index), after = text.slice(m.index + m[0].length);
      if (!before.trim()) { from = m.index + m[0].length; continue; }
      var aph = scan(after, now, st);
      var y = aph.length && aph[0].start === 0 ? aph[0] : null;
      if (y && (y.cat === 'date' || y.cat === 'time')) {
        var bph = scan(before, now, st), x = null;
        for (var i = bph.length - 1; i >= 0; i--) if (bph[i].cat === y.cat) { x = bph[i]; break; }
        if (x && /\b(?:not|nahi|nahin)\s*$/i.test(before.slice(0, x.start))) x = null;  // "not X, make it Y" is handled elsewhere
        if (x) {
          var yText = y.text.replace(/^(?:on|at|by|for|from)\s+/i, '');
          var xPrefix = (x.text.match(/^(?:on|at|by|for|from)\s+/i) || [''])[0];
          if (!/^(?:on|at|by|for|from)\s+/i.test(y.text) || !xPrefix) xPrefix = xPrefix || '';
          var rebuilt = before.slice(0, x.start) + xPrefix + yText + before.slice(x.end);
          notes.push(x.text + ' → ' + yText);
          text = squash(rebuilt + ' ' + after.slice(y.end));
          from = 0;
          continue;
        }
        if (/^(make it|make that|change it to|change that to)$/.test(marker)) { from = m.index + m[0].length; continue; }
      }
      if (strong && punct && !/^(make it|make that|change it to|change that to)$/.test(marker)) {
        // generic replacement: "call Rahul, sorry, Rohit" → "call Rohit"
        var stop = after.search(/[,.;!?—–]/);
        var yRaw = stop >= 0 ? after.slice(0, stop) : after;
        if (aph.length && aph[0].start > 0 && aph[0].start < yRaw.length) yRaw = after.slice(0, aph[0].start);
        var yw = words(yRaw).slice(0, 4);
        if (yw.length) {
          var bw = words(before.replace(/[,;.!—–-]+\s*$/, ''));
          var xw = bw.splice(bw.length - yw.length, yw.length);
          notes.push(xw.join(' ') + ' → ' + yw.join(' '));
          var rest = after.slice(after.indexOf(yw[yw.length - 1]) + yw[yw.length - 1].length);
          text = squash(bw.join(' ') + ' ' + yw.join(' ') + rest);
          from = 0;
          continue;
        }
      }
      from = m.index + m[0].length;
    }
    return text;
  }

  // "not 3 PM, make it 5 PM" / "make it 5 PM instead of 3 PM" / "Wednesday, not Tuesday"
  function applyNot(text, now, st, notes) {
    var guard = 0;
    var re = /\b(?:not|nahi|nahin)\s+/gi, m;
    while (guard++ < 5) {
      re.lastIndex = 0; var changed = false;
      while ((m = re.exec(text))) {
        var afterNot = text.slice(m.index + m[0].length);
        var ph = scan(afterNot, now, st);
        if (!ph.length || ph[0].start !== 0 || (ph[0].cat !== 'date' && ph[0].cat !== 'time')) continue;
        var x = ph[0];
        var rest = afterNot.slice(x.end);
        var conn = rest.match(/^\s*[,;—–-]*\s*(?:but\s+|make it\s+|make that\s+|rather\s+|it'?s\s+|it is\s+|change it to\s+|instead\s+|its\s+)?/i);
        var rest2 = rest.slice(conn[0].length);
        var ph2 = scan(rest2, now, st);
        var before = text.slice(0, m.index);
        if (ph2.length && ph2[0].start === 0 && ph2[0].cat === x.cat) {
          var y = ph2[0];
          var bph = scan(before, now, st), old = null;
          for (var i = bph.length - 1; i >= 0; i--) if (bph[i].cat === x.cat) { old = bph[i]; break; }
          if (old) text = squash(before.slice(0, old.start) + y.text + before.slice(old.end).replace(/[,;—–-]\s*$/, '') + ' ' + rest2.slice(y.end));
          else text = squash(before + y.text + ' ' + rest2.slice(y.end));
          notes.push(x.text + ' → ' + y.text);
          changed = true; break;
        }
        // "Wednesday, not Tuesday" → drop ", not Tuesday"
        var bph2 = scan(before, now, st);
        var lastB = bph2.length ? bph2[bph2.length - 1] : null;
        if (lastB && lastB.cat === x.cat && /^[\s,;—–-]*$/.test(before.slice(lastB.end))) {
          text = squash(before.replace(/[\s,;—–-]+$/, '') + ' ' + rest);
          notes.push(x.text + ' → ' + lastB.text);
          changed = true; break;
        }
      }
      if (!changed) break;
    }
    // "make it 5 PM instead of 3 PM"
    text = text.replace(/\s*,?\s*instead of\s+([^,.;]+)/gi, function (all, xx) {
      var p = scan(xx, now, st); if (p.length && p[0].start === 0) { notes.push(p[0].text + ' → (replaced)'); return ''; } return all;
    });
    return squash(text);
  }

  // ---------------------------------------------------------------- segmentation
  var COUNT_WORDS_LEAD = '(?:\\d+|an?|half|one|two|three|four|five|six|ten|fifteen|twenty|thirty)';
  var STARTER = R('^(?:(?:and|also|then|plus|oh|ok(?:ay)?|so|and also|one more thing|another thing|aur|aur haan)[,\\s]+)*' +
    '(?:i (?:also )?(?:have|got|\'ve got)\\s+(?:an?|my|another|one more)\\b|i\'ve got\\s+(?:an?|my)\\b|there(?:\'s| is)\\s+(?:an?|my)\\b|we have\\s+(?:an?)\\b|' +
    '(?:please\\s+)?remind me\\b(?!\\s+' + COUNT_WORDS_LEAD + '\\s*\\w*\\s+(?:before|earlier|pehle|in advance))|set (?:an?|my) (?:reminder|meeting|appointment)\\b|' +
    'i (?:need|have|want) to\\b|i must\\b|don\'t forget\\b|do not forget\\b|make sure\\b|remember to\\b|(?:another|one more|new) (?:idea|task|thing|reminder|appointment|meeting)\\b|' +
    'idea\\s*[:,]|todo\\b|to-do\\b|schedule\\b|book (?:an?|my)\\b|mujhe\\b|mala\\b|(?:majhi|maajhi|mazi|ajun ek)\\s+kalpana\\b|to\\s+(?:' + 'call|buy|get|pay|send|email|book|pick up|check|order|submit|bring|renew|collect|meet|text|message' + ')\\b)', 'i');
  var INNER_SPLIT = R('(?:,\\s*|\\s+)(?:and\\s+)?(?:also\\s+)?(?=(?:please\\s+)?remind me\\b(?!\\s+' + COUNT_WORDS_LEAD + '\\s*\\w*\\s+(?:before|earlier|pehle|in advance))|i (?:also )?have (?:an?|my|another)\\s+(?!idea)\\w|i need to\\b|i have to\\b|don\'t forget\\b|another idea\\b|one more (?:thing|idea)\\b)' +
    '|,?\\s+and also\\s+(?=to\\s+(?:call|buy|get|pay|send|email|book|pick up|check|order|submit|bring|renew|collect|meet|text|message)\\b)', 'gi');
  var LEAD_ONLY = R('^(?:and\\s+)?(?:please\\s+)?(?:remind me|alert me|notify me)\\s+' + CNT + '\\s*\\w+\\s+(?:before|earlier|pehle|in advance)', 'i');

  function splitSentences(text) {
    var out = [], buf = '';
    for (var i = 0; i < text.length; i++) {
      var c = text[i]; buf += c;
      if (/[.!?।]/.test(c) && (i + 1 >= text.length || /\s/.test(text[i + 1]))) {
        // don't split "a.m." / "p.m." / "Dr."
        if (/\b(?:a\.m|p\.m|dr|mr|mrs|ms|st|no)\.$/i.test(buf.trim())) continue;
        out.push(buf.trim()); buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function segment(text, now, st) {
    var pieces = [];
    splitSentences(text).forEach(function (s) {
      var idx = [0]; var m; INNER_SPLIT.lastIndex = 0;
      while ((m = INNER_SPLIT.exec(s))) { if (m.index > 0) idx.push(m.index); if (m[0].length === 0) INNER_SPLIT.lastIndex++; }
      for (var i = 0; i < idx.length; i++) {
        var part = s.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : s.length).replace(/^[\s,;]+/, '');
        if (part.trim()) pieces.push({ text: part.trim(), sentenceStart: i === 0 });
      }
    });
    var groups = [];
    pieces.forEach(function (p, i) {
      var isNew = i === 0 || (STARTER.test(p.text) && !LEAD_ONLY.test(p.text)) ||
        // a new sentence with its own appointment/reminder AND its own date or time is a separate item
        (p.sentenceStart && now && (APPT_NOUN.test(p.text) || REMIND_CUE.test(p.text)) && scan(p.text, now, st).some(function (x) { return x.cat === 'date' || x.cat === 'time'; }));
      if (isNew) groups.push(p.text);
      else groups[groups.length - 1] += (p.sentenceStart ? ' ' : ', ') + p.text;
    });
    return groups.map(squash).filter(function (g) { return /[a-zऀ-ॿ]/i.test(g); });
  }

  // ---------------------------------------------------------------- classification
  var APPT_NOUN = /\b(appointment|appt|meeting|interview|consultation|check-?up|session|class|lecture|flight|train|dinner|lunch|breakfast|party|wedding|function|event|visit|demo|presentation|webinar|call with|catch[- ]up|mulakat|doctor|dentist|hospital|clinic|surgery|exam|bhet|mulakhat)\b|अपॉइंटमेंट|अपोइंटमेंट|मीटिंग|डॉक्टर|मुलाकात|भेट|मुलाखत|दवाखान|मिटिंग|इंटरव्ह्यू|इंटरव्यू|डिनर|लंच/i;
  var TASK_CUE = /\b(remind me|reminder|yaad dila\w*|need to|have to|has to|must|don't forget|do not forget|make sure|remember to|todo|to-do|task|karna hai|karna he|aathvan karun de|athvan karun de|aathavan karun de|lakshat aanun de|karaycha|karaychi|karayche|karaychay|bharaycha|jaycha|jaaycha|ghyaycha|aanaycha)\b|करायच|करायचं|जायच|जायचं|भरायच|आणायच|घ्यायच|करना है|जाना है/i;
  var REMIND_CUE = /\b(remind me|reminder|yaad dila\w*|alert me|notify me|aathvan karun de|athvan karun de|aathavan karun de|lakshat aanun de)\b/i;
  var TASK_VERB = /^(?:please\s+)?(call|phone|ring|email|mail|message|text|whatsapp|buy|get|order|pay|send|submit|finish|complete|check|fix|renew|book|pick up|drop|collect|bring|clean|prepare|write|review|file|apply|transfer|deposit|withdraw|return|recharge|follow up|contact|ask|tell|share|print|update|upload|download)\b/i;
  var IDEA_START = /^(?:(?:and|also|so|ok(?:ay)?|oh)[,\s]+)*(?:i (?:have|got|'ve got|also have)\s+(?:an?|another|one more)\s+(?:new\s+)?(?:idea|thought)|i've got\s+an?\s+idea|(?:another|one more|new)\s+(?:idea|thought)|idea\s*[:,.-]|thought\s*[:,.-]|note\s*[:,.-]|what if\b|how about\b|(?:majhi|maajhi|mazi|ek|ajun ek)\s+kalpana\b|kalpana\s*[:,.-])/i;
  var IDEA_CUE = /\b(idea|what if|how about|we should|we could|we can|maybe we|brainstorm|concept|note to self|kalpana)\b/i;

  function classify(text, hasDate, hasTime) {
    if (IDEA_START.test(text)) return 'idea';
    if (APPT_NOUN.test(text) && !/\b(remind me to|yaad dila\w* ki)\b/i.test(text) &&
        (hasDate || hasTime || /\b(i have|i've got|there is|there's|schedule|book|hai|aahe|ahe)\b/i.test(text))) return 'appointment';
    var stripped = text.replace(/^(?:(?:and|also|so|ok(?:ay)?|please|to)[,\s]+)*/i, '');
    if (TASK_CUE.test(text) || TASK_VERB.test(stripped)) return 'task';
    if (IDEA_CUE.test(text)) return 'idea';
    if (hasDate && hasTime) return 'appointment';
    if (hasDate || hasTime) return 'task';
    return 'idea';
  }

  // ---------------------------------------------------------------- titles & pointers
  var STRIP_START = [
    /^(?:ok(?:ay)?|so|well|hey|listen|and|also|then|plus|oh|aur|aur haan|another thing is|another thing|one more thing)[,\s]+/i,
    /^(?:i (?:also )?(?:have|got|'ve got)|i've got|there(?:'s| is))\s+(?:an?|one more|another|my)?\s*(?:new\s+)?(?:idea|thought)\b[\s,.:;-]*(?:that|where|is|for)?\s*/i,
    /^(?:another|one more|new)\s+(?:idea|thought)\b[\s,.:;-]*(?:is|that)?\s*/i,
    /^(?:idea|note|thought)\s*[:,.-]\s*/i,
    /^(?:please\s+)?(?:remind me|set (?:an?|my) reminder|reminder|alert me)\s*(?:to|that|about|of|for)?\s*/i,
    /^(?:i (?:need|have|want|'ve got|got) to|i've got to|i must|i should|don't forget to|do not forget to|make sure (?:to|that i|i)|remember to|todo|to-do|task)\s*[:,]?\s*/i,
    /^(?:i (?:also )?(?:have|'ve got|got)|i've got|there(?:'s| is)|we have|i've)\s+(?:an?|my|the)\s+/i,
    /^(?:schedule|book|set up|add|create|set)\s+(?:an?|my|the)?\s*/i,
    /^(?:mujhe|mujhko|meri|mera|mere|mala|majhi|maajhi|mazi|maza|majha)\s+/i,
    /^(?:ajun ek\s+|ek\s+)?kalpana\b[\s,.:;-]*/i,
    /^(?:please)\s+/i,
    /^to\s+(?=\w)/i,
    /^(?:la|ko)\s+(?=\w)/i
  ];
  var STRIP_END = [
    /[\s,]+(?:yaad dila(?:na|ana|o|dena|dijiye)?|yaad dilana)(?:\s+(?:hai|he|h))?\s*$/i,
    /[\s,]+(?:remind me|please|aathvan karun de|athvan karun de|aathavan karun de|lakshat aanun de)\s*$/i,
    /[\s,]+(?:hai|hain|he|h|aahe|ahe|aahet|है|हैं|आहे|आहेत)\s*$/i,
    /[\s,]+(?:on|at|by|for|from|in|the|around|about|till|until|before|after|ko|ke|ka|ki|se|la|and|to|of|with)\s*$/i
  ];
  function stripStart(s) { var prev; do { prev = s; for (var i = 0; i < STRIP_START.length; i++) s = s.replace(STRIP_START[i], ''); } while (s !== prev); return s; }
  function stripEnd(s) { var prev; do { prev = s; s = s.replace(/[\s,.;:!?—–-]+$/, ''); for (var i = 0; i < STRIP_END.length; i++) s = s.replace(STRIP_END[i], ''); } while (s !== prev); return s; }

  // remove phrase spans (and adjacent "morning"/"shaam ko" words) from text
  function removeSpans(text, spans) {
    var out = text;
    var sorted = spans.slice().sort(function (a, b) { return b.start - a.start; });
    sorted.forEach(function (sp) {
      var s = sp.start, e = sp.end;
      var tail = out.slice(e).match(R('^\\s*(?:' + CTX_WORDS + ')\\b', 'i'));
      if (tail) e += tail[0].length;
      var head = out.slice(0, s).match(R('(?:^|\\s)(?:' + CTX_WORDS + ')\\s*$', 'i'));
      if (head) s -= head[0].replace(/^\s/, '').length;
      out = out.slice(0, s) + ' ' + out.slice(e);
    });
    out = out.replace(/\b(?:on|at|by|for|from|around|about)\s+(?=[,.;]|$)/gi, '');
    out = out.replace(/\b(?:on|at|by|around|about)\s+(?:on|at|by)\b/gi, '');
    out = out.replace(/\s+([,.;!?])/g, '$1').replace(/([,;])\s*([,;.])/g, '$2').replace(/^[\s,.;]+/, '');
    return squash(out);
  }

  var POINTER_VERBS = 'test|change|convert|add|remove|make|create|launch|call|email|send|buy|check|ask|talk|build|update|fix|try|use|start|stop|hire|reduce|increase|offer|run|share|review|write|plan|design|move|improve|get|set|book|meet|contact|prepare|introduce|replace|redesign|sell|price|promote|focus|collect|survey|measure|target|partner|post|record|film|automate|cut|raise|lower|give|tell|show|find|look|research|explore|expand|open|close';
  function toPointers(body) {
    var b = body.replace(R('\\s+and\\s+(?=(?:then\\s+)?(?:we\\s+(?:should|could|can|will|might)\\s+)?(?:also\\s+)?(?:' + POINTER_VERBS + ')\\b)', 'gi'), ', ');
    var parts = b.split(/\s*(?:[;\n]|\.\s+|,\s*(?:and\s+)?(?:then\s+)?|\s+and then\s+|\s+then\s+)\s*/i);
    var out = [];
    parts.forEach(function (p) {
      p = p.replace(/^(?:and|also|then|so|plus)\s+/i, '');
      p = p.replace(/^(?:i think|maybe|perhaps|probably)\s+/i, '');
      p = p.replace(/^(?:we|i)\s+(?:should|could|can|might|will|would)\s+(?:also\s+)?/i, '');
      p = p.replace(/^(?:let'?s|lets)\s+/i, '');
      p = stripEnd(p.trim());
      if (!p) return;
      if (out.length && words(p).length < 2) { out[out.length - 1] = out[out.length - 1] + ', ' + p; return; }
      out.push(p);
    });
    // a 1-word first fragment merges forward
    if (out.length > 1 && words(out[0]).length < 2) { out[1] = out[0] + ', ' + out[1]; out.shift(); }
    return out.map(function (p) { p = cap(p); return /[.!?]$/.test(p) ? p : p + '.'; });
  }
  function shortTitle(s) {
    s = s.replace(/[.!?]+$/, '');
    if (s.length <= 70) return s;
    var cut = s.slice(0, 70); var sp = cut.lastIndexOf(' ');
    return (sp > 30 ? cut.slice(0, sp) : cut) + '…';
  }

  // ---------------------------------------------------------------- item building
  var uid = 0;
  function newId(prefix) { uid++; return prefix + '-' + Date.now().toString(36) + '-' + uid; }

  function buildItem(seg, input, st) {
    var now = input.now;
    var phrases = scan(seg, now, st);
    var dates = phrases.filter(function (p) { return p.cat === 'date'; });
    var times = phrases.filter(function (p) { return p.cat === 'time'; });
    var durs = phrases.filter(function (p) { return p.cat === 'dur'; });
    var leads = phrases.filter(function (p) { return p.cat === 'lead'; });

    var item = { id: newId('d'), kind: 'idea', title: '', pointers: [], source: seg, date: null, time: null, durationMin: null,
      reminder: false, alertOffsetsMin: null, notes: [], pending: {}, questions: [] };

    // dates
    var realDates = dates.filter(function (d) { return d.value.date; });
    var distinct = [];
    realDates.forEach(function (d) { if (!distinct.some(function (x) { return sameDate(x.value.date, d.value.date); })) distinct.push(d); });
    if (distinct.length === 1) { item.date = distinct[0].value.date; if (distinct[0].value.note) item.notes.push(distinct[0].value.note); }
    else if (distinct.length > 1) item.pending.dateOptions = distinct.map(function (d) { return fmtDate(d.value.date, now); });
    dates.forEach(function (d) { if (d.value.invalid) item.pending.invalidDate = d.value.invalid; if (d.value.vague && !item.date) item.pending.vagueDate = d.value.vague; });

    // times
    var tDistinct = [];
    times.forEach(function (t) { if (!tDistinct.some(function (x) { return x.value.h === t.value.h && x.value.min === t.value.min && x.value.mer === t.value.mer; })) tDistinct.push(t); });
    if (tDistinct.length === 1) {
      var tv = tDistinct[0].value;
      var r = resolveTime(tv, seg);
      if (r.time) item.time = r.time; else item.pending.ampm = r.ambiguous;
      if (tv.date) item.date = tv.date;
      if (tv.durationMin) item.durationMin = tv.durationMin;
    } else if (tDistinct.length > 1) {
      var opts = [];
      tDistinct.forEach(function (t) { var rr = resolveTime(t.value, seg); if (rr.time) opts.push(fmtTime(rr.time)); else { opts.push(fmtTime({ h: rr.ambiguous.h % 12, min: rr.ambiguous.min })); opts.push(fmtTime({ h: rr.ambiguous.h % 12 + 12, min: rr.ambiguous.min })); } });
      item.pending.timeOptions = opts;
    }
    if (durs.length) item.durationMin = durs[durs.length - 1].value.durationMin;
    if (leads.length) item.alertOffsetsMin = [leads[0].value.leadMin];

    var hasDate = !!(item.date || item.pending.dateOptions || item.pending.vagueDate || item.pending.invalidDate);
    var hasTime = !!(item.time || item.pending.ampm || item.pending.timeOptions);
    var segNoLead = leads.length ? removeSpans(seg, leads) : seg;
    item.kind = classify(segNoLead, hasDate, hasTime);
    if (leads.length && item.kind !== 'appointment' && APPT_NOUN.test(segNoLead)) item.kind = 'appointment';

    // title text: remove phrases
    var body = removeSpans(seg, phrases);
    body = stripEnd(stripStart(body));

    if (item.kind === 'idea') {
      item.pointers = toPointers(body);
      item.title = shortTitle(item.pointers[0] || cap(body) || 'Idea');
      // ideas never create calendar entries
      item.date = null; item.time = null; item.pending = {};
      if (hasDate) item.notes.push('Saved as an idea (no calendar entry).');
      item.reminder = false;
    }
    if (item.kind !== 'idea' && /\b(every\s*day|daily|every (?:week|month|morning|evening|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly|monthly|har\s*(?:roz|din|hafte)|roz)\b/i.test(seg))
      item.notes.push('Repeating reminders are not supported yet — saved as a one-time item.');
    if (item.kind === 'idea') {
      // handled above
    } else if (item.kind === 'task') {
      item.title = shortTitle(cap(body) || 'Reminder');
      item.reminder = REMIND_CUE.test(seg) || hasTime;
      item.durationMin = null;
    } else {
      item.title = shortTitle(cap(body) || 'Appointment');
      item.reminder = true;
      if (!item.durationMin) { item.durationMin = st.defaultDurationMin || 60; item.notes.push('Duration ' + item.durationMin + ' min (default)'); }
    }

    // low-confidence words from the recognizer → confirm unclear names
    var low = (input.context && input.context.lowConfidence) || [];
    var confirm = low.filter(function (w) { return w && w.length > 2 && R('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(item.title); });
    if (confirm.length) item.pending.confirmWords = confirm.slice(0, 2);

    finalize(item, now, st);
    return item;
  }

  function finalize(item, now, st) {
    // task reminder with a time but no date → today if still ahead, else tomorrow
    if (item.kind === 'task' && item.time && !item.date && !item.pending.dateOptions && !item.pending.vagueDate && !item.pending.invalidDate) {
      var t = today(now);
      if (absMin(t, item.time) > nowMin(now)) { item.date = t; item.notes.push('No day given — set for today'); }
      else { item.date = addDays(t, 1); item.notes.push('No day given and that time has passed today — set for tomorrow'); }
    }
    item.questions = computeQuestions(item, now);
    return item;
  }

  function q(id, prompt, options) { return { id: id, prompt: prompt, options: options || [] }; }

  function computeQuestions(item, now) {
    var qs = [], p = item.pending || {};
    var what = item.title ? '“' + item.title + '”' : 'this';
    if (item.kind === 'idea') { if (p.confirmWords && p.confirmWords.length) qs.push(q('confirm', 'I heard “' + p.confirmWords[0] + '” — is that right?', ['Yes', 'Edit'])); return qs; }
    var needsDate = item.kind === 'appointment' || (item.kind === 'task' && item.reminder);
    if (item.date && cmpDate(item.date, today(now)) < 0 && !p.invalidDate) {
      qs.push(q('past', fmtDate(item.date, now) + ' is in the past. Which date did you mean? (Or discard if this was about something that already happened.)', []));
      return qs;
    }
    if (p.invalidDate) qs.push(q('date', '“' + p.invalidDate + '” isn’t a valid date. Which date did you mean?', []));
    else if (p.dateOptions) qs.push(q('date', 'Which day for ' + what + '?', p.dateOptions));
    else if (p.vagueDate && needsDate) qs.push(q('date', 'Which day “' + p.vagueDate + '”?', []));
    else if (!item.date && item.kind === 'appointment') qs.push(q('date', 'Which day is ' + what + '?', ['Today', 'Tomorrow', 'Day after tomorrow']));

    if (p.timeOptions) qs.push(q('time', 'I heard more than one time. Which one for ' + what + '?', p.timeOptions));
    else if (p.ampm) {
      var am = fmtHour(p.ampm.h, p.ampm.min, 'AM'), pm = fmtHour(p.ampm.h, p.ampm.min, 'PM');
      var likelyAm = p.ampm.h >= 7 && p.ampm.h <= 11;
      qs.push(q('ampm', 'Is that ' + am + ' or ' + pm + '?', likelyAm ? [am, pm] : [pm, am]));
    } else if (!item.time && item.kind === 'appointment') qs.push(q('time', 'What time is ' + what + '?', []));
    else if (!item.time && item.kind === 'task' && item.reminder) qs.push(q('time', 'What time should I remind you' + (item.date ? ' on ' + fmtDate(item.date, now) : '') + '?', []));

    if (!qs.length && item.date) {
      var t = today(now);
      if (item.time && absMin(item.date, item.time) <= nowMin(now) && (item.kind === 'appointment' || item.reminder))
        qs.push(q('past', fmtDate(item.date, now) + ' at ' + fmtTime(item.time) + ' has already passed. When should it be?', []));
      else if (!item.time && cmpDate(item.date, t) < 0)
        qs.push(q('past', fmtDate(item.date, now) + ' is in the past. Which date did you mean?', []));
    }
    if (p.confirmWords && p.confirmWords.length) qs.push(q('confirm', 'I heard “' + p.confirmWords[0] + '” — is that right?', ['Yes', 'Edit']));
    return qs;
  }

  // ---------------------------------------------------------------- edits ("move my dentist appointment to Friday")
  var EDIT_START = R('^\\s*(?:(?:no|sorry|actually|wait|oh|okay|ok|please)[,.!\\s]+)*(?:not\\s|make it\\b|make that\\b|change it\\b|change that\\b|change the (?:time|date)\\b|move it\\b|move that\\b|move (?:my|the)\\b|shift\\b|reschedule\\b|postpone\\b|prepone\\b|push\\b|delay\\b|change (?:my|the)\\b|update (?:my|the)\\b|cancel\\b|delete\\b|remove\\b|mark\\b|i(?:\'ve| have)? (?:done|finished|completed)\\b|done with\\b)', 'i');
  var EDIT_WORDS = /\b(no|sorry|actually|wait|oh|okay|ok|please|not|make|it|that|this|change|move|shift|reschedule|postpone|prepone|push|delay|update|cancel|delete|remove|mark|as|done|complete|completed|finished|i|i've|have|with|to|the|my|instead|of|from|on|at|for|by|time|date|one|later|earlier|again)\b/gi;
  var STOP = { a: 1, an: 1, and: 1, the: 1, my: 1, to: 1, with: 1, of: 1, for: 1, on: 1, at: 1, in: 1, ka: 1, ki: 1, ke: 1, ko: 1 };

  function tokens(s) { return (s.toLowerCase().match(/[a-z0-9ऀ-ॿ]+/g) || []).filter(function (w) { return !STOP[w] && w.length > 1; }); }
  function itemLabel(it, now) {
    var s = it.title;
    if (it.date) s += ' — ' + fmtDate(it.date, now) + (it.time ? ' ' + fmtTime(it.time) : '');
    return s;
  }

  function parseEdit(text, input, st) {
    var now = input.now, ctx = input.context || {}, items = ctx.items || [];
    var op = { id: newId('u'), targetId: null, targetTitle: null, candidates: [], changes: {}, notes: [], pending: {}, questions: [], source: text };
    var phrases = scan(text, now, st);
    var oldP = [], newP = [];
    phrases.forEach(function (p) {
      var pre = text.slice(Math.max(0, p.start - 14), p.start).toLowerCase();
      if (/\b(not|nahi|instead of|from)\s*$/.test(pre)) oldP.push(p); else newP.push(p);
    });
    var nd = newP.filter(function (p) { return p.cat === 'date' && p.value.date; }).pop();
    var nt = newP.filter(function (p) { return p.cat === 'time'; }).pop();
    var vague = newP.filter(function (p) { return p.cat === 'date' && p.value.vague; }).pop();
    if (nd) { op.changes.date = nd.value.date; if (nd.value.note) op.notes.push(nd.value.note); }
    if (vague && !nd) op.pending.vagueDate = vague.value.vague;
    if (nt) {
      var r = resolveTime(nt.value, text);
      if (r.time) op.changes.time = r.time; else op.pending.ampm = r.ambiguous;
      if (nt.value.date) op.changes.date = nt.value.date;
      if (nt.value.durationMin) op.changes.durationMin = nt.value.durationMin;
    }
    var dur = newP.filter(function (p) { return p.cat === 'dur'; }).pop();
    if (dur && !/\b(postpone|push|delay|prepone|later|earlier)\b/i.test(text)) op.changes.durationMin = dur.value.durationMin;

    var shift = text.match(R('\\b(?:by|for)\\s+' + CNT + '\\s+(minutes?|mins?|hours?|hrs?|days?|weeks?)\\b', 'i'));
    if (shift && /\b(postpone|push|delay|prepone|later|earlier|advance)\b/i.test(text)) {
      var n = num(shift[1]), u = shift[2].toLowerCase();
      var mins = /^d/.test(u) ? n * 1440 : /^w/.test(u) ? n * 10080 : /^h/.test(u) ? n * 60 : n;
      if (/\b(prepone|earlier|advance)\b/i.test(text)) mins = -mins;
      op.changes.shiftMin = mins;
      delete op.changes.durationMin;
    }
    if (/\b(cancel|delete|remove)\b/i.test(text)) op.changes.remove = true;
    if (/\b(mark\b.*\b(?:done|complete|completed|finished)|i(?:'ve| have)? (?:done|finished|completed)|done with)\b/i.test(text)) op.changes.complete = true;

    // target
    var spanless = removeSpans(text, phrases);
    var query = tokens(spanless.replace(EDIT_WORDS, ' '));
    var kindHint = /\b(appointment|meeting|interview|call with)\b/i.test(text) ? 'appointment' : /\b(task|reminder|todo)\b/i.test(text) ? 'task' : /\b(idea|note)\b/i.test(text) ? 'idea' : null;
    var target = null;
    if (!query.length) {
      if (kindHint) {
        var ofKind = items.filter(function (it) { return it.kind === kindHint; });
        if (ofKind.length === 1) target = ofKind[0];
        else if (ctx.lastItemId) { var li = items.filter(function (it) { return it.id === ctx.lastItemId && it.kind === kindHint; })[0]; if (li) target = li; }
        if (!target) op.candidates = ofKind.slice(0, 4);
      } else if (ctx.lastItemId) target = items.filter(function (it) { return it.id === ctx.lastItemId; })[0] || null;
    } else {
      var scored = items.map(function (it) {
        var tt = tokens(it.title);
        var s = 0; query.forEach(function (w) { if (tt.indexOf(w) >= 0) s += 1; else if (tt.some(function (x) { return x.length > 3 && (x.indexOf(w) === 0 || w.indexOf(x) === 0); })) s += 0.6; });
        if (kindHint && it.kind === kindHint) s += 0.5;
        return { it: it, s: s };
      }).filter(function (x) { return x.s >= 1; }).sort(function (a, b) { return b.s - a.s; });
      if (scored.length === 1 || (scored.length > 1 && scored[0].s - scored[1].s >= 0.99)) target = scored[0].it;
      else op.candidates = scored.slice(0, 4).map(function (x) { return x.it; });
    }
    if (target) { op.targetId = target.id; op.targetTitle = target.title; }
    op.candidates = op.candidates.map(function (it) { return { id: it.id, title: it.title, label: itemLabel(it, now) }; });
    op._targetSnapshot = target ? { date: target.date || null, time: target.time || null, kind: target.kind } : null;

    var oldT = oldP.filter(function (p) { return p.cat === 'time'; }).pop();
    var oldD = oldP.filter(function (p) { return p.cat === 'date' && p.value.date; }).pop();
    if (target && oldT) {
      var ro = resolveTime(oldT.value, text);
      var mismatch = ro.time ? !sameTime(ro.time, target.time) : (target.time ? (target.time.h % 12 !== ro.ambiguous.h % 12 || target.time.min !== ro.ambiguous.min) : true);
      if (mismatch) op.pending.notMatch = '“' + target.title + '” is at ' + (target.time ? fmtTime(target.time) : 'no set time') + ', not ' + oldT.text.replace(/^(?:not\s+)/i, '') + '.';
    }
    if (target && oldD && !sameDate(oldD.value.date, target.date)) op.pending.notMatch = '“' + target.title + '” is on ' + (target.date ? fmtDate(target.date, now) : 'no set date') + ', not ' + oldD.text + '.';
    op.questions = editQuestions(op, input);
    return op;
  }

  function editQuestions(op, input) {
    var qs = [], p = op.pending, now = input.now;
    if (op.cancelled) return qs;
    if (!op.targetId) {
      if (op.candidates.length) qs.push(q('target', 'Which one do you mean?', op.candidates.map(function (c) { return c.label; })));
      else qs.push(q('target', 'I couldn’t find which item to change. Which one do you mean?', []));
    }
    if (p.notMatch) qs.push(q('notMatch', p.notMatch + ' Change it anyway?', ['Yes, change it', 'No']));
    if (p.vagueDate) qs.push(q('date', 'Which day “' + p.vagueDate + '”?', []));
    if (p.ampm) {
      var am = fmtHour(p.ampm.h, p.ampm.min, 'AM'), pm = fmtHour(p.ampm.h, p.ampm.min, 'PM');
      var snap = op._targetSnapshot, pmFirst = snap && snap.time ? snap.time.h >= 12 : !(p.ampm.h >= 7 && p.ampm.h <= 11);
      qs.push(q('ampm', 'Is that ' + am + ' or ' + pm + '?', pmFirst ? [pm, am] : [am, pm]));
    }
    var c = op.changes;
    if (!qs.length && !c.date && !c.time && !c.shiftMin && !c.remove && !c.complete && !c.durationMin)
      qs.push(q('what', 'What should I change it to?', []));
    return qs;
  }

  // ---------------------------------------------------------------- answers to follow-up questions
  var YES = /^\s*(yes|yeah|yep|yup|haan|ha|han|ji|correct|right|ok|okay|sure|yes,? change it|theek hai)\b/i;
  var NO = /^\s*(no|nope|nahi|nahin|na|cancel|don'?t)\b/i;

  function answerItem(item, qid, text, input, st) {
    var now = input.now;
    item = clone(item);
    var p = item.pending = item.pending || {};
    var t = squash(mapDevanagari(String(text || '')));
    if (!t) return item;
    if (qid === 'confirm') {
      var w = (p.confirmWords || [])[0];
      if (!YES.test(t) && w) {
        var repl = t.replace(/^(?:no[, ]+)?(?:it'?s|it is)\s+/i, '');
        item.title = item.title.replace(R('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), repl);
        item.pointers = (item.pointers || []).map(function (x) { return x.replace(R('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), repl); });
      }
      if (p.confirmWords) p.confirmWords.shift();
      return finalize(item, now, st);
    }
    var ph = scan(t, now, st);
    var d = ph.filter(function (x) { return x.cat === 'date' && x.value.date; })[0];
    var tm = ph.filter(function (x) { return x.cat === 'time'; })[0];
    if (!tm && (qid === 'time' || qid === 'ampm' || qid === 'past')) {
      var bare = t.match(R('^\\s*' + NUM + '(?:[:.](\\d{2}))?\\s*(?:baje)?\\s*$', 'i'));
      if (bare && !isNaN(num(bare[1]))) tm = { value: T(num(bare[1]), +(bare[2] || 0), null) };
    }
    if (qid === 'ampm') {
      var base = p.ampm || (tm && tm.value);
      var mer = /\b(a\.?\s?m\.?|morning|subah)/i.test(t) ? 'am' : /\b(p\.?\s?m\.?|afternoon|evening|night|shaam|raat|dopahar)/i.test(t) ? 'pm' : (tm && tm.value.mer);
      if (tm && tm.value.mer) base = tm.value;
      if (base && mer) { item.time = { h: (base.h % 12) + (mer === 'pm' ? 12 : 0), min: base.min || 0 }; delete p.ampm; }
      return finalize(item, now, st);
    }
    if (d) { item.date = d.value.date; delete p.dateOptions; delete p.vagueDate; delete p.invalidDate; }
    if (tm) {
      var r = resolveTime(tm.value, t);
      if (r.time) { item.time = r.time; delete p.ampm; } else { item.time = null; p.ampm = r.ambiguous; }
      if (tm.value.date) item.date = tm.value.date;
      if (tm.value.durationMin) item.durationMin = tm.value.durationMin;
      delete p.timeOptions;
    }
    if (qid === 'past' && d && !tm && item.time && absMin(item.date, item.time) <= nowMin(now)) { /* still past → will re-ask */ }
    return finalize(item, now, st);
  }

  function answerEdit(op, qid, text, input, st) {
    op = clone(op);
    op.pending = op.pending || {}; op.changes = op.changes || {}; op.candidates = op.candidates || [];
    var t = squash(mapDevanagari(String(text || '')));
    var items = (input.context && input.context.items) || [];
    if (qid === 'target') {
      var pick = null;
      op.candidates.forEach(function (c) { if (!pick && (c.label === t || c.title.toLowerCase() === t.toLowerCase())) pick = c; });
      if (!pick) {
        var qt = tokens(t), best = null, bs = 0;
        items.forEach(function (it) { var s = 0, tt = tokens(it.title); qt.forEach(function (w) { if (tt.indexOf(w) >= 0) s++; }); if (s > bs) { bs = s; best = it; } });
        if (best) pick = { id: best.id, title: best.title };
      }
      if (pick) {
        op.targetId = pick.id; op.targetTitle = pick.title;
        var full = items.filter(function (it) { return it.id === pick.id; })[0];
        op._targetSnapshot = full ? { date: full.date || null, time: full.time || null, kind: full.kind } : null;
      }
    } else if (qid === 'notMatch') {
      if (NO.test(t)) op.cancelled = true;
      delete op.pending.notMatch;
    } else if (qid === 'ampm') {
      var mer = /\b(a\.?\s?m\.?|morning|subah)/i.test(t) ? 'am' : /\b(p\.?\s?m\.?|afternoon|evening|night|shaam|raat)/i.test(t) ? 'pm' : null;
      if (mer && op.pending.ampm) { op.changes.time = { h: (op.pending.ampm.h % 12) + (mer === 'pm' ? 12 : 0), min: op.pending.ampm.min }; delete op.pending.ampm; }
    } else {
      var ph = scan(t, input.now, st);
      ph.forEach(function (p) {
        if (p.cat === 'date' && p.value.date) { op.changes.date = p.value.date; delete op.pending.vagueDate; }
        if (p.cat === 'time') { var r = resolveTime(p.value, t); if (r.time) op.changes.time = r.time; else op.pending.ampm = r.ambiguous; }
      });
    }
    op.questions = editQuestions(op, input);
    return op;
  }

  function isBare(seg, now, st) {
    var rest = stripEnd(stripStart(removeSpans(seg, scan(seg, now, st))));
    return !/[a-zऀ-ॿ]{2,}/i.test(rest);
  }

  // ---------------------------------------------------------------- public API
  function prepare(text) {
    var s = String(text || '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
    s = s.replace(/\s*(?:\.{2,}|…)\s*/g, ' ');                 // "to... call" — pauses, not sentence ends
    s = mapDevanagari(s);
    s = s.replace(/\s+/g, ' ');
    return s.trim();
  }

  function parse(input) {
    var t0 = Date.now();
    var st = input.settings || {};
    var corrections = [];
    var text = prepare(input.text);
    text = removeNoise(text);
    var isEdit = EDIT_START.test(text);
    if (!isEdit) text = applyNot(text, input.now, st, corrections);   // edits keep "not X" so the old value can be checked
    text = applyCorrections(text, input.now, st, corrections);
    text = removeDiscourse(text);
    var result = { version: VERSION, cleaned: text, corrections: corrections, items: [], updates: [], ms: 0 };
    if (!text) { result.ms = Date.now() - t0; return result; }
    if (isEdit) {
      result.updates.push(parseEdit(text, input, st));
    } else {
      // a piece that is only a date/time ("Next Friday, I have a flight…") belongs to the next piece
      var segs = segment(text, input.now, st), merged = [], carry = '';
      segs.forEach(function (seg, i) {
        seg = carry ? carry + ' ' + seg : seg; carry = '';
        if (i < segs.length - 1 && isBare(seg, input.now, st)) carry = seg; else merged.push(seg);
      });
      merged.forEach(function (seg) { result.items.push(buildItem(seg, input, st)); });
    }
    result.ms = Date.now() - t0;
    return result;
  }

  function answer(obj, qid, text, input) {
    var st = input.settings || {};
    if (obj && obj.changes) return answerEdit(obj, qid, text, input, st);
    return answerItem(obj, qid, text, input, st);
  }

  var VP = {
    version: VERSION,
    parse: parse,
    answer: answer,
    scan: function (text, now, st) { return scan(prepare(text), now, st || {}); },
    fmtDate: fmtDate,
    fmtTime: fmtTime,
    // string-in / string-out wrappers used by the iOS JavaScriptCore bridge
    parseJSON: function (inputJSON) {
      try { return JSON.stringify(parse(JSON.parse(inputJSON))); }
      catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
    },
    answerJSON: function (objJSON, qid, text, inputJSON) {
      try { return JSON.stringify(answer(JSON.parse(objJSON), qid, text, JSON.parse(inputJSON))); }
      catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
    }
  };

  root.VP = VP;
  if (typeof module !== 'undefined' && module.exports) module.exports = VP;
})(typeof globalThis !== 'undefined' ? globalThis : this);
