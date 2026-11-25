'use strict';
/* Cast in Stone — dmath.js
   Arithmetic that gives the same answer on every device.

   In co-op both players' devices run the whole game themselves and only swap
   button presses, so every calculation in the rules has to come out identical
   on both, bit for bit. Adding, subtracting, multiplying, dividing and square
   roots are exact everywhere. The browser's own sin, cos, atan2, exp, pow,
   hypot and log are not: each browser has its own version, and they can differ
   in the last digit. The ones here are built only from the exact operations.
   The rule files (world.js, recipe.js, game.js) use `KMath` as their `Math`. */

const KMath = (() => {
  const M = Math, out = {};
  for (const k of Object.getOwnPropertyNames(M)) out[k] = M[k];
  const PI = M.PI, HALF_PI = PI / 2, LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, LN2 = M.LN2;
  const PIO2_HI = 1.57079632673412561417e+00, PIO2_LO = 6.07710050650619224932e-11;
  const SQRT2 = M.SQRT2, SQRT1_2 = M.SQRT1_2;

  // sin and cos of a small angle (|r| <= pi/4), as series
  const sinK = r => { const z = r * r; return r * (1 + z * (-1 / 6 + z * (1 / 120 + z * (-1 / 5040 + z * (1 / 362880 + z * (-1 / 39916800 + z * (1 / 6227020800 + z * (-1 / 1307674368000 + z * (1 / 355687428096000))))))))); };
  const cosK = r => { const z = r * r; return 1 + z * (-1 / 2 + z * (1 / 24 + z * (-1 / 720 + z * (1 / 40320 + z * (-1 / 3628800 + z * (1 / 479001600 + z * (-1 / 87178291200 + z * (1 / 20922789888000)))))))); };
  function sincos(x, quarter) {
    if (x !== x || x === Infinity || x === -Infinity) return NaN;
    const k = M.round(x / HALF_PI), r = (x - k * PIO2_HI) - k * PIO2_LO;
    switch ((((k + quarter) % 4) + 4) % 4) { case 0: return sinK(r); case 1: return cosK(r); case 2: return -sinK(r); default: return -cosK(r); }
  }
  out.sin = x => sincos(x, 0);
  out.cos = x => sincos(x, 1);

  // 2 to a whole power, by repeated doubling or halving
  function pow2(k) { let v = 1; if (k > 0) { if (k > 1100) return Infinity; while (k >= 30) { v *= 1073741824; k -= 30; } while (k-- > 0) v *= 2; } else { if (k < -1100) return 0; while (k <= -30) { v /= 1073741824; k += 30; } while (k++ < 0) v /= 2; } return v; }
  out.exp = x => {
    if (x !== x) return NaN;
    if (x > 709.78) return Infinity;
    if (x < -745.2) return 0;
    const k = M.round(x / LN2), r = (x - k * LN2_HI) - k * LN2_LO;
    const e = 1 + r * (1 + r * (1 / 2 + r * (1 / 6 + r * (1 / 24 + r * (1 / 120 + r * (1 / 720 + r * (1 / 5040 + r * (1 / 40320 + r * (1 / 362880 + r * (1 / 3628800 + r * (1 / 39916800 + r * (1 / 479001600 + r * (1 / 6227020800)))))))))))));
    return e * pow2(k);
  };
  // natural log: x = m * 2^e with m near 1, then a series in (m-1)/(m+1)
  function parts(x) { let e = 0, m = x; while (m >= SQRT2) { m /= 2; e++; } while (m < SQRT1_2) { m *= 2; e--; } return [m, e]; }
  function lnM(m) { const s = (m - 1) / (m + 1), z = s * s; return 2 * s * (1 + z * (1 / 3 + z * (1 / 5 + z * (1 / 7 + z * (1 / 9 + z * (1 / 11 + z * (1 / 13 + z * (1 / 15 + z * (1 / 17 + z * (1 / 19 + z * (1 / 21 + z * (1 / 23)))))))))))); }
  out.log = x => { if (!(x > 0)) return x === 0 ? -Infinity : NaN; if (x === Infinity) return x; const [m, e] = parts(x); return e * LN2 + lnM(m); };
  out.log2 = x => { if (!(x > 0)) return x === 0 ? -Infinity : NaN; if (x === Infinity) return x; const [m, e] = parts(x); return m === 1 ? e : e + lnM(m) / LN2; };
  out.pow = (x, y) => {
    if (y === (y | 0) && y >= -64 && y <= 64) {   // a whole power: multiply it out, exactly the same everywhere
      let n = y < 0 ? -y : y, v = 1, b = x;
      while (n) { if (n & 1) v *= b; b *= b; n >>= 1; }
      return y < 0 ? 1 / v : v;
    }
    if (x < 0 || x !== x || y !== y) return NaN;
    if (x === 0) return y > 0 ? 0 : Infinity;
    return out.exp(y * out.log(x));
  };
  out.hypot = (a, b, c) => M.sqrt(a * a + b * b + (c === undefined ? 0 : c * c));
  // atan of 0..1: halve the angle twice (exact square roots), then a short series
  function atanK(z) {
    let t = z / (1 + M.sqrt(1 + z * z)); t = t / (1 + M.sqrt(1 + t * t));
    const q = t * t;
    return 4 * t * (1 + q * (-1 / 3 + q * (1 / 5 + q * (-1 / 7 + q * (1 / 9 + q * (-1 / 11 + q * (1 / 13 + q * (-1 / 15 + q * (1 / 17 + q * (-1 / 19 + q * (1 / 21 + q * (-1 / 23))))))))))));
  }
  out.atan2 = (y, x) => {
    if (x !== x || y !== y) return NaN;
    const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
    if (ax === 0 && ay === 0) return 0;
    let a = ay <= ax ? atanK(ay / ax) : HALF_PI - atanK(ax / ay);
    if (x < 0) a = PI - a;
    return y < 0 ? -a : a;
  };
  out.atan = z => out.atan2(z, 1);
  return out;
})();
