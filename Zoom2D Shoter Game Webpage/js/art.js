/* Zoom2D Shooter — procedural art: weapons, characters and icons.
   Everything is drawn with canvas paths, so it stays crisp at any resolution scale. */
(function () {
  const Z = window.Z;

  // ---- small helpers -------------------------------------------------------
  const shadeCache = new Map();
  function shade(hex, amt) {
    const key = hex + amt;
    let v = shadeCache.get(key);
    if (v === undefined) { v = shadeRaw(hex, amt); if (shadeCache.size < 4000) shadeCache.set(key, v); }
    return v;
  }
  function shadeRaw(hex, amt) {
    if (hex[0] !== '#') return hex;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  Z.shade = shade;

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function box(ctx, x, y, w, h, col, r) {
    rr(ctx, x, y, w, h, r || 1.2);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(col, 0.28)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.35));
    ctx.fillStyle = g; ctx.fill();
  }
  function poly(ctx, pts, col) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }

  // ---- weapon palettes ------------------------------------------------------
  // Every model gets its own finish and kit, derived from a hash of its id, so 500 guns
  // built on ~25 base silhouettes still look distinct (barrel length, optic, mag, muzzle, grip, colours).
  const FINISH = [
    ['#2c2f36', '#16181c', '#5b616b'], // black
    ['#8c7a58', '#4e4330', '#6b6455'], // flat dark earth
    ['#4b5320', '#262b12', '#5f6352'], // olive drab
    ['#55595f', '#2b2e33', '#8a9099'], // gunmetal grey
    ['#3a3f4a', '#1c1f26', '#6d7480'], // blued steel
    ['#a7adb5', '#5d636b', '#d0d5db'], // stainless
    ['#6a5a7a', '#33293d', '#7d7488'], // cerakote violet
    ['#2f4a5a', '#16242c', '#5f7380']  // cobalt
  ];
  const palCache = new Map();
  function palette(w) {
    if (palCache.has(w.id)) return palCache.get(w.id);
    const H = k => Z.hash ? Z.hash(w.id, k + 20) : 0.5;
    let p;
    if (w.gold) p = { body: '#d4a52a', dark: '#8a6510', metal: '#f5d36b', wood: '#b8860b', accent: '#fff1a8' };
    else {
      const fin = FINISH[Math.floor(H(1) * (w.cat === 'Pistols' ? FINISH.length : 6))];
      p = { body: fin[0], dark: fin[1], metal: fin[2], wood: ['#7a4a24', '#5e3a1c', '#8f5a2e', '#6b3f22'][Math.floor(H(2) * 4)], accent: w.color || '#ff3355' };
      if (w.cat === 'Energy') { const e = [['#e7ebf2', '#5d6676', '#b8c2d3'], ['#2b2f3a', '#11131a', '#5b6475'], ['#f2e9d8', '#6b5d48', '#c9bba3']][Math.floor(H(3) * 3)]; p.body = e[0]; p.dark = e[1]; p.metal = e[2]; }
      if (w.tactical) { p.body = ['#3b4030', '#6b5f45', '#2f3238'][Math.floor(H(4) * 3)]; p.dark = '#1f2219'; }
      if (w.cat === 'Explosives') { p.body = ['#3f4a33', '#55513a', '#3a4450'][Math.floor(H(5) * 3)]; p.metal = '#6a6f5a'; }
      // two-tone pistols: a different slide colour
      if (w.cat === 'Pistols' && H(6) < 0.35) p.slide = ['#b8bec6', '#8c7a58', '#2c2f36'][Math.floor(H(7) * 3)];
      if (p.slide) p.metal = p.slide;
      if (w.cat === 'Pistols') {
        p.rake = Math.round(H(12) * 4) - 1;                       // grip angle
        p.serr = 2 + Math.floor(H(13) * 4);                        // slide serrations
        p.hammer = /1911|Hi-Power|CZ|Beretta|Makarov|Tokarev|Luger|Mauser|Kimber|Stechkin|Nambu|Taurus PT|92/.test(w.name);
        p.light = H(14) < 0.22 || w.tactical;
        p.comp = /Auto|18C|93R|Competition|34/.test(w.name) || H(15) < 0.12;
        p.grip = ['#16181c', '#3a2a1c', '#4b3a2a', '#2b2f36'][Math.floor(H(16) * 4)];
      }
    }
    if (/AK|Mosin|Kar98|Garand|SKS|Thompson|PPSh|Winchester|Lee-Enfield|Springfield M1903|Dragunov|Double|Sawed|Elephant|Lewis|1862|Remington 870|Mossberg|Type 56|M1 Carbine|StG|Ithaca|Lanchester|Bren|Webley|Colt Single|Mini-14|Owen|Sten|M14|FN FAL|G3|SVD|Lee|BAR|DP-28|Hotchkiss|Chauchat/.test(w.name)) p.stock = p.wood;
    // kit
    const s = w.shape;
    const gun = /^(pistol|revolver|smg|bullpup|rifle|shotgun|sniper|lmg)$/.test(s);
    p.ext = 0; p.optic = null; p.mag = null; p.muzzle = null; p.fore = false;
    if (gun) {
      const compact = /26|365|PPK|Derringer|K\b|Mini|Micro|MP5K|Sawed|Shockwave|AKS-74U|Mk 18|Commando|G36C|Krinkov/.test(w.name);
      const long = /34|Python|500|Redhawk|Hecate|Elephant|TAC-50|CheyTac|Intervention|M82|M107|AWM|Barrett|Hi-Power|Luger|Mauser|Colt Single|Webley/.test(w.name);
      p.ext = compact ? -4 : long ? 8 + H(8) * 6 : Math.round((H(8) - 0.3) * 10);
      const oRoll = H(9);
      if (s === 'rifle' || s === 'bullpup') p.optic = oRoll < 0.3 ? null : oRoll < 0.6 ? 'dot' : oRoll < 0.85 ? 'holo' : 'acog';
      else if (s === 'smg') p.optic = oRoll < 0.55 ? null : oRoll < 0.85 ? 'dot' : 'holo';
      else if (s === 'pistol') p.optic = oRoll < 0.85 ? null : 'dot';
      else if (s === 'shotgun') p.optic = oRoll < 0.7 ? null : 'dot';
      else if (s === 'lmg') p.optic = oRoll < 0.5 ? null : 'acog';
      if (w.tactical && !p.optic && s !== 'revolver' && s !== 'sniper') p.optic = 'dot';
      if ((s === 'smg' || s === 'rifle' || s === 'lmg') && (w.mag >= 50 || /Thompson|PPSh|Calico|Drum/.test(w.name))) p.mag = 'drum';
      else if ((s === 'rifle' || s === 'lmg') && /AK|Galil|RPK|Type 56|Type 81|Vz|Groza|Valmet|Krinkov|AKS|AN-94|Saiga/.test(w.name)) p.mag = 'curved';
      const mRoll = H(10);
      if (s !== 'revolver' && s !== 'pistol') p.muzzle = w.sound === 'suppressed' || w.sound === 'suppressed-heavy' ? 'can' : mRoll < 0.35 ? null : mRoll < 0.7 ? 'hider' : 'brake';
      else if (w.tactical) p.muzzle = 'can';
      p.fore = (s === 'rifle' || s === 'smg' || s === 'bullpup' || s === 'shotgun') && H(11) < 0.4;
    }
    palCache.set(w.id, p);
    return p;
  }
  Z.weaponPalette = palette;

  // Where each silhouette mounts its kit: top rail [x0, x1, y], magwell [x, y], under-rail [x, y]
  const ANCH = {
    pistol: { top: [-4, 18, -15] }, revolver: { top: [10, 28, -14] },
    smg: { top: [-4, 30, -15], mag: [13, -6], under: [24, -6] }, bullpup: { top: [-8, 28, -16], mag: [-16, -4], under: [22, -4] },
    rifle: { top: [-2, 26, -16], mag: [14, -6], under: [34, -7] }, shotgun: { top: [-4, 14, -16], under: [28, -5] },
    sniper: { top: [0, 26, -25], mag: [12, -7] }, lmg: { top: [6, 30, -22], under: [40, -10] }
  };
  function kitBox(w) {
    const s = SHAPES[w.shape] || SHAPES.pistol, p = palette(w), a = ANCH[w.shape] || {};
    const b = s.box.slice();
    b[2] += Math.max(0, p.ext) + (p.muzzle === 'can' ? 14 : p.muzzle ? 6 : 0);
    if (p.optic && a.top) b[1] = Math.min(b[1], a.top[2] - (p.optic === 'acog' ? 11 : 10));
    if (p.mag === 'drum' && a.mag) b[3] = Math.max(b[3], a.mag[1] + 20);
    if (p.fore && a.under) b[3] = Math.max(b[3], a.under[1] + 12);
    return b;
  }
  Z.weaponMuzzle = function (w) {
    const s = SHAPES[w.shape] || SHAPES.pistol, p = palette(w);
    return [s.muzzle[0] + p.ext + (p.muzzle === 'can' ? 14 : p.muzzle ? 6 : 0), s.muzzle[1]];
  };
  function drawKit(ctx, w, p) {
    const s = SHAPES[w.shape] || SHAPES.pistol, a = ANCH[w.shape] || {};
    const [mx, my] = s.muzzle;
    // barrel extension / shortening is drawn as extra barrel past the original muzzle
    let end = mx;
    if (p.ext > 0 && w.shape !== 'pistol') { box(ctx, mx - 1, my - 2, p.ext + 1, 4, p.metal); end = mx + p.ext; }
    else if (p.ext && w.shape === 'pistol') end = mx + p.ext;
    if (p.muzzle === 'can') { box(ctx, end, my - 3.6, 15, 7.2, '#24262b', 2); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(end + 2, my - 3, 11, 1.2); }
    else if (p.muzzle === 'brake') { box(ctx, end, my - 3.2, 7, 6.4, p.dark, 1); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(end + 2, my - 3.2, 1.2, 6.4); ctx.fillRect(end + 4.4, my - 3.2, 1.2, 6.4); }
    else if (p.muzzle === 'hider') { box(ctx, end, my - 2.6, 7, 5.2, p.dark, 1); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(end + 1, my - 0.4, 6, 0.8); }
    if (p.mag === 'drum' && a.mag) {
      ctx.fillStyle = p.dark; ctx.beginPath(); ctx.arc(a.mag[0] + 2, a.mag[1] + 10, 10, 0, 7); ctx.fill();
      ctx.fillStyle = p.metal; ctx.beginPath(); ctx.arc(a.mag[0] + 2, a.mag[1] + 10, 6, 0, 7); ctx.fill();
      ctx.fillStyle = p.dark; ctx.beginPath(); ctx.arc(a.mag[0] + 2, a.mag[1] + 10, 2, 0, 7); ctx.fill();
    } else if (p.mag === 'curved' && a.mag) {
      ctx.fillStyle = p.stock && /AK|Type/.test(w.name) ? '#a4552a' : p.dark;
      ctx.beginPath(); ctx.moveTo(a.mag[0] - 3, a.mag[1]); ctx.lineTo(a.mag[0] + 5, a.mag[1]); ctx.quadraticCurveTo(a.mag[0] + 8, a.mag[1] + 10, a.mag[0] + 14, a.mag[1] + 17);
      ctx.lineTo(a.mag[0] + 7, a.mag[1] + 20); ctx.quadraticCurveTo(a.mag[0] + 1, a.mag[1] + 12, a.mag[0] - 3, a.mag[1]); ctx.fill();
    }
    if (p.fore && a.under) { box(ctx, a.under[0] - 2, a.under[1], 5, 11, p.dark, 1.5); }
    if (p.optic && a.top) {
      const [x0, x1, y] = a.top, cx = (x0 + x1) / 2;
      ctx.fillStyle = p.dark; ctx.fillRect(x0, y - 1.5, x1 - x0, 1.5); // rail
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (let x = x0 + 1; x < x1; x += 3) ctx.fillRect(x, y - 1.5, 1, 1.5);
      if (p.optic === 'dot') { box(ctx, cx - 4, y - 7, 9, 6, '#1d1f24', 2); ctx.fillStyle = '#ff2a2a'; ctx.fillRect(cx - 1.5, y - 5, 1.6, 1.6); }
      else if (p.optic === 'holo') { box(ctx, cx - 6, y - 9, 13, 8, '#2a2d33', 1.5); ctx.fillStyle = 'rgba(120,200,255,0.45)'; ctx.fillRect(cx - 3.5, y - 7.5, 8, 5); }
      else { box(ctx, cx - 9, y - 9, 20, 7, '#24262b', 3); ctx.fillStyle = '#5ad1ff'; ctx.fillRect(cx + 9, y - 8, 1.6, 5); box(ctx, cx - 3, y - 2, 4, 2, p.dark, 0.5); }
    }
  }

  // Each shape draws with the grip at (0,0), barrel pointing to +x.
  // Returns nothing; SHAPES[k].muzzle gives the muzzle point, .box the bounds.
  const SHAPES = {
    pistol: {
      muzzle: [27, -11], box: [-10, -16, 30, 14], len: 1,
      draw(ctx, p) {
        const L = p.ext || 0, rk = p.rake || 0;
        poly(ctx, [-5, -6, 4, -6, 2 - rk, 12, -8 - rk, 12], p.grip || p.dark);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = -2; y < 11; y += 3) ctx.fillRect(-6 - rk * (y + 6) / 18, y, 8, 1); // grip texture
        box(ctx, -7, -9, 30 + L * 0.8, 5, p.body);
        box(ctx, -8, -15, 34 + L, 7, p.metal);
        ctx.fillStyle = p.dark;
        for (let i = 0; i < (p.serr || 2); i++) ctx.fillRect(-5 + i * 2.6, -14, 1.2, 5); // rear serrations
        ctx.fillRect(10 + L * 0.4, -14, 2, 5);
        if (p.hammer) ctx.fillRect(-11, -15, 4, 4);
        if (p.light) { box(ctx, 12, -5, 10, 5, '#1d1f24', 1.5); ctx.fillStyle = '#ffe9a8'; ctx.fillRect(21.5, -4.2, 1.2, 3.4); }
        if (p.comp) { box(ctx, 25 + L, -15, 6, 7, p.dark, 1); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(27 + L, -15, 1.2, 3); }
        ctx.strokeStyle = p.dark; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(5, -3, 4, 0, Math.PI); ctx.stroke();
      }
    },
    revolver: {
      muzzle: [34, -11], box: [-10, -16, 36, 14], len: 1,
      draw(ctx, p) {
        poly(ctx, [-6, -5, 3, -5, 0, 12, -10, 11], p.stock || p.wood);
        box(ctx, -4, -12, 14, 9, p.metal, 3);
        ctx.fillStyle = p.dark; for (let i = 0; i < 3; i++) ctx.fillRect(-1 + i * 4, -11, 2, 7);
        box(ctx, 8, -14, 26, 6, p.body);
        ctx.fillStyle = p.dark; ctx.fillRect(30, -16, 3, 2);
        ctx.strokeStyle = p.dark; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(5, -2, 4, 0, Math.PI); ctx.stroke();
      }
    },
    ePistol: {
      muzzle: [30, -11], box: [-10, -18, 32, 14], len: 1,
      draw(ctx, p) {
        poly(ctx, [-5, -6, 4, -6, 2, 12, -8, 12], p.dark);
        box(ctx, -8, -16, 34, 10, p.body, 4);
        ctx.fillStyle = p.accent; ctx.shadowColor = p.accent; ctx.shadowBlur = 8;
        ctx.fillRect(0, -13, 18, 3); ctx.fillRect(26, -14, 4, 6);
        ctx.shadowBlur = 0;
      }
    },
    smg: {
      muzzle: [44, -10], box: [-22, -17, 46, 22], len: 1.2,
      draw(ctx, p) {
        poly(ctx, [-22, -12, -6, -12, -6, -6, -20, -2], p.stock || p.dark);
        poly(ctx, [-3, -6, 5, -6, 3, 10, -6, 10], p.dark);
        box(ctx, 10, -6, 6, 18, p.dark);
        box(ctx, -8, -15, 44, 9, p.body, 2);
        box(ctx, 34, -12, 10, 4, p.metal);
        ctx.fillStyle = p.metal; ctx.fillRect(4, -17, 12, 2);
      }
    },
    bullpup: {
      muzzle: [52, -10], box: [-30, -18, 54, 20], len: 1.3,
      draw(ctx, p) {
        box(ctx, -30, -16, 70, 12, p.body, 4);
        poly(ctx, [-2, -6, 6, -6, 4, 10, -6, 10], p.dark);
        box(ctx, -20, -6, 8, 14, p.dark);
        box(ctx, 38, -12, 14, 4, p.metal);
        ctx.fillStyle = p.dark; ctx.fillRect(-10, -20, 20, 4);
      }
    },
    rifle: {
      muzzle: [62, -10], box: [-30, -20, 64, 24], len: 1.4,
      draw(ctx, p) {
        poly(ctx, [-30, -14, -4, -14, -4, -6, -28, 0], p.stock || p.dark);
        poly(ctx, [-3, -6, 5, -6, 2, 10, -7, 10], p.dark);
        poly(ctx, [10, -6, 18, -6, 22, 12, 14, 13], p.dark);
        box(ctx, -6, -16, 40, 10, p.body, 2);
        box(ctx, 30, -14, 18, 7, p.stock || p.metal, 2);
        box(ctx, 46, -12, 16, 4, p.metal);
        ctx.fillStyle = p.dark; ctx.fillRect(2, -20, 18, 4); ctx.fillRect(56, -16, 2, 4);
      }
    },
    shotgun: {
      muzzle: [62, -12], box: [-30, -18, 64, 18], len: 1.4,
      draw(ctx, p) {
        poly(ctx, [-30, -14, -4, -14, -4, -7, -28, -1], p.stock || p.wood);
        poly(ctx, [-3, -7, 5, -7, 2, 9, -7, 9], p.dark);
        box(ctx, -6, -16, 22, 9, p.body, 2);
        box(ctx, 14, -15, 48, 5, p.metal);
        box(ctx, 22, -10, 24, 5, p.stock || p.wood, 2);
      }
    },
    sniper: {
      muzzle: [80, -11], box: [-34, -26, 82, 26], len: 1.6,
      draw(ctx, p) {
        poly(ctx, [-34, -15, -4, -15, -4, -6, -32, 0], p.stock || p.dark);
        poly(ctx, [-3, -7, 5, -7, 2, 9, -7, 9], p.dark);
        box(ctx, -6, -16, 40, 9, p.body, 2);
        box(ctx, 32, -14, 48, 4, p.metal);
        box(ctx, 0, -25, 26, 7, p.dark, 3);
        ctx.fillStyle = '#5ad1ff'; ctx.fillRect(24, -24, 2, 5);
        ctx.fillStyle = p.dark; ctx.fillRect(6, -18, 3, 3); ctx.fillRect(18, -18, 3, 3);
        ctx.fillRect(40, -10, 2, 10); ctx.fillRect(44, -10, 2, 10);
      }
    },
    lmg: {
      muzzle: [68, -11], box: [-30, -22, 70, 28], len: 1.5,
      draw(ctx, p) {
        poly(ctx, [-30, -16, -4, -16, -4, -6, -28, 0], p.stock || p.dark);
        poly(ctx, [-3, -6, 5, -6, 2, 10, -7, 10], p.dark);
        box(ctx, -6, -18, 44, 12, p.body, 2);
        box(ctx, 6, -6, 18, 14, p.metal, 3);
        box(ctx, 36, -15, 32, 5, p.metal);
        ctx.fillStyle = p.dark; ctx.fillRect(4, -22, 26, 4);
        ctx.strokeStyle = p.dark; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(50, -10); ctx.lineTo(56, 4); ctx.moveTo(52, -10); ctx.lineTo(46, 4); ctx.stroke();
      }
    },
    minigun: {
      muzzle: [76, -8], box: [-20, -24, 78, 30], len: 1.6,
      draw(ctx, p, t) {
        box(ctx, -20, -20, 30, 24, p.body, 5);
        poly(ctx, [-6, 4, 4, 4, 2, 14, -8, 14], p.dark);
        ctx.fillStyle = p.dark; ctx.fillRect(-10, -24, 16, 4);
        const spin = (t || 0) * 40;
        for (let i = 0; i < 3; i++) {
          const yo = Math.sin(spin + i * 2.09) * 4;
          box(ctx, 10, -10 + yo - 2, 66, 3.6, i === 0 ? p.metal : shade(p.metal, -0.2));
        }
        box(ctx, 10, -15, 8, 14, p.dark, 2); box(ctx, 60, -14, 6, 12, p.dark, 2);
        if (p.accent && p.isEnergy) { ctx.fillStyle = p.accent; ctx.fillRect(-14, -12, 18, 3); }
      }
    },
    flamer: {
      muzzle: [60, -10], box: [-24, -22, 62, 30], len: 1.4,
      draw(ctx, p) {
        box(ctx, -24, -20, 18, 26, '#a33', 6);
        poly(ctx, [-3, -6, 5, -6, 2, 10, -7, 10], p.dark);
        box(ctx, -6, -15, 46, 9, p.body, 2);
        box(ctx, 36, -13, 24, 6, p.metal, 2);
        ctx.fillStyle = p.accent; ctx.shadowColor = p.accent; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(60, -10, 2.5, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      }
    },
    launcher: {
      muzzle: [62, -12], box: [-36, -22, 66, 24], len: 1.5,
      draw(ctx, p) {
        box(ctx, -36, -18, 98, 12, p.body, 5);
        poly(ctx, [-3, -6, 5, -6, 2, 10, -7, 10], p.dark);
        poly(ctx, [16, -6, 23, -6, 21, 8, 14, 8], p.dark);
        box(ctx, -40, -20, 8, 16, p.dark, 2); box(ctx, 56, -21, 8, 18, p.dark, 2);
        box(ctx, 4, -24, 14, 6, p.dark, 2);
        ctx.fillStyle = '#c33'; ctx.fillRect(30, -16, 3, 8);
      }
    },
    tube: {
      muzzle: [44, -12], box: [-26, -22, 46, 24], len: 1.3,
      draw(ctx, p) {
        poly(ctx, [-26, -14, -4, -14, -4, -7, -24, -1], p.stock || p.dark);
        poly(ctx, [-3, -7, 5, -7, 2, 9, -7, 9], p.dark);
        box(ctx, -6, -18, 16, 13, p.metal, 5);
        ctx.fillStyle = p.dark; for (let i = 0; i < 3; i++) ctx.fillRect(-4 + i * 5, -17, 2, 11);
        box(ctx, 10, -19, 34, 14, p.body, 4);
      }
    },
    energy: {
      muzzle: [56, -11], box: [-26, -22, 58, 24], len: 1.3,
      draw(ctx, p) { SHAPES.eRifle.draw(ctx, p); }
    },
    eRifle: {
      muzzle: [60, -11], box: [-28, -22, 62, 24], len: 1.4,
      draw(ctx, p) {
        poly(ctx, [-28, -16, -4, -16, -4, -6, -24, -2], p.body);
        poly(ctx, [-3, -6, 5, -6, 2, 10, -7, 10], p.dark);
        box(ctx, -6, -19, 52, 13, p.body, 6);
        box(ctx, 44, -15, 16, 7, p.metal, 3);
        ctx.fillStyle = p.accent; ctx.shadowColor = p.accent; ctx.shadowBlur = 10;
        ctx.fillRect(4, -14, 30, 3); ctx.fillRect(56, -14, 4, 5);
        ctx.beginPath(); ctx.arc(-14, -10, 2.5, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
      }
    },
    eHeavy: {
      muzzle: [64, -10], box: [-26, -28, 66, 32], len: 1.5,
      draw(ctx, p) {
        box(ctx, -26, -24, 40, 26, p.body, 8);
        poly(ctx, [-3, 2, 5, 2, 2, 14, -7, 14], p.dark);
        box(ctx, 10, -18, 40, 16, p.metal, 6);
        ctx.fillStyle = p.dark; for (let i = 0; i < 4; i++) ctx.fillRect(16 + i * 8, -18, 3, 16);
        box(ctx, 48, -15, 16, 10, p.body, 4);
        ctx.fillStyle = p.accent; ctx.shadowColor = p.accent; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(-6, -11, 6, 0, 7); ctx.fill(); ctx.fillRect(60, -13, 4, 6);
        ctx.shadowBlur = 0;
      }
    },
    knife: {
      muzzle: [30, -4], box: [-6, -10, 32, 10], len: 0.9, melee: true,
      draw(ctx, p) {
        box(ctx, -6, -4, 12, 7, '#2a2a2a', 2);
        ctx.fillStyle = '#555'; ctx.fillRect(5, -7, 3, 12);
        poly(ctx, [8, -4, 28, -4, 32, -1, 28, 2, 8, 2], '#cfd6de');
        ctx.fillStyle = '#9aa3ad'; ctx.fillRect(9, -1, 18, 1.4);
      }
    },
    blade: {
      muzzle: [62, -2], box: [-8, -10, 64, 10], len: 1.2, melee: true,
      draw(ctx, p, t, w) {
        box(ctx, -8, -3, 16, 6, '#222', 2);
        ctx.fillStyle = w && w.gold ? '#f5d36b' : '#777'; ctx.fillRect(7, -7, 3, 14);
        const steel = (w && w.glow) ? w.color : (w && w.gold ? '#f5d36b' : '#d7dde4');
        if (w && w.glow) { ctx.shadowColor = w.color; ctx.shadowBlur = 12; }
        poly(ctx, [10, -3, 58, -4, 64, 0, 10, 3], steel);
        ctx.shadowBlur = 0;
      }
    },
    lsword: {
      muzzle: [80, 0], box: [-10, -8, 82, 8], len: 1.4, melee: true,
      draw(ctx, p, t, w) {
        box(ctx, -10, -3.5, 22, 7, w && w.gold ? '#d4a52a' : '#b9c0c9', 2);
        ctx.fillStyle = '#222'; ctx.fillRect(-6, -3.5, 3, 7); ctx.fillRect(2, -3.5, 2, 7);
        const c = (w && w.color) || '#3ab4ff';
        ctx.lineCap = 'round';
        ctx.shadowColor = c; ctx.shadowBlur = 18;
        ctx.strokeStyle = c; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(80, 0); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(79, 0); ctx.stroke();
        ctx.shadowBlur = 0; ctx.lineCap = 'butt';
      }
    },
    dsaber: {
      muzzle: [80, 0], box: [-70, -8, 82, 8], len: 1.4, melee: true,
      draw(ctx, p, t, w) {
        box(ctx, -12, -3.5, 26, 7, '#b9c0c9', 2);
        const c = (w && w.color) || '#ff2a3a';
        ctx.lineCap = 'round'; ctx.shadowColor = c; ctx.shadowBlur = 18;
        ctx.strokeStyle = c; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(80, 0); ctx.moveTo(-14, 0); ctx.lineTo(-70, 0); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(79, 0); ctx.moveTo(-14, 0); ctx.lineTo(-69, 0); ctx.stroke();
        ctx.shadowBlur = 0; ctx.lineCap = 'butt';
      }
    },
    blunt: {
      muzzle: [56, 0], box: [-6, -8, 60, 8], len: 1.1, melee: true,
      draw(ctx, p, t, w) {
        const c = (w && w.gold) ? '#d4a52a' : (w && w.color) || '#a8743a';
        poly(ctx, [-6, -2.5, 30, -4, 58, -6, 58, 6, 30, 4, -6, 2.5], c);
        ctx.fillStyle = '#222'; ctx.fillRect(-6, -3, 12, 6);
      }
    },
    pan: {
      muzzle: [44, 0], box: [-6, -16, 50, 16], len: 1, melee: true,
      draw(ctx) {
        ctx.fillStyle = '#4a2c18'; ctx.fillRect(-6, -2.5, 22, 5);
        ctx.fillStyle = '#2b2d31'; ctx.beginPath(); ctx.ellipse(32, 0, 14, 15, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#44474d'; ctx.beginPath(); ctx.ellipse(32, 0, 10, 11, 0, 0, 7); ctx.fill();
      }
    },
    axe: {
      muzzle: [56, 0], box: [-6, -18, 60, 16], len: 1.1, melee: true,
      draw(ctx, p, t, w) {
        ctx.fillStyle = '#6b4022'; ctx.fillRect(-6, -2.5, 60, 5);
        const c = (w && w.glow) ? w.color : (w && w.gold ? '#f5d36b' : '#c33');
        if (w && w.glow) { ctx.shadowColor = c; ctx.shadowBlur = 14; }
        poly(ctx, [40, -3, 46, -18, 58, -14, 54, -3], c);
        poly(ctx, [40, 3, 46, 16, 54, 12, 52, 3], c);
        ctx.shadowBlur = 0;
      }
    },
    hammer: {
      muzzle: [60, 0], box: [-6, -16, 66, 16], len: 1.2, melee: true,
      draw(ctx, p, t, w) {
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(-6, -2.5, 54, 5);
        const c = (w && w.gold) ? '#d4a52a' : '#5b616b';
        box(ctx, 46, -15, 18, 30, c, 3);
        if (w && w.glow) { ctx.fillStyle = w.color; ctx.shadowColor = w.color; ctx.shadowBlur = 14; ctx.fillRect(52, -10, 6, 20); ctx.shadowBlur = 0; }
      }
    },
    spear: {
      muzzle: [100, 0], box: [-30, -8, 100, 8], len: 1.5, melee: true,
      draw(ctx) {
        ctx.fillStyle = '#7a4a24'; ctx.fillRect(-30, -2, 112, 4);
        poly(ctx, [82, -6, 102, 0, 82, 6], '#cfd6de');
      }
    },
    chainsaw: {
      muzzle: [64, -2], box: [-14, -16, 66, 14], len: 1.3, melee: true,
      draw(ctx, p, t) {
        box(ctx, -14, -14, 26, 22, '#e36a12', 5);
        ctx.fillStyle = '#222'; ctx.fillRect(-10, -18, 16, 4);
        box(ctx, 10, -6, 54, 10, '#9aa3ad', 5);
        ctx.fillStyle = '#333';
        const o = ((t || 0) * 60) % 6;
        for (let x = 12 + o; x < 62; x += 6) { ctx.fillRect(x, -8, 3, 2); ctx.fillRect(x, 4, 3, 2); }
      }
    }
  };
  Z.SHAPES = SHAPES;

  function shapeOf(w) { return SHAPES[w.shape] || SHAPES.pistol; }
  Z.shapeOf = shapeOf;

  // Draw weapon at current transform (grip at origin, pointing +x).
  Z.drawWeapon = function (ctx, w, t) {
    const s = shapeOf(w);
    const p = palette(w);
    if (w.cat === 'Miniguns' && w.kind !== 'bullet') { p.isEnergy = true; }
    s.draw(ctx, p, t, w);
    drawKit(ctx, w, p);
    if (w.tactical && !s.melee) { ctx.fillStyle = '#ff2030'; ctx.fillRect(10, s.muzzle[1] + 4, 4, 2); } // laser module
  };

  // Cached icon canvases for the shop and HUD.
  const iconCache = new Map();
  Z.weaponIcon = function (w, W, H) {
    const key = w.id + '|' + W + 'x' + H;
    if (iconCache.has(key)) return iconCache.get(key);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const s = shapeOf(w);
    const b = kitBox(w);
    const bw = b[2] - b[0], bh = b[3] - b[1];
    const sc = Math.min((W * 0.86) / bw, (H * 0.8) / bh);
    ctx.translate(W / 2 - (b[0] + bw / 2) * sc, H / 2 - (b[1] + bh / 2) * sc);
    ctx.scale(sc, sc);
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowOffsetY = 2;
    Z.drawWeapon(ctx, w, 0);
    iconCache.set(key, c);
    return c;
  };

  // ---- Characters ------------------------------------------------------------
  // Bodies (legs, torso, head, gear) are pre-rendered per walk frame into sprites and blitted;
  // the arms and the weapon (also a cached sprite) are placed live so aiming stays perfectly smooth.
  // This cuts ~45 vector draw calls per character down to about a dozen.
  const OL = 'rgba(10,8,22,0.88)';
  const bigOf = b => b === 'huge' ? 1.5 : b === 'muscle' ? 1.25 : b === 'thin' ? 0.85 : 1;
  const WALK_STEPS = 12;
  const resBucket = r => Math.pow(2, Math.round(Math.log2(Math.max(0.25, r)) * 4) / 4);
  const spriteCache = new Map();
  function cachePut(key, v) {
    if (spriteCache.size > 700) { let i = 0; for (const k of spriteCache.keys()) { spriteCache.delete(k); if (++i > 200) break; } }
    spriteCache.set(key, v);
  }
  function limb(ctx, pts, col, w) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = OL; ctx.lineWidth = w + 2.6; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = w * 0.3; ctx.stroke();
  }
  // a silhouette copy of a sprite in one flat colour (hit flash, frozen tint)
  function silhouette(src, color) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function drawBody(ctx, o, ph) {
    const c = o.colors, big = bigOf(o.build);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; // ground shadow
    ctx.beginPath(); ctx.ellipse(0, 0, 16 * (o.build === 'huge' ? 1.6 : o.build === 'muscle' ? 1.3 : 1), 4, 0, 0, 7); ctx.fill();
    const legA = Math.sin(ph) * 0.7, legB = -legA, hipY = -30;
    ctx.lineJoin = 'round';
    function leg(a, col) {
      const kx = Math.sin(a) * 15, ky = hipY + Math.cos(a) * 15;
      const bend = Math.max(0, -Math.sin(a)) * 0.6 + 0.15;
      const fx = kx + Math.sin(a - bend) * 15, fy = Math.min(ky + Math.cos(a - bend) * 15, -2);
      limb(ctx, [0, hipY, kx, ky, fx, fy], col, 7.5 * Math.sqrt(big));
      ctx.fillStyle = c.boots || '#1b1b1f';
      rr(ctx, fx - 4.5, fy - 3.5, 12, 7, 2.5); ctx.fill();
      ctx.strokeStyle = OL; ctx.lineWidth = 1.3; ctx.stroke();
    }
    leg(legB, shade(c.pants, -0.25));
    leg(legA, c.pants);
    const shY = -52 - (big - 1) * 6, tw = 10 * big;
    const tg = ctx.createLinearGradient(-tw, 0, tw, 0);
    tg.addColorStop(0, shade(c.shirt, -0.25)); tg.addColorStop(0.55, c.shirt); tg.addColorStop(1, shade(c.shirt, 0.18));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(-tw * 0.75, hipY + 2);
    ctx.lineTo(-tw * (big > 1.1 ? 1.25 : 1), shY - 2);
    ctx.quadraticCurveTo(0, shY - 8, tw * (big > 1.1 ? 1.3 : 1), shY - 2);
    ctx.lineTo(tw * 0.8, hipY + 2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OL; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-tw * 0.4, shY + 6); ctx.quadraticCurveTo(0, shY + 10, tw * 0.5, shY + 6); ctx.stroke();
    if (o.vest) {
      ctx.fillStyle = o.vest;
      rr(ctx, -tw * 0.85, shY + 2, tw * 1.8, (hipY - shY) - 2, 3); ctx.fill();
      ctx.strokeStyle = OL; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-tw * 0.7, shY + 9, tw * 1.4, 2); ctx.fillRect(-tw * 0.7, shY + 15, tw * 1.4, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(tw * 0.2, shY + 4, tw * 0.45, (hipY - shY) - 8);
    }
    ctx.fillStyle = c.belt || '#222'; ctx.fillRect(-tw * 0.8, hipY - 1, tw * 1.6, 4);
    if (c.belt2) { ctx.fillStyle = c.belt2; ctx.fillRect(-1.5, hipY - 1, 3, 4); }
    // head
    const hy = shY - 11 - (big - 1) * 2, hr = 8.5 * Math.sqrt(big);
    ctx.fillStyle = c.skin; ctx.fillRect(-2.5, shY - 6, 5, 6);
    const hg = ctx.createRadialGradient(2, hy - 3, 1, 0, hy, hr * 1.2);
    hg.addColorStop(0, shade(c.skin, 0.2)); hg.addColorStop(1, shade(c.skin, -0.2));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(1, hy, hr, 0, 7); ctx.fill();
    ctx.strokeStyle = OL; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = shade(c.skin, -0.12); ctx.beginPath(); ctx.arc(-3, hy + 1, 2.2, 0, 7); ctx.fill();
    if (o.headgear === 'visor') {
      ctx.fillStyle = '#0b1220'; rr(ctx, 0, hy - 4, hr + 1, 6, 3); ctx.fill();
      ctx.fillStyle = c.accent || '#3ff'; ctx.shadowColor = c.accent || '#3ff'; ctx.shadowBlur = 8;
      ctx.fillRect(2, hy - 2, hr - 1, 2); ctx.shadowBlur = 0;
    } else if (o.headgear === 'shades') {
      ctx.fillStyle = '#0a0a0a'; rr(ctx, 1, hy - 3.5, hr, 4, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(4, hy - 3, 2, 1);
    } else {
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(5, hy - 1.5, 1.4, 0, 7); ctx.fill();
      if (o.dumb) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7.5, hy - 2, 2.2, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(8, hy - 1.5, 1, 0, 7); ctx.fill(); }
    }
    if (o.mouth) { ctx.strokeStyle = '#4a1a10'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(4, hy + 4); ctx.lineTo(8, hy + 3.5); ctx.stroke(); }
    const hat = o.hat;
    if (o.helmet) {
      ctx.fillStyle = o.helmet;
      ctx.beginPath(); ctx.arc(1, hy - 1, hr + 1.5, Math.PI * 1.02, Math.PI * 2.02); ctx.fill();
      ctx.fillRect(-hr - 0.5, hy - 2, hr * 1.4, 4);
      ctx.strokeStyle = OL; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(1, hy - 1, hr + 1.5, Math.PI * 1.02, Math.PI * 2.02); ctx.stroke();
    } else if (hat === 'beanie') {
      ctx.fillStyle = c.hat || '#b33'; ctx.beginPath(); ctx.arc(1, hy - 2, hr + 0.5, Math.PI, 0); ctx.fill();
      ctx.fillRect(-hr - 0.5, hy - 3, hr * 2 + 3, 3);
    } else if (hat === 'bandana') {
      ctx.fillStyle = c.hat || '#c22'; ctx.beginPath(); ctx.arc(1, hy - 2, hr + 0.4, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-hr, hy - 3); ctx.lineTo(-hr - 7, hy + 2); ctx.lineTo(-hr - 4, hy - 4); ctx.fill();
    } else if (hat === 'cap') {
      ctx.fillStyle = c.hat || '#2a4'; ctx.beginPath(); ctx.arc(1, hy - 2, hr + 0.5, Math.PI, 0); ctx.fill();
      ctx.fillRect(1, hy - 4, hr + 7, 3);
    } else if (hat === 'mohawk') {
      ctx.fillStyle = c.hat || '#f2c'; ctx.beginPath(); ctx.moveTo(-6, hy - hr + 2); ctx.lineTo(-2, hy - hr - 8); ctx.lineTo(2, hy - hr - 1); ctx.lineTo(5, hy - hr - 7); ctx.lineTo(6, hy - hr + 2); ctx.fill();
    } else if (hat === 'bald') {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(-1, hy - 4, 3, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = c.hair || '#2a1a10'; ctx.beginPath(); ctx.arc(0, hy - 1.5, hr + 0.3, Math.PI * 0.95, Math.PI * 1.95); ctx.fill();
    }
  }

  const ARM_L = 24;
  function armSprite(col, w, res, bicep, skin) {
    const key = 'a|' + col + '|' + w.toFixed(2) + '|' + res + (bicep ? '|' + skin : '');
    let sp = spriteCache.get(key);
    if (sp) return sp;
    const pad = w / 2 + 2 + (bicep ? 3 : 0), hh = w + 3 + (bicep ? 6 : 0);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((ARM_L + pad * 2) * res); cv.height = Math.ceil(hh * 2 * res);
    const x = cv.getContext('2d');
    x.setTransform(res, 0, 0, res, pad * res, hh * res);
    limb(x, [0, 0, ARM_L * 0.5, 1.5, ARM_L, 0], col, w);
    if (bicep) {
      x.fillStyle = shade(skin, -0.05); x.beginPath(); x.ellipse(ARM_L * 0.27, 0.5, w * 0.85, w * 0.6, 0.05, 0, 7); x.fill();
      x.strokeStyle = OL; x.lineWidth = 1.2; x.stroke();
    }
    sp = { c: cv, ox: pad, oy: hh, w: cv.width / res, h: cv.height / res };
    cachePut(key, sp);
    return sp;
  }
  function handSprite(col, r, res) {
    const key = 'h|' + col + '|' + r.toFixed(2) + '|' + res;
    let sp = spriteCache.get(key);
    if (sp) return sp;
    const R = r + 1.5, cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(R * 2 * res);
    const x = cv.getContext('2d');
    x.setTransform(res, 0, 0, res, R * res, R * res);
    x.fillStyle = col; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill();
    x.strokeStyle = OL; x.lineWidth = 1.2; x.stroke();
    sp = { c: cv, r: R };
    cachePut(key, sp);
    return sp;
  }
  function drawArm(ctx, x0, y0, x1, y1, col, w, res, bicep, skin) {
    const sp = armSprite(col, w, res, bicep, skin);
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, k = len / ARM_L;
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(dy, dx));
    ctx.drawImage(sp.c, -sp.ox * k, -sp.oy, sp.w * k, sp.h);
    ctx.restore();
  }
  function drawHand(ctx, x, y, col, r, res) {
    const sp = handSprite(col, r, res);
    ctx.drawImage(sp.c, x - sp.r, y - sp.r, sp.r * 2, sp.r * 2);
  }

  function bodySprite(o, res, step) {
    const c = o.colors;
    const key = 'b|' + c.skin + c.shirt + c.pants + (c.hat || '') + (c.hair || '') + (c.boots || '') + (c.belt || '') + (c.accent || '') + '|' + o.build + '|' + (o.vest || '') + '|' + (o.helmet || '') + '|' + (o.hat || '') + '|' + (o.headgear || '') + (o.dumb ? 'd' : '') + (o.mouth ? 'm' : '') + '|' + step + '|' + res;
    let sp = spriteCache.get(key);
    if (sp) return sp;
    const big = bigOf(o.build);
    const x0 = -26 * big, x1 = 26 * big, y0 = -64 - 30 * big, y1 = 6;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((x1 - x0) * res) + 2; cv.height = Math.ceil((y1 - y0) * res) + 2;
    const x = cv.getContext('2d');
    x.setTransform(res, 0, 0, res, -x0 * res + 1, -y0 * res + 1);
    drawBody(x, o, step / WALK_STEPS * Math.PI * 2);
    sp = { c: cv, x: x0 - 1 / res, y: y0 - 1 / res, w: cv.width / res, h: cv.height / res, white: null, ice: null };
    cachePut(key, sp);
    return sp;
  }

  // weapons in hand are cached sprites too (animated ones — minigun barrels, chainsaws — stay live)
  Z.weaponSprite = function (w, res) {
    const key = 'w|' + w.id + '|' + res;
    let sp = spriteCache.get(key);
    if (sp) return sp;
    const b = kitBox(w), pad = (w.cat === 'Energy' || w.deflect || w.glow) ? 16 : 4;
    const x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((x1 - x0) * res); cv.height = Math.ceil((y1 - y0) * res);
    const x = cv.getContext('2d');
    x.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
    Z.drawWeapon(x, w, 0);
    sp = { c: cv, x: x0, y: y0, w: cv.width / res, h: cv.height / res };
    cachePut(key, sp);
    return sp;
  };

  // o: {x,y (feet), s (scale), facing, aim (world angle), walk, build, colors, weapon, t, flash, helmet, vest, headgear, filter}
  Z.drawHuman = function (ctx, o) {
    const g = Z.game;
    const res = resBucket((g ? g.scale : 1) * o.s);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(o.s * o.facing, o.s);
    let aim = o.aim;
    if (o.facing < 0) aim = Math.PI - aim;
    while (aim > Math.PI) aim -= Math.PI * 2;
    while (aim < -Math.PI) aim += Math.PI * 2;
    aim = Math.max(-1.45, Math.min(1.45, aim));
    if (o.dead) { ctx.translate(-4, -6); ctx.rotate(-Math.PI / 2 * Math.min(1, o.deadT * 3)); }

    const c = o.colors, big = bigOf(o.build);
    const shX = 2, shY = -52 - (big - 1) * 6;
    const hand = { x: shX + Math.cos(aim) * 18, y: shY + 4 + Math.sin(aim) * 18 };
    const melee = o.weapon && Z.shapeOf(o.weapon).melee;
    // back arm (support hand) behind the body
    if (!melee && !o.dead) {
      const sup = { x: hand.x + Math.cos(aim) * 14, y: hand.y + Math.sin(aim) * 14 };
      drawArm(ctx, -3, shY + 2, sup.x, sup.y, shade(c.shirt, -0.3), 6.5 * big, res, false);
      drawHand(ctx, sup.x, sup.y, c.glove || c.skin, 3.2 * Math.sqrt(big), res);
    }
    // body sprite
    let ph = (o.walk || 0) % (Math.PI * 2); if (ph < 0) ph += Math.PI * 2;
    const step = Math.round(ph / (Math.PI * 2) * WALK_STEPS) % WALK_STEPS;
    const sp = bodySprite(o, res, step);
    ctx.drawImage(sp.c, sp.x, sp.y, sp.w, sp.h);
    const flashA = o.flash > 0 ? Math.min(0.85, o.flash * 7) : 0;
    if (o.filter) { if (!sp.ice) sp.ice = silhouette(sp.c, '#9feaff'); ctx.globalAlpha *= 0.5; ctx.drawImage(sp.ice, sp.x, sp.y, sp.w, sp.h); ctx.globalAlpha /= 0.5; }
    if (flashA) { if (!sp.white) sp.white = silhouette(sp.c, '#ffffff'); const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * flashA; ctx.drawImage(sp.white, sp.x, sp.y, sp.w, sp.h); ctx.globalAlpha = a0; }

    // weapon + front arm
    ctx.save();
    ctx.translate(hand.x, hand.y);
    let wa = aim;
    if (o.swing != null) wa = aim - 1.1 + o.swing * 2.2; // melee swing arc
    ctx.rotate(wa);
    if (o.weapon) {
      const sc = o.weaponScale || 0.62;
      ctx.scale(sc, sc);
      const shape = o.weapon.shape;
      if (shape === 'minigun' || shape === 'chainsaw') Z.drawWeapon(ctx, o.weapon, o.t);
      else { const ws = Z.weaponSprite(o.weapon, resBucket(res * sc)); ctx.drawImage(ws.c, ws.x, ws.y, ws.w, ws.h); }
    }
    ctx.restore();
    drawArm(ctx, shX, shY + 1, hand.x, hand.y, c.shirt, 7 * big, res, big > 1.1, c.skin);
    drawHand(ctx, hand.x, hand.y, c.glove || c.skin, 3.4 * Math.sqrt(big), res);
    ctx.restore();
  };

  // Hand position in world space for a given character (used for muzzle math).
  Z.handPos = function (x, y, s, facing, aim, build) {
    const big = build === 'huge' ? 1.5 : build === 'muscle' ? 1.25 : build === 'thin' ? 0.85 : 1;
    let a = facing < 0 ? Math.PI - aim : aim;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    a = Math.max(-1.45, Math.min(1.45, a));
    const shY = -52 - (big - 1) * 6;
    const hx = 2 + Math.cos(a) * 18, hy = shY + 4 + Math.sin(a) * 18;
    const worldA = facing < 0 ? Math.PI - a : a;
    return { x: x + hx * s * facing, y: y + hy * s, a: worldA };
  };

  Z.muzzlePos = function (hand, w, wscale) {
    const m = Z.weaponMuzzle(w);
    const ca = Math.cos(hand.a), sa = Math.sin(hand.a);
    // When facing left, the weapon is mirrored vertically relative to the world angle.
    const flip = (Math.cos(hand.a) < 0) ? -1 : 1;
    const mx = m[0] * wscale, my = m[1] * wscale * flip;
    return { x: hand.x + ca * mx - sa * my, y: hand.y + sa * mx + ca * my };
  };

  // ---- Medical & armor icons ------------------------------------------------
  Z.drawMedIcon = function (ctx, m, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (m.id === 'gauze' || m.id === 'bandage') {
      ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c9c1ad'; ctx.lineWidth = 1.5;
      for (let r = 3; r < 12; r += 3) { ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); }
      ctx.fillStyle = m.color; ctx.fillRect(8, 4, 12, 7);
    } else if (m.id === 'painkillers') {
      ctx.fillStyle = '#ff9b1f'; rr(ctx, -8, -10, 16, 22, 3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-9, -14, 18, 6);
      ctx.fillStyle = '#fff'; ctx.fillRect(-5, -2, 10, 8);
    } else if (m.id === 'adrenaline' || m.id === 'nano-med') {
      ctx.rotate(-0.7);
      ctx.fillStyle = '#ddd'; ctx.fillRect(-14, -4, 22, 8);
      ctx.fillStyle = m.color; ctx.fillRect(-12, -3, 16, 6);
      ctx.fillStyle = '#999'; ctx.fillRect(8, -1, 10, 2); ctx.fillRect(-18, -6, 4, 12);
    } else {
      const big = m.id === 'trauma-kit' ? 1.1 : m.id === 'medkit' ? 1 : 0.9;
      ctx.scale(big, big);
      ctx.fillStyle = m.id === 'trauma-kit' ? '#2a2a2a' : '#f4f4f4'; rr(ctx, -14, -10, 28, 22, 4); ctx.fill();
      ctx.fillStyle = '#555'; ctx.fillRect(-5, -14, 10, 4);
      ctx.fillStyle = m.color; ctx.fillRect(-3, -6, 6, 14); ctx.fillRect(-7, -2, 14, 6);
    }
    ctx.restore();
  };

  Z.drawArmorIcon = function (ctx, a, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (a.slot === 'head') {
      ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(0, 4, 16, Math.PI, 0); ctx.fill();
      ctx.fillRect(-18, 2, 36, 5);
      if (a.id === 'ballistic-helmet' || a.id === 'nano-visor' || a.id === 'jugg-helmet') {
        ctx.fillStyle = a.id === 'nano-visor' ? '#4ff' : 'rgba(120,180,220,0.7)'; ctx.fillRect(-12, -2, 24, 5);
      }
    } else {
      ctx.fillStyle = a.color;
      ctx.beginPath(); ctx.moveTo(-16, -14); ctx.lineTo(-6, -16); ctx.lineTo(0, -10); ctx.lineTo(6, -16); ctx.lineTo(16, -14);
      ctx.lineTo(15, 16); ctx.lineTo(-15, 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-12, -2, 24, 3); ctx.fillRect(-12, 5, 24, 3);
      if (a.id === 'nano-suit') { ctx.fillStyle = '#4ff'; ctx.fillRect(-2, -8, 4, 22); }
    }
    ctx.restore();
  };
})();
