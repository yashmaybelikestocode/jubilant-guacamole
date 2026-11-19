// Pure attendance math. Integer arithmetic on percent values avoids float rounding bugs
// (e.g. 3/4 at 75% must count as exactly "on the line", not 74.9999%).

function attendanceStats(attended, total, minPercent) {
  const P = minPercent;
  const percent = total > 0 ? (attended / total) * 100 : 0;

  // Classes you can miss in a row: largest k with attended / (total + k) >= P/100
  //   => k <= (100*attended - P*total) / P
  let canSkip = 0;
  // Classes you must attend in a row: smallest n with (attended + n) / (total + n) >= P/100
  //   => n >= (P*total - 100*attended) / (100 - P)
  let mustAttend = 0;

  const surplus = 100 * attended - P * total;
  if (surplus >= 0) {
    canSkip = P > 0 ? Math.floor(surplus / P) : Infinity;
  } else {
    mustAttend = P < 100 ? Math.ceil(-surplus / (100 - P)) : Infinity;
  }

  return { attended, total, percent, canSkip, mustAttend, safe: surplus >= 0 };
}

if (typeof module !== "undefined") module.exports = { attendanceStats };
