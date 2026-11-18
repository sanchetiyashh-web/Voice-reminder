/* Shared test runner — works in a browser (test.html) and in Node (run-node.js). */
(function (root) {
  function d2s(d) { return d ? d.y + '-' + (d.m < 10 ? '0' : '') + d.m + '-' + (d.d < 10 ? '0' : '') + d.d : null; }
  function t2s(t) { return t ? (t.h < 10 ? '0' : '') + t.h + ':' + (t.min < 10 ? '0' : '') + t.min : null; }
  function qids(x) { return (x.questions || []).map(function (q) { return q.id; }); }
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function checkItem(got, exp, errs, field) {
    var fieldsOk = {};
    function chk(name, actual, expected) {
      var ok = eq(actual, expected);
      fieldsOk[name] = ok;
      if (!ok) errs.push(field + '.' + name + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
    if (!got) { errs.push(field + ': missing'); return { missing: true }; }
    if ('kind' in exp) chk('kind', got.kind, exp.kind);
    if ('title' in exp) chk('title', got.title, exp.title);
    if ('pointers' in exp) chk('pointers', got.pointers, exp.pointers);
    if ('date' in exp) chk('date', d2s(got.date), exp.date);
    if ('time' in exp) chk('time', t2s(got.time), exp.time);
    if ('reminder' in exp) chk('reminder', got.reminder, exp.reminder);
    if ('durationMin' in exp) chk('durationMin', got.durationMin, exp.durationMin);
    if ('alertOffsetsMin' in exp) chk('alertOffsetsMin', got.alertOffsetsMin, exp.alertOffsetsMin);
    if ('q' in exp) chk('questions', qids(got), exp.q);
    return fieldsOk;
  }

  function runAll(VP, T) {
    var report = { cases: [], flows: [], totals: {}, ms: [] };
    var fieldStats = {};
    function stat(fields) { for (var k in fields) { fieldStats[k] = fieldStats[k] || { ok: 0, n: 0 }; fieldStats[k].n++; if (fields[k]) fieldStats[k].ok++; } }
    var settings = { defaultDurationMin: 60, nextWeekday: 'coming' };

    T.CASES.forEach(function (c) {
      var ctx = { items: T.ITEMS, lastItemId: (c.ctx && c.ctx.lastItemId) || null, lowConfidence: [] };
      var t0 = Date.now();
      var res = VP.parse({ text: c.text, now: T.NOW, settings: settings, context: ctx });
      var ms = Date.now() - t0; report.ms.push(ms);
      var errs = [];
      if (c.expect.items) {
        if (res.items.length !== c.expect.items.length) errs.push('item count: expected ' + c.expect.items.length + ', got ' + res.items.length + (res.updates.length ? ' (+' + res.updates.length + ' edit)' : ''));
        stat({ itemCount: res.items.length === c.expect.items.length });
        c.expect.items.forEach(function (e, i) { stat(checkItem(res.items[i], e, errs, 'items[' + i + ']')); });
      }
      if (c.expect.updates) {
        stat({ isEdit: res.updates.length === c.expect.updates.length });
        if (res.updates.length !== c.expect.updates.length) errs.push('edit count: expected ' + c.expect.updates.length + ', got ' + res.updates.length);
        c.expect.updates.forEach(function (e, i) {
          var u = res.updates[i]; if (!u) return;
          var f = {};
          function chk(name, a, b) { f[name] = eq(a, b); if (!f[name]) errs.push('updates[' + i + '].' + name + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
          if ('target' in e) chk('target', u.targetId, e.target);
          if ('date' in e) chk('date', d2s(u.changes.date), e.date);
          if ('time' in e) chk('time', t2s(u.changes.time), e.time);
          if ('remove' in e) chk('remove', !!u.changes.remove, e.remove);
          if ('complete' in e) chk('complete', !!u.changes.complete, e.complete);
          if ('shiftMin' in e) chk('shiftMin', u.changes.shiftMin, e.shiftMin);
          if ('q' in e) chk('questions', qids(u), e.q);
          stat(f);
        });
      }
      report.cases.push({ id: c.id, tags: c.tags, text: c.text, pass: errs.length === 0, errors: errs, cleaned: res.cleaned, corrections: res.corrections, ms: ms,
        summary: res.items.map(function (it) { return it.kind + ' | ' + it.title + ' | ' + d2s(it.date) + ' ' + t2s(it.time) + ' | q=' + qids(it).join(',') + (it.notes.length ? ' | notes: ' + it.notes.join('; ') : ''); })
          .concat(res.updates.map(function (u) { return 'edit → ' + u.targetId + ' ' + JSON.stringify(u.changes) + ' q=' + qids(u).join(','); })) });
    });

    T.FLOWS.forEach(function (f) {
      var input = { text: f.text, now: T.NOW, settings: settings, context: { items: T.ITEMS, lastItemId: null, lowConfidence: f.lowConfidence || [] } };
      var res = VP.parse(input), item = res.items[0], errs = [];
      f.answers.forEach(function (a) { item = VP.answer(item, a[0], a[1], input); });
      checkItem(item, f.expect, errs, 'final');
      report.flows.push({ id: f.id, pass: errs.length === 0, errors: errs });
    });

    var passed = report.cases.filter(function (c) { return c.pass; }).length;
    var fpassed = report.flows.filter(function (c) { return c.pass; }).length;
    var sorted = report.ms.slice().sort(function (a, b) { return a - b; });
    report.totals = {
      cases: passed + '/' + report.cases.length,
      flows: fpassed + '/' + report.flows.length,
      fields: fieldStats,
      msMedian: sorted[Math.floor(sorted.length / 2)], msMax: sorted[sorted.length - 1]
    };
    return report;
  }

  function format(rep) {
    var out = [];
    out.push('Cases passed: ' + rep.totals.cases + '   Flows passed: ' + rep.totals.flows + '   parse time median ' + rep.totals.msMedian + ' ms, max ' + rep.totals.msMax + ' ms');
    out.push('Per-field accuracy:');
    Object.keys(rep.totals.fields).forEach(function (k) { var s = rep.totals.fields[k]; out.push('  ' + k + ': ' + s.ok + '/' + s.n); });
    rep.cases.forEach(function (c) {
      out.push((c.pass ? 'PASS ' : 'FAIL ') + c.id + '  «' + c.text + '»');
      c.summary.forEach(function (s) { out.push('      ' + s); });
      if (c.corrections.length) out.push('      corrections: ' + c.corrections.join('; '));
      c.errors.forEach(function (e) { out.push('      ✗ ' + e); });
    });
    rep.flows.forEach(function (f) { out.push((f.pass ? 'PASS ' : 'FAIL ') + f.id); f.errors.forEach(function (e) { out.push('      ✗ ' + e); }); });
    return out.join('\n');
  }

  var api = { runAll: runAll, format: format };
  root.VP_RUNNER = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
