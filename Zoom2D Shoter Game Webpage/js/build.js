/* Zoom2D Shooter — base building: barricades, traps, turrets and utility structures. */
(function () {
  const Z = window.Z;
  const G = () => Z.game;
  const fx = () => Z.fx;
  const MAX_STRUCTURES = 80;

  class Structure {
    constructor(def, x, hpMul) {
      this.def = def; this.id = def.id; this.x = x; this.w = def.w; this.h = def.h;
      this.maxHp = Math.round(def.hp * (hpMul || 1)); this.hp = this.maxHp;
      this.flash = 0; this.aim = -Math.PI / 2; this.cd = 0.5; this.scanT = 0; this.target = null; this.t = Math.random() * 10;
      this.incomeT = def.every || 0; this.spin = 0;
      this.settle();
    }
    // rest on the lowest ground point under the footprint so nothing floats
    settle() {
      const T = G().terrain;
      const a = T.heightAt(this.x - this.w / 2), b = T.heightAt(this.x), c = T.heightAt(this.x + this.w / 2);
      this.base = Math.max(a, b, c);
      this.top = this.base - this.h;
    }
    get dead() { return this.hp <= 0; }
  }
  Z.Structure = Structure;

  Z.canPlace = function (def, x) {
    const g = G(), T = g.terrain, P = g.player;
    if (g.structures.length >= MAX_STRUCTURES) return 'Structure limit reached (' + MAX_STRUCTURES + ')';
    if (x < 80 || x > T.width - 80) return 'Out of bounds';
    if (Math.abs(x - P.x) > 750) return 'Too far from you';
    for (const sx of T.shops) if (Math.abs(x - sx) < 150 + def.w / 2) return 'Can\'t build at the shop';
    const a = T.heightAt(x - def.w / 2), b = T.heightAt(x), c = T.heightAt(x + def.w / 2);
    // a wall on a slope would be half-buried by the uphill side; require most of its height to stand clear
    if (Math.max(a, b, c) - Math.min(a, b, c) > Math.max(12, def.h * 0.4)) return 'Ground too steep';
    for (const s of g.structures) {
      const overlap = Math.abs(s.x - x) < (s.w + def.w) / 2 - 2;
      if (overlap && (s.def.solid || def.solid || s.id === def.id)) return 'Overlaps another structure';
    }
    if (def.solid) {
      const hb = P.hitbox();
      if (hb.x + hb.w > x - def.w / 2 && hb.x < x + def.w / 2) return 'You are standing there';
      for (const e of g.enemies) { if (e.dead) continue; const eb = e.hitbox(); if (eb.x + eb.w > x - def.w / 2 && eb.x < x + def.w / 2) return 'An enemy is in the way'; }
    }
    return null;
  };

  Z.placeStructure = function (id, x, hp) {
    const g = G(), def = Z.BUILD_BY_ID[id];
    if (!def) return null;
    const s = new Structure(def, x, (1 + 0.2 * g.perk('builder')) * (def.turret ? 1.6 : 1) * (1 + Math.max(0, (g.threat || 1) - 3) * 0.08));
    if (hp != null) s.hp = Math.min(s.maxHp, hp);
    g.structures.push(s);
    Z.rebuildSolids();
    return s;
  };

  Z.rebuildSolids = function () {
    const g = G();
    g.solids = g.structures.filter(s => s.def.solid && s.hp > 0);
  };

  Z.damageStructure = function (s, d, srcX) {
    if (s.hp <= 0 || d <= 0) return;
    s.hp -= d; s.flash = 0.08;
    if (s.hp <= 0) Z.destroyStructure(s);
  };

  Z.destroyStructure = function (s, quiet) {
    const g = G();
    s.hp = 0;
    g.structures = g.structures.filter(o => o !== s);
    Z.rebuildSolids();
    if (quiet) return;
    const col = { sandbags: '#a08a5a', crates: '#7a5530', 'wood-wall': '#7a5530', 'steel-wall': '#7d8590', jersey: '#9a9a96', bunker: '#8a8a86', 'blast-wall': '#aab4c0', 'energy-shield': '#7fe8ff', watchtower: '#6b4a2a' }[s.id] || '#555';
    fx().debris(s.x, s.top + s.h / 2, 18, col);
    fx().smoke(s.x, s.top + s.h / 2, 8, 16, '120,110,100', -30);
    fx().text(s.x, s.top - 20, s.def.name + ' destroyed!', '#ff7a5a', 16, 1.4);
    Z.audio.sfxAt('explosion', s.x, 0.5);
    g.shake(4);
  };

  // First structure under a point that blocks enemy fire (traps are too low to matter).
  Z.structureAt = function (x, y) {
    const list = G().structures;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.h < 40) continue;
      if (x > s.x - s.w / 2 && x < s.x + s.w / 2 && y > s.top && y < s.base + 4) return s;
    }
    return null;
  };

  Z.structureMaterial = function (s) {
    if (s.def.shield) return 'impact-shield';
    if (/wood|crate|watchtower|barbed/.test(s.id)) return 'impact-wood';
    if (/sandbag|jersey|bunker/.test(s.id)) return 'impact-concrete';
    return 'impact-metal';
  };

  // Does the segment (x1,y1)-(x2,y2) pass through a structure? (solidOnly: walls only)
  Z.segmentStructure = function (x1, y1, x2, y2, solidOnly) {
    const list = solidOnly ? G().solids : G().structures;
    if (!list.length) return null;
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.h < 40 || s.x + s.w / 2 < minX || s.x - s.w / 2 > maxX) continue;
      // Liang-Barsky clip against the structure's box
      let t0 = 0, t1 = 1;
      const dx = x2 - x1, dy = y2 - y1;
      const p = [-dx, dx, -dy, dy], q = [x1 - (s.x - s.w / 2), (s.x + s.w / 2) - x1, y1 - s.top, s.base - y1];
      let ok = true;
      for (let k = 0; k < 4; k++) {
        if (p[k] === 0) { if (q[k] < 0) { ok = false; break; } continue; }
        const r = q[k] / p[k];
        if (p[k] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
      }
      if (ok && t0 <= t1) return s;
    }
    return null;
  };

  Z.nearestStructure = function (x, range, valuableFirst) {
    let best = null, bd = range;
    for (const s of G().structures) {
      if (s.h < 40) continue;
      let d = Math.abs(s.x - x);
      if (valuableFirst && (s.def.turret || s.def.income)) d *= 0.6;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };

  Z.updateStructures = function (dt) {
    const g = G(), P = g.player;
    let changed = false;
    for (const s of g.structures) {
      s.t += dt; s.flash -= dt;
      const ob = s.base; s.settle(); if (s.base !== ob) changed = true;
      const d = s.def;
      if (d.regen && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + d.regen * dt);
      // traps
      if (d.dps || d.mine) {
        for (const e of g.enemies) {
          if (e.dead || Math.abs(e.x - s.x) > s.w / 2 + 6 || Math.abs(e.y - s.base) > 20) continue;
          if (d.mine) { s.hp = 0; Z.explode(s.x, s.base - 6, d.mine.radius, d.mine.dmg * (1 + g.threat * 0.08), 'trap', { name: 'Landmine' }); break; }
          e.dot(d.dps * dt * (1 + g.threat * 0.06), { name: d.name });
          if (d.slow) e.vx *= 1 - d.slow * dt * 8;
          if (Math.random() < dt * 8) fx().blood(e.x, e.y - 8, Math.random() < 0.5 ? -1 : 1, 1);
          Z.damageStructure(s, 4 * dt, e.x);
        }
      }
      // med station
      if (d.heal && !P.dead && Math.abs(P.x - s.x) < d.radius && Math.abs(P.y - s.base) < 200 && P.hp < P.maxHp) {
        P.hp = Math.min(P.maxHp, P.hp + d.heal * dt);
        if (Math.random() < dt * 6) fx().add({ t: 'spark', x: P.x + Z.rand(-12, 12), y: P.y - Z.rand(10, 60), vx: 0, vy: -80, life: 0.6, size: 2.2, color: '#5dff8a', g: 0, drag: 0, add: true });
      }
      // money printer
      if (d.income) {
        s.incomeT -= dt;
        if (s.incomeT <= 0) {
          s.incomeT = d.every;
          const v = Math.round(d.income * (1 + g.threat * 0.1));
          const pile = g.pickups.find(p => p.printer === s);
          if (pile) { pile.value += v; pile.kind = Z.cashKind(pile.value); pile.life = 1e9; }
          else { const p = Z.spawnCash(s.x + 30, s.top - 6, v, false, 1e9); p.printer = s; p.vx = 60; p.vy = -200; }
          Z.audio.sfxAt('coin', s.x, 0.6);
        }
      }
      if (d.turret) turretTick(s, dt);
    }
    // drop mines/destroyed things
    const before = g.structures.length;
    g.structures = g.structures.filter(s => s.hp > 0);
    if (changed || g.structures.length !== before) Z.rebuildSolids();
  };

  function turretTick(s, dt) {
    const g = G(), T = g.terrain, tu = s.def.turret;
    const px = s.x, py = s.top + 14;
    s.scanT -= dt;
    if (s.scanT <= 0) {
      s.scanT = 0.25; s.target = null;
      let bd = tu.range;
      for (const e of g.enemies) {
        if (e.dead) continue;
        const ex = e.x, ey = e.y - 36 * e.s, d = Math.hypot(ex - px, ey - py);
        if (d < bd && T.raycast(px, py, (ex - px) / d, (ey - py) / d, d) >= d - 8) { bd = d; s.target = e; }
      }
    }
    const e = s.target;
    if (!e || e.dead) { s.aim += Math.sin(s.t * 0.8) * dt * 0.6; s.spin = Math.max(0, s.spin - dt); return; }
    const ex = e.x + e.vx * 0.08, ey = e.y - 38 * e.s;
    const ta = Math.atan2(ey - py, ex - px);
    let da = ta - s.aim; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
    s.aim += Z.clamp(da, -6 * dt, 6 * dt);
    s.cd -= dt;
    if (Math.abs(da) > 0.15 || s.cd > 0) return;
    if (tu.sound === 'minigun') { s.spin = Math.min(1, s.spin + dt * 2); if (s.spin < 1) return; }
    s.cd = 1 / tu.rate;
    const w = { name: s.def.name, dmg: tu.dmg * (1 + g.perk('builder') * 0.1) * (1 + Math.max(0, g.threat - 3) * 0.06), range: tu.range, kind: tu.kind, color: tu.color || '#ffd27a', spread: tu.spread || 0 };
    const mx = px + Math.cos(s.aim) * 26, my = py + Math.sin(s.aim) * 26;
    if (tu.kind === 'laser') { Z.hitscan(mx, my, s.aim, w, 'turret'); Z.audio.sfxAt('laser', s.x, 0.6); }
    else if (tu.kind === 'tesla') { Z.tesla(px, s.top + 6, s.aim, Object.assign(w, { range: tu.range })); Z.audio.sfxAt('zap', s.x, 0.6); }
    else if (tu.kind === 'rocket') {
      const a = s.aim + Z.gauss() * w.spread;
      g.bullets.push({ x: mx, y: my, vx: Math.cos(a) * tu.speed * 0.6, vy: Math.sin(a) * tu.speed * 0.6, owner: 'turret', dmg: w.dmg, life: 4, kind: 'rocket', radius: tu.radius, homing: 1, target: e, g: 60, acc: 1400, color: '#ff9b1f', w });
      Z.audio.sfxAt('rocket', s.x, 0.7); fx().smoke(mx, my, 3, 8, '200,200,200', -10);
    } else {
      const a = s.aim + Z.gauss() * w.spread;
      g.bullets.push({ x: mx, y: my, vx: Math.cos(a) * tu.speed, vy: Math.sin(a) * tu.speed, owner: 'turret', dmg: w.dmg, life: tu.range / tu.speed, kind: 'b', pierce: 0, color: '#ffd27a', w });
      Z.audio.sfxAt(tu.sound, s.x, 0.6);
      fx().shell(px, py, Math.cos(s.aim) >= 0 ? 1 : -1, false);
    }
    fx().muzzle(mx, my, s.aim, tu.color || '#ffd27a', 0.8);
  }

  // ---- drawing -------------------------------------------------------------------------
  function hpBar(ctx, s) {
    if (s.hp >= s.maxHp || s.h < 12) return;
    const w = Math.max(40, s.w), y = s.top - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(s.x - w / 2 - 1, y - 1, w + 2, 6);
    const f = s.hp / s.maxHp;
    ctx.fillStyle = f > 0.5 ? '#5dff8a' : f > 0.25 ? '#ffd84d' : '#ff4a4a';
    ctx.fillRect(s.x - w / 2, y, w * f, 4);
  }

  Z.drawStructure = function (ctx, s, t, ghost) {
    const d = s.def, x = s.x, top = s.top, base = s.base, w = s.w, h = s.h, l = x - w / 2;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.55;
    const dmg = 1 - s.hp / s.maxHp;
    switch (d.id) {
      case 'sandbags': {
        const rows = 3, bw = 26, bh = h / rows;
        for (let r = 0; r < rows; r++) for (let i = 0; i < 3 - (r === rows - 1 ? 0 : 0); i++) {
          const ox = l + (r % 2 ? 12 : 0) + i * (w - 12) / 3 + (r % 2 ? -6 : 0);
          const by = base - (r + 1) * bh;
          ctx.fillStyle = r % 2 ? '#a3895a' : '#b39a66';
          ctx.beginPath(); ctx.ellipse(ox + bw / 2, by + bh / 2, bw / 2 + 2, bh / 2 + 1, 0, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(ox + 3, by + bh - 4, bw - 6, 2);
        }
        break;
      }
      case 'crates': {
        const c = (cx, cy, sz) => {
          ctx.fillStyle = '#8a5f30'; ctx.fillRect(cx, cy, sz, sz);
          ctx.strokeStyle = '#4a3014'; ctx.lineWidth = 3; ctx.strokeRect(cx + 1.5, cy + 1.5, sz - 3, sz - 3);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sz, cy + sz); ctx.stroke();
        };
        c(l, base - 34, 34); c(l + 30, base - 30, 30); c(l + 12, base - 64, 30);
        break;
      }
      case 'wood-wall': case 'steel-wall': case 'bunker': case 'blast-wall': {
        const col = { 'wood-wall': ['#8a5f30', '#6b4522'], 'steel-wall': ['#7d8590', '#5b616b'], bunker: ['#8f8f8a', '#6e6e6a'], 'blast-wall': ['#aab4c0', '#7f8a96'] }[d.id];
        const g = ctx.createLinearGradient(l, 0, l + w, 0);
        g.addColorStop(0, col[1]); g.addColorStop(0.5, col[0]); g.addColorStop(1, col[1]);
        ctx.fillStyle = g; ctx.fillRect(l, top, w, h + 6);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        if (d.id === 'wood-wall') { for (let y = top + 18; y < base; y += 22) ctx.fillRect(l, y, w, 2); ctx.fillStyle = '#5a3a1a'; ctx.fillRect(l - 4, top + 20, w + 8, 6); ctx.fillRect(l - 4, base - 30, w + 8, 6); }
        else { for (let y = top + 10; y < base; y += 26) { ctx.beginPath(); ctx.arc(l + 5, y, 2, 0, 7); ctx.arc(l + w - 5, y, 2, 0, 7); ctx.fill(); } ctx.fillRect(l, top, w, 4); }
        if (d.id === 'blast-wall') { ctx.fillStyle = '#ffd84d'; for (let y = top + 6; y < top + 26; y += 10) ctx.fillRect(l, y, w, 4); }
        break;
      }
      case 'jersey': {
        ctx.fillStyle = '#a7a7a2';
        ctx.beginPath(); ctx.moveTo(l, base + 4); ctx.lineTo(l + 10, base - 24); ctx.lineTo(l + 26, top); ctx.lineTo(l + w - 26, top); ctx.lineTo(l + w - 10, base - 24); ctx.lineTo(l + w, base + 4); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(l + 26, top, w - 52, 6);
        ctx.fillStyle = '#e04a3a'; ctx.fillRect(l + 30, top + 22, w - 60, 8);
        break;
      }
      case 'watchtower': {
        ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(l + 8, base + 4); ctx.lineTo(l + 16, top + 10); ctx.moveTo(l + w - 8, base + 4); ctx.lineTo(l + w - 16, top + 10); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath();
        for (let y = top + 40; y < base; y += 40) { ctx.moveTo(l + 12, y); ctx.lineTo(l + w - 12, y + 30); ctx.moveTo(l + w - 12, y); ctx.lineTo(l + 12, y + 30); }
        ctx.stroke();
        ctx.fillStyle = '#7a5530'; ctx.fillRect(l, top, w, 12);
        ctx.fillStyle = '#5a3a1a'; ctx.fillRect(l, top - 26, 6, 26); ctx.fillRect(l + w - 6, top - 26, 6, 26); ctx.fillRect(l, top - 28, w, 5);
        break;
      }
      case 'barbed': {
        ctx.strokeStyle = '#555'; ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) { const px = l + 6 + i * (w - 12) / 3; ctx.beginPath(); ctx.moveTo(px, base + 2); ctx.lineTo(px, top); ctx.stroke(); }
        ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 1.5;
        for (let k = 0; k < 2; k++) { ctx.beginPath(); for (let px = l; px <= l + w; px += 3) { const yy = top + 8 + k * 12 + Math.sin(px * 0.5) * 5; px === l ? ctx.moveTo(px, yy) : ctx.lineTo(px, yy); } ctx.stroke(); }
        break;
      }
      case 'spikes': {
        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(l, base - 4, w, 5);
        ctx.fillStyle = '#c9ced6';
        for (let px = l + 2; px < l + w - 4; px += 8) { ctx.beginPath(); ctx.moveTo(px, base - 3); ctx.lineTo(px + 3, top); ctx.lineTo(px + 6, base - 3); ctx.fill(); }
        break;
      }
      case 'mine': {
        ctx.fillStyle = '#3f4a33'; ctx.beginPath(); ctx.ellipse(x, base - 3, 13, 6, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(l, base - 3, w, 4);
        ctx.fillStyle = Math.floor(t * 3) % 2 ? '#ff2a2a' : '#5a0a0a'; ctx.beginPath(); ctx.arc(x, base - 7, 2.2, 0, 7); ctx.fill();
        break;
      }
      case 'med-station': {
        ctx.fillStyle = '#e8ecef'; ctx.fillRect(l, top + 6, w, h - 6);
        ctx.fillStyle = '#c9ced6'; ctx.fillRect(l, top, w, 8);
        ctx.fillStyle = '#e33'; ctx.fillRect(x - 4, top + 18, 8, 26); ctx.fillRect(x - 13, top + 27, 26, 8);
        ctx.globalCompositeOperation = 'lighter';
        const r = ctx.createRadialGradient(x, top + 30, 0, x, top + 30, 70);
        r.addColorStop(0, 'rgba(90,255,140,' + (0.25 + Math.sin(t * 3) * 0.08) + ')'); r.addColorStop(1, 'rgba(90,255,140,0)');
        ctx.fillStyle = r; ctx.fillRect(x - 70, top - 40, 140, 140);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'crypto-rig': {
        ctx.fillStyle = '#15171c'; ctx.fillRect(l, top, w, h);
        ctx.fillStyle = '#23262e'; for (let i = 0; i < 4; i++) ctx.fillRect(l + 4, top + 6 + i * 16, w - 8, 12);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { ctx.fillStyle = (Math.floor(t * 6 + i * 3 + j) % 4) ? '#2bff9b' : '#0a3a22'; ctx.fillRect(l + 8 + j * 10, top + 10 + i * 16, 5, 4); }
        ctx.fillStyle = '#5dff8a'; ctx.fillRect(l + 4, base - 8, (w - 8) * (1 - s.incomeT / d.every), 4);
        ctx.fillStyle = '#f7931a'; ctx.font = '700 15px "Russo One", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('₿', x, top - 4); ctx.textAlign = 'left';
        break;
      }
      case 'gold-printer': case 'cash-printer': {
        ctx.fillStyle = d.id === 'gold-printer' ? '#6b5320' : '#2b2f36'; ctx.fillRect(l, top, w, h);
        ctx.fillStyle = '#3a3f48'; ctx.fillRect(l + 4, top + 4, w - 8, 12);
        ctx.fillStyle = '#5dff8a'; ctx.fillRect(l + 6, top + 6, (w - 12) * (1 - s.incomeT / d.every), 8);
        ctx.fillStyle = d.id === 'gold-printer' ? '#ffd84d' : '#62d27a'; const out = (t * 20) % 14; ctx.fillRect(x - 10, top + 22 + out, 20, 9);
        ctx.fillStyle = '#ffd84d'; ctx.font = 'bold 13px "Russo One", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('$', x, base - 6); ctx.textAlign = 'left';
        break;
      }
      case 'energy-shield': {
        ctx.globalCompositeOperation = 'lighter';
        const f = s.hp / s.maxHp;
        const g = ctx.createLinearGradient(l - 10, 0, l + w + 10, 0);
        g.addColorStop(0, 'rgba(80,200,255,0)'); g.addColorStop(0.5, 'rgba(120,230,255,' + (0.35 + 0.35 * f) + ')'); g.addColorStop(1, 'rgba(80,200,255,0)');
        ctx.fillStyle = g; ctx.fillRect(l - 10, top, w + 20, h);
        ctx.strokeStyle = 'rgba(200,250,255,' + (0.4 + 0.3 * Math.sin(t * 6)) + ')'; ctx.lineWidth = 1.5;
        for (let y = top + ((t * 40) % 16); y < base; y += 16) { ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(l + w, y); ctx.stroke(); }
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#2b2f36'; ctx.fillRect(l - 6, base - 10, w + 12, 12); ctx.fillRect(l - 6, top - 6, w + 12, 8);
        break;
      }
      default: if (d.turret) drawTurret(ctx, s, t);
    }
    if (!ghost && dmg > 0.35 && d.solid) { // cracks
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath();
      const n = Math.floor(dmg * 6);
      for (let i = 0; i < n; i++) { const cy = top + ((i * 37) % Math.max(10, h - 10)); ctx.moveTo(l + 3, cy); ctx.lineTo(x, cy + 8); ctx.lineTo(l + w - 4, cy + 3); }
      ctx.stroke();
    }
    if (s.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(l, top, w, h); ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    if (!ghost) hpBar(ctx, s);
  };

  function drawTurret(ctx, s, t) {
    const d = s.def, x = s.x, base = s.base, top = s.top, w = s.w;
    // tripod
    ctx.strokeStyle = '#2b2f36'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, top + 18); ctx.lineTo(x - w / 2, base + 2); ctx.moveTo(x, top + 18); ctx.lineTo(x + w / 2, base + 2); ctx.moveTo(x, top + 18); ctx.lineTo(x, base + 2); ctx.stroke();
    if (d.id === 'tesla-tower') {
      ctx.fillStyle = '#3a3f48'; ctx.fillRect(x - 8, top + 10, 16, s.h - 10);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = '#b87333'; ctx.fillRect(x - 13 + i, top + 20 + i * 16, 26 - i * 2, 6); }
      const glow = 0.5 + 0.5 * Math.sin(t * 9);
      ctx.fillStyle = '#9fd8ff'; ctx.shadowColor = '#9fd8ff'; ctx.shadowBlur = 16 * glow;
      ctx.beginPath(); ctx.arc(x, top + 6, 9, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      return;
    }
    ctx.save(); ctx.translate(x, top + 14); ctx.scale(1.35, 1.35);
    ctx.fillStyle = '#3a3f48'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
    ctx.rotate(s.aim);
    const flip = Math.cos(s.aim) < 0 ? -1 : 1;
    ctx.scale(1, flip);
    if (d.id === 'heavy-sentry') {
      ctx.fillStyle = '#2b2f36'; ctx.fillRect(-12, -9, 22, 18);
      const sp = s.spin * t * 40;
      for (let i = 0; i < 3; i++) { ctx.fillStyle = '#7d8590'; ctx.fillRect(8, -5 + Math.sin(sp + i * 2.1) * 3.5 - 1.5, 30, 3); }
    } else if (d.id === 'rocket-sentry') {
      ctx.fillStyle = '#3f4a33'; ctx.fillRect(-14, -12, 40, 24);
      ctx.fillStyle = '#222'; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.arc(26, -6 + j * 12, 4.5, 0, 7); ctx.fill(); }
    } else if (d.id === 'laser-sentry') {
      ctx.fillStyle = '#e7ebf2'; ctx.fillRect(-12, -9, 38, 18);
      ctx.fillStyle = '#ff2b4a'; ctx.shadowColor = '#ff2b4a'; ctx.shadowBlur = 10; ctx.fillRect(4, -3, 26, 3); ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#4b4f3a'; ctx.fillRect(-12, -8, 24, 16);
      ctx.fillStyle = '#2b2f36'; ctx.fillRect(10, -3, 24, 5);
      ctx.fillStyle = '#ff3030'; ctx.fillRect(-4, -11, 6, 3);
    }
    ctx.restore();
    // targeting eye
    ctx.fillStyle = s.target && !s.target.dead ? '#ff3030' : '#5dff8a';
    ctx.beginPath(); ctx.arc(x, top + 14, 3, 0, 7); ctx.fill();
  }

  const iconCache = new Map();
  Z.buildIcon = function (def, W, H) {
    const key = def.id + W + 'x' + H;
    if (iconCache.has(key)) return iconCache.get(key);
    const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
    const x = c.getContext('2d');
    const box = Math.max(def.w + 20, def.h * 1.25 + 10);
    const sc = Math.min(c.width / box, c.height / (def.h + 24));
    x.translate(c.width / 2, c.height - 6); x.scale(sc, sc);
    const fake = { def, id: def.id, x: 0, w: def.w, h: def.h, base: 0, top: -def.h, hp: 1, maxHp: 1, flash: 0, aim: -0.35, incomeT: (def.every || 1) * 0.4, spin: 0, t: 1 };
    Z.drawStructure(x, fake, 1, false);
    iconCache.set(key, c);
    return c;
  };

  Z.drawStructures = function (ctx, x0, x1, t) {
    for (const s of G().structures) if (s.x > x0 - 200 && s.x < x1 + 200) Z.drawStructure(ctx, s, t);
  };
})();
