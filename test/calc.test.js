const assert = require("assert");
const { attendanceStats: s } = require("../extension/calc.js");
// brute-force check against the definition for many cases
for (const P of [60, 65, 75, 80, 85]) for (let t = 1; t <= 120; t++) for (let a = 0; a <= t; a++) {
  const r = s(a, t, P);
  let k = 0; while (100 * a >= P * (t + k + 1)) k++;
  let n = 0; while (100 * (a + n) < P * (t + n)) n++;
  if (100 * a >= P * t) { assert.strictEqual(r.canSkip, k, `skip a=${a} t=${t} P=${P}`); assert.strictEqual(r.mustAttend, 0); }
  else { assert.strictEqual(r.mustAttend, n, `need a=${a} t=${t} P=${P}`); assert.strictEqual(r.canSkip, 0); }
}
assert.deepStrictEqual([s(30,40,75).canSkip, s(3,4,75).canSkip, s(20,30,75).mustAttend], [0, 0, 10]);
assert.strictEqual(s(36,40,75).canSkip, 8);
console.log("calc tests passed");
