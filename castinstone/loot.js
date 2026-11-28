'use strict';
/* Cast in Stone — loot.js
   Interface pieces shared by the HUD and the panels: the icon set (KIcon),
   the Runestones tab of the rest panel (the golem with its four sockets, the
   bag, and the stone you picked), the Forge tab, hover notes for things lying
   in the cave, and their dots on the map. The rules (drops, pick-up, traits,
   treasure) live in game.js. */

(() => {
  const RU = KData.runes;
  const $ = id => document.getElementById(id);
  const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  // ---------- icons: 24 x 24 line drawings ----------
  const ICONS = {
    fire: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2C9.5 11 12 9 12 3z',
    water: 'M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z',
    earth: 'M3 19l6-11 4 6 2.5-3L21 19z',
    lightning: 'M13 3 5 13h6l-1 8 8-10h-6z',
    heart: 'M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10z',
    drop: 'M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z',
    map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M9 8h6',
    sound: 'M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
    mute: 'M4 10v4h4l5 4V6L8 10zM16 9l5 6M21 9l-5 6',
    pause: 'M9 5v14M15 5v14',
    music: 'M9 18V5l10-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    nomusic: 'M9 18V8M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16v-5M4 4l16 16',
    golem: 'M8 3h8v5H8zM5 9h14v7H5zM8 16v5M16 16v5M3 11v4M21 11v4',
    keys: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
    stats: 'M5 20V10M12 20V4M19 20v-7',
    sliders: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4',
    rune: 'M8 3h8l5 5v8l-5 5H8l-5-5V8zM12 8v8M9 11l3-3 3 3',
    anvil: 'M4 8h13a3 3 0 0 0 3-3M7 8v3a4 4 0 0 0 4 4h2M6 20h12M9 20l1-5h4l1 5',
    stone: 'M9 21V7l3-4 3 4v14zM7 21h10M12 9v5M10 11h4',
    shot: 'M3 12h13M12 7l5 5-5 5M20 9v6',
    burst: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
    lift: 'M6 13l6-6 6 6M6 19l6-6 6 6',
    move: 'M3 8h8M3 12h13M3 16h8M14 7l5 5-5 5',
    star: 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z',
    shard: 'M12 3l6 7-6 11-6-11zM6 10h12',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8h.01M11 12h1v5',
    skull: 'M6 11a6 6 0 1 1 12 0v4l-2 1v3H8v-3l-2-1zM10 12h.01M14 12h.01',
    attack: 'M5 19l3-3M7 15l9-9 3-1-1 3-9 9zM6 14l4 4',
    defence: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
    focus: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3',
    mouse: 'M7 9a5 5 0 0 1 10 0v6a5 5 0 0 1-10 0zM12 4v6M7 10h10',
    crown: 'M4 18h16M4 18 3 8l5 4 4-7 4 7 5-4-1 10',
  };
  window.KIcon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ICONS.info}"/></svg>`;

  // one line per stat a stone gives, e.g. "+19% Fire power"
  function statLines(r) {
    const T = RU.types[r.type];
    return Object.keys(T.stats).map(k => RU.effect(k, RU.value(T.stats[k], r.tier, r.level))).join(' · ');
  }
  // what breaking a stone gives (shards are spent at Lodestones, see treasure)
  const shardValue = r => Math.round((3 + 2 * r.level) * [1, 2.5, 6, 15][r.tier]);
  const tile = (r, attrs, sel) => r
    ? `<button type="button" class="gemtile${sel ? ' sel' : ''}" style="--t:${css(RU.tiers[r.tier].color)}" ${attrs} title="${RU.types[r.type].name} · ${RU.tiers[r.tier].name} · level ${r.level}">${runeIcon(r.type)}<span class="lv">${r.level}</span></button>`
    : `<span class="gemtile empty">${KIcon('rune')}</span>`;

  // v0.98: each kind of runestone has its own mark, so stones can be told apart at a glance (they differed only by colour)
  const RUNE_ICONS = {
    glimmerBrow: 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z',
    stormCrown: 'M4 19h16M5 19 3.5 8l5 4 3.5-7 3.5 7 5-4L19 19M12.8 11 11 14.5h2.4L11.6 18',
    emberVisor: 'M4.5 18v-4a7.5 7.5 0 0 1 15 0v4zM8 14.5h8M12 2.8c1.1 1.6 2.2 2.5 2.2 3.8a2.2 2.2 0 0 1-4.4 0c0-1.3 1.1-2.2 2.2-3.8z',
    deepCore: 'M12 2.5 20 12l-8 9.5L4 12zM12 8l3.4 4-3.4 4-3.4-4z',
    magmaHeart: 'M12 20.5s-7.5-4.8-7.5-10.4A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.7c0 5.6-7.5 10.4-7.5 10.4zM12 10.2c1 1.4 1.9 2.1 1.9 3.3a1.9 1.9 0 0 1-3.8 0c0-1.2.9-1.9 1.9-3.3z',
    tidalCore: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.5 13c2-2 3.5-2 5 0s3 2 4.5 0 2.5-2 3.5-.5M5.5 9.5c2-2 3.5-2 5 0s3 2 4.5 0',
    crucible: 'M4.5 9h15L18 18.2a2 2 0 0 1-2 1.8H8a2 2 0 0 1-2-1.8zM9 6.5c0-1.6 1-2 1-3.5M14 6.5c0-1.6 1-2 1-3.5M8 14h8',
    quarryFists: 'M13.5 3.5 20.5 10.5 17.5 13.5 10.5 6.5zM12 8.5l-8.5 8.5 3.5 3.5 8.5-8.5',
    splitArms: 'M3 12h6.5M9.5 12 20 5M9.5 12H21M9.5 12 20 19M17 5h3v3M18 9.5l3 2.5-3 2.5M17 19h3v-3',
    thriftArms: 'M12 3.5s5.5 5.8 5.5 9.6a5.5 5.5 0 0 1-11 0c0-3.8 5.5-9.6 5.5-9.6zM4 20 20 4',
    mireArms: 'M3 19c3-2 6-2 9 0s6 2 9 0M5.5 15c1.2-3 3.6-4.5 6.5-4.5s5.3 1.5 6.5 4.5M8.5 6.5l1.2 2.2M15.5 6.5l-1.2 2.2M12 4.5v3',
    springLegs: 'M6 20.5h12M6 3.5h12M8 17.5h8l-8-3h8l-8-3h8l-8-3h8',
    anchorLegs: 'M12 3a2.2 2.2 0 1 0 0 4.4A2.2 2.2 0 0 0 12 3zM12 7.4V21M4.5 13.5a7.5 7.5 0 0 0 15 0M8 10.5h8M4.5 13.5l2.2 1.3M19.5 13.5l-2.2 1.3',
    swiftLegs: 'M2.5 8h7M2 12h8M2.5 16h7M12.5 5.5l8.5 6.5-8.5 6.5z',
    diverLegs: 'M3.5 19.5c4.5 0 8.5-3 10.5-8.5l2-6.5 2 6.5c1 3.2 2 6.5 2 8.5zM8 19.5c2.5-2 4-4.5 5-7',
  };
  const runeIcon = type => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${RUNE_ICONS[type] || ''}"/></svg>`;

  // ---------- the Runestones tab ----------
  // Laid out like MORPHOS's Mutations tab: the golem in the middle of a panel with its four places round it (Head, Arms,
  // Core, Legs), each showing the stone worn there by its own mark and name; beside it, the chosen place's stones in a row
  // (the worn one first, ticked) and what the chosen stone does, with Equip, Take off and Break.
  let place = null;    // the chosen place: 'head', 'core', 'arms' or 'legs'
  let picked = null;   // { slot } for a worn stone or { bag: index }
  let refocus = null;  // with a controller: what to put the cursor on after the tab is redrawn
  const POS = { head: [50, 15], arms: [15, 50], core: [85, 50], legs: [50, 85] };   // where each place sits in the panel (%)
  const ANCHOR = { head: [50, 33], arms: [37, 47], core: [63, 47], legs: [50, 66] }; // where its line meets the golem (%)
  window.KRest = {
    build(game, p, tab) {
      if (tab === 'forge') return this.forge(game, p);
      if (tab !== 'runes') return;
      const view = $('runesView');
      if (!place) place = RU.slots.find(s => p.runes[s]) || 'head';
      let stone = picked && (picked.slot ? p.runes[picked.slot] : p.inventory[picked.bag]);
      if (!stone || (picked.bag != null && RU.types[stone.type].slot !== place) || (picked.slot && picked.slot !== place)) {
        // nothing chosen in this place: the worn stone, else its best spare
        picked = p.runes[place] ? { slot: place } : null;
        if (!picked) { const best = p.inventory.map((r, i) => ({ r, i })).filter(o => RU.types[o.r.type].slot === place).sort((a, b) => b.r.tier - a.r.tier || b.r.level - a.r.level)[0]; if (best) picked = { bag: best.i }; }
        stone = picked && (picked.slot ? p.runes[picked.slot] : p.inventory[picked.bag]);
      }
      // the panel with the golem
      let html = '<div class="rr"><div class="rr-body"><svg class="rr-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">';
      for (const s of RU.slots) { const [x1, y1] = POS[s], [x2, y2] = ANCHOR[s], r = p.runes[s]; html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${r ? css(RU.tiers[r.tier].color) : '#d9cce83d'}" class="${s === place ? 'on' : ''}"/>`; }
      html += '</svg><div class="rr-figure"><canvas id="dollGolem"></canvas></div>';
      for (const s of RU.slots) {
        const r = p.runes[s], n = p.inventory.filter(o => RU.types[o.type].slot === s).length;
        html += `<button type="button" class="rr-node${s === place ? ' on' : ''}${r ? '' : ' empty'}" data-place="${s}" style="left:${POS[s][0]}%;top:${POS[s][1]}%;--t:${r ? css(RU.tiers[r.tier].color) : '#6a5f78'}" aria-label="${RU.slotNames[s]}: ${r ? RU.types[r.type].name : 'nothing worn'}">` +
          `<span class="rr-disc">${r ? runeIcon(r.type) : KIcon('rune')}${r ? `<i class="lv">${r.level}</i>` : ''}${n ? `<i class="spare${p.inventory.some(o => o.fresh && RU.types[o.type].slot === s) ? ' new' : ''}">${n}</i>` : ''}</span>` +
          `<span class="rr-label"><b>${RU.slotNames[s]}</b><small>${r ? RU.types[r.type].name : 'Empty'}</small></span></button>`;
      }
      html += '</div>';
      // the side panel: this place's stones and the chosen one
      const worn = p.runes[place], spares = p.inventory.map((r, i) => ({ r, i })).filter(o => RU.types[o.r.type].slot === place).sort((a, b) => b.r.tier - a.r.tier || b.r.level - a.r.level || a.i - b.i);
      const chip = (r, attrs, sel, tick) => `<button type="button" class="rr-chip${sel ? ' sel' : ''}" style="--t:${css(RU.tiers[r.tier].color)}" ${attrs} title="${RU.types[r.type].name} · ${RU.tiers[r.tier].name} · level ${r.level}">${runeIcon(r.type)}<i class="lv">${r.level}</i>${tick ? '<i class="tick">✓</i>' : ''}${r.fresh && !sel ? '<i class="new"></i>' : ''}</button>`;
      html += `<div class="rr-side"><header class="rr-head"><b>${RU.slotNames[place]}</b><span></span><small>${(worn ? 1 : 0) + spares.length} found</small></header>`;
      html += '<div class="rr-chips">' + (worn ? chip(worn, `data-worn="${place}"`, picked && picked.slot, true) : '<span class="rr-none">Nothing worn</span>') + (spares.length ? '<span class="rr-sep"></span>' + spares.map(o => chip(o.r, `data-bag="${o.i}"`, picked && picked.bag === o.i, false)).join('') : '') + '</div>';
      if (stone) {
        const T = RU.types[stone.type], tier = RU.tiers[stone.tier], other = !picked.slot && worn;
        html += `<div class="rr-card" style="--t:${css(tier.color)}"><div class="rr-title"><span class="rr-big">${runeIcon(stone.type)}</span><div><h3>${T.name}</h3><p>${tier.name} · Level ${stone.level}${picked.slot ? ' · Worn' : stone.fresh ? ' · <b class="rr-new">New</b>' : ''}</p></div></div>
          <div class="rr-stats">${statLines(stone)}</div>
          ${T.trait ? `<div class="rr-trait">${T.desc}</div>` : `<p class="rr-desc">${T.desc}</p>`}
          ${other ? `<p class="rr-cmp">Replaces ${RU.types[other.type].name} (${RU.tiers[other.tier].name}, level ${other.level}): ${statLines(other)}</p>` : ''}
          <div class="rr-btns">${picked.slot ? '<button type="button" class="btn small" data-off>Take off</button>'
            : `<button type="button" class="btn small primary" data-equip>Equip</button><button type="button" class="btn small" data-break>Break for ${KIcon('shard')}${shardValue(stone)}</button>`}</div></div>`;
      } else html += `<div class="rr-card empty"><p class="rr-desc">No ${RU.slotNames[place].toLowerCase()} stone yet. Runestones drop from creatures and lie in relic caches.</p></div>`;
      html += `<p class="rr-bag">${KIcon('rune')}${p.inventory.length} of ${RU.bag} spare stones carried</p></div></div>`;
      view.innerHTML = html;
      // the stone on show has now been looked at: its mark goes (through act, so both devices agree in co-op)
      if (stone && stone.fresh && picked.bag != null) { window.cis.act('seeRune', picked.bag); if (!KNet.on) window.cis.save(); }
      { const t = $('tabRunes'), d = t.querySelector('.dot'), any = p.inventory.some(o => o.fresh); if (d && !any) d.remove(); else if (!d && any) t.insertAdjacentHTML('beforeend', '<i class="dot new"></i>'); }
      const c = $('dollGolem');
      KRender.preview(c, p.skin, p.slots);
      c.style.width = (c.width * 4) + 'px'; c.style.height = (c.height * 4) + 'px';
      if (refocus && document.body.dataset.device === 'pad') { const f = view.querySelector(refocus) || view.querySelector('[data-place]'); if (f) f.focus({ preventScroll: true }); }
      refocus = null;
      const redraw = () => this.build(game, p, 'runes'), rebuild = () => { window.cis.save(true); redraw(); };
      view.querySelectorAll('[data-place]').forEach(b => b.addEventListener('click', () => { if (place !== b.dataset.place) { place = b.dataset.place; picked = null; } refocus = `[data-place="${place}"]`; redraw(); }));
      view.querySelectorAll('[data-worn]').forEach(b => b.addEventListener('click', () => { picked = { slot: b.dataset.worn }; refocus = `[data-worn="${place}"]`; redraw(); }));
      view.querySelectorAll('[data-bag]').forEach(b => b.addEventListener('click', () => { picked = { bag: +b.dataset.bag }; refocus = `[data-bag="${b.dataset.bag}"]`; redraw(); }));
      const on = (sel, fn) => { const b = view.querySelector(sel); if (b) b.addEventListener('click', fn); };
      on('[data-equip]', () => { window.cis.act('equip', picked.bag); picked = { slot: place }; refocus = '[data-off]'; rebuild(); });
      on('[data-off]', () => { window.cis.act('unequip', place); picked = null; refocus = `[data-place="${place}"]`; rebuild(); });
      on('[data-break]', () => { window.cis.act('breakRune', picked.bag); picked = null; refocus = `[data-place="${place}"]`; window.cis.save(true); window.cis.rest(); });
    },
  };

  // ---------- the Forge tab: shards into stat points and stronger runestones ----------
  let forgeFocus = null;
  window.KRest.forge = (game, p) => {
    const T = KData.treasure, view = $('forgeView');
    const pc = T.pointCost(p.bought || 0), cost = n => `<span class="cost">${KIcon('shard')}${n}</span>`;
    let html = `<p class="forge-head">Shards come from crystal veins (any digging spell breaks them), relic caches, champions and spare runestones you break.</p>
      <div class="frow"><span class="gemtile" style="--t:#ffd37a">${KIcon('star')}</span><div><b>A stat point</b><span>Spend it in the Stats tab. Each one costs more than the last.</span></div><button type="button" class="btn small primary" data-buy ${p.shards >= pc ? '' : 'disabled'}>Buy ${cost(pc)}</button></div>`;
    for (const slot of RU.slots) {
      const r = p.runes[slot];
      if (!r) { html += `<div class="frow dim"><span class="gemtile empty">${KIcon('rune')}</span><div><b>${RU.slotNames[slot]}</b><span>Nothing worn</span></div><span></span></div>`; continue; }
      const c = T.levelUpCost(r), max = r.level >= T.maxRuneLevel, next = { ...r, level: r.level + 1 };
      html += `<div class="frow"><span class="gemtile" style="--t:${css(RU.tiers[r.tier].color)}">${runeIcon(r.type)}<span class="lv">${r.level}</span></span><div><b style="color:${css(RU.tiers[r.tier].color)}">${RU.types[r.type].name}</b><span>Level ${r.level} → ${r.level + 1}: ${statLines(next)}</span></div>` +
        `<button type="button" class="btn small" data-lvl="${slot}" ${!max && p.shards >= c ? '' : 'disabled'}>${max ? 'Highest level' : 'Strengthen ' + cost(c)}</button></div>`;
    }
    view.innerHTML = html;
    // v1.03: with a controller the cursor stays on the button just pressed (it jumped to Buy, so a second press bought a point)
    if (forgeFocus && document.body.dataset.device === 'pad') { const f = view.querySelector(forgeFocus); if (f) f.focus({ preventScroll: true }); }
    forgeFocus = null;
    const rebuild = sel => { forgeFocus = sel; window.cis.save(true); window.cis.rest(); };
    view.querySelector('[data-buy]').addEventListener('click', () => { if (window.cis.act('buyPoint')) rebuild('[data-buy]'); });
    view.querySelectorAll('[data-lvl]').forEach(b => b.addEventListener('click', () => { if (window.cis.act('levelUpRune', b.dataset.lvl)) rebuild(`[data-lvl="${b.dataset.lvl}"]`); }));
  };

  // ---------- hover notes and map dots for things in the cave ----------
  window.KLoot = {
    describe(game, wx, wy) {
      for (const L of game.loot) if (Math.abs(wx - L.x) < 4 && Math.abs(wy - L.y) < 4) {
        const T = RU.types[L.rune.type];
        return [`${T.name} · ${RU.tiers[L.rune.tier].name}`, `A runestone (${RU.slotNames[T.slot]}). Touch it to pick it up. ${statLines(L.rune)}.`];
      }
      if (game.describeTreasure) return game.describeTreasure(wx, wy);
      return null;
    },
    mapDots(game, dot, pk) {
      for (const L of game.loot) dot(L.x, L.y, pk(255, 211, 122), false);
      if (game.treasureDots) game.treasureDots(dot, pk);
    },
    shardValue, statLines,
  };
})();
