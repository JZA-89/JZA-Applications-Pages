'use strict';
/* Cast in Stone prototype — loot.js
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
    ? `<button type="button" class="gemtile${sel ? ' sel' : ''}" style="--t:${css(RU.tiers[r.tier].color)}" ${attrs} title="${RU.types[r.type].name} · ${RU.tiers[r.tier].name} · level ${r.level}">${KIcon('rune')}<span class="lv">${r.level}</span></button>`
    : `<span class="gemtile empty">${KIcon('rune')}</span>`;

  // ---------- the Runestones tab ----------
  let picked = null;   // { slot } for a worn stone or { bag: index }
  window.KRest = {
    build(game, p, tab) {
      if (tab === 'forge') return this.forge(game, p);
      if (tab !== 'runes') return;
      const view = $('runesView');
      const stone = picked && (picked.slot ? p.runes[picked.slot] : p.inventory[picked.bag]);
      if (!stone) picked = null;
      // the golem and its four sockets
      let html = '<div class="doll"><div class="figure"><canvas id="dollGolem"></canvas>';
      for (const slot of RU.slots) {
        const r = p.runes[slot];
        html += `<div class="rsock" data-slot="${slot}">${tile(r, `data-worn="${slot}"`, picked && picked.slot === slot)}<small>${RU.slotNames[slot]}</small></div>`;
      }
      // the bag, a row for each place a stone can be worn; best grade first, then highest level
      html += `</div><div class="bagside"><h3>${KIcon('rune')}Bag<small>${p.inventory.length} of ${RU.bag}</small></h3><div class="bag">`;
      for (const slot of RU.slots) {
        const list = p.inventory.map((r, i) => ({ r, i })).filter(o => RU.types[o.r.type].slot === slot).sort((a, b) => b.r.tier - a.r.tier || b.r.level - a.r.level || a.i - b.i);
        html += `<div class="bagrow${list.length ? '' : ' none'}"><small>${RU.slotNames[slot]}</small><div>` +
          (list.length ? list.map(o => tile(o.r, `data-bag="${o.i}"`, picked && picked.bag === o.i)).join('') : '<i>None</i>') + '</div></div>';
      }
      html += '</div>';
      // the stone you picked
      if (stone) {
        const T = RU.types[stone.type], tier = RU.tiers[stone.tier], worn = !picked.slot && p.runes[T.slot];
        html += `<div class="rune-card" style="--t:${css(tier.color)}"><div class="rn">${T.name}</div>
          <div class="rm">${tier.name} · level ${stone.level} · ${RU.slotNames[T.slot]}</div>
          <div class="rs">${statLines(stone)}</div>${T.trait ? `<div class="rt">${T.desc}</div>` : ''}
          ${worn ? `<div class="rc">Replaces ${RU.types[worn.type].name} (${RU.tiers[worn.tier].name}, level ${worn.level}): ${statLines(worn)}</div>` : ''}
          <div class="rb">${picked.slot ? '<button type="button" class="btn small" data-off>Take off</button>'
            : `<button type="button" class="btn small primary" data-equip>Equip</button><button type="button" class="btn small" data-break><span class="cost">Break for ${KIcon('shard')}${shardValue(stone)}</span></button>`}</div></div>`;
      } else html += '<div class="rune-card none">Pick a runestone to see what it does. Worn stones add their stats and traits; spare ones can be broken into shards for the Forge.</div>';
      html += '</div></div>';
      view.innerHTML = html;
      const c = $('dollGolem');
      KRender.preview(c, p.skin, p.slots);
      c.style.width = (c.width * 6) + 'px'; c.style.height = (c.height * 6) + 'px';
      const rebuild = () => { window.cis.save(); this.build(game, p, 'runes'); };
      view.querySelectorAll('[data-worn]').forEach(b => b.addEventListener('click', () => { picked = { slot: b.dataset.worn }; this.build(game, p, 'runes'); }));
      view.querySelectorAll('[data-bag]').forEach(b => b.addEventListener('click', () => { picked = { bag: +b.dataset.bag }; this.build(game, p, 'runes'); }));
      const on = (sel, fn) => { const b = view.querySelector(sel); if (b) b.addEventListener('click', fn); };
      on('[data-equip]', () => { const slot = RU.types[stone.type].slot; game.equip(p, picked.bag); picked = { slot }; rebuild(); });
      on('[data-off]', () => { game.unequip(p, picked.slot); picked = null; rebuild(); });
      on('[data-break]', () => { p.inventory.splice(picked.bag, 1); p.shards = (p.shards || 0) + shardValue(stone); picked = null; rebuild(); window.cis.rest(); });
    },
  };

  // ---------- the Forge tab: shards into stat points and stronger runestones ----------
  window.KRest.forge = (game, p) => {
    const T = KData.treasure, view = $('forgeView');
    const pc = T.pointCost(p.bought || 0), cost = n => `<span class="cost">${KIcon('shard')}${n}</span>`;
    let html = `<p class="forge-head">Shards come from crystal veins (any digging spell breaks them), relic caches, champions and spare runestones you break.</p>
      <div class="frow"><span class="gemtile" style="--t:#ffd37a">${KIcon('star')}</span><div><b>A stat point</b><span>Spend it in the Stats tab. Each one costs more than the last.</span></div><button type="button" class="btn small primary" data-buy ${p.shards >= pc ? '' : 'disabled'}>Buy ${cost(pc)}</button></div>`;
    for (const slot of RU.slots) {
      const r = p.runes[slot];
      if (!r) { html += `<div class="frow dim"><span class="gemtile empty">${KIcon('rune')}</span><div><b>${RU.slotNames[slot]}</b><span>Nothing worn</span></div><span></span></div>`; continue; }
      const c = T.levelUpCost(r), max = r.level >= T.maxRuneLevel, next = { ...r, level: r.level + 1 };
      html += `<div class="frow"><span class="gemtile" style="--t:${css(RU.tiers[r.tier].color)}">${KIcon('rune')}<span class="lv">${r.level}</span></span><div><b style="color:${css(RU.tiers[r.tier].color)}">${RU.types[r.type].name}</b><span>Level ${r.level} → ${r.level + 1}: ${statLines(next)}</span></div>` +
        `<button type="button" class="btn small" data-lvl="${slot}" ${!max && p.shards >= c ? '' : 'disabled'}>${max ? 'Highest level' : 'Strengthen ' + cost(c)}</button></div>`;
    }
    view.innerHTML = html;
    const rebuild = () => { window.cis.save(); window.cis.rest(); };
    view.querySelector('[data-buy]').addEventListener('click', () => { if (game.buyPoint(p)) rebuild(); });
    view.querySelectorAll('[data-lvl]').forEach(b => b.addEventListener('click', () => { if (game.levelUpRune(p, b.dataset.lvl)) rebuild(); }));
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
