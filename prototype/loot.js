'use strict';
/* Cast in Stone prototype — loot.js
   The interface side of loot: the Runestones tab of the rest panel (equip,
   take off, break into shards), hover notes for things lying in the cave,
   and their dots on the map. The rules (drops, pick-up, traits, treasure)
   live in game.js. */

(() => {
  const RU = KData.runes;
  const $ = id => document.getElementById(id);
  const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  // one line per stat a stone gives, e.g. "+19% Fire power"
  function statLines(r) {
    const T = RU.types[r.type];
    return Object.keys(T.stats).map(k => RU.effect(k, RU.value(T.stats[k], r.tier, r.level))).join(' · ');
  }
  function card(r, extra) {
    const T = RU.types[r.type], tier = RU.tiers[r.tier];
    return `<div class="rune-name" style="--t:${css(tier.color)}">${T.name}</div>
      <div class="rune-meta">${tier.name} · level ${r.level} · ${RU.slotNames[T.slot]}</div>
      <div class="rune-stats">${statLines(r)}</div>
      ${T.trait ? `<div class="rune-trait">${T.desc}</div>` : ''}${extra || ''}`;
  }
  // what breaking a stone gives (shards are spent at Lodestones, see treasure)
  const shardValue = r => Math.round((3 + 2 * r.level) * [1, 2.5, 6, 15][r.tier]);

  // ---------- the Runestones tab ----------
  window.KRest = {
    build(game, p, tab) {
      $('tabRunes').hidden = false;
      const view = $('runesView');
      if (tab !== 'runes') return;
      let html = '<div class="rune-slots">';
      for (const slot of RU.slots) {
        const r = p.runes[slot];
        html += `<div class="rune-slot${r ? '' : ' empty'}"><div class="slot-label">${RU.slotNames[slot]}</div>` +
          (r ? card(r, `<button type="button" class="btn small" data-off="${slot}">Take off</button>`) : '<div class="rune-meta">Empty</div>') + '</div>';
      }
      html += `</div><h2 class="bag-title">Bag · ${p.inventory.length} of ${RU.bag}${p.shards ? ` · ${p.shards} shards` : ''}</h2>`;
      if (!p.inventory.length) html += '<p class="note">Runestones dropped by enemies and found in treasure end up here.</p>';
      html += '<div class="rune-bag">';
      p.inventory.forEach((r, i) => {
        const T = RU.types[r.type], worn = p.runes[T.slot];
        const cmp = worn ? `<div class="rune-cmp">Replaces ${RU.types[worn.type].name} (${RU.tiers[worn.tier].name}, level ${worn.level})</div>` : '';
        html += `<div class="rune">${card(r, cmp)}<div class="rune-btns"><button type="button" class="btn small primary" data-equip="${i}">Equip</button>` +
          `<button type="button" class="btn small" data-break="${i}" title="Break it into ${shardValue(r)} shards">Break · ${shardValue(r)}</button></div></div>`;
      });
      html += '</div>';
      view.innerHTML = html;
      const rebuild = () => { window.cis.save(); document.querySelector('.rest-tab[data-tab="runes"]').click(); };
      view.querySelectorAll('[data-equip]').forEach(b => b.addEventListener('click', () => { game.equip(p, +b.dataset.equip); rebuild(); }));
      view.querySelectorAll('[data-off]').forEach(b => b.addEventListener('click', () => { game.unequip(p, b.dataset.off); rebuild(); }));
      view.querySelectorAll('[data-break]').forEach(b => b.addEventListener('click', () => {
        const r = p.inventory[+b.dataset.break];
        if (!r) return;
        p.inventory.splice(+b.dataset.break, 1); p.shards = (p.shards || 0) + shardValue(r);
        rebuild();
      }));
    },
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
