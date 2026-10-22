/* Zoom2D Shooter — the Armory shop. Gameplay is fully paused while it is open. */
(function () {
  const Z = window.Z;
  const G = () => Z.game;
  const $ = id => document.getElementById(id);
  const fmt = n => '$' + Math.floor(n).toLocaleString();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const TABS = [
    { id: 'weapons', label: 'Weapons', icon: '🔫' },
    { id: 'upgrades', label: 'Upgrades', icon: '⬆️' },
    { id: 'armor', label: 'Armor', icon: '🛡️' },
    { id: 'medical', label: 'Medical', icon: '🩹' },
    { id: 'building', label: 'Base Building', icon: '🧱' },
    { id: 'training', label: 'Upgrade You', icon: '💪' }
  ];
  const TYPE_ICON = t => (Z.TYPE_INFO[t] || {}).icon || '★';
  const CAT_ICON = { Pistols: '🔫', SMGs: '💨', Rifles: '🎯', Shotguns: '💥', Snipers: '🔭', Heavy: '🪖', Miniguns: '🌀', Explosives: '🚀', Energy: '⚡', Melee: '⚔️' };

  const S = Z.shop = {
    tab: 'weapons', cat: 'All', cls: 'all', q: '', mode: 'all', sort: 'catalog', ownedOnly: false, affordable: false,
    selected: 'glock-17', slot: 0, open: openShop, close: closeShop, isOpen: false
  };

  let root, observer;

  function openShop() {
    const g = G();
    if (g.state !== 'play' || g.player.dead) return;
    g.state = 'shop'; S.isOpen = true;
    g.building = false;
    Z.audio.setMuffled(true); Z.audio.sfx('shop');
    S.slot = g.player.cur; S.slotChosen = false; S.openedAt = performance.now();
    root.classList.remove('hidden');
    document.body.classList.add('in-menu');
    S.gridKey = null;
    renderAll();
  }
  function closeShop() {
    const g = G();
    if (!S.isOpen) return;
    S.isOpen = false;
    root.classList.add('hidden');
    document.body.classList.remove('in-menu');
    g.state = 'play';
    // a short grace period after a real shopping trip (not a free panic button)
    const now = performance.now();
    if (now - (S.openedAt || now) > 1500 && now - (S.lastGrace || -1e9) > 15000) { g.player.invuln = Math.max(g.player.invuln, 1); S.lastGrace = now; }
    Z.audio.setMuffled(false);
    Z.save();
  }

  // ---- purchases -------------------------------------------------------------------------
  function pay(cost, el) {
    const g = G();
    if (g.money < cost) {
      Z.audio.sfx('deny');
      if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
      flash('Not enough cash — you need ' + fmt(cost - g.money) + ' more', 'bad');
      return false;
    }
    g.money -= cost; g.stats.spent = (g.stats.spent || 0) + cost; return true;
  }
  function flash(msg, kind) {
    const f = $('shop-flash'); if (!f) return;
    f.textContent = msg; f.className = 'shop-flash show ' + (kind || '');
    clearTimeout(flash.t); flash.t = setTimeout(() => f.classList.remove('show'), 1800);
  }

  function equip(id, slot) {
    const P = G().player;
    const old = P.slots.indexOf(id);
    if (old === slot) return;
    const prev = P.slots[slot];
    if (old >= 0) P.slots[old] = prev; // swap positions
    P.slots[slot] = id;
    if (!P.slots[P.cur]) P.cur = slot;
    if (P.cur === slot || P.cur === old) { P.reloadT = 0; P.spin = 0; P.burstLeft = 0; }
    Z.audio.sfx('click');
  }
  function buyWeapon(id, el) {
    const P = G().player, w = Z.WEAPON_BY_ID[id];
    if (P.owned.has(id)) { equip(id, S.slot); flash(w.name + ' equipped in slot ' + (S.slot + 1)); renderAll(); return; }
    if (!pay(w.price, el)) return;
    P.owned.add(id);
    let slot = S.slotChosen ? S.slot : P.slots.indexOf(null);
    if (slot < 0) slot = S.slot;
    const replaced = P.slots[slot];
    equip(id, slot);
    Z.audio.sfx('buy');
    flash('Bought ' + w.name + '! Equipped in slot ' + (slot + 1) + (replaced && replaced !== id ? ' (replaced ' + Z.WEAPON_BY_ID[replaced].name + ')' : ''), 'good');
    renderAll();
  }
  function buyUpgrade(id, key, el) {
    const P = G().player, w = Z.WEAPON_BY_ID[id];
    const u = P.upg[id] || (P.upg[id] = {});
    const lvl = u[key] || 0, def = Z.UPGRADES.find(x => x.key === key);
    if (lvl >= def.max) return;
    const cost = Z.upgradeCost(w, lvl);
    if (!pay(cost, el)) return;
    u[key] = lvl + 1;
    P.eff = {};
    Z.audio.sfx('upgrade');
    flash(w.name + ': ' + def.name + ' level ' + (lvl + 1), 'good');
    renderAll();
  }
  function buyArmor(id, el) {
    const P = G().player, a = Z.ARMOR_BY_ID[id];
    if ((a.slot === 'body' ? P.body : P.head) === id) return;
    if (!pay(a.price, el)) return;
    if (a.slot === 'body') { P.body = id; P.bodyDur = a.dur; } else { P.head = id; P.headDur = a.dur; }
    Z.audio.sfx('buy'); flash('Equipped ' + a.name, 'good'); renderAll();
  }
  function repairCost(a, dur) { return Z.nicePrice(a.price * 0.45 * (1 - dur / a.dur)); }
  function repair(slot, el) {
    const P = G().player, id = slot === 'body' ? P.body : P.head; if (!id) return;
    const a = Z.ARMOR_BY_ID[id], dur = slot === 'body' ? P.bodyDur : P.headDur;
    const c = repairCost(a, dur); if (c <= 0) return;
    if (!pay(c, el)) return;
    if (slot === 'body') P.bodyDur = a.dur; else P.headDur = a.dur;
    Z.audio.sfx('upgrade'); flash(a.name + ' repaired', 'good'); renderAll();
  }
  function buyMed(id, n, el) {
    const P = G().player, m = Z.MED_BY_ID[id];
    if (m.max && (P.meds[id] || 0) + n > m.max) { flash('You can carry at most ' + m.max + ' ' + m.name + 's', 'bad'); Z.audio.sfx('deny'); return; }
    if (!pay(m.price * n, el)) return;
    P.meds[id] = (P.meds[id] || 0) + n;
    Z.audio.sfx('buy'); flash('+' + n + ' ' + m.name, 'good'); renderAll();
  }
  function buyBuild(id, n, el) {
    const g = G(), b = Z.BUILD_BY_ID[id];
    if (!pay(b.price * n, el)) return;
    g.buildInv[id] = (g.buildInv[id] || 0) + n;
    Z.audio.sfx('buy'); flash('+' + n + ' ' + b.name + ' — press B in-game to build', 'good'); renderAll();
  }
  function buyPerk(id, el) {
    const g = G(), p = Z.PERK_BY_ID[id], lvl = g.perk(id);
    if (lvl >= p.max) return;
    if (!pay(Z.perkCost(p, lvl), el)) return;
    g.perks[id] = lvl + 1;
    g.player.invalidate();
    if (id === 'vitality') g.player.hp = Math.min(g.player.maxHp, g.player.hp + 20);
    Z.audio.sfx('upgrade'); flash(p.name + ' level ' + (lvl + 1), 'good'); renderAll();
  }

  // ---- stats helpers ---------------------------------------------------------------------
  function dps(w) {
    if (w.kind === 'melee') return w.dmg * w.rate;
    const shots = w.mag ? Math.min(w.mag, w.rate * 6) : w.rate * 6;
    const t = shots / w.rate + (w.mag && w.mag < w.rate * 6 ? w.reload : 0);
    return w.dmg * (w.pellets || 1) * shots / Math.max(0.1, t);
  }
  const norm = (v, max) => Math.max(0.04, Math.min(1, v / max));
  function statBars(w) {
    const dmg = norm(Math.log10(1 + w.dmg * (w.pellets || 1)), 3);
    const rate = norm(w.rate, 30);
    const range = w.kind === 'melee' ? norm(w.range, 160) : norm(w.range, 3000);
    const acc = w.kind === 'melee' ? norm(w.arc || 1.5, 2.6) : 1 - Math.min(0.96, (w.spread || 0) / 0.3);
    return [['DMG', dmg], ['RATE', rate], [w.kind === 'melee' ? 'REACH' : 'RANGE', range], [w.kind === 'melee' ? 'ARC' : 'ACC', acc]]
      .map(([l, v]) => '<div class="sb"><span>' + l + '</span><i><b style="width:' + (v * 100).toFixed(0) + '%"></b></i></div>').join('');
  }
  function specials(w) {
    const s = [];
    if (w.pierce) s.push('Pierces ' + w.pierce + (w.pierce > 1 ? ' enemies' : ' enemy'));
    if (w.kind === 'rail') s.push('Pierces every enemy in line');
    if (w.radius && (w.kind === 'rocket' || w.kind === 'grenade' || w.kind === 'plasma')) s.push('Explosive (' + w.radius + ' radius)');
    if (w.homing) s.push('Homing');
    if (w.cluster) s.push('Cluster bomblets');
    if (w.burn) s.push('Sets enemies on fire');
    if (w.freeze) s.push('Freezes / slows');
    if (w.kind === 'tesla') s.push('Chain lightning');
    if (w.deflect) s.push('Deflects bullets');
    if (w.shock) s.push('Lightning strikes');
    if (w.knock) s.push('Heavy knockback');
    if (w.spinup) s.push('Spin-up ' + w.spinup + 's');
    if (w.moveMul && w.moveMul < 1) s.push('Move speed ' + Math.round(w.moveMul * 100) + '%');
    if (w.tactical) s.push('Laser sight');
    return s;
  }

  // ---- rendering --------------------------------------------------------------------------
  function renderAll() {
    if (!S.isOpen) return;
    $('shop-money').textContent = fmt(G().money);
    renderTabs();
    renderMain(true);
    renderDetail();
    renderLoadout();
  }

  function renderTabs() {
    $('shop-tabs').innerHTML = TABS.map(t => '<button class="tab' + (t.id === S.tab ? ' on' : '') + '" data-action="tab" data-id="' + t.id + '"><span>' + t.icon + '</span>' + t.label + '</button>').join('');
  }

  function filteredWeapons() {
    const P = G().player, money = G().money, q = S.q.trim().toLowerCase();
    let list = Z.WEAPONS.filter(w =>
      (S.cat === 'All' || w.type === S.cat) &&
      (S.cls === 'all' || w.cat === S.cls) &&
      (!q || w.name.toLowerCase().includes(q) || w.cat.toLowerCase().includes(q) || Z.MODE_LABEL[w.mode].toLowerCase().includes(q)) &&
      (S.mode === 'all' || w.mode === S.mode || (S.mode === 'select' && w.modes.length > 1) || (S.mode === 'break' && (w.mode === 'break' || w.mode === 'lever'))) &&
      (!S.ownedOnly || P.owned.has(w.id)) &&
      (!S.affordable || w.price <= money || P.owned.has(w.id)));
    const sorters = {
      'catalog': (a, b) => a.index - b.index,
      'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price,
      'dmg': (a, b) => b.dmg * (b.pellets || 1) - a.dmg * (a.pellets || 1), 'dps': (a, b) => dps(b) - dps(a),
      'rate': (a, b) => b.rate - a.rate, 'name': (a, b) => a.name.localeCompare(b.name)
    };
    return list.sort(sorters[S.sort]);
  }

  function renderMain(gridOnly) {
    const tb = $('shop-toolbar'), grid = $('shop-grid');
    const keepScroll = grid.dataset.tab === S.tab + S.cat ? grid.scrollTop : 0;
    grid.dataset.tab = S.tab + S.cat;
    if (S.tab === 'weapons') {
      const counts = {}; Z.WEAPONS.forEach(w => counts[w.type] = (counts[w.type] || 0) + 1);
      if (!gridOnly || tb.dataset.kind !== 'weapons') {
      tb.dataset.kind = 'weapons';
      tb.innerHTML =
        '<div class="chips">' + ['All', ...Z.TYPES].map(c => '<button class="chip' + (c === S.cat ? ' on' : '') + '" data-action="cat" data-id="' + c + '" title="' + esc(c === 'All' ? 'Every weapon, grouped by type and sorted by price' : Z.TYPE_INFO[c].desc) + '">' + (c === 'All' ? '★' : TYPE_ICON(c)) + ' ' + c + ' <em>' + (c === 'All' ? Z.WEAPONS.length : counts[c]) + '</em></button>').join('') + '</div>' +
        '<div class="filters">' +
        '<input id="shop-search" type="search" placeholder="Search ' + Z.WEAPONS.length + ' weapons… (e.g. Glock, laser, minigun)" value="' + esc(S.q) + '">' +
        '<select id="shop-cls"><option value="all">All classes</option>' + Z.CATEGORIES.map(c => '<option value="' + c + '">' + (CAT_ICON[c] || '') + ' ' + c + '</option>').join('') + '</select>' +
        '<select id="shop-mode"><option value="all">All fire modes</option><option value="semi">Semi-Auto</option><option value="auto">Full-Auto</option><option value="burst">Burst</option><option value="select">Select-fire (switchable)</option><option value="pump">Pump-Action</option><option value="bolt">Bolt-Action</option><option value="break">Break / Lever-Action</option><option value="melee">Melee</option></select>' +
        '<select id="shop-sort"><option value="catalog">Sort: type, then price</option><option value="price-asc">Price: low → high</option><option value="price-desc">Price: high → low</option><option value="dmg">Damage</option><option value="dps">DPS</option><option value="rate">Fire rate</option><option value="name">Name A–Z</option></select>' +
        '<label class="tog"><input type="checkbox" id="shop-owned"' + (S.ownedOnly ? ' checked' : '') + '> Owned</label>' +
        '<label class="tog"><input type="checkbox" id="shop-afford"' + (S.affordable ? ' checked' : '') + '> Affordable</label>' +
        '</div>';
      $('shop-mode').value = S.mode; $('shop-sort').value = S.sort; $('shop-cls').value = S.cls;
      }
      const list = filteredWeapons();
      const P = G().player, money = G().money;
      grid.className = 'grid';
      const key = [S.cat, S.cls, S.q, S.mode, S.sort, S.ownedOnly, S.affordable].join('|');
      // same list as before (e.g. after a purchase): just refresh card states in place
      if (gridOnly && S.gridKey === key && grid.querySelector('.card')) { refreshCards(grid); return; }
      S.gridKey = key; S.list = list; S.shown = 0; S.lastType = null;
      grid.innerHTML = list.length ? '' : '<div class="empty">No weapons match those filters.</div>';
      grid.scrollTop = 0;
      appendCards(grid, 36);
      return;
    }
    tb.innerHTML = ''; tb.dataset.kind = '';
    grid.className = 'grid wide';
    if (S.tab === 'upgrades') grid.innerHTML = renderUpgradesTab();
    else if (S.tab === 'armor') grid.innerHTML = renderArmorTab();
    else if (S.tab === 'medical') grid.innerHTML = renderMedTab();
    else if (S.tab === 'building') grid.innerHTML = renderBuildTab();
    else if (S.tab === 'training') grid.innerHTML = renderTrainingTab();
    grid.scrollTop = keepScroll;
    paintCanvases(grid);
  }

  function cardState(w) {
    const P = G().player, money = G().money;
    const owned = P.owned.has(w.id), slot = P.slots.indexOf(w.id);
    const cls = ['card', owned ? 'owned' : '', slot >= 0 ? 'equipped' : '', w.gold ? 'gold' : '', w.tactical ? 'tac' : '', !owned && w.price > money ? 'poor' : '', S.selected === w.id ? 'sel' : ''].join(' ');
    const btn = owned ? (slot >= 0 ? '<span class="tagline eq">SLOT ' + (slot + 1) + '</span>' : '<button class="buy alt" data-action="buy" data-id="' + w.id + '">Equip</button>') : '<button class="buy" data-action="buy" data-id="' + w.id + '">' + fmt(w.price) + '</button>';
    const lv = owned && P.upg[w.id] ? Object.values(P.upg[w.id]).reduce((x, y) => x + y, 0) : 0;
    const badges = (w.gold ? '<b class="bg-gold">GOLD</b>' : '') + (w.tactical ? '<b class="bg-tac">TACTICAL</b>' : '') + (lv ? '<b class="bg-up">+' + lv + '</b>' : '') + '<b class="bg-tier t' + w.tier + '">' + '★'.repeat(w.tier) + '</b>';
    return { cls, btn, badges };
  }
  function cardHTML(w) {
    const st = cardState(w);
    return '<div class="' + st.cls + '" data-action="select" data-id="' + w.id + '">' +
      '<canvas class="ic" data-icon="' + w.id + '" width="200" height="90"></canvas>' +
      '<div class="badges">' + st.badges + '</div>' +
      '<div class="nm">' + esc(w.name) + '</div>' +
      '<div class="meta">' + Z.CLASS_LABEL[w.cat] + (w.cat === 'Melee' ? '' : ' · ' + Z.MODE_LABEL[w.mode] + (w.modes.length > 1 ? ' ⇄' : '')) + '</div>' +
      '<div class="bars">' + statBars(w) + '</div><span class="btn-slot">' + st.btn + '</span></div>';
  }
  // cards are added in batches as you scroll, so opening the shop or filtering is instant
  function appendCards(grid, n) {
    const list = S.list || [];
    const from = S.shown, to = Math.min(list.length, from + n);
    if (from >= to) return;
    const old = grid.querySelector('.more'); if (old) old.remove();
    // section headers between weapon types when the list is in type order
    const showHeads = S.sort === 'catalog';
    let html = '';
    for (const w of list.slice(from, to)) {
      if (showHeads && w.type !== S.lastType) {
        S.lastType = w.type;
        const n = list.filter(x => x.type === w.type).length;
        html += '<div class="type-head"><span>' + TYPE_ICON(w.type) + ' ' + w.type + '</span><small>' + n + (n === 1 ? ' weapon · ' : ' weapons · ') + esc(Z.TYPE_INFO[w.type].desc) + '</small></div>';
      }
      html += cardHTML(w);
    }
    grid.insertAdjacentHTML('beforeend', html + (to < list.length ? '<div class="more">Loading more…</div>' : ''));
    S.shown = to;
    observeIcons(grid);
    const more = grid.querySelector('.more');
    if (S.moreObs) S.moreObs.disconnect();
    if (more && 'IntersectionObserver' in window) {
      S.moreObs = new IntersectionObserver(ents => { if (ents.some(e => e.isIntersecting)) appendCards(grid, 48); }, { root: grid, rootMargin: '600px' });
      S.moreObs.observe(more);
    } else if (more) appendCards(grid, list.length);
  }
  function refreshCards(grid) {
    grid.querySelectorAll('.card[data-id]').forEach(el => {
      const w = Z.WEAPON_BY_ID[el.dataset.id]; if (!w) return;
      const st = cardState(w);
      if (el.className !== st.cls) el.className = st.cls;
      const bs = el.querySelector('.btn-slot'); if (bs && bs.innerHTML !== st.btn) bs.innerHTML = st.btn;
      const bd = el.querySelector('.badges'); if (bd && bd.innerHTML !== st.badges) bd.innerHTML = st.badges;
    });
  }

  function upgradeRows(w) {
    const P = G().player, u = P.upg[w.id] || {}, money = G().money;
    return Z.upgradesFor(w).map(def => {
      const lvl = u[def.key] || 0, max = lvl >= def.max, cost = max ? 0 : Z.upgradeCost(w, lvl);
      return '<div class="uprow"><span class="ui">' + def.icon + '</span><span class="un">' + def.name + '<small>' + (lvl ? def.fmt(lvl) : 'Not upgraded') + '</small></span>' +
        '<span class="pips">' + Array.from({ length: def.max }, (_, i) => '<i class="' + (i < lvl ? 'on' : '') + '"></i>').join('') + '</span>' +
        (max ? '<span class="tagline max">MAX</span>' : '<button class="buy sm' + (cost > money ? ' poor' : '') + '" data-action="upgrade" data-id="' + w.id + '" data-key="' + def.key + '">' + fmt(cost) + '</button>') + '</div>';
    }).join('');
  }

  function renderUpgradesTab() {
    const P = G().player;
    const list = Z.WEAPONS.filter(w => P.owned.has(w.id));
    list.sort((a, b) => (P.slots.indexOf(b.id) >= 0) - (P.slots.indexOf(a.id) >= 0) || b.price - a.price);
    return '<div class="section-note">Upgrade any weapon you own: guns have 5 upgrade tracks and melee weapons 3, each with 5 levels.</div>' + list.map(w =>
      '<div class="wide-card"><canvas class="ic" data-icon="' + w.id + '" width="200" height="90"></canvas><div class="wc-body"><div class="nm">' + esc(w.name) + (P.slots.indexOf(w.id) >= 0 ? ' <span class="tagline eq">SLOT ' + (P.slots.indexOf(w.id) + 1) + '</span>' : '') + '</div><div class="meta">' + w.cat + ' · ' + Z.MODE_LABEL[w.mode] + '</div>' + upgradeRows(w) + '</div></div>').join('');
  }

  function renderArmorTab() {
    const P = G().player, money = G().money;
    const sec = (slot, title) => {
      const curId = slot === 'body' ? P.body : P.head, dur = slot === 'body' ? P.bodyDur : P.headDur;
      let cur = '';
      if (curId) {
        const a = Z.ARMOR_BY_ID[curId], c = repairCost(a, dur);
        cur = '<div class="current"><canvas class="ic" data-armor="' + a.id + '" width="120" height="90"></canvas><div><div class="nm">Wearing: ' + a.name + '</div><div class="durbar"><b style="width:' + (dur / a.dur * 100).toFixed(0) + '%"></b></div><div class="meta">Durability ' + Math.round(dur) + ' / ' + a.dur + '</div></div>' +
          (c > 0 ? '<button class="buy' + (c > money ? ' poor' : '') + '" data-action="repair" data-id="' + slot + '">Repair ' + fmt(c) + '</button>' : '<span class="tagline max">FULL</span>') + '</div>';
      }
      return '<h3>' + title + '</h3>' + cur + '<div class="mini-grid">' + Z.ARMOR.filter(a => a.slot === slot).map(a => {
        const on = curId === a.id;
        return '<div class="card' + (on ? ' equipped' : '') + (a.price > money && !on ? ' poor' : '') + '"><canvas class="ic" data-armor="' + a.id + '" width="120" height="90"></canvas><div class="nm">' + a.name + '</div>' +
          '<div class="meta">-' + Math.round(a.reduce * 100) + '% damage · ' + a.dur + ' durability' + (a.head ? ' · ' + Math.round(a.head * 100) + '% headshot protection' : '') + '</div><div class="desc">' + a.desc + '</div>' +
          (on ? '<span class="tagline eq">EQUIPPED</span>' : '<button class="buy" data-action="armor" data-id="' + a.id + '">' + fmt(a.price) + '</button>') + '</div>';
      }).join('') + '</div>';
    };
    return '<div class="section-note">Armor absorbs a share of every hit and wears down as it does. Vest and helmet stack. Buying new armor replaces your old piece.</div>' + sec('body', 'Body Armor') + sec('head', 'Helmets');
  }

  function renderMedTab() {
    const P = G().player, money = G().money;
    return '<div class="section-note">Heal anytime with the hotkey shown on each item, or press <kbd>H</kbd> to auto-pick the best one. The Defibrillator works by itself when you go down.</div><div class="mini-grid">' + Z.MEDS.map(m =>
      '<div class="card"><canvas class="ic" data-med="' + m.id + '" width="120" height="90"></canvas><div class="badges"><b class="bg-key">' + (m.revive ? 'AUTO' : 'KEY ' + m.key) + '</b></div><div class="nm">' + m.name + '</div><div class="desc">' + m.desc + '</div>' +
      '<div class="meta">You have: <b>' + (P.meds[m.id] || 0) + '</b>' + (m.max ? ' / ' + m.max : '') + '</div><div class="btn-row">' + medButtons(m, P.meds[m.id] || 0, money) + '</div></div>').join('') + '</div>';
  }
  function medButtons(m, have, money) {
    const left = m.max ? m.max - have : Infinity;
    if (left <= 0) return '<span class="tagline max">MAX</span>';
    const many = Math.min(5, left);
    return '<button class="buy' + (m.price > money ? ' poor' : '') + '" data-action="med" data-id="' + m.id + '" data-n="1">Buy 1 · ' + fmt(m.price) + '</button>' +
      (many > 1 ? '<button class="buy alt' + (m.price * many > money ? ' poor' : '') + '" data-action="med" data-id="' + m.id + '" data-n="' + many + '">×' + many + ' · ' + fmt(m.price * many) + '</button>' : '');
  }

  function renderBuildTab() {
    const g = G(), money = g.money;
    return '<div class="section-note">Stock up on barricades, traps and turrets, then press <kbd>B</kbd> in-game to place them. In build mode you can also buy-and-place directly, and right-click to sell. Solid walls block enemies and their bullets — your own shots pass through. Build a wall on the same kind of wall to stack it taller, and put turrets on top of walls.</div><div class="mini-grid">' + Z.BUILD.map(b =>
      '<div class="card"><canvas class="ic" data-build="' + b.id + '" width="120" height="90"></canvas><div class="badges">' + (b.turret ? '<b class="bg-tac">TURRET</b>' : b.solid ? '<b class="bg-key">WALL</b>' : '<b class="bg-up">TRAP/UTILITY</b>') + '</div><div class="nm">' + b.name + '</div><div class="desc">' + b.desc + '</div>' +
      '<div class="meta">HP ' + Math.round(b.hp * (1 + 0.2 * g.perk('builder'))).toLocaleString() + (b.turret ? ' · ' + b.turret.dmg + ' dmg × ' + b.turret.rate + '/s · range ' + b.turret.range : '') + ' · In stock: <b>' + (g.buildInv[b.id] || 0) + '</b></div>' +
      '<div class="btn-row"><button class="buy' + (b.price > money ? ' poor' : '') + '" data-action="build" data-id="' + b.id + '" data-n="1">Buy 1 · ' + fmt(b.price) + '</button><button class="buy alt' + (b.price * 5 > money ? ' poor' : '') + '" data-action="build" data-id="' + b.id + '" data-n="5">×5 · ' + fmt(b.price * 5) + '</button></div></div>').join('') + '</div>';
  }

  function renderTrainingTab() {
    const g = G(), money = g.money;
    return '<div class="section-note">Upgrade <b>yourself</b>: more health, damage, healing, speed and cash. These are permanent and stay with you after respawning. Early levels are cheap!</div><div class="mini-grid">' + Z.PERKS.map(p => {
      const lvl = g.perk(p.id), max = lvl >= p.max, cost = max ? 0 : Z.perkCost(p, lvl);
      return '<div class="card"><div class="perk-ic">' + p.icon + '</div><div class="nm">' + p.name + '</div><div class="desc">' + p.desc + '</div>' +
        '<div class="pips big">' + Array.from({ length: p.max }, (_, i) => '<i class="' + (i < lvl ? 'on' : '') + '"></i>').join('') + '</div>' +
        (max ? '<span class="tagline max">MAXED</span>' : '<button class="buy' + (cost > money ? ' poor' : '') + '" data-action="perk" data-id="' + p.id + '">Level ' + (lvl + 1) + ' · ' + fmt(cost) + '</button>') + '</div>';
    }).join('') + '</div>';
  }

  function renderDetail() {
    const d = $('shop-detail');
    if (S.tab !== 'weapons') { d.classList.add('hidden'); return; }
    d.classList.remove('hidden');
    const w = Z.WEAPON_BY_ID[S.selected] || Z.WEAPONS[0];
    const P = G().player, owned = P.owned.has(w.id), slot = P.slots.indexOf(w.id);
    const e = owned ? Z.applyUpgrades(w, P.upg[w.id]) : w;
    const row = (k, v) => '<tr><td>' + k + '</td><td>' + v + '</td></tr>';
    const sp = specials(w);
    const action = owned
      ? (slot >= 0 ? '<div class="own-row"><span class="tagline eq">EQUIPPED · SLOT ' + (slot + 1) + '</span>' + (slot !== S.slot ? '<button class="buy alt" data-action="buy" data-id="' + w.id + '">Move to slot ' + (S.slot + 1) + '</button>' : '') + '</div>'
        : '<button class="buy wide" data-action="buy" data-id="' + w.id + '">Equip → slot ' + (S.slot + 1) + '</button>')
      : '<button class="buy wide' + (w.price > G().money ? ' poor' : '') + '" data-action="buy" data-id="' + w.id + '">Buy for ' + fmt(w.price) + '</button>';
    // the action button sits right under the name so it's always reachable on short screens
    d.innerHTML =
      '<div class="det-head"><canvas class="big-ic" data-icon="' + w.id + '" width="360" height="160"></canvas>' +
      '<div class="det-title"><div class="badges">' + (w.gold ? '<b class="bg-gold">GOLD EDITION</b>' : '') + (w.tactical ? '<b class="bg-tac">TACTICAL</b>' : '') + '<b class="bg-tier t' + w.tier + '">TIER ' + w.tier + '</b></div>' +
      '<h2>' + esc(w.name) + '</h2>' +
      '<div class="meta">' + w.cat + (w.cat === 'Melee' ? '' : ' · ' + w.modes.map(m => Z.MODE_LABEL[m]).join(' / ')) + '</div></div></div>' +
      action +
      (!owned ? '<div class="hint">Goes into ' + (S.slotChosen ? 'slot ' + (S.slot + 1) : 'the first empty slot (or slot ' + (S.slot + 1) + ')') + ' — pick a slot in the loadout bar.</div>' : '') +
      (w.desc ? '<p class="desc">' + esc(w.desc) + '</p>' : '') +
      '<table class="stats">' +
      row('Damage', (Math.round(e.dmg * 10) / 10) + (w.pellets ? ' × ' + w.pellets + ' pellets' : '')) +
      row('DPS', Math.round(dps(e)).toLocaleString()) +
      (w.kind === 'melee' ? row('Swings', e.rate.toFixed(1) + ' / sec') + row('Reach', Math.round(e.range)) :
        row('Fire rate', Math.round(e.rate * 60) + ' RPM') + row('Magazine', e.mag) + row('Reload', e.reload.toFixed(2) + 's') +
        row('Accuracy', Math.round((1 - Math.min(0.96, e.spread / 0.3)) * 100) + '%') + row('Range', Math.round(w.range))) +
      (sp.length ? row('Special', sp.join(' · ')) : '') +
      '</table>' +
      (owned ? '<h3>Upgrades</h3>' + upgradeRows(w) : '');
    paintCanvases(d);
  }

  function renderLoadout() {
    const P = G().player;
    $('shop-loadout').innerHTML = '<div class="lo-title">LOADOUT<small>Click a slot to choose where new weapons go · right-click to unequip</small></div>' +
      P.slots.map(x => (x && Z.WEAPON_BY_ID[x] ? x : null)).map((id, i) => '<div class="slot' + (i === S.slot ? ' target' : '') + (id ? '' : ' empty') + '" data-action="slot" data-id="' + i + '"><span class="k">' + (i + 1) + '</span>' +
        (id ? '<canvas class="ic" data-icon="' + id + '" width="120" height="56"></canvas><span class="sn">' + esc(Z.WEAPON_BY_ID[id].name) + '</span>' : '<span class="sn">Empty</span>') + '</div>').join('');
    paintCanvases($('shop-loadout'));
  }

  // ---- canvases (icons are drawn lazily as cards scroll into view) ------------------------------
  function paintOne(c) {
    if (c.dataset.done) return;
    c.dataset.done = 1;
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    if (c.dataset.icon) x.drawImage(Z.weaponIcon(Z.WEAPON_BY_ID[c.dataset.icon], c.width, c.height), 0, 0);
    else if (c.dataset.armor) Z.drawArmorIcon(x, Z.ARMOR_BY_ID[c.dataset.armor], c.width / 2, c.height / 2 + 4, 2);
    else if (c.dataset.med) Z.drawMedIcon(x, Z.MED_BY_ID[c.dataset.med], c.width / 2, c.height / 2, 2.1);
    else if (c.dataset.build) { const ic = Z.buildIcon(Z.BUILD_BY_ID[c.dataset.build], c.width, c.height); x.drawImage(ic, 0, 0, c.width, c.height); }
  }
  function paintCanvases(el) { el.querySelectorAll('canvas').forEach(paintOne); }
  function observeIcons(grid) {
    if (!('IntersectionObserver' in window)) { paintCanvases(grid); return; }
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) { paintOne(en.target); observer.unobserve(en.target); } }), { root: grid, rootMargin: '300px' });
    grid.querySelectorAll('canvas[data-icon]:not([data-done])').forEach(c => observer.observe(c));
  }

  // ---- events --------------------------------------------------------------------------------
  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const a = el.dataset.action, id = el.dataset.id;
    if (a !== 'select') e.stopPropagation();
    switch (a) {
      case 'tab': S.tab = id; Z.audio.sfx('click'); $('shop-toolbar').dataset.kind = ''; renderAll(); break;
      case 'cat': S.cat = id; Z.audio.sfx('click'); renderMain(); break;
      case 'select': S.selected = id; Z.audio.sfx('click'); root.querySelectorAll('.card.sel').forEach(c => c.classList.remove('sel')); el.classList.add('sel'); renderDetail(); break;
      case 'buy': buyWeapon(id, el); break;
      case 'upgrade': buyUpgrade(id, el.dataset.key, el); break;
      case 'armor': buyArmor(id, el); break;
      case 'repair': repair(id, el); break;
      case 'med': buyMed(id, +el.dataset.n, el); break;
      case 'build': buyBuild(id, +el.dataset.n, el); break;
      case 'perk': buyPerk(id, el); break;
      case 'slot': S.slot = +id; S.slotChosen = true; Z.audio.sfx('click'); renderLoadout(); renderDetail(); break;
    }
  }
  function onContext(e) {
    const el = e.target.closest('[data-action="slot"]');
    if (!el) return;
    e.preventDefault();
    const P = G().player, i = +el.dataset.id;
    if (!P.slots[i] || P.slots.filter(Boolean).length <= 1) { flash('You need at least one weapon equipped', 'bad'); return; }
    P.slots[i] = null;
    if (P.cur === i) P.cur = P.slots.findIndex(Boolean);
    renderAll();
  }

  S.init = function () {
    root = $('shop');
    root.innerHTML =
      '<div class="shop-wrap">' +
      '<header class="shop-head"><div class="brand">ZOOM2D <span>ARMORY</span></div><div class="paused-chip">⏸ GAME PAUSED</div><div class="wallet" id="shop-money">$0</div><button class="close" id="shop-close" title="Close (Esc / E)">✕</button></header>' +
      '<nav class="shop-tabs" id="shop-tabs"></nav>' +
      '<div class="shop-body"><section class="shop-main"><div class="toolbar" id="shop-toolbar"></div><div class="grid" id="shop-grid"></div></section><aside class="detail" id="shop-detail"></aside></div>' +
      '<footer class="loadout" id="shop-loadout"></footer>' +
      '<div class="shop-flash" id="shop-flash"></div>' +
      '</div>';
    root.addEventListener('click', onClick);
    root.addEventListener('contextmenu', onContext);
    $('shop-close').addEventListener('click', closeShop);
    root.addEventListener('input', e => {
      if (e.target.id === 'shop-search') { S.q = e.target.value; clearTimeout(S.qT); S.qT = setTimeout(() => renderMain(true), 140); }
    });
    root.addEventListener('change', e => {
      if (e.target.id === 'shop-mode') { S.mode = e.target.value; renderMain(true); }
      if (e.target.id === 'shop-cls') { S.cls = e.target.value; renderMain(true); }
      if (e.target.id === 'shop-sort') { S.sort = e.target.value; renderMain(true); }
      if (e.target.id === 'shop-owned') { S.ownedOnly = e.target.checked; renderMain(true); }
      if (e.target.id === 'shop-afford') { S.affordable = e.target.checked; renderMain(true); }
    });
  };
})();
