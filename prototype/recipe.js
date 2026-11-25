'use strict';
/* Cast in Stone prototype — recipe.js
   Turns the elements you have typed (the recipe, up to KData.recipe.max) into
   the four spells it casts. The rules:

   - The FIRST element is the form: what kind of thing each way of casting
     makes (KData.spells['fire+fire'] and so on are the four forms).
   - Every element after it is a modifier, in any order. A different element
     adds its property (fire burns and blasts, water soaks, earth adds weight
     and digging, lightning chains). The same element as the form makes it
     bigger.
   - Some first-plus-modifier pairs are a hand-made spell of their own
     (KData.recipe.owner): Earth then Fire is Magma, Fire then Water lifts as
     Steam flight. One copy of that modifier is used up by it.
   - Each element after the second multiplies the cost more than the power, so
     long recipes are expensive bursts and short ones are the efficient spells.
   - An exact sequence may be a special spell (KData.specials): it replaces
     the Shot once you could hold enough mana to cast it.

   resolve(queue) returns { key, n, form, second, special, shot, burst, lift,
   move }, where each mode is a ready spell spec (a scaled copy of the data
   entry, with sp.mods = the modifier counts still to apply). Results are
   cached by recipe. */

const KRecipe = (() => {
  const { spells, spellKey, modes } = KData;
  const cache = new Map(), parsed = new Map();
  const ADJ = { fire: 'Burning', water: 'Soaking', earth: 'Heavy', lightning: 'Charged' };
  const SIZE_FIELDS = ['radius', 'reach', 'count', 'rubble', 'cloud', 'width', 'height', 'dig', 'bore'];

  // counts of each element after the first
  function parse(key) {
    let r = parsed.get(key);
    if (r) return r;
    const q = key.split('+'), form = q[0], mods = { fire: 0, water: 0, earth: 0, lightning: 0 };
    for (let i = 1; i < q.length; i++) if (mods[q[i]] != null) mods[q[i]]++;
    const other = { ...mods }; other[form] = 0;   // modifiers that are a different element from the form
    r = { q, n: q.length, form, mods, other };
    parsed.set(key, r);
    return r;
  }

  function build(P, mode) {
    const RC = KData.recipe, A = P.form;
    // a hand-made spell for this form and its most-used modifier?
    let B = null;
    for (const el of P.q.slice(1)) {
      if (el === A || !RC.owner[mode].includes(A + '>' + el)) continue;
      if (!B || P.mods[el] > P.mods[B]) B = el;
    }
    const base = spells[B ? spellKey(A, B) : A + '+' + A][mode];
    const sp = { ...base };
    const extra = { ...P.other };
    if (B) extra[B]--;
    const sizeExtra = P.mods[A] - (B ? 0 : 1);
    const others = extra.fire + extra.water + extra.earth + extra.lightning;
    const size = Math.max(0.8, Math.min(RC.sizeMax, 1 + RC.sizeStep * sizeExtra + RC.sizeOther * others));
    const steps = P.n - 2;
    const gentle = mode === 'lift' || mode === 'move';
    const costMul = steps < 0 ? RC.single : Math.pow(gentle ? RC.costStepGentle : RC.costStep, steps);
    const powMul = steps < 0 ? RC.single : Math.pow(RC.powerStep, steps);
    if (sp.power) sp.power *= powMul;
    for (const f of SIZE_FIELDS) if (sp[f]) sp[f] = f === 'count' || f === 'rubble' ? Math.round(sp[f] * size) : sp[f] * size;
    let cost = costMul;
    if (mode === 'lift') {
      const f = 1 + 0.12 * extra.fire, l = 1 + 0.15 * extra.lightning;
      for (const k of ['accel', 'maxSpeed', 'rise', 'jump']) if (sp[k]) sp[k] *= f * (k === 'jump' ? Math.min(1.25, 0.9 + 0.1 * size) : 1);
      for (const k of ['sideSpeed', 'side']) if (sp[k]) sp[k] *= l;
      cost *= Math.max(0.5, 1 - 0.12 * extra.water);
      sp.guard = Math.min(0.45, 0.15 * extra.earth);
    } else if (mode === 'move') {
      if (sp.power) sp.power *= 1 + 0.25 * extra.fire;
      if (sp.kind === 'dash') {
        if (extra.fire && !sp.trail) sp.trail = 'FIRE';
        if (extra.earth) sp.dig = Math.max(sp.dig || 0, 5 + extra.earth);
        sp.time *= (1 + 0.2 * extra.water) * Math.min(1.5, size); sp.waterTime *= (1 + 0.2 * extra.water) * Math.min(1.5, size);
      }
      if (sp.dist) sp.dist *= (1 + 0.2 * extra.water) * size;
      if (sp.speed) sp.speed *= 1 + 0.12 * extra.lightning;
    }
    if (sp.cost) sp.cost = Math.round(sp.cost * cost);
    if (sp.drain) { sp.drain = Math.round(sp.drain * cost * 10) / 10; sp.min = Math.min(sp.min * cost, sp.drain * 0.4); }
    sp.mods = extra; sp.n = P.n; sp.size = size;
    sp.vis = Math.max(0.7, 1 + RC.visStep * steps);   // drawn size: a longer recipe looks bigger
    for (const el of KData.elementOrder) if (extra[el] > 0 && (!sp.tint || extra[el] > extra[sp.tint])) sp.tint = el;
    // a name: property words, a size word, the base name
    const words = [];
    for (const el of KData.elementOrder) if (extra[el] > 0) words.push(ADJ[el] + (extra[el] > 1 ? ' ×' + extra[el] : ''));
    const sizeWord = P.n === 1 ? 'Lesser ' : sizeExtra >= 4 ? 'Colossal ' : sizeExtra >= 2 ? 'Grand ' : sizeExtra >= 1 ? 'Great ' : '';
    sp.name = (words.length ? words.join(', ') + ' ' : '') + sizeWord + base.name;
    sp.baseName = base.name;
    return sp;
  }

  function resolve(queue) {
    if (!queue || !queue.length) return null;
    const key = queue.join('+');
    let r = cache.get(key);
    if (r) return r;
    const P = parse(key);
    r = { key, n: P.n, form: P.form, special: null };
    // the golem shows two colours: the form and its strongest modifier
    let second = null;
    for (const el of P.q.slice(1)) if (el !== P.form && (!second || P.other[el] > P.other[second])) second = el;
    r.second = second || (P.n > 1 ? P.form : null);
    for (const m of modes) r[m] = build(P, m);
    for (const id in KData.specials) if (KData.specials[id].seq.join('+') === key) r.special = id;
    if (cache.size > 400) cache.clear();
    cache.set(key, r);
    return r;
  }

  return { resolve, parse };
})();
