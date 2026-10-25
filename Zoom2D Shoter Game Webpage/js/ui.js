/* Zoom2D Shooter — menus: title, pause, settings, how-to-play, death screen, toasts. */
(function () {
  // Game version: V.1.0 was the first release; each update adds one to the last number.
  window.Z.VERSION = 'V.1.3';
  const Z = window.Z;
  const G = () => Z.game;
  const $ = id => document.getElementById(id);
  const fmt = n => '$' + Math.floor(n).toLocaleString();
  const SCREENS = ['title', 'pause', 'settings', 'help', 'dead'];
  let settingsBack = 'title';

  const ui = Z.ui = {};

  function show(id) {
    SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
    document.body.classList.toggle('in-menu', !!id);
    $('game').classList.toggle('playing', !id);
  }
  ui.hideAll = () => show(null);

  // in-game dialog (browser confirm/alert boxes steal focus and look out of place)
  ui.modal = function (title, text, buttons) {
    let m = $('modal');
    if (!m) { m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m); }
    m.innerHTML = '<div class="panel-box"><h2>' + title + '</h2><p>' + text + '</p><div class="menu">' +
      buttons.map((b, i) => '<button class="mbtn' + (b.primary ? ' primary' : '') + '" data-i="' + i + '">' + b.label + '</button>').join('') + '</div></div>';
    m.classList.remove('hidden');
    m.querySelectorAll('button').forEach(btn => btn.onclick = () => { m.classList.add('hidden'); const b = buttons[+btn.dataset.i]; if (b.action) b.action(); });
    const first = m.querySelector('.mbtn.primary') || m.querySelector('.mbtn'); if (first) first.focus();
  };

  ui.init = function () {
    Z.shop.init();
    const start = () => { Z.audio.init(); Z.deleteSave(); Z.newGame(); };
    $('btn-new').onclick = () => {
      if (!Z.hasSave()) return start();
      ui.modal('NEW GAME?', 'Starting over replaces your saved progress — weapons, base and cash.', [
        { label: 'Start fresh', primary: true, action: start }, { label: 'Cancel' }]);
    };
    $('btn-continue').onclick = () => { Z.audio.init(); let ok = false; try { ok = Z.load(); } catch (err) { console.warn('Zoom2D: save could not be loaded', err); } if (!ok) { ui.modal('SAVE PROBLEM', 'That save could not be loaded. You can start a new game instead.', [{ label: 'OK', primary: true }]); refreshTitle(); } };
    // title music starts on the first click or key press (browsers block audio before that)
    const wake = () => { Z.audio.init(); Z.audio.startMusic(); if (G().state === 'title') { Z.audio.targetIntensity = 0; Z.audio.setAmbience(-1); } };
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    $('btn-settings').onclick = () => { settingsBack = 'title'; openSettings(); };
    $('btn-help').onclick = () => { settingsBack = 'title'; show('help'); };
    $('btn-resume').onclick = ui.resume;
    $('btn-p-settings').onclick = () => { settingsBack = 'pause'; openSettings(); };
    $('btn-p-help').onclick = () => { settingsBack = 'pause'; show('help'); };
    $('btn-p-quit').onclick = () => { Z.save(); toTitle(); };
    $('btn-help-back').onclick = () => show(settingsBack);
    $('btn-set-back').onclick = () => show(settingsBack);
    $('btn-respawn').onclick = () => Z.respawn();
    $('btn-dead-quit').onclick = () => { Z.save(); toTitle(); };
    buildSettings();
    buildHelp();
    refreshTitle();
    show('title');
    document.addEventListener('keydown', e => {
      if (e.code === 'Escape' && (G().state === 'title' || G().state === 'pause') && !$('settings').classList.contains('hidden')) show(settingsBack);
      else if (e.code === 'Escape' && !$('help').classList.contains('hidden')) show(settingsBack);
    });
  };

  function refreshTitle() {
    const has = Z.hasSave();
    $('btn-continue').classList.toggle('hidden', !has);
    $('stat-line').textContent = Z.VERSION + ' · ' + Z.WEAPONS.length + ' weapons · ' + Z.BUILD.length + ' base structures · ' + Object.keys(Z.ETYPES).length + ' enemy types · 4 biomes';
  }

  function toTitle() {
    const g = G();
    g.state = 'title'; g.building = false;
    Z.audio.setMuffled(false); Z.audio.targetIntensity = 0; Z.audio.event('calm'); Z.audio.setAmbience(-1);
    Z.audio.loop('minigun', 0); Z.audio.loop('flame', 0);
    refreshTitle();
    show('title');
  }

  ui.pause = function () {
    const g = G();
    if (g.state !== 'play') return;
    g.state = 'pause';
    Z.audio.setMuffled(true);
    const s = g.stats;
    $('pause-stats').innerHTML = '<span>' + fmt(g.money) + '</span><span>' + s.kills + ' kills</span><span>Threat ' + g.threat.toFixed(1) + '</span><span>' + fmtTime(s.time) + '</span>';
    show('pause');
  };
  ui.resume = function () {
    const g = G();
    if (g.state !== 'pause') return;
    g.state = 'play';
    Z.audio.setMuffled(false);
    show(null);
  };

  function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }

  ui.showDeath = function () {
    const g = G(), s = g.stats;
    g.state = 'dead';
    Z.audio.setMuffled(true);
    const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
    $('dead-stats').innerHTML = [
      ['Survived', fmtTime(s.time)], ['Kills', s.kills], ['Headshots', s.headshots], ['Accuracy', acc + '%'],
      ['Cash earned', fmt(s.earned)], ['Best combo', s.bestCombo + 'x'], ['Raids', s.raids], ['Threat level', g.threat.toFixed(1)]
    ].map(([k, v]) => '<div><small>' + k + '</small><b>' + v + '</b></div>').join('');
    const by = g.player.lastHitBy;
    $('dead-by').textContent = by ? 'Taken down by ' + (/^(a|an|your) /.test(by) ? by : 'a ' + by) : '';
    $('dead-loss').textContent = 'Respawning costs 10% of your cash (' + fmt(Math.min(g.money * 0.1, Z.RESPAWN_CAP)) + '). You keep your weapons, upgrades, perks and base, and enemies ease off for a while.';
    show('dead');
  };

  ui.toast = function (title, body) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<b>' + title + '</b><span>' + body + '</span>';
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4400);
  };

  // ---- settings --------------------------------------------------------------------------
  const RES = [['auto', 'Auto — keeps it smooth (recommended)'], [0.5, '50%'], [0.67, '67%'], [0.75, '75%'], [0.85, '85%'], [1, '100% (native)'], [1.25, '125% (supersample)'], [1.5, '150% (supersample)'], [2, '200% (supersample)']];
  function buildSettings() {
    const s = G().settings;
    $('set-body').innerHTML =
      '<label>Resolution scale<select id="set-res">' + RES.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('') + '</select></label>' +
      '<div class="res-label" id="res-label"></div>' +
      '<label class="chk"><input type="checkbox" id="set-hidpi"> Sharp HiDPI rendering (uses your screen\'s pixel density)</label>' +
      '<label>Graphics quality<select id="set-quality"><option value="0">Low (fast)</option><option value="1">High</option><option value="2">Ultra</option></select></label>' +
      '<label>HUD size<select id="set-hud"><option value="0.8">Small</option><option value="1">Normal</option><option value="1.15">Large</option></select></label>' +
      '<label>Music volume<input type="range" id="set-music" min="0" max="1" step="0.05"></label>' +
      '<label>Sound effects volume<input type="range" id="set-sfx" min="0" max="1" step="0.05"></label>' +
      '<label class="chk"><input type="checkbox" id="set-shake"> Screen shake</label>' +
      '<label class="chk"><input type="checkbox" id="set-dmg"> Damage numbers</label>' +
      '<label class="chk"><input type="checkbox" id="set-fps"> Show FPS counter</label>';
    $('set-res').value = String(s.res);
    $('set-hidpi').checked = s.hidpi; $('set-quality').value = String(s.quality); $('set-hud').value = String(s.hud);
    $('set-music').value = s.music; $('set-sfx').value = s.sfx;
    $('set-shake').checked = s.shake; $('set-dmg').checked = s.dmgNumbers; $('set-fps').checked = s.fps;
    const bind = (id, key, conv, prop) => $(id).addEventListener(prop === 'checked' ? 'change' : 'input', e => { s[key] = conv(e.target[prop || 'value']); Z.applySettings(); });
    bind('set-res', 'res', v => v === 'auto' ? 'auto' : parseFloat(v)); bind('set-quality', 'quality', v => parseInt(v, 10)); bind('set-hud', 'hud', parseFloat);
    bind('set-music', 'music', parseFloat); bind('set-sfx', 'sfx', parseFloat);
    bind('set-hidpi', 'hidpi', Boolean, 'checked'); bind('set-shake', 'shake', Boolean, 'checked'); bind('set-dmg', 'dmgNumbers', Boolean, 'checked'); bind('set-fps', 'fps', Boolean, 'checked');
    $('set-res').addEventListener('change', () => { const v = $('set-res').value; s.res = v === 'auto' ? 'auto' : parseFloat(v); Z.applySettings(); });
    $('set-quality').addEventListener('change', () => { s.quality = parseInt($('set-quality').value, 10); Z.applySettings(); });
    $('set-hud').addEventListener('change', () => { s.hud = parseFloat($('set-hud').value); Z.applySettings(); });
  }
  ui.updateResLabel = function () {
    const c = $('game'), el = $('res-label');
    if (el) el.textContent = 'Rendering at ' + c.width + ' × ' + c.height + ' pixels (window ' + window.innerWidth + ' × ' + window.innerHeight + ', pixel ratio ' + (window.devicePixelRatio || 1) + ')' + (G().settings.res === 'auto' && Z.dyn ? ' · auto scale ' + Math.round(Z.dyn.scale * 100) + '%' : '');
  };
  function openSettings() { ui.updateResLabel(); show('settings'); }

  // ---- how to play -------------------------------------------------------------------------
  function buildHelp() {
    const keys = [
      ['A / D  or  ← / →', 'Move'], ['Space / W', 'Jump (hold for higher)'], ['Shift', 'Sprint'],
      ['Left click', 'Shoot / swing'], ['Right click (hold)', 'Aim down sights — tighter spread, snipers zoom out'],
      ['R', 'Reload'], ['V', 'Switch fire mode (select-fire guns)'], ['1 – 9 / mouse wheel', 'Switch weapon'], ['Q', 'Quick-swap to last weapon'],
      ['E or click the sign', 'Open the shop (pauses the game)'], ['B', 'Build mode (place barricades, traps, turrets)'],
      ['H', 'Quick heal (best med for your HP)'], ['Z X C F G T Y U', 'Use a specific medical item'], ['J K L I O', 'More medical items (the Defibrillator works by itself)'], ['M', 'Mute music'], ['Esc', 'Pause / close menus']
    ];
    const foes = Object.values(Z.ETYPES).map(e => '<div class="foe"><b>' + e.name + '</b><span>Tier ' + e.tier + ' · ' + e.hp + ' HP · $' + e.reward[0] + '–' + e.reward[1] + '</span></div>').join('');
    $('help-body').innerHTML =
      '<div class="help-cols"><div><h3>Controls</h3><table class="keys">' + keys.map(([k, v]) => '<tr><td><kbd>' + k + '</kbd></td><td>' + v + '</td></tr>').join('') + '</table></div>' +
      '<div><h3>How to win</h3><ul>' +
      '<li>Enemies start as clueless <b>Dimwits</b> who throw rocks and trip over their own feet. The longer you survive (and the more you kill) the higher the <b>Threat Level</b> — and the tougher they get, all the way up to machine-gun <b>Big Henchmen</b> and minigun <b>Boss Brutes</b>.</li>' +
      '<li>Earn money from kills (headshots and combos pay extra), cash lying around the map, supply drops, and Money Printers in your base.</li>' +
      '<li>Spend it at <b>SHOP</b> signs: ' + Z.WEAPONS.length + ' weapons grouped by type (Semi-Auto, Full-Auto, Manual Action, Machine Guns, Explosives, Melee, Futuristic) and sorted by price, plus upgrades, armor, meds, barricades and training.</li>' +
      '<li>Everything is expensive on purpose. Futuristic gear costs millions and <b>laser swords start at $10,000,000</b> — build Money Printers, Gold Printers and Crypto Mining Rigs, and push the threat level up (bounties grow fast) to afford them.</li>' +
      '<li>Every ~3 minutes a <b>RAID</b> hits: a big wave that marches straight at you. Build walls, traps and turrets to hold the line.</li>' +
      '<li><b>Stack your walls:</b> build a wall on top of the same kind of wall and they merge into one taller wall (right-click takes the top block off). Turrets, med stations and printers can sit on top of walls too.</li>' +
      '<li>Carry a <b>Defibrillator</b> and it revives you automatically when you go down.</li>' +
      '<li>Laser swords deflect bullets back at enemies. Snipers zoom out when you aim. Tactical guns have laser sights.</li>' +
      '<li>The game autosaves every 30 seconds and whenever you close the shop.</li></ul>' +
      '<h3>Enemies</h3><div class="foes">' + foes + '</div></div></div>';
  }
})();
