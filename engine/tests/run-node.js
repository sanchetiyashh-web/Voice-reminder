// Usage: node engine/tests/run-node.js   (exit code 1 if any case fails)
const VP = require('../understanding.js');
const T = require('./cases.js');
const HELD = require('./heldout.js');
const R = require('./runner.js');
const rep = R.runAll(VP, T);
const held = R.runAll(VP, { NOW: T.NOW, ITEMS: T.ITEMS, CASES: HELD, FLOWS: [] });
console.log('=== MAIN CORPUS ===\n' + R.format(rep));
console.log('\n=== HELD-OUT SET ===\n' + R.format(held));
const failed = [rep, held].reduce((n, r) => n + r.cases.filter(c => !c.pass).length + r.flows.filter(f => !f.pass).length, 0);
process.exit(failed ? 1 : 0);
