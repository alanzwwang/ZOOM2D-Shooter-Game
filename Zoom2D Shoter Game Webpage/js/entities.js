/* Zoom2D Shooter — player, NPC AI, projectiles, pickups and effects. */
(function () {
  const Z = window.Z;
  const GRAV = 2300;
  const rand = (a, b) => a + Math.random() * (b - a);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  Z.rand = rand; Z.gauss = gauss; Z.clamp = clamp;
  const G = () => Z.game;

  // ---- Effects ------------------------------------------------------------------
  const fx = Z.fx = {
    add(p) {
      const g = G();
      if (g.particles.length >= g.maxParticles) return;
      p.max = p.life; g.particles.push(p);
    },
    spark(x, y, ang, spread, n, color, speed) {
      const q = G().quality; n = Math.ceil(n * (q === 0 ? 0.4 : q === 2 ? 1.4 : 1));
      for (let i = 0; i < n; i++) {
        const a = ang + (Math.random() - 0.5) * spread, s = (speed || 500) * rand(0.3, 1);
        fx.add({ t: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.12, 0.35), size: rand(1, 2.4), color: color || '#ffd27a', g: 900, drag: 2, add: true });
      }
    },
    smoke(x, y, n, size, color, vy) {
      for (let i = 0; i < n; i++) fx.add({ t: 'smoke', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-30, 30), vy: (vy || -40) + rand(-20, 10), life: rand(0.6, 1.6), size: (size || 10) * rand(0.7, 1.3), grow: 22, color: color || '80,80,80', g: 0, drag: 1.2 });
    },
    fire(x, y, n, size) {
      for (let i = 0; i < n; i++) fx.add({ t: 'fire', x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-60, 60), vy: rand(-140, -30), life: rand(0.25, 0.6), size: (size || 9) * rand(0.6, 1.3), grow: -6, g: -120, drag: 1.5, add: true });
    },
    blood(x, y, dir, n, color) {
      const q = G().quality; n = Math.ceil(n * (q === 0 ? 0.4 : 1));
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(-0.4, dir) + rand(-0.8, 0.8), s = rand(80, 380);
        fx.add({ t: 'drop', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rand(0.4, 0.9), size: rand(1.4, 3), color: color || '#b3122a', g: 1400, drag: 0.6, stick: true });
      }
    },
    debris(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rand(-1.3, 1.3), s = rand(200, 700);
        fx.add({ t: 'chunk', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.6, 1.4), size: rand(2, 5.5), color, g: GRAV * 0.8, drag: 0.3, rot: rand(0, 6), vr: rand(-12, 12) });
      }
    },
    shell(x, y, dir, big) {
      fx.add({ t: 'shell', x, y, vx: -dir * rand(80, 180), vy: rand(-320, -200), life: 1.2, size: big ? 3.2 : 2.2, color: '#e3b341', g: GRAV * 0.7, drag: 0.4, rot: rand(0, 6), vr: rand(-25, 25), bounce: true });
    },
    muzzle(x, y, a, color, size) {
      const g = G();
      const s = (size || 1) * 1.35;
      g.flashes.push({ x, y, a, color: color || '#ffd27a', size: s, life: 0.075, max: 0.075, rot: Math.random() * 6 });
      g.lights.push({ x, y, r: 190 * s, color: color && color[0] === '#' ? Z.hexToRgb(color) : '255,200,120', life: 0.08, max: 0.08 });
      if (g.quality > 0 && Math.random() < 0.5) fx.add({ t: 'smoke', x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 8, vx: Math.cos(a) * 60, vy: -30, life: 0.5, size: 5 * s, grow: 26, color: '170,170,170', g: 0, drag: 2 });
    },
    ring(x, y, r, color, life) { G().rings.push({ x, y, r, color: color || '255,220,160', life: life || 0.4, max: life || 0.4 }); },
    text(x, y, str, color, size, life) { G().texts.push({ x, y, str, color: color || '#fff', size: size || 18, life: life || 0.9, max: life || 0.9, vy: -70 }); }
  };

  // ---- Shared physics ---------------------------------------------------------------
  // Ground height under an entity, counting the tops of solid barricades it is standing above.
  function supportY(e, x, T) {
    let gy = T.heightAt(x);
    const sol = G().solids, hw = 11 * (e.s || 1);
    for (let i = 0; i < sol.length; i++) {
      const b = sol[i];
      // swept: also land if we were above the top last frame (fast falls can't tunnel through)
      if (x > b.x - b.w / 2 - hw && x < b.x + b.w / 2 + hw && (e.y <= b.top + 8 || (e.prevY != null && e.prevY <= b.top + 2)) && b.top < gy) gy = b.top;
    }
    return gy;
  }
  Z.supportY = supportY;
  // would nudging this entity by dx push it into a barricade or a steep wall?
  Z.supportBlocked = function (e, dx) {
    const nx = e.x + dx, T = G().terrain;
    if (e.y - T.heightAt(nx) > (e.stepMax || 26)) return true;
    for (const b of G().solids) if (Math.abs(nx - b.x) < b.w / 2 + 11 * (e.s || 1) && e.y > b.top + 8 && e.y - 62 * (e.s || 1) < b.base) return true;
    return false;
  };

  function moveBody(e, dt, T) {
    e.vy += GRAV * dt;
    if (e.vy > 1800) e.vy = 1800;
    e.blockedBy = null;
    // horizontal with step-up handling
    let nx = e.x + e.vx * dt;
    nx = clamp(nx, 30, T.width - 30);
    const stepMax = e.stepMax || 26;
    // barricade walls
    const sol = G().solids, hw = 11 * (e.s || 1);
    e.wallDir = 0; e.terrainWall = false;
    for (let i = 0; i < sol.length; i++) {
      const b = sol[i];
      const l = b.x - b.w / 2 - hw, r = b.x + b.w / 2 + hw;
      // already embedded (wall built/settled on top of us, knockback...): pop out to the nearest side or onto the top
      if (e.x > l && e.x < r && e.y > b.top + 8 && e.y < b.base + 40) {
        if (e.y - b.top < 34) { e.y = b.top; e.vy = Math.min(e.vy, 0); }
        else nx = (e.x - l < r - e.x) ? l - 0.5 : r + 0.5;
        continue;
      }
      if (nx > l && nx < r && e.y > b.top + 8 && e.y - 62 * (e.s || 1) < b.base) {
        if (e.y - b.top <= stepMax && e.onGround) { e.y = b.top; continue; }
        nx = e.x < b.x ? Math.min(nx, l) : Math.max(nx, r); e.vx = 0; e.blockedBy = b; e.wallDir = e.x < b.x ? 1 : -1;
      }
    }
    const g = T.heightAt(nx);
    if (e.y > g + 0.5) {
      if (e.y - g <= stepMax) e.y = g; // climb small steps
      else { e.wallDir = Math.sign(nx - e.x) || e.wallDir; e.terrainWall = true; nx = e.x; e.blocked = true; e.vx = 0; }
    }
    e.x = nx;
    // vertical
    e.prevY = e.y;
    e.y += e.vy * dt;
    const gy = supportY(e, e.x, T);
    const was = e.onGround;
    if (e.y >= gy) {
      if (!was && e.vy > 900 && e.onLand) e.onLand(e.vy);
      e.y = gy; e.vy = 0; e.onGround = true;
    } else if (was && e.vy >= 0 && gy - e.y < 18) {
      e.y = gy; e.vy = 0; e.onGround = true; // stick to downhill slopes
    } else e.onGround = false;
  }
  Z.moveBody = moveBody;

  // ---- Player ---------------------------------------------------------------------
  class Player {
    constructor(x, y) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.hp = 100; this.maxHp = 100;
      this.onGround = false; this.facing = 1; this.aim = 0; this.walk = 0;
      this.coyote = 0; this.jumpBuf = 0;
      this.slots = ['glock-17', 'combat-knife', null, null, null, null, null, null, null];
      this.owned = new Set(['glock-17', 'combat-knife']);
      this.cur = 0; this.ammo = {}; this.reloadT = 0; this.fireCD = 0; this.spin = 0; this.burstLeft = 0; this.burstT = 0;
      this.bloom = 0; this.swingT = 0; this.swingDur = 0.28; this.swingHit = new Set();
      this.body = null; this.head = null; this.bodyDur = 0; this.headDur = 0;
      this.meds = { gauze: 5, bandage: 2, 'first-aid': 1 };
      this.heals = []; this.resistT = 0; this.resist = 0; this.speedT = 0; this.speedMul = 1; this.regenT = 0; this.regen = 0; this.dmgT = 0; this.dmgMul = 1;
      this.invuln = 2; this.flash = 0; this.hurtT = 0; this.dead = false; this.deadT = 0; this.wasDown = false;
      this.stepMax = 26;
      this.upg = {}; this.eff = {}; this.effB = {}; this.modeSel = {}; this.lastSlot = 1;
      this.climb = 0; this.deflectE = 100; this.autoReloadT = 0; this.lastHitBy = null; this.stepT = 0; this.wallJumpCD = 0;
      this.onLand = (v) => { Z.audio.sfx('land', 0.6); fx.smoke(this.x, this.y - 2, 4, 8, '150,130,110', -10); };
    }
    get baseWeapon() { const id = this.slots[this.cur]; return (id && Z.WEAPON_BY_ID[id]) || null; }
    // Effective weapon = catalog stats + upgrades + perks (cached until something changes).
    get weapon() {
      const b = this.baseWeapon; if (!b) return null;
      let c = this.eff[b.id];
      if (!c) {
        // always a copy: perk bonuses must never be written into the shared catalog entry
        c = this.eff[b.id] = Object.assign({}, Z.applyUpgrades(b, this.upg[b.id]));
        const hands = G().perk('hands');
        if (c.reload) c.reload *= 1 - 0.08 * hands;
        c.dmg *= 1 + 0.05 * G().perk('gunslinger');
      }
      // Combat Stim: a boosted copy of the same weapon while the stim lasts
      if (this.dmgT > 0) {
        let cb = this.effB[b.id];
        if (!cb || cb.base !== c) cb = this.effB[b.id] = Object.assign({}, c, { dmg: c.dmg * this.dmgMul, base: c });
        return cb;
      }
      return c;
    }
    invalidate() { this.eff = {}; this.effB = {}; this.maxHp = 100 + 20 * G().perk('vitality'); }
    modeOf(w) { return w.modes[(this.modeSel[w.id] || 0) % w.modes.length]; }
    toggleMode() {
      const w = this.weapon; if (!w || w.modes.length < 2) { if (w) fx.text(this.x, this.y - 90, Z.MODE_LABEL[w.mode] + ' only', '#9fd8ff', 15); return; }
      this.modeSel[w.id] = ((this.modeSel[w.id] || 0) + 1) % w.modes.length;
      this.burstLeft = 0;
      Z.audio.sfx('click');
      fx.text(this.x, this.y - 90, Z.MODE_LABEL[this.modeOf(w)], '#ffd84d', 17);
    }
    hitbox() { return { x: this.x - 13, y: this.y - 66, w: 26, h: 66 }; }
    magOf(w) { if (!(w.id in this.ammo)) this.ammo[w.id] = w.mag; return this.ammo[w.id]; }

    switchTo(i) {
      if (i < 0 || i > 8 || !this.slots[i] || i === this.cur) return;
      this.lastSlot = this.cur; this.cur = i; this.reloadT = 0; this.spin = 0; this.burstLeft = 0; this.fireCD = Math.max(this.fireCD, 0.15);
      Z.audio.sfx('click');
    }
    cycle(d) {
      for (let k = 1; k <= 9; k++) { const i = (this.cur + d * k + 90) % 9; if (this.slots[i]) { this.switchTo(i); return; } }
    }
    reload() {
      const w = this.weapon; if (!w || !w.mag || this.reloadT > 0) return;
      if (this.magOf(w) >= w.mag) return;
      this.reloadT = w.reload;
      const snd = { Pistols: 'reload-pistol', SMGs: 'reload-rifle', Rifles: 'reload-rifle', Shotguns: 'reload-shotgun', Snipers: 'reload-sniper', Heavy: 'reload-heavy', Miniguns: 'reload-heavy', Explosives: 'reload-launcher', Energy: 'reload-energy' }[w.cat];
      Z.audio.sfx(snd || 'reload');
    }
    armorReduce(head) {
      let keep = 1;
      const b = this.body && Z.ARMOR_BY_ID[this.body], h = this.head && Z.ARMOR_BY_ID[this.head];
      if (b && this.bodyDur > 0) keep *= 1 - b.reduce;
      if (h && this.headDur > 0) keep *= 1 - h.reduce;
      return 1 - keep;
    }
    moveMul() {
      let m = 1;
      const w = this.weapon; if (w && w.moveMul) m *= w.moveMul;
      const b = this.body && Z.ARMOR_BY_ID[this.body]; if (b && b.moveMul) m *= b.moveMul;
      if (this.speedT > 0) m *= this.speedMul;
      m *= 1 + 0.05 * G().perk('agility');
      if (this.aiming) m *= 0.65;
      return m;
    }

    hurt(d, srcX, head, blast, src) {
      const g = G();
      if (this.dead || this.invuln > 0 || g.godMode) return;
      if (src) this.lastHitBy = src;
      const h = this.head && this.headDur > 0 ? Z.ARMOR_BY_ID[this.head] : null;
      if (head) d *= 1 + 0.6 * (1 - (h ? h.head : 0));
      const b = this.body && this.bodyDur > 0 ? Z.ARMOR_BY_ID[this.body] : null;
      if (blast && b && b.blast) d *= b.blast;
      if (this.resistT > 0) d *= 1 - this.resist;
      d *= 1 - 0.04 * g.perk('skin');
      this.lastHurt = g.time;
      const red = this.armorReduce();
      const absorbed = d * red;
      // armor soaks damage and wears down
      if (b) { this.bodyDur = Math.max(0, this.bodyDur - absorbed * (h ? 0.7 : 1)); if (this.bodyDur === 0 && absorbed > 0) fx.text(this.x, this.y - 90, 'ARMOR BROKEN!', '#ff9b1f', 20, 1.4); }
      if (h) this.headDur = Math.max(0, this.headDur - absorbed * (b ? 0.3 : 1));
      this.hp -= d - absorbed;
      this.flash = 0.12; this.hurtT = 0.4;
      g.hurtFlash = Math.min(1, g.hurtFlash + (d - absorbed) / 40);
      if (srcX != null) g.dmgDirs.push({ a: Math.atan2(-30, srcX - this.x), life: 1 });
      Z.audio.sfx('hurt', 0.8);
      fx.blood(this.x, this.y - 40, Math.sign(this.x - (srcX || this.x)) || 1, 4);
      if (this.hp <= 0) {
        if (this.meds.defibrillator > 0) this.revive();
        else { this.hp = 0; this.die(); }
      }
    }
    // Defibrillator: instead of going down, get shocked back up
    revive() {
      const m = Z.MED_BY_ID.defibrillator;
      this.meds.defibrillator--;
      this.hp = Math.max(1, Math.round(this.maxHp * m.revive));
      this.heals = []; this.invuln = 2.5; this.hurtT = 0;
      const g = G(); g.hurtFlash = 0; g.shake(10);
      fx.text(this.x, this.y - 110, '⚡ DEFIBRILLATOR! Back in the fight', '#ffd84d', 22, 2);
      Z.audio.sfx('zap'); Z.audio.sfx('heal');
      for (let i = 0; i < 18; i++) fx.add({ t: 'spark', x: this.x + rand(-18, 18), y: this.y - rand(10, 70), vx: rand(-160, 160), vy: -rand(60, 220), life: 0.6, size: 2.6, color: i % 2 ? '#ffd84d' : '#9fd8ff', g: 0, drag: 0, add: true });
    }
    die() {
      this.dead = true; this.deadT = 0;
      Z.audio.sfx('death');
      fx.blood(this.x, this.y - 40, 1, 18);
      G().onPlayerDeath();
    }
    useMed(id) {
      const m = Z.MED_BY_ID[id];
      if (this.dead) return false;
      if (!m || !this.meds[id]) { if (m) { fx.text(this.x, this.y - 90, 'No ' + m.name + '!', '#ff6a6a', 16); Z.audio.sfx('deny'); } return false; }
      if (m.revive) { fx.text(this.x, this.y - 90, 'Defibrillator ready — it works by itself when you go down', '#ffd84d', 16, 1.6); return false; }
      if (this.hp >= this.maxHp && !m.speed && !m.resist && !m.dmgBoost) { fx.text(this.x, this.y - 90, 'Already full HP', '#9fd8ff', 16); return false; }
      this.meds[id]--;
      const amt = Math.min(m.heal * (1 + 0.2 * G().perk('medic')), this.maxHp * 2);
      if (m.time <= 0.25) this.hp = Math.min(this.maxHp, this.hp + amt);
      else this.heals.push({ rate: amt / m.time, left: amt });
      // timed effects keep the stronger value and the longer timer, so a weak med never cancels a strong one
      const buff = (tKey, vKey, v, t) => { this[vKey] = this[tKey] > 0 ? Math.max(this[vKey], v) : v; this[tKey] = Math.max(this[tKey], t); };
      if (m.speed) buff('speedT', 'speedMul', m.speed, m.speedTime);
      if (m.resist) buff('resistT', 'resist', m.resist, m.resistTime);
      if (m.regen) buff('regenT', 'regen', m.regen, m.regenTime);
      if (m.dmgBoost) { buff('dmgT', 'dmgMul', m.dmgBoost, m.dmgTime); this.effB = {}; }
      fx.text(this.x, this.y - 90, '+ ' + m.name, '#5dff8a', 18);
      Z.audio.sfx('heal');
      for (let i = 0; i < 10; i++) fx.add({ t: 'spark', x: this.x + rand(-14, 14), y: this.y - rand(10, 60), vx: 0, vy: -rand(40, 120), life: 0.7, size: 2.5, color: '#5dff8a', g: 0, drag: 0, add: true });
      return true;
    }
    smartHeal() {
      if (this.dead) return;
      const missing = this.maxHp - this.hp;
      if (missing <= 0) { fx.text(this.x, this.y - 90, 'Already full HP', '#9fd8ff', 16); return; }
      // pick the cheapest owned item that covers most of the missing HP; when you're nearly down,
      // skip the slow ones (a Blood Bag takes 8 s) as long as something faster is on hand
      const plain = Z.MEDS.filter(m => this.meds[m.id] > 0 && !m.speed && !m.resist && !m.dmgBoost && !m.revive && m.heal > 0);
      const urgent = this.hp < this.maxHp * 0.35;
      let order = plain.filter(m => !urgent || m.time <= 4);
      if (!order.length) order = plain;
      if (!order.length) {
        // only special meds left: they heal too, so use one as a last resort
        const spare = ['morphine', 'combat-stim', 'adrenaline', 'painkillers'].find(id => this.meds[id] > 0);
        if (spare) { this.useMed(spare); return; }
        fx.text(this.x, this.y - 90, 'No meds! Buy some at a shop', '#ff6a6a', 16); Z.audio.sfx('deny'); return;
      }
      order.sort((a, b) => a.heal - b.heal);
      const pick = order.find(m => m.heal >= missing * 0.8) || order[order.length - 1];
      this.useMed(pick.id);
    }

    update(dt, input) {
      const g = G(), T = g.terrain;
      if (this.dead) { this.deadT += dt; this.vx *= 0.9; moveBody(this, dt, T); return; }
      this.invuln -= dt; this.flash -= dt; this.hurtT -= dt;
      // healing over time
      for (const h of this.heals) { const a = Math.min(h.left, h.rate * dt); h.left -= a; this.hp = Math.min(this.maxHp, this.hp + a); }
      this.heals = this.heals.filter(h => h.left > 0.01);
      if (this.regenT > 0) { this.regenT -= dt; this.hp = Math.min(this.maxHp, this.hp + this.regen * dt); }
      // Second Wind perk: slow regeneration after a few seconds out of danger
      const sw = g.perk('regen');
      if (sw && g.time - (this.lastHurt || -99) > 4 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + sw * dt);
      if (this.resistT > 0) this.resistT -= dt;
      if (this.speedT > 0) this.speedT -= dt;
      if (this.dmgT > 0) this.dmgT -= dt;
      const b = this.body && Z.ARMOR_BY_ID[this.body];
      if (b && b.regen) this.bodyDur = Math.min(b.dur, this.bodyDur + b.regen * dt);
      const hh = this.head && Z.ARMOR_BY_ID[this.head];
      if (hh && hh.regen) this.headDur = Math.min(hh.dur, this.headDur + hh.regen * dt);

      // movement
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const w = this.weapon;
      this.aiming = !!input.aim && !g.building && w && w.kind !== 'melee';
      const sprint = input.sprint && !this.aiming ? 1.4 : 1;
      const target = dir * 330 * sprint * this.moveMul();
      const acc = this.onGround ? 3200 : 1700;
      if (Math.abs(target - this.vx) < acc * dt) this.vx = target; else this.vx += Math.sign(target - this.vx) * acc * dt;
      if (this.onGround) this.coyote = 0.1; else this.coyote -= dt;
      if (input.jumpPressed) this.jumpBuf = 0.12; else this.jumpBuf -= dt;
      this.wallJumpCD -= dt;
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vy = -880 * (1 + 0.03 * g.perk('agility')); this.onGround = false; this.coyote = 0; this.jumpBuf = 0;
        Z.audio.sfx('jump'); fx.smoke(this.x, this.y, 3, 7, '150,130,110', -10);
      } else if (this.jumpBuf > 0 && !this.onGround && this.wallDir && this.wallJumpCD <= 0 && dir === this.wallDir) {
        // wall-climb: kick off steep crater walls and barricades so you can never get trapped in a pit
        this.vy = -760; this.jumpBuf = 0; this.wallJumpCD = 0.28;
        Z.audio.sfx('jump'); fx.smoke(this.x + this.wallDir * 10, this.y - 20, 3, 6, '150,130,110', -10);
      }
      if (!input.jump && this.vy < -300) this.vy += GRAV * dt * 0.9; // variable jump height
      moveBody(this, dt, T);
      if (this.onGround && Math.abs(this.vx) > 10) {
        this.walk += dt * Math.abs(this.vx) / 22;
        this.stepT -= dt * Math.abs(this.vx) / 330;
        if (this.stepT <= 0) { this.stepT = 0.32; Z.audio.sfx('step', 0.8, { biome: T.biomeAt(this.x) }); }
      } else this.walk *= 0.85;

      // aim (muzzle climb kicks the barrel up; it settles back on its own)
      const shoulder = { x: this.x + 2 * this.facing, y: this.y - 50 };
      this.facing = input.mx >= this.x ? 1 : -1;
      this.climb = Math.max(0, this.climb - dt * (this.aiming ? 1.6 : 1.1));
      this.aim = Math.atan2(input.my - shoulder.y, input.mx - shoulder.x) - this.climb * this.facing;

      // weapon
      this.fireCD = Math.max(this.fireCD - dt, -dt);
      this.bloom = Math.max(0, this.bloom - dt * (this.aiming ? 1.3 : 0.85));
      this.deflectE = Math.min(100, this.deflectE + dt * 22);
      if (this.swingT > 0) { this.swingT -= dt; this.meleeTick(w); }
      if (!w) { Z.audio.loop('minigun', 0); Z.audio.loop('flame', 0); return; }
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) { this.ammo[w.id] = w.mag; this.reloadT = 0; Z.audio.sfx('reload-done'); }
      }
      if (this.autoReloadT > 0) { this.autoReloadT -= dt; if (this.autoReloadT <= 0) this.reload(); }
      const firing = input.fire && !g.building;
      if (w.spinup) {
        const was = this.spin;
        this.spin = firing || this.aiming ? Math.min(1, this.spin + dt / w.spinup) : Math.max(0, this.spin - dt / (w.spinup * 1.5));
        if ((firing || this.aiming) && was === 0) Z.audio.sfx('spin');
        Z.audio.loop('minigun', this.spin);
      } else Z.audio.loop('minigun', 0);
      Z.audio.loop('flame', w.kind === 'flame' && w.rate > 10 && firing && this.reloadT <= 0 && this.magOf(w) > 0 ? 1 : 0);
      if (input.reload) this.reload();
      if (g.building) return;
      const mode = this.modeOf(w);
      const auto = mode === 'auto' || mode === 'melee';
      const burst = mode === 'burst' ? (w.burst || 3) : 0;
      const wantFire = auto ? input.fire : input.firePressed;
      // fire-rate accounting carries leftover time, so 30 rounds/s really is 30/s at any frame rate
      if ((!wantFire || this.reloadT > 0 || (w.spinup && this.spin < 1)) && this.burstLeft <= 0 && this.fireCD < 0) this.fireCD = 0;
      if (this.burstLeft > 0) {
        this.burstT -= dt;
        if (this.burstT <= 0 && this.reloadT <= 0 && this.magOf(w) > 0) { this.burstLeft--; this.burstT += 1 / (w.rate * 2.4); Z.fire(this, w, true); this.ammo[w.id]--; }
        if (this.magOf(w) <= 0) this.burstLeft = 0;
      } else if (wantFire && this.fireCD <= 0 && this.reloadT <= 0) {
        if (w.spinup && this.spin < 1) return;
        if (w.kind === 'melee') { this.startSwing(w); this.fireCD = 1 / w.rate; return; }
        let shots = 0;
        while (this.fireCD <= 0 && shots < 4) {
          const m = this.magOf(w);
          if (m <= 0) { Z.audio.sfx('empty'); this.reload(); break; }
          this.fireCD += 1 / w.rate;
          if (burst) { this.burstLeft = Math.min(burst, m) - 1; this.burstT = 1 / (w.rate * 2.4); this.fireCD = Math.max(this.fireCD, 0) + burst / (w.rate * 2.4); }
          Z.fire(this, w, true); this.lastShotT = G().time;
          this.ammo[w.id]--; shots++;
          if (!auto || burst) break;
        }
        if (shots && (mode === 'pump' || mode === 'bolt' || mode === 'lever')) {
          const snd = mode === 'bolt' ? 'bolt' : mode === 'lever' ? 'lever' : 'pump';
          setTimeout(() => Z.audio.sfx(snd), Math.min(450, 380 / w.rate));
        }
        if (shots && this.ammo[w.id] <= 0) this.autoReloadT = 0.16;
      }
    }
    startSwing(w) {
      this.swingT = this.swingDur; this.swingHit.clear();
      Z.audio.sfx(w.sound === 'saber' ? 'saber' : w.sound === 'saw' ? 'saw' : 'swing');
    }
    meleeTick(w) {
      if (!w || w.kind !== 'melee') return;
      const g = G();
      const reach = w.range * 1.05 + 30;
      const cx = this.x + 2 * this.facing, cy = this.y - 46;
      for (const e of g.enemies) {
        if (e.dead || this.swingHit.has(e)) continue;
        const hb = e.hitbox();
        const ex = clamp(cx, hb.x, hb.x + hb.w), ey = clamp(cy, hb.y, hb.y + hb.h);
        const dx = ex - cx, dy = ey - cy, d = Math.hypot(dx, dy);
        if (d > reach) continue;
        let da = Math.atan2(dy, dx) - this.aim; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
        if (Math.abs(da) > (w.arc || 1.5) / 2 + 0.35 && d > 26) continue;
        this.swingHit.add(e);
        const head = ey < hb.y + hb.h * 0.22;
        e.hurt(w.dmg, this.facing * (w.knock ? 520 : 200), head, w);
        Z.audio.sfx('melee-hit');
        fx.spark(ex, ey, this.aim, 1.2, 8, w.color || '#fff', 400);
        if (w.shock) Z.lightning(ex, ey - 400, ex, ey, '#9fd8ff', 3);
        if (w.burn) e.burnT = 3;
      }
      // laser swords bat bullets back — only in front of you, within the blade's reach, and it costs focus
      if (w.deflect) {
        const arc = (w.arc || 1.5) / 2 + 0.5;
        for (const b of g.bullets) {
          if (b.owner !== 'e' || this.deflectE < 6) continue;
          const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
          if (d > w.range * 0.85 + 20) continue;
          let da = Math.atan2(dy, dx) - this.aim; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
          if (Math.abs(da) > arc) continue;
          this.deflectE -= 6;
          const sp = Math.hypot(b.vx, b.vy) * (b.kind === 'rocket' ? 1 : 1.2);
          const a = this.aim + rand(-0.08, 0.08);
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.owner = 'p'; b.w = w;
          if (b.kind !== 'rocket') { b.dmg *= 1.5; b.color = w.color; b.kind = b.kind === 'rock' ? 'rock' : 'b'; b.g = 0; }
          fx.spark(b.x, b.y, a, 1, 6, w.color, 300);
          Z.audio.sfx('deflect');
          g.stats.deflects = (g.stats.deflects || 0) + 1;
        }
      }
    }
    draw(ctx, t) {
      const w = this.weapon;
      const body = this.body && this.bodyDur > 0 ? Z.ARMOR_BY_ID[this.body] : null;
      const head = this.head && this.headDur > 0 ? Z.ARMOR_BY_ID[this.head] : null;
      const blink = this.invuln > 0 && !this.dead && Math.floor(t * 20) % 2 === 0;
      if (blink) ctx.globalAlpha = 0.55;
      Z.drawHuman(ctx, {
        x: this.x, y: this.y, s: 1, facing: this.facing, aim: this.aim, walk: this.walk, build: 'normal', t,
        colors: { skin: '#f1c7a0', shirt: '#1f6fb2', pants: '#24324a', boots: '#151a22', belt: '#ffb020', belt2: '#fff', accent: '#5ff', glove: '#222' },
        weapon: w, weaponScale: 0.62, flash: this.flash, dead: this.dead, deadT: this.deadT,
        helmet: head ? head.color : null, headgear: head && head.id === 'nano-visor' ? 'visor' : (head && head.id === 'ballistic-helmet' ? 'visor' : null), vest: body ? body.color : null,
        hair: '#2a1a10', swing: this.swingT > 0 ? 1 - this.swingT / this.swingDur : null
      });
      ctx.globalAlpha = 1;
      // melee swing trail
      if (this.swingT > 0 && w && w.kind === 'melee') {
        const p = 1 - this.swingT / this.swingDur;
        const cx = this.x + 2 * this.facing, cy = this.y - 46, r = w.range * 0.62 + 18;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = w.color ? w.color : 'rgba(255,255,255,0.6)';
        ctx.globalAlpha = 0.5 * (1 - p);
        ctx.lineWidth = w.deflect ? 10 : 5;
        ctx.beginPath();
        const a0 = this.aim - 1.1 * this.facing, a1 = this.aim - 1.1 * this.facing + p * 2.2 * this.facing;
        ctx.arc(cx, cy, r, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  Z.Player = Player;

  // ---- Enemy types ------------------------------------------------------------------
  const ETYPES = Z.ETYPES = {
    dimwit: {
      name: 'Dimwit', tier: 1, hp: 30, s: 0.95, build: 'thin', speed: 115, weapon: null, proj: 'rock', dmg: 5, rate: 0.5, err: 0.42, sight: 650, pref: [80, 320],
      reward: [12, 26], react: 1.8, burst: [1, 0.9], bspeed: 600, hat: 'beanie', dumb: true,
      colors: { skin: '#f0c9a0', shirt: '#c9a227', pants: '#5a6b8a', hat: '#e05a3a', hair: '#7a4a20' },
      lines: ['Uhh... which end is the shooty end?', 'Is that the guy?', 'I forgot how to aim!', 'Rocks count as weapons, right?', 'Wait for me!', 'Ow, my foot!', 'Mom said I\'d be a hero...', 'Duhhh...']
    },
    goon: {
      name: 'Goon', tier: 2, hp: 55, s: 1, build: 'normal', speed: 150, weapon: 'makarov-pm', dmg: 6, rate: 1.0, err: 0.2, sight: 900, pref: [260, 560],
      reward: [28, 50], react: 1.2, burst: [2, 1.4], bspeed: 1150, hat: 'cap',
      colors: { skin: '#d9a77a', shirt: '#5a5f66', pants: '#2b2f36', hat: '#2a6a3a' },
      lines: ['Get him!', 'Boss is gonna pay me for this!', 'Hey you!', 'Stop right there!']
    },
    thug: {
      name: 'Thug', tier: 3, hp: 90, s: 1.02, build: 'normal', speed: 165, weapon: 'mac-10', dmg: 5, rate: 5, err: 0.14, sight: 950, pref: [200, 460],
      reward: [60, 105], react: 1.0, burst: [4, 1.6], bspeed: 1250, hat: 'bandana',
      colors: { skin: '#c48a60', shirt: '#7a1f2a', pants: '#1f2026', hat: '#d22' },
      lines: ['Spray and pray!', 'You picked the wrong street!', 'Light him up!']
    },
    merc: {
      name: 'Mercenary', tier: 4, hp: 140, armor: 0.25, s: 1.04, build: 'normal', speed: 160, weapon: 'ak-47', dmg: 9, rate: 4.2, err: 0.075, lead: 0.4, sight: 1150, pref: [350, 720],
      reward: [140, 210], react: 0.8, burst: [5, 1.4], bspeed: 1600, grenades: true, helmet: '#4a5a3a', vest: '#3c4a3a',
      colors: { skin: '#e0b088', shirt: '#4f5a3a', pants: '#3a3f2f' },
      lines: ['Contact!', 'Target acquired.', 'Flanking left!', 'Suppressing fire!']
    },
    rocketeer: {
      name: 'Rocketeer', tier: 4, hp: 120, armor: 0.2, s: 1.04, build: 'normal', speed: 140, weapon: 'rpg-7', proj: 'rocket', dmg: 32, rate: 0.22, err: 0.06, lead: 0.3, sight: 1300, pref: [500, 900],
      reward: [250, 360], react: 1.4, burst: [1, 3.2], bspeed: 750, helmet: '#5a3a2a', vest: '#4b4f3a',
      colors: { skin: '#d9a77a', shirt: '#6a4a2a', pants: '#3a2f22' },
      lines: ['Rocket out!', 'Boom time!', 'Eat this!']
    },
    marksman: {
      name: 'Marksman', tier: 5, hp: 100, armor: 0.1, s: 1, build: 'thin', speed: 130, weapon: 'dragunov-svd', dmg: 26, rate: 0.38, err: 0.02, lead: 0.7, sight: 1750, pref: [800, 1350],
      reward: [270, 390], react: 1.3, burst: [1, 1.6], bspeed: 2500, aimLaser: 1.2, longRange: true, hat: 'cap',
      colors: { skin: '#e8be98', shirt: '#2f3a2a', pants: '#2a2f22', hat: '#2f3a2a' },
      lines: ['In my sights.', 'Hold still...', 'One shot.']
    },
    henchman: {
      name: 'Big Henchman', tier: 6, hp: 460, armor: 0.35, s: 1.18, build: 'muscle', speed: 120, weapon: 'm249-saw', dmg: 6, rate: 6.5, err: 0.045, lead: 0.85, sight: 1300, pref: [300, 650],
      reward: [380, 500], react: 0.7, burst: [11, 1.8], bspeed: 1700, telegraph: 0.7, grenades: true, headgear: 'shades', hat: 'bald', vest: '#2a2a30', stepMax: 30,
      colors: { skin: '#c48a60', shirt: '#1a1a1e', pants: '#24242a', glove: '#111' },
      lines: ['You\'re going DOWN!', 'Nobody escapes the boss!', 'I eat guys like you for breakfast!', 'Feel the burn!', 'HAHAHA!']
    },
    brute: {
      name: 'Boss Brute', tier: 7, hp: 1500, armor: 0.45, s: 1.38, build: 'huge', speed: 95, weapon: 'm134-minigun', dmg: 4.5, rate: 13, err: 0.055, lead: 0.9, spin: 1.1, sight: 1400, pref: [250, 620],
      reward: [3300, 4500], react: 0.9, burst: [26, 2.8], bspeed: 1700, telegraph: 0.9, headgear: 'shades', hat: 'mohawk', vest: '#3a1010', stepMax: 34,
      colors: { skin: '#b5754a', shirt: '#2a0a0a', pants: '#1a1a1a', hat: '#ff2a3a', glove: '#111' },
      lines: ['I AM THE BOSS!', 'Say hello to my little friend!', 'Time to get SHREDDED!']
    }
  };

  // ---- Enemy ----------------------------------------------------------------------
  class Enemy {
    constructor(type, x, y, lvl) {
      const T = ETYPES[type];
      this.type = type; this.def = T;
      this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      const hpMul = 1 + Math.max(0, lvl - 3) * 0.06;
      this.hp = this.maxHp = Math.round(T.hp * hpMul);
      this.s = T.s; this.facing = Math.random() < 0.5 ? -1 : 1; this.aim = this.facing > 0 ? 0 : Math.PI; this.walk = 0;
      this.weapon = T.weapon ? Z.WEAPON_BY_ID[T.weapon] : null;
      this.state = 'patrol'; this.alert = 0; this.react = T.react * rand(0.8, 1.3);
      this.patrolDir = this.facing; this.patrolT = rand(1, 4);
      this.burstLeft = T.burst[0]; this.shotT = 0; this.pauseT = rand(0.2, 1);
      this.losT = 0; this.sees = false; this.flash = 0; this.dead = false; this.deadT = 0;
      this.burnT = 0; this.freezeT = 0; this.trip = 0; this.say = null; this.sayT = 0; this.sayCD = rand(2, 6);
      this.stepMax = T.stepMax || 26; this.spin = 0; this.aimLaserT = 0; this.stuckT = 0; this.lastX = x;
      this.strafe = 0; this.strafeT = 0;
      this.hunt = false; this.siege = null; this.siegeT = 0; this.hopT = 0;
      // every enemy keeps its own distance so groups spread out instead of forming a conga line
      this.pref = [T.pref[0] * rand(0.75, 1.15), T.pref[1] * rand(0.85, 1.3)];
      this.shockT = 0; this.nadeT = rand(8, 14); this.teleT = 0; this.dmgText = null; this.stuckPitT = 0;
      this.onLand = () => { };
    }
    hitbox() { const h = 66 * this.s * (this.def.build === 'huge' ? 1.05 : 1), w = 26 * this.s * (this.def.build === 'huge' ? 1.5 : this.def.build === 'muscle' ? 1.25 : 1); return { x: this.x - w / 2, y: this.y - h, w, h }; }
    speak(line) {
      const g = G();
      // one chatty enemy at a time keeps the screen readable
      if (g.time - (g.lastSpeak || -9) < 1.6) { this.sayCD = rand(2, 4); return; }
      g.lastSpeak = g.time;
      this.say = line || this.def.lines[Math.floor(Math.random() * this.def.lines.length)]; this.sayT = 2.2; this.sayCD = rand(5, 10);
    }

    // damage-over-time (fire, traps) without hit sounds or numbers
    dot(d, src) {
      if (this.dead) return;
      this.hp -= d * (1 - (this.def.armor || 0) * 0.5);
      if (Math.random() < 0.15) this.flash = 0.05;
      if (this.alert <= 0) this.alert = 3;
      if (this.hp <= 0) this.die(src || null, false);
    }
    hurt(d, knock, head, w) {
      if (this.dead) return;
      const g = G();
      if (head) d *= 2;
      if (this.def.armor) d *= 1 - this.def.armor;
      if (this.freezeT > 0) d *= 1.15;
      this.hp -= d; this.flash = 0.1; this.vx += knock * (this.def.build === 'huge' ? 0.2 : 0.6) / this.s;
      if (this.alert < 1) { this.alert = 6; this.react = Math.min(this.react, 0.35); }
      this.alert = 6;
      if (g.settings.dmgNumbers) {
        // rapid hits add up into one number instead of stacking
        const tx = this.dmgText;
        if (tx && tx.life > tx.max - 0.35 && g.texts.includes(tx)) { tx.sum += d; tx.str = '' + Math.round(tx.sum); tx.life = tx.max; tx.size = Math.min(30, tx.size + 1); if (head) { tx.head = true; tx.color = '#ffd84d'; } tx.x = this.x; tx.y = this.y - 80 * this.s; }
        else { fx.text(this.x + rand(-6, 6), this.y - 80 * this.s, '' + Math.round(d), head ? '#ffd84d' : '#fff', head ? 22 : 16, 0.7); this.dmgText = g.texts[g.texts.length - 1]; this.dmgText.sum = d; this.dmgText.head = head; }
      }
      if (head) Z.audio.sfx('headshot'); else Z.audio.sfx('hit');
      g.hitMarker = head ? 0.2 : 0.12; g.hitHead = head;
      if (this.hp <= 0) this.die(w, head);
    }
    die(w, head) {
      this.dead = true; this.deadT = 0; this.hp = 0;
      const g = G();
      fx.blood(this.x, this.y - 40 * this.s, this.facing * -1, 14);
      Z.audio.sfx('kill');
      // killstreak combo multiplier
      g.combo = g.comboT > 0 ? Math.min(10, g.combo + 1) : 1; g.comboT = 3.5;
      // bounties climb steeply with the threat level: ~2x at threat 5, ~5x at threat 10
      const mul = (1 + (g.combo - 1) * 0.1) * (1 + Math.pow(Math.max(0, g.threat - 1), 1.6) * 0.12) * (1 + 0.1 * g.perk('bounty'));
      let cash = Math.round(rand(this.def.reward[0], this.def.reward[1]) * mul * (head ? 1.25 : 1));
      const parts = Math.min(5, 1 + Math.floor(cash / 60));
      for (let i = 0; i < parts; i++) Z.spawnCash(this.x, this.y - 40 * this.s, Math.ceil(cash / parts), true);
      const r = Math.random();
      // about half of all kills drop something to heal with
      if (r < 0.28) Z.spawnMed(this.x, this.y - 40, 'gauze');
      else if (r < 0.39) Z.spawnMed(this.x, this.y - 40, 'bandage');
      else if (r < 0.44) Z.spawnMed(this.x, this.y - 40, Math.random() < 0.5 ? 'energy-bar' : 'splint');
      else if (r < 0.50 + this.def.tier * 0.02) Z.spawnMed(this.x, this.y - 40, this.def.tier >= 5 ? (Math.random() < 0.25 ? 'morphine' : 'medkit') : 'first-aid');
      g.stats.kills++;
      g.stats.killsByType[this.type] = (g.stats.killsByType[this.type] || 0) + 1;
      if (head) g.stats.headshots++;
      g.feed.unshift({ str: (w ? w.name : 'Explosion') + '  ✖  ' + this.def.name + (head ? '  (headshot)' : ''), life: 4, color: this.def.tier >= 6 ? '#ff9b1f' : '#fff' });
      if (g.combo >= 3) fx.text(this.x, this.y - 110 * this.s, g.combo + 'x COMBO!', '#ff4dff', 22, 1.2);
      if (this.type === 'brute') { g.shake(16); fx.text(this.x, this.y - 140, 'BOSS DOWN!', '#ffd84d', 34, 2); Z.audio.sfx('cash-big'); g.slowT = 0.9; if (!g.enemies.some(o => o !== this && o.type === 'brute' && !o.dead)) Z.audio.event('boss-dead'); }
    }

    update(dt) {
      const g = G(), P = g.player, T = g.terrain, D = this.def;
      this.flash -= dt; this.sayT -= dt; this.sayCD -= dt;
      if (this.dead) { this.deadT += dt; this.vx *= 0.92; moveBody(this, dt, T); return; }
      if (this.burnT > 0) {
        this.burnT -= dt; this.dot(9 * dt * (1 + g.threat * 0.05), { name: 'Fire' });
        if (Math.random() < dt * 30) fx.fire(this.x + rand(-8, 8), this.y - rand(10, 60) * this.s, 1, 7);
        if (this.dead) return;
      }
      const slow = this.freezeT > 0 ? 0.35 : 1;
      if (this.freezeT > 0) this.freezeT -= dt;
      if (this.trip > 0) { this.trip -= dt; this.vx *= 0.9; moveBody(this, dt, T); return; }

      const eye = { x: this.x, y: this.y - 58 * this.s };
      const tx = P.x, ty = P.y - 40;
      const dx = tx - eye.x, dy = ty - eye.y, dist = Math.hypot(dx, dy) || 1;
      this.losT -= dt;
      if (this.losT <= 0) {
        this.losT = 0.18;
        // terrain AND solid barricades block sight — enemies have to go around, over or through your walls
        this.sees = !P.dead && dist < D.sight && T.raycast(eye.x, eye.y, dx / dist, dy / dist, dist) >= dist - 8 && !Z.segmentStructure(eye.x, eye.y, tx, ty, true);
      }
      if (this.sees) {
        if (this.alert <= 0) { this.react = D.react * rand(0.8, 1.3); if (Math.random() < 0.5) this.speak(); Z.audio.sfxAt('alert', this.x, 0.8); }
        this.alert = 5;
      } else this.alert -= dt;
      if (!this.sees && this.sayCD <= 0 && D.dumb && Math.random() < dt * 0.3) this.speak();
      if (this.shockT > 0) this.shockT -= dt;
      // only shoot at what the player can see (plus a little margin); snipers telegraph from further away
      const onScreen = Math.abs(dx) < g.viewW / 2 + 100;
      const canShoot = this.sees && (onScreen || D.longRange);

      let want = 0;
      if (this.alert > 0 && !P.dead) {
        this.facing = dx >= 0 ? 1 : -1;
        const adx = Math.abs(dx);
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = rand(0.8, 2.2); this.strafe = Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) : 0; }
        const hurtBad = D.tier >= 3 && this.hp < this.maxHp * 0.3;
        if (adx > this.pref[1] || (!onScreen && !D.longRange)) want = this.facing;
        else if (adx < this.pref[0] || (hurtBad && adx < this.pref[1])) want = -this.facing;
        else want = this.strafe * 0.6;
        if (D.dumb && Math.random() < dt * 0.25) { this.trip = 1.1; this.speak(Math.random() < 0.5 ? 'Ow, my foot!' : 'Whoops!'); this.vy = -200; }
        if (D.dumb && Math.random() < dt * 0.4) want = -want; // confused
        // aiming
        const flight = dist / D.bspeed;
        const lead = D.lead || 0;
        let ax = tx + P.vx * flight * lead, ay = ty + (P.onGround ? 0 : P.vy * flight * lead * 0.5);
        if (D.proj === 'rock') ay -= dist * dist * 0.0006;
        const ta = Math.atan2(ay - eye.y, ax - eye.x);
        let da = ta - this.aim; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
        const turn = (D.tier >= 6 ? 6 : D.tier >= 4 ? 5 : 3) * dt;
        this.aim += clamp(da, -turn, turn);
        // grenades flush you out from behind cover
        if (D.grenades) {
          this.nadeT -= dt;
          if (this.nadeT <= 0 && adx > 220 && adx < 760 && onScreen && (this.sees || this.siege)) { this.nadeT = rand(11, 17); this.throwGrenade(tx, P.y - 10); }
        }
        if (canShoot) {
          this.react -= dt;
          if (this.react <= 0) this.tryFire(dt * slow, dist);
        } else { if (this.spin > 0) this.spin = Math.max(0, this.spin - dt); this.teleT = 0; }
      } else if (this.hunt && !P.dead) {
        // hunters march toward the player even without line of sight
        want = Math.sign(P.x - this.x) * 0.8;
        this.facing = Math.sign(want) || this.facing;
        this.aim += ((this.facing > 0 ? 0.1 : Math.PI - 0.1) - this.aim) * dt * 3;
      } else {
        this.patrolT -= dt;
        if (this.patrolT <= 0) { this.patrolT = rand(1.5, 5); this.patrolDir = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? -1 : 1); }
        want = this.patrolDir * 0.45;
        if (want) this.facing = Math.sign(want);
        this.aim += ((this.facing > 0 ? 0.15 : Math.PI - 0.15) - this.aim) * dt * 3;
        // don't wander into the shop plaza while unaware
        for (const sx of T.shops) if (Math.abs(this.x + want * 40 - sx) < 160) { this.patrolDir *= -1; want = -want; break; }
      }

      // Siege: attack barricades that block the way, or base structures nearby when the player is out of sight.
      if (this.blockedBy && this.blockedBy.hp > 0) { this.siege = this.blockedBy; this.siegeT = 2; }
      if (!this.siege && !this.sees && (this.hunt || this.alert > 0)) {
        this.scanT = (this.scanT || 0) - dt;
        if (this.scanT <= 0) { this.scanT = 0.6; this.siege = Z.stackRoot(Z.nearestStructure(this.x, 420, true)); if (this.siege) this.siegeT = 3; }
      }
      if (this.siege) {
        const s = this.siege; this.siegeT -= dt;
        if (s.hp <= 0 || this.siegeT <= 0) this.siege = null;
        else {
          const sx = s.x, sy = s.top + s.h * 0.45, adx = Math.abs(sx - this.x);
          if (!this.sees) {
            this.facing = sx >= this.x ? 1 : -1;
            const ta = Math.atan2(sy - eye.y, sx - eye.x);
            let da = ta - this.aim; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
            this.aim += clamp(da, -5 * dt, 5 * dt);
            if (adx > 160 && !D.dumb) want = this.facing * 0.5; else if (adx < 40 + s.w / 2) want = 0;
            this.react -= dt;
            if (this.react <= 0 && Math.abs(sx - G().cam.x) < g.viewW / 2 + 200) this.tryFire(dt * slow, adx);
          }
          // punch / kick whatever is right in front of us
          if (adx < s.w / 2 + 26 * this.s && s.base > this.y - 90 * this.s && s.top < this.y + 10) Z.damageStructure(s, (3 + D.tier * 3) * dt, this.x);
          // hop over low cover
          this.hopT -= dt;
          const climb = this.y - s.top;
          if (s.def.solid && climb > 0 && climb <= 75 && this.onGround && this.hopT <= 0 && adx < s.w / 2 + 40) { this.hopT = 1.5; if (Math.random() < 0.6) { this.vy = -Math.sqrt(2 * GRAV * (climb + 18)); this.onGround = false; this.vx = this.facing * D.speed; } }
        }
      }

      const spd = D.speed * slow * (this.def.proj === 'rocket' && this.burstLeft === 0 ? 0.6 : 1);
      const target = want * spd;
      this.vx += (target - this.vx) * Math.min(1, dt * 8);
      // jump over walls
      const ahead = T.heightAt(this.x + Math.sign(want || this.facing) * 22 * this.s);
      if (this.onGround && want && this.y - ahead > this.stepMax - 4) { this.vy = -760; this.onGround = false; }
      else if (!this.onGround && want && this.terrainWall && !this.blockedBy && this.vy > -100 && !this.siege && Math.random() < dt * 4) this.vy = -700; // scramble up crater walls
      moveBody(this, dt, T);
      if (want && Math.abs(this.x - this.lastX) < 0.5) { this.stuckT += dt; if (this.stuckT > 1) { this.patrolDir *= -1; this.stuckT = 0; this.strafe *= -1; this.stuckPitT += 1; } } else { this.stuckT = 0; this.stuckPitT = Math.max(0, this.stuckPitT - dt * 0.2); }
      // hopelessly stuck somewhere off-screen: quietly leave the battlefield
      if (this.stuckPitT > 5 && Math.abs(this.x - g.cam.x) > g.viewW / 2 + 200) { this.dead = true; this.deadT = 99; this.vanished = true; }
      this.lastX = this.x;
      if (this.onGround && Math.abs(this.vx) > 10) this.walk += dt * Math.abs(this.vx) / 22; else this.walk *= 0.85;
    }

    throwGrenade(tx, ty) {
      const g = G();
      const hand = Z.handPos(this.x, this.y, this.s, this.facing, this.aim, this.def.build);
      const t = 0.95, gr = 1500;
      const vx = (tx - hand.x) / t * rand(0.85, 1.1), vy = (ty - hand.y - 0.5 * gr * t * t) / t;
      g.bullets.push({ x: hand.x, y: hand.y - 6, vx, vy, owner: 'e', dmg: 34 * (1 + Math.max(0, g.threat - 4) * 0.05), life: 1.7, kind: 'grenade', radius: 110, g: gr, bounces: 2, color: '#ffd27a', src: this.def.name + "'s grenade" });
      this.speak(Math.random() < 0.5 ? 'Grenade!' : 'Fire in the hole!');
      Z.audio.sfxAt('swing', this.x, 0.6);
    }

    tryFire(dt, dist) {
      const D = this.def;
      if (D.spin) { this.spin = Math.min(1, this.spin + dt / D.spin); if (this.spin < 1) return; }
      if (D.aimLaser && this.aimLaserT < D.aimLaser) { this.aimLaserT += dt; return; }
      if (this.burstLeft <= 0) {
        this.pauseT -= dt;
        if (this.pauseT <= 0) {
          // heavies show a laser sight briefly before every burst, so you get a moment to react
          if (D.telegraph && this.teleT < D.telegraph) { this.teleT += dt; return; }
          this.teleT = 0;
          this.burstLeft = D.burst[0] + Math.floor(rand(0, D.burst[0] * 0.4)); this.pauseT = D.burst[1] * rand(0.8, 1.3); this.shotT = 0;
        }
        return;
      }
      this.shotT -= dt;
      let n = 0;
      while (this.shotT <= 0 && this.burstLeft > 0 && n < 3) {
        this.shotT += 1 / D.rate;
        this.burstLeft--; n++;
        if (D.aimLaser) this.aimLaserT = 0;
        Z.enemyFire(this, dist);
      }
    }

    draw(ctx, t) {
      const D = this.def;
      const alpha = this.dead ? Math.max(0, 1 - Math.max(0, this.deadT - 2.5)) : 1;
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      Z.drawHuman(ctx, {
        x: this.x, y: this.y, s: this.s, facing: this.facing, aim: this.aim, walk: this.walk, build: D.build, t,
        colors: D.colors, weapon: this.weapon, weaponScale: 0.62, flash: this.flash, dead: this.dead || this.trip > 0, deadT: this.dead ? this.deadT : 0.4,
        helmet: D.helmet, vest: D.vest, hat: D.hat, headgear: D.headgear, dumb: D.dumb, mouth: D.dumb,
        filter: this.freezeT > 0 ? 'saturate(0.35) brightness(1.3) hue-rotate(165deg)' : null
      });
      ctx.globalAlpha = 1;
      if (this.dead) return;
      const hb = this.hitbox();
      if (this.trip > 0) { ctx.fillStyle = '#ffd84d'; ctx.font = '700 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★ ✦ ★', this.x, this.y - 30 - Math.sin(t * 8) * 3); ctx.textAlign = 'left'; }
      if (D.dumb && !this.weapon) { // rock in hand
        const hp = Z.handPos(this.x, this.y, this.s, this.facing, this.aim, D.build);
        ctx.fillStyle = '#7d7a72'; ctx.beginPath(); ctx.arc(hp.x, hp.y, 5, 0, 7); ctx.fill();
      }
      if (this.freezeT > 0) { // ice crystals
        ctx.fillStyle = 'rgba(200,245,255,0.75)';
        for (let i = 0; i < 4; i++) { const cx = hb.x + hb.w * ((i * 0.37 + 0.1) % 1), cy = hb.y + hb.h * ((i * 0.53 + 0.2) % 1); ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 3, cy); ctx.fill(); }
      }
      if (this.shockT > 0) { // crackling arcs
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(170,220,255,0.9)'; ctx.lineWidth = 1.6;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath(); let px = hb.x + Math.random() * hb.w, py = hb.y + Math.random() * hb.h; ctx.moveTo(px, py);
          for (let j = 0; j < 4; j++) { px += rand(-10, 10); py += rand(-10, 10); ctx.lineTo(px, py); }
          ctx.stroke();
        }
        ctx.restore();
      }
      // laser telegraphs: snipers before each shot, heavies before each burst
      const tele = (D.aimLaser && this.sees && this.aimLaserT > 0) ? 0.25 + 0.6 * this.aimLaserT / D.aimLaser : (D.telegraph && this.teleT > 0) ? 0.3 + 0.6 * this.teleT / D.telegraph : 0;
      if (tele) {
        const hp = Z.handPos(this.x, this.y, this.s, this.facing, this.aim, D.build);
        const len = G().terrain.raycast(hp.x, hp.y, Math.cos(this.aim), Math.sin(this.aim), 2000);
        ctx.strokeStyle = 'rgba(255,30,40,' + tele + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(hp.x + Math.cos(this.aim) * len, hp.y + Math.sin(this.aim) * len); ctx.stroke();
      }
      if (this.alert > 0 && this.react > 0 && this.sees) { ctx.fillStyle = '#ff3a3a'; ctx.font = '800 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', this.x, hb.y - 22); ctx.textAlign = 'left'; }
    }
    // health bar + nameplate + speech, drawn after every body (nameplates skip themselves if they'd overlap)
    drawOverlay(ctx) {
      const D = this.def;
      if (this.dead) return;
      const hb = this.hitbox();
      if (this.hp < this.maxHp || D.tier >= 6) {
        const w = Math.max(36, hb.w + 14);
        const y = hb.y - 14;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(this.x - w / 2 - 1, y - 1, w + 2, 6);
        ctx.fillStyle = D.tier >= 6 ? '#ff9b1f' : '#e33';
        ctx.fillRect(this.x - w / 2, y, w * Math.max(0, this.hp / this.maxHp), 4);
        if (D.tier >= 6) {
          const rects = G().labelRects || (G().labelRects = []);
          const r = { x: this.x - 46, y: y - 16, w: 92, h: 14 };
          if (!rects.some(o => o.x < r.x + r.w && r.x < o.x + o.w && o.y < r.y + r.h && r.y < o.y + o.h)) {
            rects.push(r);
            ctx.font = '400 12px "Russo One", sans-serif'; ctx.textAlign = 'center';
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(D.name, this.x, y - 5);
            ctx.fillStyle = '#fff'; ctx.fillText(D.name, this.x, y - 5); ctx.textAlign = 'left';
          }
        }
      }
      if (this.sayT > 0 && this.say) Z.drawBubble(ctx, this.x, hb.y - 30, this.say, Math.min(1, this.sayT * 2));
    }
  }
  Z.Enemy = Enemy;

  Z.drawBubble = function (ctx, x, y, str, a) {
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = '600 13px "Space Grotesk", sans-serif';
    const w = ctx.measureText(str).width + 16;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 26, w, 22, 8); else ctx.rect(x - w / 2, y - 26, w, 22); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 5, y - 4); ctx.lineTo(x + 5, y - 4); ctx.lineTo(x, y + 4); ctx.fill();
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.fillText(str, x, y - 10); ctx.textAlign = 'left';
    ctx.restore();
  };

  // ---- Firing ----------------------------------------------------------------------
  Z.fire = function (p, w, isPlayer) {
    const g = G();
    const hand = Z.handPos(p.x, p.y, 1, p.facing, p.aim, 'normal');
    const mz = Z.muzzlePos(hand, w, 0.62);
    // never shoot from inside terrain (muzzle poking through a hill)
    if (g.terrain.solid(mz.x, mz.y)) { mz.x = hand.x; mz.y = hand.y; }
    const spreadMul = (1 + p.bloom * 2.5 + (p.onGround ? 0 : 0.5)) * (p.aiming ? 0.5 : 1);
    const base = p.aim;
    // recoil: spread blooms during sustained fire and the barrel climbs; ADS keeps it tighter
    const rec = w.recoil * (p.aiming ? 0.6 : 1);
    p.bloom = Math.min(1, p.bloom + rec * 1.6);
    p.climb = Math.min(0.32, p.climb + rec * (w.kind === 'melee' ? 0 : 0.22));
    g.shake(w.recoil * 14 + (w.kind === 'rail' ? 6 : 0) + (w.cat === 'Miniguns' ? 1.2 : 0));
    g.kick = Math.min(16, g.kick + w.recoil * 12);
    g.camKick.x -= Math.cos(base) * w.recoil * 26; g.camKick.y -= Math.sin(base) * w.recoil * 26;
    Z.audio.sfx(w.sound, 1);
    g.stats.shots++;
    const pellets = w.pellets || 1;
    const col = w.color || '#ffd27a';
    if (w.kind === 'laser' || w.kind === 'rail') {
      for (let i = 0; i < pellets; i++) Z.hitscan(mz.x, mz.y, base + gauss() * w.spread * spreadMul, w, 'p');
      fx.muzzle(mz.x, mz.y, base, col, 0.8);
      return;
    }
    if (w.kind === 'tesla') { Z.tesla(mz.x, mz.y, base, w); fx.muzzle(mz.x, mz.y, base, col, 0.8); return; }
    for (let i = 0; i < pellets; i++) {
      const a = base + gauss() * w.spread * spreadMul * (w.pellets ? 0.55 : 1);
      const sp = w.speed * (w.pellets ? rand(0.85, 1.1) : 1);
      const b = { x: mz.x, y: mz.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: 'p', dmg: w.dmg, life: w.range / Math.max(1, sp), kind: 'b', pierce: w.pierce || 0, hit: null, color: col, w };
      if (w.kind === 'rocket') { b.kind = 'rocket'; b.radius = w.radius; b.homing = w.homing; b.cluster = w.cluster; b.life = 4; b.g = 120; b.vx *= 0.6; b.vy *= 0.6; b.acc = 1800; }
      else if (w.kind === 'grenade') { b.kind = 'grenade'; b.radius = w.radius; b.g = 1500; b.life = w.fuse || 2.2; b.bounces = 2; }
      else if (w.kind === 'plasma') { b.kind = 'plasma'; b.radius = w.radius; }
      else if (w.kind === 'flame') { b.kind = 'flame'; b.burn = w.burn; b.freeze = w.freeze; b.g = -200; b.life = w.range / sp * rand(0.8, 1.1); }
      if (w.freeze) b.freeze = 1;
      g.bullets.push(b);
    }
    if (w.kind === 'flame') { if (Math.random() < 0.5) fx.fire(mz.x, mz.y, 1, 6); }
    else {
      fx.muzzle(mz.x, mz.y, base, w.kind === 'plasma' ? col : '#ffd27a', w.cat === 'Shotguns' || w.cat === 'Snipers' ? 1.4 : w.cat === 'Explosives' ? 1.5 : 1);
      if (w.kind === 'bullet' || w.kind === 'b') fx.shell(hand.x, hand.y - 4, p.facing, w.cat === 'Snipers' || w.cat === 'Heavy');
      if (w.kind === 'rocket' || w.kind === 'grenade') fx.smoke(mz.x, mz.y, 5, 10, '200,200,200', -10);
    }
  };

  Z.enemyFire = function (e, dist) {
    const g = G(), D = e.def;
    const hand = Z.handPos(e.x, e.y, e.s, e.facing, e.aim, D.build);
    const mz = e.weapon ? Z.muzzlePos(hand, e.weapon, 0.62 * e.s) : hand;
    if (g.terrain.solid(mz.x, mz.y)) return;
    // a muzzle poking through a wall the enemy is pressed against still hits the wall, not you
    const blocker = Z.segmentStructure(e.x, e.y - 45 * e.s, mz.x, mz.y, true);
    if (blocker) { Z.damageStructure(blocker, D.dmg * (D.proj === 'rocket' ? 3 : 1), e.x); fx.muzzle(mz.x, mz.y, e.aim, '#ffd27a', 0.8); if (e.weapon) Z.audio.sfxAt(e.weapon.sound, e.x, 0.7); return; }
    // aim error: moving and jumping targets are much harder to hit, even for elites
    const P = g.player;
    const err = D.err * (1 + Math.min(1.5, Math.abs(P.vx) / 400) * 0.8 + (P.onGround ? 0 : 0.35));
    const a = e.aim + gauss() * err;
    const src = D.name + (e.weapon ? ' (' + e.weapon.name + ')' : '');
    const dmg = D.dmg * (1 + Math.max(0, g.threat - 5) * 0.035);
    if (D.proj === 'rock') {
      g.bullets.push({ x: hand.x, y: hand.y, vx: Math.cos(a) * D.bspeed, vy: Math.sin(a) * D.bspeed, owner: 'e', dmg, life: 3, kind: 'rock', g: 900, color: '#7d7a72', src: "a Dimwit's rock" });
      Z.audio.sfxAt('swing', e.x, 0.6);
      if (Math.random() < 0.15) e.speak('Take THAT!');
      return;
    }
    if (D.proj === 'rocket') {
      g.bullets.push({ x: mz.x, y: mz.y, vx: Math.cos(a) * D.bspeed * 0.6, vy: Math.sin(a) * D.bspeed * 0.6, owner: 'e', dmg, life: 4, kind: 'rocket', radius: 110, g: 60, acc: 900, color: '#ff9b1f', src });
      Z.audio.sfxAt('rocket', e.x); fx.muzzle(mz.x, mz.y, a, '#ffd27a', 1.4); fx.smoke(mz.x, mz.y, 4, 10, '200,200,200', -10);
      return;
    }
    g.bullets.push({ x: mz.x, y: mz.y, vx: Math.cos(a) * D.bspeed, vy: Math.sin(a) * D.bspeed, owner: 'e', dmg, life: 1.6, kind: 'b', color: '#ff7a5a', src });
    fx.muzzle(mz.x, mz.y, a, '#ffd27a', D.tier >= 6 ? 1.1 : 0.8);
    if (e.weapon) Z.audio.sfxAt(e.weapon.sound, e.x, 0.75);
  };

  Z.hitscan = function (x, y, a, w, owner) {
    const g = G(), T = g.terrain;
    const dx = Math.cos(a), dy = Math.sin(a);
    const max = T.raycast(x, y, dx, dy, w.range);
    let end = max;
    const hits = [];
    for (const e of g.enemies) {
      if (e.dead) continue;
      const hb = e.hitbox();
      // slab test ray vs rect
      let t0 = 0, t1 = end;
      for (const [o, d, mn, mx] of [[x, dx, hb.x, hb.x + hb.w], [y, dy, hb.y, hb.y + hb.h]]) {
        if (Math.abs(d) < 1e-6) { if (o < mn || o > mx) { t0 = 1; t1 = 0; } continue; }
        let ta = (mn - o) / d, tb = (mx - o) / d; if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      }
      if (t0 <= t1) hits.push({ e, t: t0, hb });
    }
    hits.sort((p, q) => p.t - q.t);
    const pierce = w.kind === 'rail' ? 99 : 0;
    for (let i = 0; i < hits.length && i <= pierce; i++) {
      const h = hits[i], hy = y + dy * h.t;
      const head = hy < h.hb.y + h.hb.h * 0.22;
      h.e.hurt(w.dmg, dx * 160, head, w);
      if (w.freeze) h.e.freezeT = 2.5;
      if (w.burn) h.e.burnT = Math.max(h.e.burnT, w.burn);
      fx.spark(x + dx * h.t, hy, a + Math.PI, 1.4, 6, w.color, 350);
      if (!pierce) end = h.t;
    }
    if (end >= max - 1 && max < w.range) { // hit terrain
      fx.spark(x + dx * end, y + dy * end, a + Math.PI, 1.6, 6, w.color, 300);
      if (w.kind === 'rail') { T.carve(x + dx * end, y + dy * end, 26); fx.debris(x + dx * end, y + dy * end, 6, Z.BIOMES[T.biomeAt(x + dx * end)].dirt); }
    }
    g.beams.push({ x1: x, y1: y, x2: x + dx * end, y2: y + dy * end, color: w.color, life: w.kind === 'rail' ? 0.35 : 0.07, max: w.kind === 'rail' ? 0.35 : 0.07, width: w.kind === 'rail' ? 7 : 3.2 });
    g.lights.push({ x: x + dx * end, y: y + dy * end, r: 90, color: '255,120,140', life: 0.08, max: 0.08 });
  };

  Z.tesla = function (x, y, a, w) {
    const g = G();
    let best = null, bd = 1e9;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const ex = e.x, ey = e.y - 36 * e.s, d = Math.hypot(ex - x, ey - y);
      let da = Math.atan2(ey - y, ex - x) - a; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
      if (d < w.range && Math.abs(da) < 0.6 && d < bd && g.terrain.raycast(x, y, (ex - x) / d, (ey - y) / d, d) >= d - 8) { bd = d; best = e; }
    }
    if (!best) { // zap into the air
      const ex = x + Math.cos(a) * w.range * 0.6, ey = y + Math.sin(a) * w.range * 0.6;
      Z.lightning(x, y, ex, ey, w.color, 2); return;
    }
    let cur = best, px = x, py = y; const hit = new Set();
    for (let k = 0; k < 4 && cur; k++) {
      hit.add(cur);
      const ex = cur.x, ey = cur.y - 36 * cur.s;
      Z.lightning(px, py, ex, ey, w.color, 2.5);
      cur.hurt(w.dmg * (1 - k * 0.15), Math.sign(ex - px) * 120, false, w);
      cur.shockT = 0.45; cur.vx *= 0.3;
      px = ex; py = ey;
      let nxt = null, nd = 260;
      for (const e of g.enemies) { if (e.dead || hit.has(e)) continue; const d = Math.hypot(e.x - px, e.y - 36 * e.s - py); if (d < nd) { nd = d; nxt = e; } }
      cur = nxt;
    }
  };

  Z.lightning = function (x1, y1, x2, y2, color, width) {
    const pts = [[x1, y1]];
    const n = Math.max(4, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 28));
    for (let i = 1; i < n; i++) { const t = i / n; pts.push([x1 + (x2 - x1) * t + rand(-14, 14), y1 + (y2 - y1) * t + rand(-14, 14)]); }
    pts.push([x2, y2]);
    G().beams.push({ pts, color, life: 0.14, max: 0.14, width: width || 2.5 });
    G().lights.push({ x: x2, y: y2, r: 120, color: '170,210,255', life: 0.12, max: 0.12 });
  };

  // owner: 'p' player weapon (30% self-damage), 'e' enemy, 'trap' / 'turret' (never hurt the player)
  Z.explode = function (x, y, r, dmg, owner, w, src) {
    const g = G(), T = g.terrain;
    const removed = T.carve(x, y, r * 0.5);
    fx.ring(x, y, r * 1.1, '255,220,160', 0.35);
    const q = g.quality;
    for (let i = 0; i < (q ? 26 : 10); i++) {
      const a = rand(0, 6.283), s = rand(50, 420) * r / 140;
      fx.add({ t: 'fire', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.3, 0.7), size: rand(14, 30) * r / 140, grow: 20, g: -100, drag: 3, add: true });
    }
    // billowing smoke that hangs around, plus glowing embers
    for (let i = 0; i < (q ? 12 : 5); i++) fx.add({ t: 'smoke', x: x + rand(-r * 0.3, r * 0.3), y: y + rand(-r * 0.25, r * 0.1), vx: rand(-45, 45), vy: rand(-90, -25), life: rand(1.6, 3.4), size: rand(18, 30) * r / 140, grow: 16, color: i % 3 ? '58,52,48' : '92,84,76', g: -10, drag: 0.9 });
    for (let i = 0; i < (q ? 16 : 6); i++) { const a = -Math.PI / 2 + rand(-1.4, 1.4), sp = rand(150, 520); fx.add({ t: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.8, 1.8), size: rand(1.4, 2.6), color: '#ffb347', g: 500, drag: 0.8, add: true }); }
    fx.debris(x, y, q ? 14 + Math.min(20, removed / 400) : 6, Z.BIOMES[T.biomeAt(x)].dirt);
    fx.spark(x, y, -Math.PI / 2, 6.28, 20, '#ffd27a', 900);
    g.lights.push({ x, y, r: r * 3, color: '255,170,80', life: 0.25, max: 0.25 });
    g.shake(Math.min(30, 8 + r / 10) * (g.volAt(x) > 0.3 ? 1 : 0.4));
    Z.audio.sfxAt('explosion', x);
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - 36 * e.s - y);
      if (d < r) { const f = 1 - d / r * 0.7; e.hurt(dmg * f * (owner === 'e' ? 0.3 : 1), Math.sign(e.x - x) * 600 * f, false, w || { name: owner === 'trap' ? 'Landmine' : 'Explosion' }); e.vy -= 500 * f; }
    }
    const P = g.player;
    const d = Math.hypot(P.x - x, P.y - 36 - y);
    if (d < r && !P.dead && owner !== 'trap' && owner !== 'turret') {
      const f = 1 - d / r * 0.7;
      P.hurt(dmg * f * (owner === 'p' ? 0.3 : 1), x, false, true, owner === 'p' ? 'your own explosion' : src || 'an explosion');
      P.vx += Math.sign(P.x - x) * 500 * f; P.vy -= 500 * f; P.onGround = false;
    }
    for (const pk of g.pickups) { const dd = Math.hypot(pk.x - x, pk.y - y); if (dd < r) { pk.vy -= 400; pk.vx += Math.sign(pk.x - x) * 200; pk.ground = false; } }
    for (const s of g.structures) {
      const ex = Math.max(0, Math.abs(x - s.x) - s.w / 2), ey = y < s.top ? s.top - y : y > s.base ? y - s.base : 0;
      const dd = Math.hypot(ex, ey);
      if (dd < r) Z.damageStructure(s, dmg * (1 - dd / r * 0.6) * (owner === 'e' ? 1 : 0.12), x);
    }
    if (w && w.cluster && !w.isBomblet) {
      const bw = { name: w.name, isBomblet: true };
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + rand(-1, 1), sp = rand(350, 650);
        g.bullets.push({ x, y: y - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner, dmg: dmg * 0.35, life: rand(0.7, 1.1), kind: 'grenade', radius: r * 0.5, g: 1500, bounces: 1, color: '#ffd27a', w: bw });
      }
    }
  };

  // ---- Projectile update -----------------------------------------------------------
  Z.updateBullets = function (dt) {
    const g = G(), T = g.terrain, P = g.player;
    const out = [];
    for (const b of g.bullets) {
      b.life -= dt;
      if (b.life <= 0) {
        if (b.kind === 'rocket' || b.kind === 'grenade') Z.explode(b.x, b.y, b.radius, b.dmg, b.owner, b.w, b.src);
        continue;
      }
      if (b.homing) {
        let best = b.target && !b.target.dead ? b.target : null, bd = 1e9;
        // turret rockets chase the turret's own target; player rockets the enemy nearest your crosshair
        if (!best) for (const e of g.enemies) { if (e.dead) continue; const d = b.owner === 'turret' ? Math.hypot(e.x - b.x, e.y - b.y) : Math.hypot(e.x - g.mouse.wx, e.y - g.mouse.wy) + Math.hypot(e.x - b.x, e.y - b.y) * 0.3; if (d < bd) { bd = d; best = e; } }
        if (best) {
          const ta = Math.atan2(best.y - 40 * best.s - b.y, best.x - b.x), ca = Math.atan2(b.vy, b.vx);
          let da = ta - ca; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
          const sp = Math.hypot(b.vx, b.vy), na = ca + clamp(da, -4 * dt, 4 * dt);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      if (b.acc) { const sp = Math.hypot(b.vx, b.vy); const ns = Math.min(sp + b.acc * dt, 1800); b.vx *= ns / sp; b.vy *= ns / sp; }
      if (b.g) b.vy += b.g * dt;
      if (b.kind === 'flame') { b.vx *= 1 - dt * 1.5; b.vy *= 1 - dt * 1.5; }
      const sp = Math.hypot(b.vx, b.vy) * dt;
      const steps = Math.max(1, Math.ceil(sp / 10));
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        const px = b.x, py = b.y;
        b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
        // terrain
        if (T.solid(b.x, b.y)) {
          if (b.kind === 'grenade' && b.bounces > 0) {
            b.bounces--; b.x = px; b.y = py;
            const sl = T.slope(b.x); const nx = -sl, ny = -1, nl = Math.hypot(nx, ny);
            const dot = (b.vx * nx + b.vy * ny) / nl;
            b.vx = (b.vx - 2 * dot * nx / nl) * 0.5; b.vy = (b.vy - 2 * dot * ny / nl) * 0.5;
            Z.audio.sfxAt('dirt', b.x); break;
          }
          if (b.kind === 'rocket' || b.kind === 'grenade') { Z.explode(px, py, b.radius, b.dmg, b.owner, b.w, b.src); dead = true; break; }
          if (b.kind === 'plasma') { Z.splash(px, py, b); dead = true; break; }
          if (b.kind === 'flame') { if (Math.random() < 0.3) fx.fire(px, py, 1, 6); T.burnAt(px, 4); dead = true; break; }
          const B = Z.BIOMES[T.biomeAt(b.x)];
          fx.spark(px, py, Math.atan2(-b.vy, -b.vx), 1.2, 3, '#ffd27a', 300);
          fx.add({ t: 'smoke', x: px, y: py, vx: 0, vy: -30, life: 0.5, size: 4, grow: 14, color: '150,130,110', g: 0, drag: 1 });
          if (Math.random() < 0.5) fx.debris(px, py, 2, B.dirt);
          if (Math.random() < 0.3) Z.audio.sfxAt('ricochet', b.x, 0.5);
          dead = true; break;
        }
        // entities
        if (b.owner === 'p' || b.owner === 'turret') {
          for (const e of g.enemies) {
            if (e.dead || (b.hit && b.hit.has(e))) continue;
            const hb = e.hitbox();
            if (b.x > hb.x && b.x < hb.x + hb.w && b.y > hb.y && b.y < hb.y + hb.h) {
              if (b.kind === 'rocket' || b.kind === 'grenade') { Z.explode(b.x, b.y, b.radius, b.dmg, b.owner, b.w); dead = true; break; }
              if (b.kind === 'plasma') { Z.splash(b.x, b.y, b); dead = true; break; }
              const head = b.y < hb.y + hb.h * 0.22;
              e.hurt(b.dmg, Math.sign(b.vx) * (b.kind === 'flame' ? 20 : 140), head && b.kind !== 'flame', b.w);
              if (b.burn) e.burnT = Math.max(e.burnT, b.burn);
              if (b.freeze) e.freezeT = Math.max(e.freezeT, 2.5);
              if (b.kind !== 'flame') fx.blood(b.x, b.y, Math.sign(b.vx), 5);
              g.stats.hits++;
              if (b.pierce > 0) { b.pierce--; (b.hit = b.hit || new Set()).add(e); b.dmg *= 0.8; }
              else { dead = true; break; }
            }
          }
        } else {
          const st = Z.structureAt(b.x, b.y);
          if (st) {
            if (b.kind === 'rocket' || b.kind === 'grenade') Z.explode(px, py, b.radius, b.dmg, 'e', null, b.src);
            else {
              Z.damageStructure(st, b.dmg * (b.kind === 'rock' ? 1.2 : 0.75), b.x);
              fx.spark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 1.2, 4, st.def.shield ? '#7fe8ff' : '#ffd27a', 300);
              Z.audio.sfxAt(Z.structureMaterial(st), b.x, 0.6);
            }
            dead = true; break;
          }
          if (P.dead) continue;
          const hb = P.hitbox();
          if (b.x > hb.x && b.x < hb.x + hb.w && b.y > hb.y && b.y < hb.y + hb.h) {
            if (b.kind === 'rocket' || b.kind === 'grenade') Z.explode(b.x, b.y, b.radius, b.dmg, 'e', null, b.src);
            else P.hurt(b.dmg, b.x - b.vx * 0.05, b.y < hb.y + 15, false, b.src);
            dead = true;
          } else if (!b.whiz && b.kind === 'b' && Math.abs(b.x - P.x) < 46 && Math.abs(b.y - (P.y - 36)) < 54) { b.whiz = true; Z.audio.sfx('whiz', 0.9, { pan: Math.sign(b.vx) * 0.5 }); }
        }
      }
      if (dead) continue;
      if (b.x < -50 || b.x > T.width + 50 || b.y > T.bottom + 200 || b.y < -3000) continue;
      // trails
      if (b.kind === 'rocket' && Math.random() < 0.9) { fx.smoke(b.x, b.y, 1, 7, '190,190,190', 0); fx.fire(b.x, b.y, 1, 6); }
      if (b.kind === 'grenade' && Math.random() < 0.4) fx.smoke(b.x, b.y, 1, 4, '190,190,190', 0);
      if (b.kind === 'flame' && Math.random() < 0.7) fx.add({ t: b.freeze ? 'frost' : 'fire', x: b.x, y: b.y, vx: b.vx * 0.2, vy: b.vy * 0.2 - 40, life: 0.3, size: rand(8, 15) * (1.4 - b.life), grow: 30, g: -80, drag: 2, add: true });
      out.push(b);
    }
    g.bullets = out;
  };

  Z.splash = function (x, y, b) {
    const g = G();
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - 36 * e.s - y);
      if (d < b.radius + 20) e.hurt(b.dmg * (1 - d / (b.radius + 20) * 0.5), Math.sign(e.x - x) * 220, false, b.w);
    }
    if (b.radius > 80) { g.terrain.carve(x, y, b.radius * 0.35); g.shake(b.radius / 10); Z.audio.sfxAt('explosion', x, 0.7); }
    fx.ring(x, y, b.radius, hexToRgb(b.color), 0.3);
    fx.spark(x, y, 0, 6.28, 14, b.color, 500);
    g.lights.push({ x, y, r: b.radius * 2.5, color: hexToRgb(b.color), life: 0.2, max: 0.2 });
  };
  // pre-rendered radial glows (gradients per object per frame are expensive)
  const glowCache = new Map();
  Z.glowSprite = function (rgb, a, core) {
    const key = rgb + a + (core || '');
    let c = glowCache.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      if (core) gr.addColorStop(0, core);
      gr.addColorStop(core ? 0.3 : 0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      glowCache.set(key, c);
    }
    return c;
  };
  const flashCache = new Map();
  Z.flashSprite = function (color) {
    let c = flashCache.get(color);
    if (!c) {
      c = document.createElement('canvas'); c.width = 64; c.height = 16;
      const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 64, 0);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, color); gr.addColorStop(1, 'rgba(255,120,0,0)');
      x.fillStyle = gr; x.beginPath(); x.moveTo(0, 2); x.lineTo(64, 8); x.lineTo(0, 14); x.closePath(); x.fill();
      flashCache.set(color, c);
    }
    return c;
  };
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); }
  Z.hexToRgb = hexToRgb;

  // ---- Pickups -----------------------------------------------------------------------
  Z.cashKind = v => v >= 400 ? 'case' : v >= 120 ? 'gold' : v >= 40 ? 'wallet' : 'bill';
  Z.spawnCash = function (x, y, value, pop, life) {
    const p = { type: 'cash', kind: Z.cashKind(value), value, x, y, vx: pop ? rand(-220, 220) : 0, vy: pop ? rand(-520, -250) : 0, t: 0, ground: false, life: life || 90 };
    G().pickups.push(p);
    return p;
  };
  Z.spawnMed = function (x, y, id) {
    G().pickups.push({ type: 'med', id, x, y, vx: rand(-150, 150), vy: rand(-450, -250), t: 0, ground: false, life: 60 });
  };
  Z.spawnCrate = function (x) {
    G().pickups.push({ type: 'crate', x, y: -400, vx: 0, vy: 90, t: 0, ground: false, life: 120, chute: true, value: Math.round(rand(250, 700) * (1 + G().threat * 0.15)) });
  };

  // ground height for a pickup: the terrain, or the top of a wall it is resting on
  function pickupFloor(p, T) {
    let gy = T.heightAt(p.x);
    const sol = G().solids;
    for (let i = 0; i < sol.length; i++) { const b = sol[i]; if (Math.abs(p.x - b.x) < b.w / 2 && p.y <= b.top + 12 && b.top < gy) gy = b.top; }
    return gy - (p.type === 'crate' ? 0 : 6);
  }
  Z.updatePickups = function (dt) {
    const g = G(), T = g.terrain, P = g.player;
    const keep = [];
    // keep the pickup count bounded: the oldest dropped cash merges into its neighbour instead of piling up
    if (g.pickups.length > 220) {
      const drops = g.pickups.filter(p => p.type === 'cash' && !p.loot && !p.printer);
      for (let i = 0; i + 1 < drops.length && g.pickups.length - i > 200; i += 2) { drops[i + 1].value += drops[i].value; drops[i + 1].kind = Z.cashKind(drops[i + 1].value); drops[i].life = 0; }
    }
    for (const p of g.pickups) {
      p.t += dt; p.life -= dt;
      if (p.life <= 0) continue;
      const dx = P.x - p.x, dy = (P.y - 34) - p.y, d = Math.hypot(dx, dy);
      if (!P.dead && p.t > 0.4 && d < (p.type === 'crate' ? 60 : 150 * (1 + 0.4 * g.perk('magnet')))) { // magnet
        if (p.type !== 'crate') { p.vx += dx / d * 2600 * dt; p.vy += dy / d * 2600 * dt; p.ground = false; p.mag = true; }
      }
      if (!P.dead && p.t > 0.25 && d < (p.type === 'crate' ? 55 : 34)) { Z.collect(p); continue; }
      if (!p.ground) {
        if (p.chute) { p.vy = 110; p.vx = Math.sin(p.t) * 30; }
        else p.vy += (p.mag ? 0 : 1500) * dt;
        if (p.mag) { p.vx *= 0.9; p.vy *= 0.9; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        const gy = pickupFloor(p, T);
        if (p.y >= gy) { p.y = gy; if (Math.abs(p.vy) > 200 && !p.chute) { p.vy *= -0.3; p.vx *= 0.6; } else { p.ground = true; p.vy = 0; p.vx = 0; if (p.chute) { p.chute = false; Z.audio.sfxAt('land', p.x); fx.smoke(p.x, p.y, 6, 12, '180,160,140', -20); } } }
      } else {
        const gy = pickupFloor(p, T);
        if (gy > p.y + 2) p.ground = false; else p.y = gy;
      }
      keep.push(p);
    }
    g.pickups = keep;
  };

  Z.collect = function (p) {
    const g = G(), P = g.player;
    if (p.type === 'cash') {
      g.money += p.value; g.stats.earned += p.value;
      fx.text(p.x, p.y - 20, '+$' + p.value.toLocaleString(), '#5dff8a', p.value >= 120 ? 22 : 17);
      Z.audio.sfx(p.value >= 120 ? 'cash-big' : 'coin');
    } else if (p.type === 'med') {
      P.meds[p.id] = (P.meds[p.id] || 0) + 1;
      fx.text(p.x, p.y - 20, '+1 ' + Z.MED_BY_ID[p.id].name, '#ff8a8a', 17);
      Z.audio.sfx('pickup-med');
    } else if (p.type === 'crate') {
      g.money += p.value; g.stats.earned += p.value;
      const meds = ['gauze', 'bandage', 'first-aid', 'medkit', 'adrenaline', 'splint', 'energy-bar', 'morphine', 'combat-stim', 'blood-bag'];
      const id = meds[Math.floor(Math.random() * meds.length)];
      P.meds[id] = (P.meds[id] || 0) + 1;
      P.meds.gauze = (P.meds.gauze || 0) + 2;
      fx.text(p.x, p.y - 60, 'SUPPLY DROP: +$' + p.value + ' & ' + Z.MED_BY_ID[id].name, '#ffd84d', 22, 1.8);
      Z.audio.sfx('cash-big');
      fx.spark(p.x, p.y - 20, -Math.PI / 2, 2, 20, '#ffd84d', 500);
    }
  };

  Z.drawPickup = function (ctx, p, t) {
    const bob = p.ground ? Math.sin(t * 4 + p.x) * 2.5 : 0;
    ctx.save(); ctx.translate(p.x, p.y + bob);
    // glow
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(Z.glowSprite(p.type === 'cash' ? '90,255,140' : p.type === 'med' ? '255,90,90' : '255,216,77', 0.35), -30, -34, 60, 60);
    ctx.globalCompositeOperation = 'source-over';
    if (p.life < 5 && Math.floor(t * 8) % 2) ctx.globalAlpha = 0.4;
    if (p.type === 'cash') {
      if (p.kind === 'bill') {
        ctx.rotate(Math.sin(t * 3 + p.x) * 0.2);
        ctx.fillStyle = '#2f9e4a'; ctx.fillRect(-10, -6, 20, 11); ctx.fillStyle = '#62d27a'; ctx.fillRect(-8, -4, 16, 7);
        ctx.fillStyle = '#1f6a30'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 2.5);
      } else if (p.kind === 'wallet') {
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(-10, -9, 20, 14); ctx.fillStyle = '#7a5030'; ctx.fillRect(-10, -9, 20, 5);
        ctx.fillStyle = '#62d27a'; ctx.fillRect(-7, -12, 12, 4);
      } else if (p.kind === 'gold') {
        ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.moveTo(-12, 4); ctx.lineTo(-8, -6); ctx.lineTo(8, -6); ctx.lineTo(12, 4); ctx.fill();
        ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-6, -5); ctx.lineTo(6, -5); ctx.lineTo(8, 2); ctx.fill();
        if (Math.floor(t * 3 + p.x) % 4 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(2, -5, 2, 2); }
      } else {
        ctx.fillStyle = '#222'; ctx.fillRect(-14, -12, 28, 18); ctx.fillStyle = '#444'; ctx.fillRect(-14, -12, 28, 4);
        ctx.fillStyle = '#c9a227'; ctx.fillRect(-3, -16, 6, 4); ctx.fillRect(-10, -6, 3, 4); ctx.fillRect(7, -6, 3, 4);
      }
    } else if (p.type === 'med') {
      Z.drawMedIcon(ctx, Z.MED_BY_ID[p.id], 0, -6, 0.6);
    } else {
      if (p.chute) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-18, -30); ctx.lineTo(-40, -90); ctx.moveTo(18, -30); ctx.lineTo(40, -90); ctx.moveTo(0, -30); ctx.lineTo(0, -100); ctx.stroke();
        ctx.fillStyle = '#e04a3a'; ctx.beginPath(); ctx.ellipse(0, -96, 50, 26, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -96, 16, 26, 0, Math.PI, 0); ctx.fill();
      }
      ctx.fillStyle = '#6b4a22'; ctx.fillRect(-22, -30, 44, 30);
      ctx.strokeStyle = '#3e2a12'; ctx.lineWidth = 3; ctx.strokeRect(-22, -30, 44, 30);
      ctx.beginPath(); ctx.moveTo(-22, -30); ctx.lineTo(22, 0); ctx.moveTo(22, -30); ctx.lineTo(-22, 0); ctx.stroke();
      ctx.fillStyle = '#ffd84d'; ctx.font = 'bold 16px "Russo One", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('$', 0, -9);
    }
    ctx.restore();
  };
})();
