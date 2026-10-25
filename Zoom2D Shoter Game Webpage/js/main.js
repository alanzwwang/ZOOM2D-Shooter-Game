/* Zoom2D Shooter — game state, loop, camera, rendering, HUD, spawning, building, saving. */
(function () {
  const Z = window.Z;
  const VIEW_H = 700;
  const SAVE_KEY = 'zoom2d_save_v2', SET_KEY = 'zoom2d_settings_v3';
  const WORLD_W = 36000;
  const rand = Z.rand, clamp = Z.clamp;
  const $ = id => document.getElementById(id);

  // ---- storage helpers (private windows can throw) ---------------------------------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };

  const DEFAULT_SETTINGS = { res: 'auto', hidpi: true, quality: 1, shake: true, dmgNumbers: true, fps: false, music: 0.7, sfx: 0.8, hud: 1 };
  const settings = Object.assign({}, DEFAULT_SETTINGS, store.get(SET_KEY) || {});

  const canvas = $('game');
  let ctx = canvas.getContext('2d', { alpha: false });
  const hudCanvas = $('hud'), hudCtx = hudCanvas.getContext('2d');
  let hudT = 0, hudShown = false;
  const vignettes = {};
  function vignetteFor(W, H) {
    const key = W + 'x' + H;
    if (!vignettes[key]) {
      for (const k in vignettes) delete vignettes[k];
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'), vg = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      x.fillStyle = vg; x.fillRect(0, 0, W, H);
      vignettes[key] = c;
    }
    return vignettes[key];
  }

  const g = Z.game = {
    settings, state: 'title', time: 0, realTime: 0,
    particles: [], bullets: [], enemies: [], pickups: [], texts: [], beams: [], flashes: [], lights: [], rings: [], decals: [], feed: [], dmgDirs: [],
    structures: [], solids: [], buildInv: {}, perks: {}, achievements: {},
    money: 0, threat: 1, combo: 0, comboT: 0, hitMarker: 0, hitHead: false, hurtFlash: 0, kick: 0, shakeAmt: 0,
    maxParticles: 1500, quality: 1, mouse: { sx: 0, sy: 0, wx: 0, wy: 0 },
    cam: { x: 0, y: 400, vh: VIEW_H }, camKick: { x: 0, y: 0 }, building: false, buildSel: 0, timeScale: 1, slowT: 0,
    banners: [], tips: [], stats: null, spawnQueue: [], deathRelief: 0, labelRects: [],
    perk(id) { return this.perks[id] || 0; },
    shake(a) { if (settings.shake) this.shakeAmt = Math.max(this.shakeAmt, a); },
    volAt(x) { const d = Math.abs(x - this.cam.x); return clamp(1 - (d - this.viewW * 0.5) / 1600, 0.06, 1); },
    onPlayerDeath() { this.deathT = 2; Z.audio.targetIntensity = 0; Z.audio.loop('minigun', 0); Z.audio.loop('flame', 0); },
    viewW: 1600, scale: 1
  };

  // ---- input -------------------------------------------------------------------------
  const keys = {};
  const input = { left: false, right: false, jump: false, jumpPressed: false, sprint: false, fire: false, firePressed: false, aim: false, reload: false, mx: 0, my: 0 };
  let mouseDown = false, rightDown = false;

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    g.mouse.sx = (e.clientX - r.left) * canvas.width / r.width;
    g.mouse.sy = (e.clientY - r.top) * canvas.height / r.height;
  }
  window.addEventListener('mousemove', toCanvas);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', e => {
    toCanvas(e);
    Z.audio.init();
    if (g.state !== 'play') return;
    updateMouseWorld();
    if (e.button === 0) {
      if (g.building) { tryPlace(); return; }
      const sign = signUnderMouse();
      const enemyUnder = g.enemies.some(en => { if (en.dead) return false; const hb = en.hitbox(); return g.mouse.wx > hb.x - 30 && g.mouse.wx < hb.x + hb.w + 30 && g.mouse.wy > hb.y - 30 && g.mouse.wy < hb.y + hb.h + 30; });
      if (sign != null && !enemyUnder) {
        if (Math.abs(sign - g.player.x) < 420) { Z.shop.open(); return; }
        Z.fx.text(sign, g.terrain.heightAt(sign) - 220, 'Get closer to shop!', '#ffd84d', 18);
        return;
      }
      mouseDown = true; input.firePressed = true;
    } else if (e.button === 2) {
      if (g.building) { trySell(); return; }
      rightDown = true;
    }
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) rightDown = false; });
  window.addEventListener('blur', () => { mouseDown = false; rightDown = false; for (const k in keys) keys[k] = false; if (g.state === 'play') Z.ui.pause(); });
  canvas.addEventListener('wheel', e => {
    if (g.state !== 'play') return;
    e.preventDefault();
    const d = e.deltaY > 0 ? 1 : -1;
    if (g.building) { g.buildSel = (g.buildSel + d + Z.BUILD.length) % Z.BUILD.length; Z.audio.sfx('click'); }
    else g.player.cycle(d);
  }, { passive: false });

  const MED_KEYS = Object.fromEntries(Z.MEDS.map(m => ['Key' + m.key, m.id]));
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
      if (e.code === 'Escape') { e.target.blur(); if (g.state === 'shop') Z.shop.close(); }
      return;
    }
    Z.audio.init();
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyZ' && !e.repeat) { e.preventDefault(); secretToggle(); return; }
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (e.code === 'Escape') {
      if (g.state === 'shop') Z.shop.close();
      else if (g.state === 'play' && g.building) setBuilding(false);
      else if (g.state === 'play') Z.ui.pause();
      else if (g.state === 'pause') Z.ui.resume();
      return;
    }
    if (g.state === 'shop' && (e.code === 'KeyE')) { Z.shop.close(); return; }
    if (g.state !== 'play') return;
    const P = g.player;
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') input.jumpPressed = true;
    if (/^Digit[1-9]$/.test(e.code)) {
      const i = +e.code.slice(5) - 1;
      const j = i + (e.shiftKey ? 10 : 0);
      if (g.building) { if (j < Z.BUILD.length) { g.buildSel = j; Z.audio.sfx('click'); } } else P.switchTo(i);
    }
    if (e.code === 'Digit0' && g.building) { const j = e.shiftKey ? 19 : 9; if (j < Z.BUILD.length) { g.buildSel = j; Z.audio.sfx('click'); } }
    if (e.code === 'KeyQ') { if (g.building) g.buildSel = (g.buildSel + Z.BUILD.length - 1) % Z.BUILD.length; else P.switchTo(P.lastSlot); }
    if (e.code === 'KeyV') P.toggleMode();
    if (e.code === 'KeyB') setBuilding(!g.building);
    if (e.code === 'KeyE') {
      const s = nearestSign();
      if (s != null && Math.abs(s - P.x) < 420) Z.shop.open();
      else if (g.building) g.buildSel = (g.buildSel + 1) % Z.BUILD.length;
      else Z.fx.text(P.x, P.y - 100, 'No shop nearby — follow the $ on the minimap', '#ffd84d', 16, 1.6);
    }
    if (e.code === 'KeyH') P.smartHeal();
    if (MED_KEYS[e.code]) P.useMed(MED_KEYS[e.code]);
    if (e.code === 'KeyM') { Z.audio.muted = !Z.audio.muted; Z.audio.applyVolumes(); banner(Z.audio.muted ? 'Music muted' : 'Music on', '#9fd8ff', 1.5); }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  // the owner's private switch: invincible, plus a cash boost each time it is turned on
  function secretToggle() {
    if (g.state !== 'play' || !g.player) return;
    g.godMode = !g.godMode;
    if (g.godMode) { g.money += 1000000; g.player.hp = g.player.maxHp; }
    Z.fx.text(g.player.x, g.player.y - 110, g.godMode ? '★ ON' : '★ OFF', '#ffd84d', 18, 1.2);
    Z.audio.sfx('click');
  }

  function readInput() {
    input.left = keys.KeyA || keys.ArrowLeft;
    input.right = keys.KeyD || keys.ArrowRight;
    input.jump = keys.Space || keys.KeyW || keys.ArrowUp;
    input.sprint = (keys.ShiftLeft || keys.ShiftRight) && !g.building;
    input.reload = keys.KeyR;
    input.fire = mouseDown;
    input.aim = rightDown;
    input.mx = g.mouse.wx; input.my = g.mouse.wy;
  }

  // ---- canvas sizing / resolution scale ------------------------------------------------
  // Dynamic resolution: in 'auto' mode the internal resolution is capped to ~2560x1440 worth of
  // pixels and scaled down a step whenever frames get slow, then carefully back up when there's headroom.
  const MAXPIX = 5.0e6;
  const dyn = { scale: 1, ceil: 1, ft: [], t: 0, bad: 0, good: 0, cool: 2, lastUp: -1e9 };
  // Uses the MEDIAN frame time of each ~1.25s window, so one-off hitches (GC, alt-tab, loading)
  // never trigger a resolution drop — only sustained slowness does.
  function dynTick(dt, now) {
    if (settings.res !== 'auto' || (g.state !== 'play' && g.state !== 'title')) { dyn.ft.length = 0; dyn.t = 0; return; }
    if (dt > 0.25) return;
    dyn.ft.push(dt * 1000); dyn.t += dt; dyn.cool -= dt;
    if (dyn.t < 1.25) return;
    const f = dyn.ft.sort((x, y) => x - y), med = f[f.length >> 1], p80 = f[Math.floor(f.length * 0.8)];
    dyn.ft.length = 0; dyn.t = 0;
    if (dyn.cool > 0) return;
    // a downscale that didn't make frames faster means we're CPU-bound: undo it and hold for 30 s
    if (dyn.checkDown) {
      const d = dyn.checkDown; dyn.checkDown = null;
      if (med > d.med * 0.9) { dyn.scale = d.scale; dyn.ceil = Math.max(dyn.ceil, d.scale); dyn.cool = 30; dyn.bad = 0; resize(); return; }
    }
    if (med > 19.5 || p80 > 31) {
      dyn.calm = 0;
      if (++dyn.bad < 2 && med < 28) return;
      // a scale-up that immediately caused slowdown sets a ceiling, so we don't oscillate
      if (now - dyn.lastUp < 7000) dyn.ceil = Math.max(0.5, dyn.scale * 0.97);
      const prev = dyn.scale;
      dyn.scale = Math.max(0.5, dyn.scale * (med > 30 ? 0.82 : 0.9)); dyn.bad = 0; dyn.good = 0; dyn.cool = 1.5;
      if (dyn.scale !== prev) { dyn.checkDown = { scale: prev, med }; resize(); }
    } else {
      dyn.bad = 0;
      // the ceiling slowly recovers after a calm stretch, so one hard fight doesn't cap quality forever
      if (++dyn.calm >= 8 && dyn.ceil < 1) { dyn.ceil = Math.min(1, dyn.ceil + 0.05); dyn.calm = 0; }
      if (med < 18.5 && p80 < 24 && dyn.scale < dyn.ceil && ++dyn.good >= 5) { dyn.scale = Math.min(dyn.ceil, dyn.scale * 1.08); dyn.good = 0; dyn.cool = 2; dyn.lastUp = now; resize(); }
    }
  }
  Z.dyn = dyn;
  function resize() {
    const cw = window.innerWidth, ch = window.innerHeight;
    const dpr = settings.hidpi ? (window.devicePixelRatio || 1) : 1;
    let pr = settings.res === 'auto' ? Math.min(dpr, Math.sqrt(MAXPIX / (cw * ch))) * dyn.scale : dpr * settings.res;
    if (settings.res === 'auto') pr = Math.max(pr, Math.min(dpr, Math.max(1280 / cw, 720 / ch))); // never blurrier than ~720p
    if (cw * pr > 4096) pr = 4096 / cw;
    if (ch * pr > 2304) pr = Math.min(pr, 2304 / ch);
    canvas.width = Math.max(320, Math.round(cw * pr));
    canvas.height = Math.max(180, Math.round(ch * pr));
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const hdpr = Math.min(window.devicePixelRatio || 1, 2);
    hudCanvas.width = Math.round(cw * hdpr); hudCanvas.height = Math.round(ch * hdpr);
    hudCanvas.style.width = cw + 'px'; hudCanvas.style.height = ch + 'px';
    hudT = 0;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (Z.Sky && Z.Sky.clear) Z.Sky.clear();
    Z.ui && Z.ui.updateResLabel && Z.ui.updateResLabel();
  }
  window.addEventListener('resize', resize);
  Z.resize = resize;

  function applySettings() {
    g.quality = settings.quality;
    g.maxParticles = [450, 1500, 3000][settings.quality];
    Z.audio.musicVol = settings.music; Z.audio.sfxVol = settings.sfx; Z.audio.applyVolumes();
    if (settings.res !== 'auto') { dyn.scale = 1; dyn.ceil = 1; }
    resize();
    store.set(SET_KEY, settings);
  }
  Z.applySettings = applySettings;

  // ---- world setup -------------------------------------------------------------------------
  function makeWorld(seed) {
    g.seed = seed;
    g.terrain = new Z.Terrain(seed, WORLD_W);
    g.terrain.h0 = g.terrain.h.slice(); // pristine heights, so saves only store the craters
    Z.Sky.init(seed);
    g.particles = []; g.bullets = []; g.enemies = []; g.pickups = []; g.texts = []; g.beams = []; g.flashes = []; g.lights = []; g.rings = []; g.decals = []; g.feed = []; g.dmgDirs = [];
    g.structures = []; g.solids = []; g.spawnQueue = []; g.deathRelief = 0; g.camKick = { x: 0, y: 0 }; g.slowT = 0;
    g.player = new Z.Player(260, g.terrain.heightAt(260));
    // scatter loot across the world
    for (let i = 0; i < 170; i++) spawnLoot(rand(500, WORLD_W - 200), true);
  }

  function freshStats() { return { kills: 0, headshots: 0, shots: 0, hits: 0, earned: 0, spent: 0, time: 0, deaths: 0, killsByType: {}, raids: 0, built: 0, bestCombo: 0, deflects: 0 }; }

  function newGame() {
    makeWorld((Math.random() * 1e9) | 0);
    g.money = 400; g.threat = 1; g.time = 0; g.stats = freshStats();
    g.perks = {}; g.buildInv = { sandbags: 2 }; g.freeStock = { sandbags: 2 }; g.achievements = {};
    g.spawnT = 6; g.cashT = 3; g.dropT = 45; g.raidT = 420; g.raidWarn = false; g.maxX = 260; g.biomeShown = -1;
    g.player.invalidate(); g.player.hp = g.player.maxHp;
    g.tips = [
      { t: 0, d: 6, s: 'Move with A / D, jump with SPACE or W. Hold SHIFT to sprint.' },
      { t: 6, d: 6, s: 'Aim with the mouse and LEFT-CLICK to shoot. Hold RIGHT-CLICK to aim down sights.' },
      { t: 12, d: 6, s: 'Kill enemies and grab the cash they drop. Loot is hidden all over the map!' },
      { t: 18, d: 7, s: 'CLICK the glowing SHOP sign (or press E near it) to buy ' + Z.WEAPONS.length + ' weapons, armor, meds & barricades.' },
      { t: 25, d: 7, s: 'Press B to enter BUILD MODE and fortify a base with walls, traps and turrets.' },
      { t: 38.5, d: 6, s: 'Build a wall on top of the same kind of wall to stack it taller. Turrets can sit on walls too!' },
      { t: 32, d: 6, s: 'Press H to heal, R to reload, V to switch fire mode, Q to quick-swap.' },
      { t: 45, d: 7, s: 'Open the shop\'s UPGRADE YOU tab to boost your health, damage, healing and speed!' }
    ];
    startPlay();
  }

  function startPlay() {
    g.state = 'play'; g.deathT = 0; g.building = false;
    Z.audio.init(); Z.audio.startMusic(); Z.audio.setMuffled(false); Z.audio.event('calm');
    Z.ui.hideAll();
    canvas.classList.add('playing');
    snapCamera();
  }

  // ---- save / load --------------------------------------------------------------------------
  function save() {
    if (!g.player || !g.stats) return false;
    const P = g.player;
    return store.set(SAVE_KEY, {
      v: 2, seed: g.seed, money: g.money, time: g.time, stats: g.stats, perks: g.perks, buildInv: g.buildInv, achievements: g.achievements,
      player: { x: P.x, y: P.y, hp: P.hp, slots: P.slots, owned: [...P.owned], cur: P.cur, body: P.body, head: P.head, bodyDur: P.bodyDur, headDur: P.headDur, meds: P.meds, upg: P.upg, modeSel: P.modeSel,
        fx: { heals: P.heals.map(h => [h.rate, h.left]), speedT: P.speedT, speedMul: P.speedMul, resistT: P.resistT, resist: P.resist, regenT: P.regenT, regen: P.regen, dmgT: P.dmgT, dmgMul: P.dmgMul } },
      structures: g.structures.map(s => {
        const pile = g.pickups.find(p => p.printer === s), on = s.on ? g.structures.indexOf(s.on) : -1;
        return { id: s.id, x: s.x, hp: s.hp, maxHp: s.maxHp, free: s.free || undefined, pile: pile ? pile.value : undefined,
          lv: s.levels > 1 ? s.levelFree.map(Number) : undefined, lh: s.levels > 1 ? s.levelHp.map(Math.round) : undefined, on: on >= 0 ? on : undefined };
      }),
      raidT: g.raidT, deathRelief: g.deathRelief, freeStock: g.freeStock, craters: encodeCraters(), savedAt: Date.now()
    });
  }
  function encodeCraters() {
    const T = g.terrain, out = [];
    for (let i = 0; i < T.cols; i++) if (Math.abs(T.h[i] - T.h0[i]) > 0.5 || T.burn[i]) out.push(i + ':' + Math.round(T.h[i]) + ':' + T.burn[i]);
    return out.join(',');
  }
  function decodeCraters(str) {
    if (!str) return;
    const T = g.terrain;
    for (const part of str.split(',')) { const [i, h, b] = part.split(':').map(Number); if (i >= 0 && i < T.cols) { T.h[i] = h; T.burn[i] = b || 0; } }
    for (const d of T.decor) if (Math.abs(T.heightAt(d.x) - T.h0[Math.round(d.x / T.step)]) > 20) d.alive = false;
    T.invalidate(0, T.width);
  }
  function load() {
    const d = store.get(SAVE_KEY);
    if (!d || d.v !== 2) return false;
    makeWorld(d.seed);
    g.money = d.money; g.time = d.time; g.stats = Object.assign(freshStats(), d.stats); g.perks = d.perks || {}; g.buildInv = d.buildInv || {}; g.achievements = d.achievements || {};
    g.freeStock = d.freeStock || {}; g.deathRelief = d.deathRelief || 0;
    decodeCraters(d.craters);
    const P = g.player, p = d.player;
    P.x = p.x; P.y = g.terrain.heightAt(p.x) - 40; P.slots = p.slots.map(id => id && Z.WEAPON_BY_ID[id] ? id : null);
    P.owned = new Set(p.owned.filter(id => Z.WEAPON_BY_ID[id])); P.cur = P.slots[p.cur] ? p.cur : P.slots.findIndex(Boolean);
    P.body = p.body; P.head = p.head; P.bodyDur = p.bodyDur; P.headDur = p.headDur; P.meds = p.meds || {}; P.upg = p.upg || {}; P.modeSel = p.modeSel || {};
    P.invalidate(); P.hp = Math.min(P.maxHp, p.hp || P.maxHp);
    const pf = p.fx;
    if (pf && typeof pf === 'object') {
      const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
      P.heals = Array.isArray(pf.heals) ? pf.heals.filter(h => Array.isArray(h) && num(h[0]) > 0 && num(h[1]) > 0).map(h => ({ rate: h[0], left: h[1] })) : [];
      for (const k of ['speedT', 'resistT', 'regenT', 'dmgT']) P[k] = num(pf[k]);
      P.speedMul = num(pf.speedMul) || 1; P.resist = num(pf.resist); P.regen = num(pf.regen); P.dmgMul = num(pf.dmgMul) || 1;
    }
    const list = Array.isArray(d.structures) ? d.structures : [];
    const placed = [];
    for (const s of list) {
      const st = s && Z.BUILD_BY_ID[s.id] ? Z.placeStructure(s.id, s.x) : null; placed.push(st); if (!st) continue;
      if (Array.isArray(s.lv) && s.lv.length > 1 && st.def.stack) {
        // never more levels than fit under the height cap
        const n = Math.min(s.lv.length, Math.max(1, Math.floor(Z.MAX_STACK_H / st.def.h)));
        st.levels = n; st.levelFree = s.lv.slice(0, n).map(Boolean); st.h = st.def.h * n;
        st.levelHp = Array.isArray(s.lh) && s.lh.length >= n ? s.lh.slice(0, n).map(Number) : new Array(n).fill(st.maxHp);
      } else st.levelFree = [!!s.free];
      if (s.maxHp > 0) st.maxHp = s.maxHp;
      else if (st.levels > 1) st.maxHp = st.levelHp.reduce((a, b) => a + b, 0);
      st.hp = Math.min(st.maxHp, s.hp > 0 ? s.hp : st.maxHp);
      if (s.free) st.free = true;
    }
    // put stacked structures back on top of whatever they stood on (only on solid blocks, never in a loop)
    list.forEach((s, i) => {
      const st = placed[i], j = s && s.on;
      if (!st || !Number.isInteger(j) || j === i || !placed[j] || !placed[j].def.solid) return;
      st.on = placed[j];
      for (let r = st.on, n = 0; r; r = r.on, n++) if (r === st || n > 60) { st.on = null; break; }
    });
    // settle bottom-up, and keep supports ahead of what they hold so later frames stay in order
    const depth = st => { let n = 0; for (let r = st.on; r && n < 60; r = r.on) n++; return n; };
    g.structures.sort((a, b) => depth(a) - depth(b));
    for (const st of g.structures) st.settle();
    Z.rebuildSolids();
    g.quietSettle = true;
    list.forEach((s, i) => { const st = placed[i]; if (st && s.pile > 0) { const pile = Z.spawnCash(Z.printerPileX(st), st.top - 6, s.pile, false, 1e9); pile.printer = st; } });
    // stand where you were saved (on top of a wall, say) if that spot is still free; otherwise on the ground
    if (typeof p.y === 'number' && isFinite(p.y)) {
      const gy = g.terrain.heightAt(P.x);
      const onTop = g.solids.some(b => Math.abs(P.x - b.x) < b.w / 2 + 11 && Math.abs(p.y - b.top) < 2);
      const inside = g.solids.some(b => Math.abs(P.x - b.x) < b.w / 2 + 11 && p.y > b.top + 2 && p.y - 62 < b.base);
      if (p.y <= gy && !inside && (onTop || gy - p.y < 1)) P.y = p.y;
    }
    g.spawnT = 3; g.cashT = 3; g.dropT = 40; g.raidT = d.raidT || 170; g.raidWarn = false; g.maxX = P.x; g.biomeShown = -1; g.tips = [];
    g.threat = calcThreat();
    startPlay();
    banner('Welcome back!', '#5dff8a', 2);
    return true;
  }
  Z.save = save; Z.load = load; Z.newGame = newGame; Z.hasSave = () => { const d = store.get(SAVE_KEY); return !!(d && d.v === 2); };
  Z.deleteSave = () => store.del(SAVE_KEY);
  Z.startPlay = startPlay;

  // ---- spawning director ------------------------------------------------------------------
  function calcThreat() {
    const s = g.stats;
    // threat follows how strong you are (kills, gear bought) more than the clock, and backs off after you die
    const raw = 1 + Math.min(1.5, g.time / 600) + Math.min(4, 1.2 * Math.sqrt(s.kills / 10)) + Math.min(0.5, Math.max(0, g.maxX - 600) / 30000) + Math.min(3, (s.spent || 0) / 400000);
    return clamp(raw - (g.deathRelief || 0), 1, 10);
  }
  function pickType(t, raid) {
    const W = {
      dimwit: Math.max(raid ? 0 : 0.4, 5 - t * 1.1),
      goon: t < 1.4 ? 0.5 : Math.max(0.3, 4 - Math.abs(t - 2.8)),
      thug: t < 2.2 ? 0 : Math.max(0.2, 4 - Math.abs(t - 4.3)),
      merc: t < 3.2 ? 0 : Math.max(0.3, 3.5 - Math.abs(t - 6) * 0.8),
      rocketeer: t < 3.8 ? 0 : 0.9,
      marksman: t < 4.2 ? 0 : 0.9,
      // the big muscly henchmen only show up after a good while (threat 6.5+ and 10+ minutes in),
      // and never more than one at a time — counting any already queued up for a raid
      henchman: t < 6.5 || g.time < 600 || henchmenOut() >= 1 ? 0 : Math.min(1.6, (t - 6) * 0.5),
      brute: 0
    };
    if (t >= 8.5 && g.time > 1200 && bossesOut('brute') < 1) W.brute = 0.12 * (t - 8) * (raid ? 2 : 1);
    let sum = 0; for (const k in W) sum += W[k];
    let r = Math.random() * sum;
    for (const k in W) { r -= W[k]; if (r <= 0) return k; }
    return 'dimwit';
  }
  // Big Henchmen (or Boss Brutes) alive on the map plus any waiting in the raid queue
  function bossesOut(type) {
    let n = 0;
    for (const e of g.enemies) if (e.type === type && !e.dead) n++;
    for (const q of g.spawnQueue) if (q.type === type) n++;
    return n;
  }
  const henchmenOut = () => bossesOut('henchman');
  function spawnEnemy(type, side, hunt) {
    const T = g.terrain, P = g.player;
    // safety net: only one Big Henchman on the map at any time
    if ((type === 'henchman' || type === 'brute') && g.enemies.some(e => e.type === type && !e.dead)) type = 'merc';
    side = side || (Math.random() < 0.5 ? -1 : 1);
    let x = P.x + side * (g.viewW / 2 + rand(120, 500));
    if (x < 200 || x > T.width - 200) x = P.x - side * (g.viewW / 2 + rand(120, 500));
    x = clamp(x, 120, T.width - 120);
    for (const sx of T.shops) if (Math.abs(x - sx) < 260) x += (x < sx ? -1 : 1) * 300;
    x = clamp(x, 120, T.width - 120);
    const e = new Z.Enemy(type, x, T.heightAt(x) - 4, g.threat);
    e.hunt = hunt != null ? hunt : (type !== 'dimwit' && Math.random() < 0.08 + g.threat * 0.035);
    g.enemies.push(e);
    return e;
  }
  function spawnLoot(x, initial) {
    const T = g.terrain;
    if (Math.random() < 0.12) { // medical supplies lying around
      for (const s of T.shops) if (Math.abs(s - x) < 120) x += 200;
      const mr = Math.random(), id = mr < 0.6 ? 'gauze' : mr < 0.8 ? 'bandage' : mr < 0.88 ? 'energy-bar' : mr < 0.95 ? 'splint' : 'first-aid';
      g.pickups.push({ type: 'med', id, x, y: T.heightAt(x) - 6, vx: 0, vy: 0, t: 1, ground: true, life: initial ? 1e9 : 120, loot: true });
      return;
    }
    const r = Math.random();
    const v = r < 0.88 ? Math.round(rand(2, 15)) : r < 0.993 ? Math.round(rand(15, 45)) : r < 0.9993 ? Math.round(rand(90, 180)) : Math.round(rand(300, 800));
    for (const s of T.shops) if (Math.abs(s - x) < 120) x += 200;
    g.pickups.push({ type: 'cash', kind: v >= 400 ? 'case' : v >= 120 ? 'gold' : v >= 40 ? 'wallet' : 'bill', value: Math.round(v * (initial ? 1 : 1 + g.threat * 0.05)), x, y: T.heightAt(x) - 6, vx: 0, vy: 0, t: 1, ground: true, life: initial ? 1e9 : 90, loot: true });
  }

  function director(dt) {
    const P = g.player;
    g.deathRelief = Math.max(0, (g.deathRelief || 0) - dt * 0.01);
    g.threat += (calcThreat() - g.threat) * Math.min(1, dt);
    // queued spawns run on game time (so pausing or shopping really pauses raids)
    if (g.spawnQueue.length) {
      const aliveNow = g.enemies.filter(e => !e.dead).length, cap = Math.min(12, 4 + Math.floor(g.threat * 0.7));
      const due = g.spawnQueue.filter(q => q.t <= g.time).slice(0, Math.max(0, cap - aliveNow));
      if (due.length) { g.spawnQueue = g.spawnQueue.filter(q => !due.includes(q)); for (const q of due) if (!P.dead) spawnEnemy(q.type, q.side, true); }
      for (const q of g.spawnQueue) if (q.t <= g.time) q.t = g.time + 1; // field is full: try again in a second
    }
    const t = g.threat;
    const alive = g.enemies.filter(e => !e.dead).length;
    // fewer enemies at once: 2 at the start, never more than 9
    const maxE = Math.min(9, 2 + Math.floor(t * 0.7));
    g.spawnT -= dt;
    if (alive < maxE && g.spawnT <= 0 && !P.dead) { spawnEnemy(pickType(t)); g.spawnT = Math.max(2.4, 6 - t * 0.35) * rand(0.8, 1.25); }
    // raids: big hunting waves that test your base
    g.raidT -= dt;
    if (g.raidT < 6 && !g.raidWarn) { g.raidWarn = true; banner('⚠ RAID INCOMING ⚠', '#ff4a4a', 4, true); Z.audio.event('raid'); }
    if (g.raidT <= 0 && !P.dead) {
      const side = Math.random() < 0.5 ? -1 : 1, early = g.stats.raids < 2;
      const n = early ? 2 + Math.floor(t * 0.4) : 3 + Math.floor(t * 0.5);
      for (let i = 0; i < n; i++) g.spawnQueue.push({ t: g.time + i * 1.5, type: pickType(t + 0.3, true), side: i % 4 === 3 ? -side : side });
      g.raidT = rand(220, 290); g.raidWarn = false; g.stats.raids++;
      banner('RAID! ' + n + ' enemies, mostly from the ' + (side < 0 ? 'WEST' : 'EAST'), '#ff4a4a', 3, true);
    }
    // loot & supply drops
    g.cashT -= dt;
    if (g.cashT <= 0) {
      g.cashT = rand(2.5, 6);
      const near = g.pickups.filter(p => p.loot && Math.abs(p.x - P.x) < 3000).length;
      if (near < 22) spawnLoot(clamp(P.x + rand(-2800, 2800), 300, g.terrain.width - 300));
    }
    g.dropT -= dt;
    if (g.dropT <= 0) {
      g.dropT = rand(60, 100);
      const x = clamp(P.x + rand(-800, 800), 200, g.terrain.width - 200);
      Z.spawnCrate(x); banner('📦 Supply drop incoming!', '#ffd84d', 3);
      Z.audio.sfx('drop');
    }
    // boss music while a Boss Brute is close
    if (g.enemies.some(e => e.type === 'brute' && !e.dead && Math.abs(e.x - P.x) < 1800)) Z.audio.event('boss');
    else if (Z.audio.mood === 'boss' && !g.enemies.some(e => e.type === 'brute' && !e.dead && Math.abs(e.x - P.x) < 3000)) Z.audio.event('boss-dead');
    // cleanup
    g.enemies = g.enemies.filter(e => !(e.dead && e.deadT > 3.6) && !(Math.abs(e.x - P.x) > 3400 && !e.dead && !e.hunt));
    // music intensity from combat
    let engaged = 0;
    for (const e of g.enemies) if (!e.dead && e.alert > 0 && Math.abs(e.x - P.x) < 1500) engaged += e.def.tier >= 6 ? 3 : 1;
    if (engaged) g.combatT = 8; else g.combatT = (g.combatT || 0) - 0.016;
    const fighting = g.combatT > 0 || (g.time - (g.player.lastShotT || -99)) < 4;
    Z.audio.targetIntensity = P.dead ? 0 : clamp(0.3 + (fighting ? 0.9 : 0) + engaged * 0.3 + (g.raidT < 30 ? 0.6 : 0), 0.3, 3);
  }

  // ---- building -----------------------------------------------------------------------------
  function setBuilding(on) {
    g.building = on;
    Z.audio.sfx('click');
    if (on) banner('BUILD MODE — 1-0 (Shift for 11-20) / Q, E or wheel to pick · LMB place · RMB sell · B exit', '#ffd84d', 3);
  }
  function ghostX() { return Math.round(g.mouse.wx / 4) * 4; }
  function tryPlace() {
    const def = Z.BUILD[g.buildSel], plan = Z.placementPlan(def, ghostX()), x = plan.x;
    const ty = labelY(plan.peak !== undefined ? plan.peak : plan.top);
    if (plan.err) { Z.fx.text(x, ty, plan.err, '#ff6a6a', 16); Z.audio.sfx('deny'); return; }
    let free = false;
    if ((g.buildInv[def.id] || 0) > 0) { g.buildInv[def.id]--; if ((g.freeStock[def.id] || 0) > 0) { g.freeStock[def.id]--; free = true; } }
    else if (g.money >= def.price) { g.money -= def.price; Z.fx.text(x, ty - 20, '-$' + def.price.toLocaleString(), '#ffd84d', 16); }
    else { Z.fx.text(x, ty, 'Need $' + def.price.toLocaleString(), '#ff6a6a', 16); Z.audio.sfx('deny'); return; }
    const s = Z.buildFromPlan(def, plan, free);
    g.stats.built++;
    Z.audio.sfx('build');
    Z.fx.smoke(x, plan.base, 6, 10, '170,150,130', -20);
    if (plan.mode === 'merge') Z.fx.text(x, labelY(s.top) + 6, def.name + ' ×' + s.levels, '#ffd84d', 16);
  }
  function trySell() {
    const wx = g.mouse.wx, wy = g.mouse.wy;
    // the structure under the cursor; if two touch (a turret on a wall), the one whose box really holds the cursor wins
    let s = null, best = 1e9;
    for (const o of g.structures) {
      if (!(wx > o.x - o.w / 2 - 6 && wx < o.x + o.w / 2 + 6 && wy > o.top - 20 && wy < o.base + 10)) continue;
      const d = wy < o.top ? o.top - wy : wy > o.base ? wy - o.base : 0;
      if (d < best) { best = d; s = o; }
    }
    if (!s) return;
    // a stack sells one block at a time, from the top
    const frac = s.hp / s.maxHp, top = s.top;
    let wasFree;
    if (s.levels > 1) wasFree = Z.removeLevel(s);
    else { wasFree = s.free; Z.destroyStructure(s, true); }
    const refund = wasFree ? 0 : Math.round(s.def.price * 0.5 * frac);
    g.money += refund;
    Z.fx.text(s.x, labelY(top), 'Sold +$' + refund.toLocaleString(), '#5dff8a', 16);
    Z.audio.sfx('coin');
  }

  // world y for a label above something, kept below the top HUD panels so it can always be read
  function labelY(worldTop) {
    // below the money panel, the minimap and its caption, and any banner on screen
    const camTop = g.cam.y - g.cam.vh / 2, hudPad = (175 + 70 * g.banners.length) * hudU / Math.max(0.01, g.scale);
    return Math.max(worldTop - 20, camTop + hudPad);
  }

  // ---- shop signs ---------------------------------------------------------------------------
  function nearestSign() {
    let best = null, bd = 1e9;
    for (const sx of g.terrain.shops) { const d = Math.abs(sx - g.player.x); if (d < bd) { bd = d; best = sx; } }
    return best;
  }
  function signUnderMouse() {
    const { wx, wy } = g.mouse;
    for (const sx of g.terrain.shops) {
      const gy = g.terrain.heightAt(sx);
      if (wx > sx - 85 && wx < sx + 85 && wy > gy - 215 && wy < gy + 5) return sx;
    }
    return null;
  }
  Z.nearestSign = nearestSign;

  // ---- banners / toasts / achievements ------------------------------------------------------
  function banner(s, color, d, big) { g.banners.push({ s, color: color || '#fff', life: d || 2.5, max: d || 2.5, big }); if (g.banners.length > 3) g.banners.shift(); }
  Z.banner = banner;

  const ACH = [
    { id: 'first', name: 'First Blood', desc: 'Defeat your first enemy', test: s => s.kills >= 1 },
    { id: 'k50', name: 'Exterminator', desc: 'Defeat 50 enemies', test: s => s.kills >= 50 },
    { id: 'k250', name: 'One-Person Army', desc: 'Defeat 250 enemies', test: s => s.kills >= 250 },
    { id: 'hs25', name: 'Headhunter', desc: 'Land 25 headshot kills', test: s => s.headshots >= 25 },
    { id: 'rich', name: 'Getting Rich', desc: 'Earn $50,000 total', test: s => s.earned >= 50000 },
    { id: 'mill', name: 'Millionaire', desc: 'Earn $1,000,000 total', test: s => s.earned >= 1e6 },
    { id: 'hench', name: 'Muscle Buster', desc: 'Defeat a Big Henchman', test: s => (s.killsByType.henchman || 0) >= 1 },
    { id: 'boss', name: 'Boss Slayer', desc: 'Defeat a Boss Brute', test: s => (s.killsByType.brute || 0) >= 1 },
    { id: 'build', name: 'Architect', desc: 'Build 10 structures', test: s => s.built >= 10 },
    { id: 'raid', name: 'Raid Survivor', desc: 'Survive a raid', test: s => s.raids >= 1 && g.raidT > 60 },
    { id: 'combo', name: 'Combo King', desc: 'Reach a 10x combo', test: s => s.bestCombo >= 10 },
    { id: 'jedi', name: 'Bullet Bouncer', desc: 'Deflect 25 bullets with a laser sword', test: s => s.deflects >= 25 },
    { id: 'arsenal', name: 'Collector', desc: 'Own 25 weapons', test: () => g.player.owned.size >= 25 },
    { id: 'crypto', name: 'Crypto King', desc: 'Build a Crypto Mining Rig', test: () => g.structures.some(s => s.id === 'crypto-rig') },
    { id: 'saber', name: 'A Long Time Ago...', desc: 'Own a laser sword', test: () => [...g.player.owned].some(id => /laser-sword|saber|energy-katana/.test(id)) },
    { id: 'tenmil', name: 'Decamillionaire', desc: 'Earn $10,000,000 total', test: s => s.earned >= 1e7 }
  ];
  Z.ACHIEVEMENTS = ACH;
  let achT = 0;
  function checkAchievements(dt) {
    achT -= dt; if (achT > 0) return; achT = 1;
    for (const a of ACH) if (!g.achievements[a.id] && a.test(g.stats)) {
      g.achievements[a.id] = Date.now();
      Z.ui.toast('🏆 ' + a.name, a.desc);
      Z.audio.sfx('achievement');
    }
  }

  // ---- update --------------------------------------------------------------------------------
  function updateMouseWorld() {
    const s = g.scale;
    g.mouse.wx = g.cam.x - g.viewW / 2 + g.mouse.sx / s;
    g.mouse.wy = g.cam.y - g.cam.vh / 2 + g.mouse.sy / s;
  }

  function update(dt) {
    g.time += dt; g.stats.time += dt;
    const P = g.player;
    readInput();
    P.update(dt, input);
    input.jumpPressed = false; input.firePressed = false;
    if (P.x > g.maxX) g.maxX = P.x;
    for (const e of g.enemies) e.update(dt);
    separateEnemies();
    Z.updateBullets(dt);
    Z.updateStructures(dt);
    g.quietSettle = false;
    Z.updatePickups(dt);
    updateParticles(dt);
    director(dt);
    g.comboT -= dt; if (g.comboT <= 0) g.combo = 0;
    if (g.combo > g.stats.bestCombo) g.stats.bestCombo = g.combo;
    g.hitMarker -= dt; g.hurtFlash = Math.max(0, g.hurtFlash - dt * 1.6);
    g.kick *= Math.pow(0.0005, dt);
    for (const d of g.dmgDirs) d.life -= dt; g.dmgDirs = g.dmgDirs.filter(d => d.life > 0);
    for (const f of g.feed) f.life -= dt; g.feed = g.feed.filter(f => f.life > 0).slice(0, 6);
    checkAchievements(dt);
    Z.audio.setAmbience(g.terrain.biomeAt(P.x)); Z.audio.ambienceTick(dt);
    // low-health heartbeat
    if (!P.dead && P.hp < P.maxHp * 0.3) { g.beatT = (g.beatT || 0) - dt; if (g.beatT <= 0) { g.beatT = 0.55 + P.hp / P.maxHp * 1.5; Z.audio.sfx('heartbeat'); } }
    // biome announcement
    const b = g.terrain.biomeAt(P.x);
    if (b !== g.biomeShown) { if (g.biomeShown !== -1) banner(Z.BIOMES[b].name, '#fff', 2.5); g.biomeShown = b; }
    // death sequence
    if (P.dead) { g.deathT -= dt; if (g.deathT <= 0 && g.state === 'play') { g.stats.deaths++; Z.ui.showDeath(); } }
    // autosave
    g.saveT = (g.saveT || 0) - dt; if (g.saveT <= 0) { g.saveT = 30; if (!P.dead) save(); }
  }

  // keep enemies from stacking into one blob
  function separateEnemies() {
    const list = g.enemies.filter(e => !e.dead);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const min = 19 * (a.s + b.s) * (a.def.build === 'huge' || b.def.build === 'huge' ? 1.4 : 1);
      const dx = b.x - a.x;
      if (Math.abs(dx) < min && Math.abs(a.y - b.y) < 40) {
        const push = (min - Math.abs(dx)) * 0.25 * (dx >= 0 ? 1 : -1);
        if (!Z.supportBlocked(a, -push)) a.x -= push;
        if (!Z.supportBlocked(b, push)) b.x += push;
      }
    }
  }

  function updateParticles(dt) {
    const T = g.terrain;
    const keep = [];
    for (const p of g.particles) {
      p.life -= dt; if (p.life <= 0) continue;
      p.vy += (p.g || 0) * dt;
      const dr = Math.max(0, 1 - (p.drag || 0) * dt);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.grow) p.size = Math.max(0.5, p.size + p.grow * dt);
      if (p.vr) p.rot += p.vr * dt;
      if ((p.t === 'drop' || p.t === 'chunk' || p.t === 'shell') && p.y > T.heightAt(p.x)) {
        if (p.stick && g.decals.length < 500) { g.decals.push({ x: p.x, y: T.heightAt(p.x), r: p.size * 1.6, c: p.color, life: 25 }); continue; }
        if (p.bounce && Math.abs(p.vy) > 120) { p.y = T.heightAt(p.x); p.vy *= -0.4; p.vx *= 0.6; p.vr *= 0.5; }
        else { p.y = T.heightAt(p.x); p.vy = 0; p.vx *= 0.8; }
      }
      keep.push(p);
    }
    g.particles = keep;
    for (const d of g.decals) d.life -= dt;
    if (g.decals.length && g.decals[0].life <= 0) g.decals = g.decals.filter(d => d.life > 0);
    for (const arr of ['texts', 'beams', 'flashes', 'lights', 'rings']) {
      const a = g[arr];
      for (const o of a) { o.life -= dt; if (o.vy) { o.y += o.vy * dt; o.vy *= 0.96; } }
      g[arr] = a.filter(o => o.life > 0);
    }
    for (const b of g.banners) b.life -= dt;
    g.banners = g.banners.filter(b => b.life > 0);
  }

  // ---- camera ----------------------------------------------------------------------------------
  function camTarget() {
    const P = g.player, w = P.weapon;
    const sniper = P.aiming && w && (w.cat === 'Snipers' || w.kind === 'rail');
    const vh = VIEW_H * (sniper ? 1.4 : P.aiming ? 1.08 : 1) * (g.building ? 1.15 : 1);
    // build mode locks the look-ahead so the placement ghost doesn't drift under a still mouse
    const look = g.building ? 0 : P.aiming ? 0.45 : 0.22;
    const vy = g.mouse.wy - (P.y - 95);
    const high = Math.min(320, Math.max(0, g.terrain.heightAt(P.x) - P.y)) * 0.55;
    return { x: P.x + (g.mouse.wx - P.x) * look, y: P.y - 95 + high + vy * look * (vy > 0 ? 1.3 : 0.6), vh };
  }
  function snapCamera() { const t = camTarget(); g.cam.x = t.x; g.cam.y = t.y; g.cam.vh = t.vh; }
  function updateCamera(dt) {
    const t = camTarget();
    const k = 1 - Math.pow(0.0008, dt);
    g.cam.vh += (t.vh - g.cam.vh) * (1 - Math.pow(0.02, dt));
    g.scale = canvas.height / g.cam.vh;
    g.viewW = canvas.width / g.scale;
    g.cam.x += (t.x - g.cam.x) * k; g.cam.y += (t.y - g.cam.y) * k;
    g.cam.x = clamp(g.cam.x, g.viewW / 2, g.terrain.width - g.viewW / 2);
    g.cam.y = Math.min(g.cam.y, g.terrain.bottom - g.cam.vh / 2);
    g.shakeAmt *= Math.pow(0.002, dt);
    const kd = Math.pow(0.0004, dt); g.camKick.x *= kd; g.camKick.y *= kd;
  }

  // ---- weather (screen space) --------------------------------------------------------------------
  const weather = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, s: Math.random() }));
  let lastCamX = 0, lastCamY = 0;
  function drawWeather(W, H, dt, biome) {
    const dx = (g.cam.x - lastCamX) * g.scale / W, dy = (g.cam.y - lastCamY) * g.scale / H;
    lastCamX = g.cam.x; lastCamY = g.cam.y;
    if (g.quality === 0) return;
    const u = H / 1080;
    ctx.save();
    buckets.clear();
    for (const p of weather) {
      p.x -= dx * p.z; p.y -= dy * p.z;
      if (biome === 2) { p.y += dt * 0.08 * p.z; p.x += dt * 0.02 * Math.sin(g.realTime + p.s * 10); }
      else if (biome === 1) { p.x -= dt * 0.25 * p.z; p.y += dt * 0.01; }
      else if (biome === 3) { p.y -= dt * 0.04 * p.z; p.x += dt * 0.03; }
      else { p.x += dt * 0.01 * Math.sin(g.realTime * 0.7 + p.s * 20); p.y += dt * 0.008 * Math.cos(g.realTime + p.s * 9); }
      p.x = ((p.x % 1) + 1) % 1; p.y = ((p.y % 1) + 1) % 1;
      const x = p.x * W, y = p.y * H;
      // batched by alpha level: one path per bucket instead of one draw per flake
      if (biome === 2) { const q = Math.round(p.z * 3); bucket('w' + q, '#ffffff', 0, 0.4 + q / 3 * 0.5).push(x, y, (1 + p.z * 2.4) * u); }
      else if (biome === 1) { const q = Math.max(1, Math.round(p.z * 3)); bucket('d' + q, 'rgb(240,200,140)', 1.2 * u, 0.25 * q / 3).push(x, y, x + 30 * p.z * u, y); }
      else if (biome === 3) { const q = Math.max(1, Math.round((0.35 + 0.4 * Math.sin(g.realTime * 3 + p.s * 30)) * p.z * 4)); bucket('e' + q, 'rgb(255,160,40)', 0, q / 4).push(x, y, 1.3 * u); }
      else if (p.s < 0.35) { const q = Math.round(Math.max(0, Math.sin(g.realTime * 2 + p.s * 40)) * 3); if (q) bucket('f' + q, 'rgb(220,255,140)', 0, q / 3 * 0.6).push(x, y, 1.8 * u * p.z); }
    }
    if (biome === 1) flushStrokes(); else flushFills();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---- render ------------------------------------------------------------------------------------
  let fps = 60, fpsAcc = 0, fpsN = 0;
  let profT = 0;
  const mark = (label) => { if (!g.profile) return; const t = performance.now(); if (label) g.prof[label] = (g.prof[label] || 0) + t - profT; profT = t; };
  Z.mark = mark;
  function render(dt) {
    if (g.profile && !g.prof) g.prof = {};
    mark();
    const W = canvas.width, H = canvas.height;
    const T = g.terrain, P = g.player, t = g.time, rt = g.realTime;
    const s = g.scale;
    const camL = g.cam.x - g.viewW / 2, camT = g.cam.y - g.cam.vh / 2;
    const camR = camL + g.viewW, camB = camT + g.cam.vh;
    const biome = T.biomeAt(g.cam.x);
    g.labelRects = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    Z.Sky.draw(ctx, { x: g.cam.x, y: g.cam.y }, s, W, H, rt, T.blendAt(g.cam.x), g.quality);
    mark('sky');

    const sh = g.shakeAmt;
    const sx = (Math.random() - 0.5) * sh * s + g.camKick.x * s, sy = (Math.random() - 0.5) * sh * s + g.camKick.y * s;
    ctx.setTransform(s, 0, 0, s, -camL * s + sx, -camT * s + sy);

    T.drawDecor(ctx, camL, camR, true, rt);
    T.draw(ctx, camL, camR, camB, rt, g.quality, s);
    // decals (blood / scorch)
    drawDecals(ctx, camL, camR);
    mark('terrain');
    drawSigns(ctx, camL, camR, rt);
    Z.drawStructures(ctx, camL, camR, rt);
    T.drawDecor(ctx, camL, camR, false, rt);
    for (const p of g.pickups) if (p.x > camL - 50 && p.x < camR + 50) Z.drawPickup(ctx, p, rt);
    for (const e of g.enemies) if (e.dead && e.x > camL - 100 && e.x < camR + 100) e.draw(ctx, t);
    for (const e of g.enemies) if (!e.dead && e.x > camL - 100 && e.x < camR + 100) e.draw(ctx, t);
    for (const e of g.enemies) if (!e.dead && e.x > camL - 100 && e.x < camR + 100) e.drawOverlay(ctx);
    mark('world');
    if (g.state !== 'title') {
      P.draw(ctx, t);
      drawAimAssist(ctx);
    }
    mark('player');
    drawProjectiles(ctx, camL, camR);
    mark('projectiles');
    drawParticles(ctx, camL, camR, camT, camB);
    mark('particles');
    drawLights(ctx, camL, camR);
    mark('lights');
    // floating texts
    for (const tx of g.texts) {
      const a = Math.min(1, tx.life / tx.max * 2.2);
      ctx.globalAlpha = a;
      ctx.font = '800 ' + tx.size + 'px "Russo One", "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(tx.str, tx.x, tx.y);
      ctx.fillStyle = tx.color; ctx.fillText(tx.str, tx.x, tx.y);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
    if (g.building && g.state === 'play') drawGhost(ctx, rt);

    // ---- screen space post + HUD
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    mark('texts');
    drawWeather(W, H, dt, biome);
    postFX(W, H);
    mark('post');
    if ((g.state === 'play' || g.state === 'pause' || g.state === 'shop') && !g.noHud) {
      hudT -= dt;
      if (hudT <= 0 || g.state !== 'play') {
        hudT = 0.04; hudShown = true;
        const HW = hudCanvas.width, HH = hudCanvas.height;
        const main = ctx; ctx = hudCtx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, HW, HH);
        ctx.drawImage(vignetteFor(HW, HH), 0, 0);
        try { drawHUD(HW, HH, dt, true); } finally { ctx = main; }
      }
      drawCrosshairLive();
    } else if (hudShown) { hudCtx.setTransform(1, 0, 0, 1, 0, 0); hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height); hudShown = false; }
    mark('hud');
    fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  }

  const signCache = {};
  function signSprite(hover) {
    const res = Math.min(3, Math.pow(2, Math.round(Math.log2(g.scale || 1) * 2) / 2));
    const key = (hover ? 'h' : 'n') + res;
    if (signCache[key]) return signCache[key];
    const c = document.createElement('canvas'); c.width = Math.ceil(240 * res); c.height = Math.ceil(240 * res);
    const x = c.getContext('2d'); x.setTransform(res, 0, 0, res, 120 * res, 240 * res);
    const bw = 170, bh = 74;
    x.fillStyle = hover ? '#2a1d3a' : '#1c1428';
    x.beginPath(); if (x.roundRect) x.roundRect(-bw / 2, -205, bw, bh, 10); else x.rect(-bw / 2, -205, bw, bh); x.fill();
    x.lineWidth = 4; x.strokeStyle = hover ? '#fff2a8' : '#ffb020'; x.shadowColor = '#ffb020'; x.shadowBlur = 14 * res; x.stroke();
    x.font = '400 40px "Russo One", sans-serif'; x.textAlign = 'center';
    x.fillStyle = '#ffe28a'; x.fillText('SHOP', 8, -154);
    x.fillStyle = '#5dff8a'; x.shadowColor = '#5dff8a'; x.fillText('$', -62, -154);
    x.shadowBlur = 0;
    x.save(); x.translate(-30, -110); x.scale(0.9, 0.9); Z.drawWeapon(x, Z.WEAPON_BY_ID['ak-47'], 0); x.restore();
    x.fillStyle = '#4a3a2a'; x.fillRect(-90, -40, 180, 40); x.fillStyle = '#5a4a3a'; x.fillRect(-90, -44, 180, 6);
    // fonts may still be loading on the first frames; don't cache a fallback-font sign forever
    if (!document.fonts || document.fonts.check('40px "Russo One"')) signCache[key] = { c };
    return { c };
  }
  function drawSigns(ctx, x0, x1, t) {
    const P = g.player;
    for (const sx of g.terrain.shops) {
      if (sx < x0 - 200 || sx > x1 + 200) continue;
      const gy = g.terrain.heightAt(sx);
      const near = g.state !== 'title' && Math.abs(sx - P.x) < 420;
      const hover = g.state === 'play' && signUnderMouse() === sx;
      ctx.save(); ctx.translate(sx, gy);
      // plaza floor
      ctx.fillStyle = 'rgba(40,30,25,0.6)'; ctx.fillRect(-150, -2, 300, 8);
      ctx.fillStyle = '#6a6056'; for (let i = -150; i < 150; i += 30) ctx.fillRect(i + 1, -3, 28, 4);
      // posts
      ctx.fillStyle = '#3a2a1c'; ctx.fillRect(-62, -150, 10, 150); ctx.fillRect(52, -150, 10, 150);
      // glow
      const pulse = 0.6 + 0.4 * Math.sin(t * 4);
      ctx.globalCompositeOperation = 'lighter';
      const gr = near ? 220 : 150;
      ctx.globalAlpha = near ? 0.55 * pulse + 0.4 : 0.5;
      ctx.drawImage(Z.glowSprite('255,190,60', 0.5), -gr, -165 - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const spr = signSprite(hover);
      ctx.drawImage(spr.c, -120, -240, 240, 240);
      ctx.textAlign = 'center';
      if (near) {
        ctx.font = '700 16px "Space Grotesk", sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-120, -250, 240, 28);
        ctx.fillStyle = '#fff'; ctx.fillText('CLICK THE SIGN  or press  E', 0, -230);
      }
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  function drawAimAssist(ctx) {
    const P = g.player, w = P.weapon;
    if (!w || P.dead || g.building || w.kind === 'melee') return;
    if (!(w.tactical || (P.aiming && (w.cat === 'Snipers' || w.kind === 'rail')))) return;
    const hand = Z.handPos(P.x, P.y, 1, P.facing, P.aim, 'normal');
    const mz = Z.muzzlePos(hand, w, 0.62);
    const len = g.terrain.raycast(mz.x, mz.y, Math.cos(P.aim), Math.sin(P.aim), 2400);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,40,50,0.45)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(mz.x, mz.y); ctx.lineTo(mz.x + Math.cos(P.aim) * len, mz.y + Math.sin(P.aim) * len); ctx.stroke();
    ctx.fillStyle = 'rgba(255,60,60,0.9)'; ctx.beginPath(); ctx.arc(mz.x + Math.cos(P.aim) * len, mz.y + Math.sin(P.aim) * len, 3, 0, 7); ctx.fill();
    ctx.restore();
  }

  // Batched effects renderer: bullets, particles and decals are grouped by colour/alpha bucket and
  // drawn as a few big paths, instead of one stroke + blend-mode switch per object (which the GPU
  // canvas pays for per call). Big firefights went from hundreds of draw calls to a few dozen.
  const buckets = new Map();
  function bucket(key, style, width, alpha) {
    let b = buckets.get(key);
    if (!b) { b = { style, width, alpha, segs: [] }; buckets.set(key, b); }
    return b.segs;
  }
  const AQ = a => Math.max(1, Math.min(4, Math.round(a * 4))); // alpha quantised to 4 levels
  function flushStrokes() {
    for (const b of buckets.values()) {
      if (!b.segs.length) continue;
      const s = b.segs;
      ctx.beginPath();
      for (let i = 0; i < s.length; i += 4) { ctx.moveTo(s[i], s[i + 1]); ctx.lineTo(s[i + 2], s[i + 3]); }
      ctx.globalAlpha = b.alpha; ctx.strokeStyle = b.style; ctx.lineWidth = b.width; ctx.stroke();
      s.length = 0;
    }
  }
  function flushFills(kind) {
    // circles: segs hold x, y, r triples
    for (const b of buckets.values()) {
      if (!b.segs.length) continue;
      const s = b.segs;
      ctx.beginPath();
      if (kind === 'ellipse') for (let i = 0; i < s.length; i += 3) { ctx.moveTo(s[i] + s[i + 2], s[i + 1]); ctx.ellipse(s[i], s[i + 1], s[i + 2], s[i + 2] * 0.4, 0, 0, 6.2832); }
      else for (let i = 0; i < s.length; i += 3) { ctx.moveTo(s[i] + s[i + 2], s[i + 1]); ctx.arc(s[i], s[i + 1], s[i + 2], 0, 6.2832); }
      ctx.globalAlpha = b.alpha; ctx.fillStyle = b.style; ctx.fill();
      s.length = 0;
    }
  }

  function drawDecals(ctx2, x0, x1) {
    buckets.clear();
    for (const d of g.decals) {
      if (d.x < x0 - 10 || d.x > x1 + 10) continue;
      const q = AQ(Math.min(0.85, d.life / 6) / 0.85);
      bucket('d' + d.c + q, d.c, 0, q / 4 * 0.85).push(d.x, d.y + 1, d.r);
    }
    flushFills('ellipse');
    ctx.globalAlpha = 1;
  }

  function drawProjectiles(ctx2, x0, x1) {
    ctx.save();
    ctx.lineCap = 'round';
    buckets.clear();
    // tracers: additive, batched by colour
    for (const b of g.bullets) {
      if (b.kind !== 'b' || b.x < x0 - 60 || b.x > x1 + 60) continue;
      const tl = b.owner === 'e' ? 0.03 : 0.022;
      const col = b.owner === 'e' ? 'rgba(255,120,90,0.95)' : (b.w && b.w.gold ? '#ffe28a' : b.color === '#ffd27a' ? 'rgba(255,220,140,0.95)' : b.color);
      bucket('t' + col + (b.owner === 'e' ? 'e' : 'p'), col, b.owner === 'e' ? 2.8 : 2.4, 1).push(b.x - b.vx * tl, b.y - b.vy * tl, b.x, b.y);
    }
    ctx.globalCompositeOperation = 'lighter';
    flushStrokes();
    // plasma orbs (one glow sprite each, all additive)
    for (const b of g.bullets) {
      if (b.kind !== 'plasma' || b.x < x0 - 60 || b.x > x1 + 60) continue;
      const r = (5 + Math.min(18, (b.radius || 30) / 8)) * 2.4;
      ctx.drawImage(Z.glowSprite(Z.hexToRgb(b.color), 0.9, 'rgba(255,255,255,1)'), b.x - r, b.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const b of g.bullets) {
      if (b.x < x0 - 60 || b.x > x1 + 60) continue;
      if (b.kind === 'rocket') {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
        ctx.fillStyle = '#5a6248'; ctx.fillRect(-14, -3.5, 22, 7);
        ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.moveTo(8, -3.5); ctx.lineTo(16, 0); ctx.lineTo(8, 3.5); ctx.fill();
        ctx.fillStyle = '#333'; ctx.fillRect(-16, -6, 5, 12);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,190,80,0.9)'; ctx.beginPath(); ctx.moveTo(-15, -3); ctx.lineTo(-28 - Math.random() * 10, 0); ctx.lineTo(-15, 3); ctx.fill();
        ctx.restore();
      } else if (b.kind === 'grenade' || b.kind === 'rock') {
        bucket(b.kind === 'rock' ? 'rock' : 'nade', b.kind === 'rock' ? '#7d7a72' : '#3f4a33', 0, 1).push(b.x, b.y, 5);
      }
    }
    flushFills();
    for (const b of g.bullets) if (b.kind === 'grenade' && b.x > x0 - 60 && b.x < x1 + 60) bucket(Math.floor(b.life * 10) % 2 ? 'nl1' : 'nl0', Math.floor(b.life * 10) % 2 ? '#ff3030' : '#300', 0, 1).push(b.x, b.y - 2, 1.6);
    flushFills();
    // beams
    ctx.globalCompositeOperation = 'lighter';
    for (const bm of g.beams) {
      const a = bm.life / bm.max;
      ctx.beginPath();
      if (bm.pts) { ctx.moveTo(bm.pts[0][0], bm.pts[0][1]); for (const p of bm.pts) ctx.lineTo(p[0], p[1]); }
      else { ctx.moveTo(bm.x1, bm.y1); ctx.lineTo(bm.x2, bm.y2); }
      // fake bloom: a wide faint stroke under the core instead of an expensive shadow blur
      ctx.strokeStyle = bm.color; ctx.globalAlpha = a * 0.25; ctx.lineWidth = bm.width * 4.5; ctx.stroke();
      ctx.globalAlpha = a; ctx.lineWidth = bm.width * (0.6 + a); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = bm.width * 0.35; ctx.stroke();
    }
    // muzzle flashes (all additive, no per-flash blend switching)
    for (const f of g.flashes) {
      const a = f.life / f.max, L = 26 * f.size * (0.7 + Math.random() * 0.6);
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.globalAlpha = a;
      ctx.drawImage(Z.flashSprite(f.color), -4, -7 * f.size, L + 4, 14 * f.size);
      ctx.drawImage(Z.glowSprite(f.color[0] === '#' ? Z.hexToRgb(f.color) : '255,200,120', 0.9, 'rgba(255,255,255,1)'), -10 * f.size, -10 * f.size, 20 * f.size, 20 * f.size);
      ctx.restore();
    }
    ctx.restore();
  }

  let FIRE_HOT, FIRE_COOL, FROST;
  function drawParticles(ctx2, x0, x1, y0, y1) {
    if (!FIRE_HOT) { FIRE_HOT = Z.glowSprite('255,150,40', 0.85, 'rgba(255,245,200,1)'); FIRE_COOL = Z.glowSprite('200,60,10', 0.7, 'rgba(255,170,60,0.9)'); FROST = Z.glowSprite('120,220,255', 0.6, 'rgba(235,250,255,1)'); }
    buckets.clear();
    // normal-blend pass: smoke & blood batched into a few fills, debris/shells as small rects
    for (const p of g.particles) {
      if (p.add || p.x < x0 - 40 || p.x > x1 + 40 || p.y < y0 - 40 || p.y > y1 + 40) continue;
      const a = p.life / p.max;
      if (p.t === 'smoke') { const q = AQ(a); bucket('s' + p.color + q, 'rgb(' + p.color + ')', 0, q / 4 * 0.45).push(p.x, p.y, p.size); }
      else if (p.t === 'drop') { const q = AQ(Math.min(1, a * 2)); bucket('b' + p.color + q, p.color, 0, q / 4).push(p.x, p.y, p.size); }
    }
    flushFills();
    for (const p of g.particles) {
      if (p.add || (p.t !== 'chunk' && p.t !== 'shell') || p.x < x0 - 40 || p.x > x1 + 40 || p.y < y0 - 40 || p.y > y1 + 40) continue;
      ctx.globalAlpha = Math.min(1, p.life / p.max * 3); ctx.fillStyle = p.color;
      const w = p.t === 'shell' ? p.size * 2 : p.size, h = p.t === 'shell' ? p.size * 0.9 : p.size;
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
    }
    // additive pass: sparks batched by colour, fire as sprites
    ctx.globalCompositeOperation = 'lighter';
    for (const p of g.particles) {
      if (!p.add || p.x < x0 - 40 || p.x > x1 + 40 || p.y < y0 - 40 || p.y > y1 + 40) continue;
      const a = p.life / p.max;
      if (p.t === 'spark') { const q = AQ(a); bucket('k' + p.color + q + (p.size > 1.8 ? 'w' : 'n'), p.color, p.size > 1.8 ? 2.2 : 1.4, q / 4).push(p.x, p.y, p.x - p.vx * 0.025, p.y - p.vy * 0.025); }
    }
    flushStrokes();
    for (const p of g.particles) {
      if (!p.add || (p.t !== 'fire' && p.t !== 'frost') || p.x < x0 - 40 || p.x > x1 + 40 || p.y < y0 - 40 || p.y > y1 + 40) continue;
      const a = p.life / p.max, r = p.size;
      ctx.globalAlpha = Math.min(1, a * 1.3);
      ctx.drawImage(p.t === 'frost' ? FROST : a > 0.55 ? FIRE_HOT : FIRE_COOL, p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // shockwave rings
    for (const r of g.rings) {
      const a = r.life / r.max, rad = r.r * (1 - a * 0.85);
      ctx.strokeStyle = 'rgba(' + r.color + ',' + a * 0.7 + ')'; ctx.lineWidth = 6 * a + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 7); ctx.stroke();
    }
  }

  function drawLights(ctx, x0, x1) {
    if (g.quality === 0) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const L of g.lights) {
      if (L.x < x0 - L.r || L.x > x1 + L.r) continue;
      ctx.globalAlpha = L.life / L.max;
      ctx.drawImage(Z.glowSprite(L.color, 0.35), L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  function drawGhost(ctx, t) {
    const def = Z.BUILD[g.buildSel], plan = Z.placementPlan(def, ghostX()), x = plan.x, err = plan.err;
    const fake = { def, id: def.id, x, w: def.w, h: def.h, hp: 1, maxHp: 1, flash: 0, aim: -0.3, incomeT: def.every || 0, spin: 0, t, levels: 1, base: plan.base, top: plan.top };
    if (plan.mode === 'merge') {
      // preview the whole stack as the single taller block it will become
      const s = plan.target;
      Object.assign(fake, { h: s.h + def.h, top: s.top - def.h, base: s.base, levels: s.levels + 1 });
    }
    if (plan.mode === 'merge' && err) Z.drawStructure(ctx, Object.assign({}, fake, { h: def.h, top: plan.top, base: plan.base, levels: 1 }), t, true);
    else {
      Z.drawStructure(ctx, fake, t, true);
      // whatever rides on the stack, shown where it will end up
      if (plan.mode === 'merge') for (const r of plan.riders) Z.drawStructure(ctx, Object.assign(Object.create(Object.getPrototypeOf(r)), r, { top: r.top - def.h, base: r.base - def.h, flash: 0, hp: r.maxHp }), t, true);
    }
    ctx.strokeStyle = err ? 'rgba(255,70,70,0.9)' : 'rgba(90,255,140,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.strokeRect(x - def.w / 2 - 4, plan.top - 4, def.w + 8, def.h + 8); ctx.setLineDash([]);
    if (def.turret || def.heal) { ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(x, plan.top + 14, def.turret ? def.turret.range : def.radius, 0, 7); ctx.stroke(); }
    ctx.font = '700 14px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
    const have = g.buildInv[def.id] || 0;
    const where = plan.mode === 'merge' ? def.name + ' ×' + (plan.target.levels + 1) : plan.mode === 'on' ? def.name + ' on the ' + plan.target.def.name : def.name;
    const label = err || where + (have ? ' · in stock: ' + have : ' — $' + def.price.toLocaleString());
    // keep the label inside the view and clear of the HUD panels
    const lw = ctx.measureText(label).width / 2 + 10, camL = g.cam.x - g.viewW / 2, camR = g.cam.x + g.viewW / 2;
    const lx = Math.min(Math.max(x, camL + lw), camR - lw), ly = labelY((plan.peak !== undefined ? plan.peak : plan.top) + 4);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(lx - lw, ly - 15, lw * 2, 21);
    ctx.fillStyle = err ? '#ff7a7a' : '#fff';
    ctx.fillText(label, lx, ly);
    ctx.textAlign = 'left';
  }

  function postFX(W, H) {
    // vignette
    if (!postFX.v || postFX.v.width !== W || postFX.v.height !== H) {
      const c = postFX.v = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'), vg = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      x.fillStyle = vg; x.fillRect(0, 0, W, H);
    }
    if (!(g.state === 'play' || g.state === 'pause' || g.state === 'shop')) ctx.drawImage(postFX.v, 0, 0);
    if (!g.player || g.state === 'title') return;
    // hurt / low HP pulse
    const P = g.player;
    const low = P.hp / P.maxHp < 0.3 && !P.dead ? (0.25 + 0.2 * Math.sin(g.realTime * 7)) : 0;
    const a = Math.min(0.75, g.hurtFlash * 0.6 + low);
    if (a > 0.01) {
      const rg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
      rg.addColorStop(0, 'rgba(180,0,0,0)'); rg.addColorStop(1, 'rgba(200,0,0,' + a + ')');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    if (P.aiming && P.weapon && (P.weapon.cat === 'Snipers' || P.weapon.kind === 'rail')) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H * 0.06); ctx.fillRect(0, H * 0.94, W, H * 0.06);
    }
  }

  // ---- HUD ----------------------------------------------------------------------------------------
  function panel(x, y, w, h, r, a) {
    ctx.fillStyle = 'rgba(10,12,22,' + (a || 0.62) + ')';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function bar(x, y, w, h, f, c1, c2, back) {
    ctx.fillStyle = back || 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, w, h);
    const gr = ctx.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    ctx.fillStyle = gr; ctx.fillRect(x, y, w * clamp(f, 0, 1), h);
  }
  function txt(s, x, y, size, color, align, weight, font) {
    ctx.font = (weight || 700) + ' ' + size + 'px ' + (font || '"Space Grotesk", sans-serif');
    ctx.textAlign = align || 'left'; ctx.fillStyle = color || '#fff'; ctx.fillText(s, x, y);
  }
  const fmt = n => '$' + Math.floor(n).toLocaleString();
  const shortMoney = p => '$' + (p >= 1e6 ? +(p / 1e6).toFixed(p >= 1e7 ? 0 : 1) + 'M' : p >= 1000 ? +(p / 1000).toFixed(p >= 1e4 ? 0 : 1) + 'k' : p);

  let chipTop = 0;
  function drawHUD(W, H, dt) {
    const P = g.player;
    // never shrink the HUD into unreadable text on small windows; rearrange instead
    const u = Math.max(Math.min(W / 1920, H / 1080), Math.min(0.66, H / 1080, W / 1100)) * settings.hud;
    ctx.save(); ctx.scale(u, u);
    const VW = W / u, VH = H / u;
    const compact = VW - 960 < 9 * 104 + 10; // not enough room for the hotbar between the side panels
    const rowY = compact ? VH - 300 : VH - 92;
    const RUSSO = '"Russo One", sans-serif';

    // money + threat (top-left)
    panel(24, 22, 360, 118, 14);
    const ms = fmt(g.money);
    txt(ms, 44, 76, Math.min(46, Math.floor(560 / Math.max(1, ms.length))), '#5dff8a', 'left', 400, RUSSO);
    txt('THREAT LV ' + g.threat.toFixed(1), 44, 108, 17, '#ffb020', 'left', 700);
    bar(196, 96, 168, 12, g.threat / 10, '#ffd84d', '#ff4a4a');
    txt('KILLS ' + g.stats.kills + '   HEADSHOTS ' + g.stats.headshots, 44, 130, 14, 'rgba(255,255,255,0.65)');
    if (g.combo >= 2) { txt(g.combo + 'x COMBO', 400, 74, 30, '#ff4dff', 'left', 400, RUSSO); bar(400, 84, 150, 6, g.comboT / 3.5, '#ff4dff', '#a020ff'); }
    // raid timer
    if (g.raidT < 30) txt('RAID IN ' + Math.ceil(g.raidT) + 's', 44, 168, 20, Math.floor(g.realTime * 3) % 2 ? '#ff4a4a' : '#fff', 'left', 400, RUSSO);

    // health / armor (bottom-left)
    const by = VH - 238;
    panel(24, by, 440, 214, 14);
    txt('HP', 44, by + 38, 18, '#ff6a6a', 'left', 400, RUSSO);
    bar(90, by + 20, 262, 24, P.hp / P.maxHp, '#ff5a5a', '#b3122a');
    for (const h of P.heals) { const f = Math.min(P.maxHp, P.hp + h.left) / P.maxHp; ctx.fillStyle = 'rgba(93,255,138,0.35)'; ctx.fillRect(90 + 262 * P.hp / P.maxHp, by + 20, 262 * (f - P.hp / P.maxHp), 24); }
    txt(Math.ceil(P.hp) + '/' + P.maxHp, 446, by + 39, 17, '#fff', 'right', 700);
    const body = P.body && Z.ARMOR_BY_ID[P.body], head = P.head && Z.ARMOR_BY_ID[P.head];
    txt('ARMOR', 44, by + 68, 12, '#7fc8ff', 'left', 700);
    bar(110, by + 58, 150, 12, body ? P.bodyDur / body.dur : 0, '#7fc8ff', '#2f6fb2');
    bar(268, by + 58, 100, 12, head ? P.headDur / head.dur : 0, '#b6d8ff', '#4a6a9a');
    txt(body ? body.name : 'No vest', 110, by + 86, 12, 'rgba(255,255,255,0.6)');
    txt(head ? head.name : 'No helmet', 268, by + 86, 12, 'rgba(255,255,255,0.6)');
    txt('-' + Math.round(P.armorReduce() * 100) + '%', 446, by + 70, 13, '#7fc8ff', 'right');
    // status effects: little timer chips just above the panel
    const st = [];
    if (P.speedT > 0) st.push(['⚡ SPEED', P.speedT, '#4cd4ff']);
    if (P.resistT > 0) st.push(['💊 RESIST', P.resistT, '#ffd84d']);
    if (P.regenT > 0) st.push(['✚ REGEN', P.regenT, '#3aff9b']);
    if (P.dmgT > 0) st.push(['💥 DAMAGE', P.dmgT, '#ff4dc4']);
    if (P.meds.defibrillator > 0) st.push(['♥ DEFIB ×' + P.meds.defibrillator, 0, '#ff6a8a']);
    // a column up the left edge, clear of the hotbar and the build bar
    st.forEach((s2, i) => {
      const label = s2[0] + (s2[1] > 0 ? ' ' + Math.ceil(s2[1]) + 's' : '');
      ctx.font = '800 13px "Space Grotesk", sans-serif';
      const cw2 = ctx.measureText(label).width + 20, cy = by - 34 - i * 30;
      panel(24, cy, cw2, 26, 8, 0.7);
      txt(label, 34, cy + 18, 13, s2[2], 'left', 800);
    });
    chipTop = by - 4 - st.length * 30;
    // meds: two rows of seven, each with its hotkey
    const mx = 44, my = by + 98, per = 7;
    Z.MEDS.forEach((m, i) => {
      const x = mx + (i % per) * 58, y = my + Math.floor(i / per) * 48, n = P.meds[m.id] || 0;
      ctx.fillStyle = n ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(x, y, 52, 42);
      ctx.globalAlpha = n ? 1 : 0.3;
      Z.drawMedIcon(ctx, m, x + 24, y + 20, 0.5);
      ctx.globalAlpha = 1;
      txt(m.key, x + 4, y + 13, 11, '#ffd84d', 'left', 800);
      if (n) { ctx.font = '800 12px "Space Grotesk", sans-serif'; const nw = ctx.measureText('' + n).width + 6; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 51 - nw, y + 28, nw, 14); }
      if (n) txt('' + n, x + 48, y + 39, 12, '#fff', 'right', 800);
    });
    txt('H = quick heal', 44 + per * 58 - 6, my + 2 * 48 + 12, 11, 'rgba(255,255,255,0.45)', 'right');

    // weapon panel (bottom-right)
    const w = P.weapon;
    const wx = VW - 470, wy = VH - 200;
    panel(wx, wy, 446, 176, 14);
    if (w) {
      const icon = Z.weaponIcon(w, 200, 90);
      ctx.drawImage(icon, wx + 16, wy + 18, 200, 90);
      let ns = 21; ctx.font = '700 21px "Space Grotesk", sans-serif';
      const nw = ctx.measureText(w.name).width; if (nw > 202) ns = Math.max(12, Math.floor(21 * 202 / nw));
      txt(w.name, wx + 228, wy + 42, ns, w.gold ? '#ffd84d' : '#fff', 'left', 700);
      txt(w.cat === 'Melee' ? 'MELEE' : w.cat.toUpperCase() + ' · ' + Z.MODE_LABEL[P.modeOf(w)].toUpperCase() + (w.modes.length > 1 ? ' (V)' : ''), wx + 228, wy + 64, 12, '#9fd8ff', 'left', 700);
      const up = P.upg[w.id]; const lv = up ? Object.values(up).reduce((a, b) => a + b, 0) : 0;
      if (lv) txt('★'.repeat(Math.min(10, Math.ceil(lv / 3))) + '  +' + lv + ' upgrades', wx + 228, wy + 84, 12, '#ffd84d');
      if (w.kind === 'melee') {
        txt(w.deflect ? 'DEFLECTS BULLETS' : 'MELEE', wx + 228, wy + 120, w.deflect ? 20 : 34, '#fff', 'left', 400, RUSSO);
        if (w.deflect) { txt('FOCUS', wx + 16, wy + 160, 12, '#9fd8ff', 'left', 800); bar(wx + 70, wy + 151, 360, 10, P.deflectE / 100, '#9fd8ff', '#3a8fd8'); }
      }
      else {
        const m = P.magOf(w);
        txt('' + m, wx + 228, wy + 146, 52, m <= w.mag * 0.2 ? '#ff6a6a' : '#fff', 'left', 400, RUSSO);
        ctx.font = '400 52px ' + RUSSO; const mw = ctx.measureText('' + m).width;
        txt('/ ' + w.mag + '  ∞', wx + 236 + mw, wy + 146, 20, 'rgba(255,255,255,0.55)', 'left', 700);
        if (P.reloadT > 0) { bar(wx + 16, wy + 150, 414, 8, 1 - P.reloadT / w.reload, '#ffd84d', '#ff9b1f'); txt('RELOADING', wx + 16, wy + 140, 13, '#ffd84d'); }
        else if (m === 0) txt('PRESS R TO RELOAD', wx + 16, wy + 140, 13, '#ff6a6a');
        if (w.spinup) bar(wx + 16, wy + 120, 200, 6, P.spin, '#9fd8ff', '#3a8fd8');
      }
    }

    // hotbar / build bar (bottom-center)
    if (g.building) drawBuildBar(VW, VH, compact);
    else {
      const sw = 96, sh2 = 60, n = 9, hx = VW / 2 - (n * (sw + 8)) / 2;
      for (let i = 0; i < n; i++) {
        const id = P.slots[i], x = hx + i * (sw + 8), y = rowY;
        const sel = i === P.cur;
        panel(x, y, sw, sh2, 10, sel ? 0.85 : 0.5);
        if (sel) { ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 2.5; ctx.stroke(); }
        if (id && Z.WEAPON_BY_ID[id]) ctx.drawImage(Z.weaponIcon(Z.WEAPON_BY_ID[id], 84, 40), x + 6, y + 12, 84, 40);
        txt('' + (i + 1), x + 7, y + 16, 13, sel ? '#ffd84d' : 'rgba(255,255,255,0.6)', 'left', 800);
      }
      const cw = P.weapon; if (cw) txt(cw.name, VW / 2, rowY - 10, 15, 'rgba(255,255,255,0.85)', 'center', 700);
    }

    // minimap (top-right)
    drawMinimap(VW - 404, 22, 380, 120);

    // kill feed
    g.feed.forEach((f, i) => { ctx.globalAlpha = Math.min(1, f.life); txt(f.str, VW - 26, 196 + i * 22, 14, f.color, 'right', 700); });
    ctx.globalAlpha = 1;

    // banners
    g.banners.forEach((b, i) => {
      const a = Math.min(1, b.life * 2, (b.max - b.life) * 4);
      ctx.globalAlpha = a;
      const size = b.big ? 46 : 26;
      ctx.font = '400 ' + size + 'px ' + RUSSO;
      const tw = ctx.measureText(b.s).width;
      panel(VW / 2 - tw / 2 - 26, 150 + i * 70, tw + 52, size + 24, 12, 0.6);
      txt(b.s, VW / 2, 150 + i * 70 + size + 6, size, b.color, 'center', 400, RUSSO);
    });
    ctx.globalAlpha = 1;
    // tutorial tips
    for (const tp of g.tips) {
      if (g.building || g.time < tp.t || g.time > tp.t + tp.d) continue;
      const a = Math.min(1, (g.time - tp.t) * 3, (tp.t + tp.d - g.time) * 2);
      ctx.globalAlpha = a;
      ctx.font = '700 20px "Space Grotesk", sans-serif';
      const tw = ctx.measureText(tp.s).width;
      panel(VW / 2 - tw / 2 - 22, rowY - 76, tw + 44, 42, 10, 0.75);
      txt(tp.s, VW / 2, rowY - 48, 20, '#fff', 'center', 700);
    }
    ctx.globalAlpha = 1;

    // damage direction indicators
    for (const d of g.dmgDirs) {
      ctx.save(); ctx.translate(VW / 2, VH / 2); ctx.rotate(d.a);
      ctx.globalAlpha = d.life;
      ctx.fillStyle = '#ff3030';
      ctx.beginPath(); ctx.moveTo(220, -30); ctx.lineTo(250, 0); ctx.lineTo(220, 30); ctx.lineTo(228, 0); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // off-screen threat arrows at the screen edges
    const camL = g.cam.x - g.viewW / 2, camR = g.cam.x + g.viewW / 2;
    for (const e of g.enemies) {
      if (e.dead || e.alert <= 0) continue;
      const hw = e.hitbox().w / 2 + 4, left = e.x + hw < camL, right = e.x - hw > camR;
      if (!left && !right) continue;
      const dist = left ? camL - e.x : e.x - camR;
      if (dist > 1400) continue;
      // left-side arrows stop above the status chips and the health panel; right-side ones above the weapon panel
      const sy2 = clamp((e.y - 40 - (g.cam.y - g.cam.vh / 2)) / g.cam.vh * VH, 120, left ? Math.min(VH - 256, chipTop - 18) : VH - 240);
      const x = left ? 18 : VW - 18, dir = left ? -1 : 1;
      ctx.globalAlpha = 0.5 + 0.5 * (1 - dist / 1400);
      ctx.fillStyle = e.def.tier >= 6 ? '#ff9b1f' : '#ff4a4a';
      ctx.beginPath(); ctx.moveTo(x, sy2); ctx.lineTo(x - dir * 22, sy2 - 14); ctx.lineTo(x - dir * 22, sy2 + 14); ctx.fill();
      txt(Math.round(dist / 10) + 'm', x - dir * 30, sy2 + 5, 13, '#fff', left ? 'left' : 'right', 800);
    }
    ctx.globalAlpha = 1;
    if (settings.fps) txt(Math.round(fps) + ' FPS  ·  ' + canvas.width + '×' + canvas.height, VW - 26, VH - 214, 13, '#9fd8ff', 'right');
    ctx.restore();

    hudU = u;
  }

  function drawBuildBar(VW, VH, compact) {
    const n = Z.BUILD.length, per = Math.ceil(Z.BUILD.length / 2), sw = 78, sh = 66, gap = 6;
    const total = per * (sw + gap) - gap, hx = VW / 2 - total / 2, y0 = (compact || VW - 960 < total ? VH - 250 : VH) - 2 * (sh + gap) - 34;
    panel(hx - 12, y0 - 36, total + 24, 2 * (sh + gap) + 62, 12, 0.78);
    txt('BUILD MODE', hx, y0 - 12, 16, '#ffd84d', 'left', 400, '"Russo One", sans-serif');
    txt('1-0 (Shift: 11-20) / Q / E / wheel: pick  ·  LMB: place  ·  RMB: sell  ·  B: exit', hx + total, y0 - 12, 13, 'rgba(255,255,255,0.7)', 'right');
    Z.BUILD.forEach((d, i) => {
      const x = hx + (i % per) * (sw + gap), y = y0 + Math.floor(i / per) * (sh + gap), sel = i === g.buildSel;
      ctx.fillStyle = sel ? 'rgba(255,216,77,0.22)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(x, y, sw, sh);
      if (sel) { ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 2; ctx.strokeRect(x, y, sw, sh); }
      ctx.drawImage(Z.buildIcon(d, 64, 42), x + (sw - 64) / 2, y + 4, 64, 42);
      const have = g.buildInv[d.id] || 0;
      txt(have ? 'x' + have : shortMoney(d.price), x + sw / 2, y + sh - 6, 12, have ? '#5dff8a' : (g.money >= d.price ? '#fff' : '#ff7a7a'), 'center', 800);
      if (i < 10) txt('' + ((i + 1) % 10), x + 4, y + 12, 10, 'rgba(255,255,255,0.6)', 'left', 800);
    });
    const d = Z.BUILD[g.buildSel];
    txt(d.name + ' — ' + d.desc + '  (HP ' + Math.round(d.hp * (1 + 0.2 * g.perk('builder'))).toLocaleString() + ')', VW / 2, y0 + 2 * (sh + gap) + 14, 14, '#fff', 'center');
  }

  function drawMinimap(x, y, w, h) {
    panel(x, y, w, h, 12);
    const T = g.terrain, P = g.player;
    const span = 9000, x0 = clamp(P.x - span / 2, 0, T.width - span);
    const sx = v => x + 8 + (v - x0) / span * (w - 16);
    const sy = v => y + 10 + (v - 200) / 1100 * (h - 20);
    ctx.save(); ctx.beginPath(); ctx.rect(x + 4, y + 4, w - 8, h - 8); ctx.clip();
    ctx.fillStyle = 'rgba(140,110,80,0.6)';
    ctx.beginPath(); ctx.moveTo(sx(x0), y + h);
    for (let v = x0; v <= x0 + span; v += 60) ctx.lineTo(sx(v), sy(T.heightAt(v)));
    ctx.lineTo(sx(x0 + span), y + h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(93,255,138,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
    // view rect
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.strokeRect(sx(g.cam.x - g.viewW / 2), y + 6, (g.viewW / span) * (w - 16), h - 12);
    for (const s of T.shops) { if (s < x0 || s > x0 + span) continue; txt('$', sx(s), sy(T.heightAt(s)) - 4, 16, '#ffd84d', 'center', 900); }
    for (const s of g.structures) { if (s.x < x0 || s.x > x0 + span) continue; ctx.fillStyle = '#7fc8ff'; ctx.fillRect(sx(s.x) - 1.5, sy(s.top) , 3, Math.max(2, s.h / 1100 * h)); }
    for (const p of g.pickups) { if (p.x < x0 || p.x > x0 + span) continue; ctx.fillStyle = p.type === 'crate' ? '#ffd84d' : p.type === 'med' ? '#ff8a8a' : 'rgba(93,255,138,0.8)'; ctx.fillRect(sx(p.x) - 1.5, sy(p.y) - 1.5, p.type === 'crate' ? 5 : 3, p.type === 'crate' ? 5 : 3); }
    for (const e of g.enemies) { if (e.dead || e.x < x0 || e.x > x0 + span) continue; ctx.fillStyle = e.def.tier >= 6 ? '#ff9b1f' : '#ff3a3a'; ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y - 30), e.def.tier >= 6 ? 4 : 2.5, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx(P.x), sy(P.y - 30), 4, 0, 7); ctx.fill();
    ctx.restore();
    txt(Z.BIOMES[T.biomeAt(P.x)].name.toUpperCase(), x + w - 10, y + h + 18, 12, 'rgba(255,255,255,0.6)', 'right', 700);
  }

  let hudU = 1;
  function drawCrosshairLive() { if (g.state === 'play') drawCrosshair(hudU * canvas.width / hudCanvas.width); }
  function drawCrosshair(u) {
    const mx = g.mouse.sx, my = g.mouse.sy, P = g.player, w = P.weapon;
    if (g.building || !w) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(mx, my, 6 * u, 0, 7); ctx.stroke(); return;
    }
    const spread = w.kind === 'melee' ? 0 : (w.spread || 0) * (1 + P.bloom * 2.5) * (P.aiming ? 0.5 : 1);
    const gap = (8 + spread * 400 + g.kick) * u;
    const L = 10 * u;
    ctx.save();
    ctx.lineWidth = 2.2 * u; ctx.lineCap = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? (P.aiming ? '#ffd84d' : '#fff') : 'rgba(0,0,0,0.6)';
      ctx.lineWidth = (pass ? 2 : 4.5) * u;
      ctx.beginPath();
      if (w.kind === 'melee') { ctx.arc(mx, my, 10 * u, 0, 7); }
      else if (w.pellets && w.pellets > 2) { ctx.arc(mx, my, gap + 4 * u, 0, 7); }
      else {
        ctx.moveTo(mx - gap - L, my); ctx.lineTo(mx - gap, my); ctx.moveTo(mx + gap, my); ctx.lineTo(mx + gap + L, my);
        ctx.moveTo(mx, my - gap - L); ctx.lineTo(mx, my - gap); ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + gap + L);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.fillRect(mx - 1.2 * u, my - 1.2 * u, 2.4 * u, 2.4 * u);
    if (g.hitMarker > 0) {
      ctx.strokeStyle = g.hitHead ? '#ffd84d' : '#fff'; ctx.lineWidth = 2.5 * u;
      const a = 7 * u, b = 15 * u;
      ctx.beginPath();
      ctx.moveTo(mx - a, my - a); ctx.lineTo(mx - b, my - b); ctx.moveTo(mx + a, my - a); ctx.lineTo(mx + b, my - b);
      ctx.moveTo(mx - a, my + a); ctx.lineTo(mx - b, my + b); ctx.moveTo(mx + a, my + a); ctx.lineTo(mx + b, my + b);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- title-screen ambience ------------------------------------------------------------------------
  function titleUpdate(dt) {
    g.time += dt;
    g.titleX = (g.titleX || 1500) + dt * 70;
    if (g.titleX > g.terrain.width - 1500) g.titleX = 1500;
    g.cam.vh = VIEW_H; g.scale = canvas.height / VIEW_H; g.viewW = canvas.width / g.scale;
    g.cam.x = clamp(g.titleX, g.viewW / 2, g.terrain.width - g.viewW / 2);
    g.cam.y = g.terrain.heightAt(g.cam.x) - 250;
    updateParticles(dt);
  }

  // ---- main loop --------------------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const rawDt = (now - last) / 1000;
    let dt = Math.min(0.05, rawDt);
    last = now;
    dynTick(rawDt, now);
    g.realTime += dt;
    requestAnimationFrame(frame);
    try {
      if (g.state === 'title') titleUpdate(dt);
      else if (g.state === 'play') {
        // brief slow-motion on big moments (boss kills)
        const sdt = g.slowT > 0 ? dt * 0.35 : dt;
        g.slowT -= dt;
        updateMouseWorld();
        mark();
        update(sdt);
        mark('update');
        updateCamera(dt);
      } else { updateCamera(0); }
      render(g.state === 'play' || g.state === 'title' ? dt : 0);
    } catch (err) {
      // never let one bad frame freeze the game; report once per message
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (!frame.seen) frame.seen = {};
      const key = String(err.message).replace(/[0-9.]+/g, '#');
      if (!frame.seen[key]) { frame.seen[key] = 1; console.error('Zoom2D frame error: ' + err.message + ' @ ' + String(err.stack).split(/\n/).slice(1, 3).join(' / ')); }
    }
  }

  // ---- boot ------------------------------------------------------------------------------------------------
  Z.boot = function () {
    applySettings();
    makeWorld(20261012);
    g.stats = freshStats();
    Z.ui.init();
    requestAnimationFrame(frame);
  };
  Z.RESPAWN_CAP = 50000; // dying costs 10% of your cash, at most this much
  Z.respawn = function () {
    const P = g.player;
    // dying costs 10% of your cash (capped), and the world eases off for a while
    const lost = Math.min(Math.round(g.money * 0.1), Z.RESPAWN_CAP);
    g.money -= lost;
    g.deathRelief = Math.min(4, (g.deathRelief || 0) + 1.5);
    g.threat = calcThreat();
    // respawn at the nearest shop sign behind you (safe zone)
    let best = 260, bd = 1e9;
    for (const s of g.terrain.shops) { const d = Math.abs(s - P.x); if (d < bd) { bd = d; best = s; } }
    const np = new Z.Player(best, g.terrain.heightAt(best));
    // you keep everything, including the weapon in your hands and your armor exactly as worn as it was
    Object.assign(np, { slots: P.slots, owned: P.owned, upg: P.upg, meds: P.meds, modeSel: P.modeSel, body: P.body, head: P.head, bodyDur: P.bodyDur, headDur: P.headDur, ammo: P.ammo });
    np.cur = P.slots[P.cur] ? P.cur : P.slots.findIndex(Boolean);
    g.player = np; np.invalidate(); np.hp = np.maxHp; np.invuln = 3;
    // clear nearby enemies so you don't respawn into a firing squad
    g.enemies = g.enemies.filter(e => Math.abs(e.x - best) > 1400);
    g.bullets = []; g.spawnQueue = [];
    startPlay();
    banner('Respawned — lost ' + fmt(lost), '#ff9b1f', 3);
    save();
  };
})();
