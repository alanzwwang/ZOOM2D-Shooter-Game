/* Zoom2D Shooter — destructible heightmap terrain, biomes, decorations and parallax sky. */
(function () {
  const Z = window.Z;

  Z.rng = function (seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  const BIOMES = [
    { name: 'Grasslands', grass: '#4caf3a', grassHi: '#8be05a', top: '#5a3d22', dirt: '#6e4a2a', deep: '#2a1a0e', stone: '#7d6b5a', blade: '#5fcf3f', decor: ['tree', 'tree', 'pine', 'bush', 'rock', 'flower'] },
    { name: 'Desert Canyon', grass: '#e0b25a', grassHi: '#f7d98c', top: '#c98a45', dirt: '#b8733a', deep: '#5a2e14', stone: '#d9a066', blade: '#d8b060', decor: ['cactus', 'cactus', 'rock', 'skull', 'deadtree'] },
    { name: 'Frozen Peaks', grass: '#e8f4ff', grassHi: '#ffffff', top: '#9fb6cc', dirt: '#6f8399', deep: '#2a3646', stone: '#a9bdd1', blade: '#f4fbff', decor: ['snowpine', 'snowpine', 'rock', 'ice'] },
    { name: 'Wasteland', grass: '#6f6a3a', grassHi: '#9a9255', top: '#4a3a30', dirt: '#3f342c', deep: '#16110d', stone: '#5c524a', blade: '#7c7444', decor: ['deadtree', 'barrel', 'rock', 'wreck', 'tire'] }
  ];
  Z.BIOMES = BIOMES;
  const BIOME_LEN = 4200;

  class Terrain {
    constructor(seed, width) {
      this.seed = seed;
      this.width = width;
      this.step = 4;
      this.cols = Math.ceil(width / this.step) + 2;
      this.h = new Float32Array(this.cols);
      this.burn = new Uint8Array(this.cols);
      this.bladeH = new Float32Array(this.cols);
      this.bottom = 1500;
      this.decor = [];
      this.patterns = null;
      this.generate();
    }

    biomeAt(x) { return Math.max(0, Math.floor(x / BIOME_LEN)) % BIOMES.length; }

    generate() {
      const R = Z.rng(this.seed);
      const oct = [];
      for (let i = 0; i < 5; i++) oct.push({ ph: R() * 1000, ph2: R() * 1000 });
      const N = this.cols, st = this.step;
      // smooth value-ish noise from summed sines with random phases (cheap and seamless)
      for (let i = 0; i < N; i++) {
        const x = i * st;
        const b = this.biomeAt(x);
        let y = 640;
        y += Math.sin(x / 1900 + oct[0].ph) * 150 + Math.sin(x / 1210 + oct[0].ph2) * 70;
        y += Math.sin(x / 560 + oct[1].ph) * 55 + Math.sin(x / 390 + oct[1].ph2) * 30;
        y += Math.sin(x / 150 + oct[2].ph) * 14 + Math.sin(x / 97 + oct[2].ph2) * 8;
        y += Math.sin(x / 41 + oct[3].ph) * 2.5;
        if (b === 1) { // canyon mesas: terrace the height
          const terr = Math.round(y / 70) * 70;
          y = y * 0.35 + terr * 0.65;
        }
        if (b === 2) y -= 90 + Math.abs(Math.sin(x / 700 + oct[4].ph)) * 120; // peaks
        if (b === 3) y += Math.sin(x / 230 + oct[4].ph2) * 22;
        this.h[i] = Math.max(300, Math.min(900, y));
      }
      // smooth biome seams
      for (let k = 1; k * BIOME_LEN < this.width; k++) {
        const c = Math.round(k * BIOME_LEN / st), r = 60;
        const a = this.h[Math.max(0, c - r)], bb = this.h[Math.min(N - 1, c + r)];
        for (let i = -r; i <= r; i++) {
          const j = c + i; if (j < 0 || j >= N) continue;
          const t = (i + r) / (2 * r), s = t * t * (3 - 2 * t);
          this.h[j] = this.h[j] * 0.25 + (a + (bb - a) * s) * 0.75;
        }
      }
      // shop sign plateaus
      this.shops = [];
      for (let x = 700; x < this.width - 400; x += 2800 + Math.floor(R() * 900)) this.shops.push(x);
      for (const sx of this.shops) this.flatten(sx, 170, 120);
      this.locked = new Uint8Array(N);
      for (const sx of this.shops) for (let i = Math.floor((sx - 165) / st); i <= Math.ceil((sx + 165) / st); i++) if (i >= 0 && i < N) this.locked[i] = 1;
      // spawn plateau
      this.flatten(260, 220, 160);
      // world edges rise into cliffs
      for (let i = 0; i < 60; i++) {
        const k = (60 - i) / 60;
        this.h[i] = Math.min(this.h[i], this.h[60] - k * k * 400);
        this.h[N - 1 - i] = Math.min(this.h[N - 1 - i], this.h[N - 61] - k * k * 400);
      }
      for (let i = 0; i < N; i++) this.bladeH[i] = 3 + R() * 7;

      // decorations
      const dec = this.decor = [];
      for (let x = 120; x < this.width - 120; x += 60 + R() * 170) {
        if (this.shops.some(s => Math.abs(s - x) < 140)) continue;
        if (Math.abs(this.slope(x)) > 0.9) continue;
        const b = BIOMES[this.biomeAt(x)];
        const type = b.decor[Math.floor(R() * b.decor.length)];
        dec.push({ type, x, s: 0.7 + R() * 0.7, seed: R(), alive: true, back: R() < 0.35 });
      }
    }

    flatten(cx, half, blend) {
      const st = this.step;
      const c = Math.round(cx / st);
      let avg = 0, n = 0;
      const hc = Math.round(half / st);
      for (let i = c - hc; i <= c + hc; i++) { if (i >= 0 && i < this.cols) { avg += this.h[i]; n++; } }
      avg /= n || 1;
      const R = (half + blend) / st;
      for (let i = Math.floor(c - R); i <= c + R; i++) {
        if (i < 0 || i >= this.cols) continue;
        const d = Math.abs(i - c) * st;
        const t = d < half ? 1 : 1 - (d - half) / blend;
        const s = t * t * (3 - 2 * t);
        this.h[i] = this.h[i] * (1 - s) + avg * s;
      }
    }

    heightAt(x) {
      const f = x / this.step;
      let i = Math.floor(f);
      if (i < 0) return this.h[0] - 2000;
      if (i >= this.cols - 1) return this.h[this.cols - 1] - 2000;
      const t = f - i;
      return this.h[i] * (1 - t) + this.h[i + 1] * t;
    }
    slope(x) { return (this.heightAt(x + 6) - this.heightAt(x - 6)) / 12; }
    solid(x, y) { return x < 0 || x > this.width || y >= this.heightAt(x); }

    // Carve a crater. Explosions dig bowls, not wells: steep walls slump until they're walkable,
    // so repeated blasts can never trap you in a pit. Returns how much dirt was removed.
    carve(cx, cy, r) {
      const st = this.step, h = this.h;
      let removed = 0;
      const i0 = Math.max(2, Math.floor((cx - r) / st)), i1 = Math.min(this.cols - 3, Math.ceil((cx + r) / st));
      const rim = (h[Math.max(0, i0 - 12)] + h[Math.min(this.cols - 1, i1 + 12)]) / 2;
      for (let i = i0; i <= i1; i++) {
        const dx = i * st - cx;
        if (Math.abs(dx) > r) continue;
        const dy = Math.sqrt(r * r - dx * dx);
        const top = cy - dy, bot = cy + dy;
        if (this.locked[i]) continue;
        if (top <= h[i] && bot > h[i]) {
          const nh = Math.min(this.bottom - 40, bot, rim + 150);
          if (nh > h[i]) { removed += nh - h[i]; h[i] = nh; }
        }
      }
      // slump: limit the slope between neighbouring columns (mass-preserving)
      const a = Math.max(2, i0 - 24), b = Math.min(this.cols - 3, i1 + 24), maxStep = 6.5;
      for (let it = 0; it < 14; it++) {
        let moved = false;
        for (let i = a; i < b; i++) {
          if (this.locked[i] || this.locked[i + 1]) continue;
          const d = h[i + 1] - h[i];
          if (d > maxStep) { const m = (d - maxStep) / 2; h[i + 1] -= m; h[i] += m; moved = true; }
          else if (d < -maxStep) { const m = (-d - maxStep) / 2; h[i] -= m; h[i + 1] += m; moved = true; }
        }
        if (!moved) break;
      }
      for (let i = Math.floor((cx - r * 1.25) / st); i <= Math.ceil((cx + r * 1.25) / st); i++) if (i >= 0 && i < this.cols) this.burn[i] = Math.min(255, this.burn[i] + 160);
      for (const d of this.decor) if (d.alive && Math.abs(d.x - cx) < r * 0.9 && Math.abs(this.heightAt(d.x) - cy) < r * 1.4) d.alive = false;
      this.invalidate(cx - r * 1.4 - 24 * st, cx + r * 1.4 + 24 * st);
      return removed;
    }
    // mark cached terrain chunks in a world x-range as needing a redraw
    invalidate(x0, x1) {
      if (!this.chunks) return;
      for (let c = Math.floor(x0 / CHUNK); c <= Math.floor(x1 / CHUNK); c++) { const ch = this.chunks.get(c); if (ch) ch.dirty = true; }
    }
    burnAt(x, amt) {
      const i = Math.floor(x / this.step);
      if (i < 0 || i >= this.cols) return;
      const before = this.burn[i];
      this.burn[i] = Math.min(255, before + amt);
      if ((before >> 5) !== (this.burn[i] >> 5)) this.invalidate(x - 8, x + 8);
    }

    // Ray march for line-of-sight / hitscan. Returns distance to first solid or max.
    raycast(x, y, dx, dy, max) {
      const step = 6;
      for (let d = 0; d < max; d += step) {
        const px = x + dx * d, py = y + dy * d;
        if (this.solid(px, py)) return d;
      }
      return max;
    }

    // ---- rendering -----------------------------------------------------------
    makePatterns() {
      this.patternCanvases = BIOMES.map((b, bi) => {
        const S = 256;
        const c = document.createElement('canvas'); c.width = S; c.height = S;
        const g = c.getContext('2d');
        g.fillStyle = b.dirt; g.fillRect(0, 0, S, S);
        const R = Z.rng(99 + bi);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = Z.shade(b.dirt, Math.round((R() - 0.5) * 7) / 20);
          g.globalAlpha = 0.5;
          const x = R() * S, y = R() * S, r = 1 + R() * 3;
          for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill(); }
        }
        g.globalAlpha = 1;
        for (let i = 0; i < 26; i++) { // pebbles & stones
          const x = R() * S, y = R() * S, rx = 3 + R() * 9, ry = rx * (0.5 + R() * 0.4), rot = R() * 3;
          for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
            g.fillStyle = Z.shade(b.stone, -0.2);
            g.beginPath(); g.ellipse(x + ox, y + oy + 1.5, rx, ry, rot, 0, 7); g.fill();
            g.fillStyle = b.stone;
            g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, 0, 0, 7); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.15)';
            g.beginPath(); g.ellipse(x + ox - rx * 0.3, y + oy - ry * 0.3, rx * 0.4, ry * 0.3, 0, 0, 7); g.fill();
          }
        }
        if (bi === 2) { // ice crystals
          g.strokeStyle = 'rgba(220,240,255,0.25)'; g.lineWidth = 1;
          for (let i = 0; i < 40; i++) { const x = R() * S, y = R() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8 * R(), y + 8 * R()); g.stroke(); }
        }
        return c;
      });
    }

    // Biome mix at world x: near a border the two biomes cross-fade over 1200px.
    blendAt(x) {
      const B = Math.round(x / BIOME_LEN) * BIOME_LEN;
      const d = x - B;
      if (B > 0 && B < this.width && Math.abs(d) < BLEND) {
        const a = this.biomeAt(B - 1), b = this.biomeAt(B + 1);
        const f = (d + BLEND) / (2 * BLEND);
        return { a, b, f: f * f * (3 - 2 * f) };
      }
      const k = this.biomeAt(x);
      return { a: k, b: k, f: 0 };
    }

    // Terrain is drawn from cached chunk images; a chunk is only re-rendered when it's cratered,
    // scorched or the zoom changes. Grass blades are the only per-frame terrain drawing.
    draw(ctx, x0, x1, yBottom, time, quality, scale) {
      if (!this.patternCanvases) this.makePatterns();
      if (!this.chunks) this.chunks = new Map();
      const rs = Math.min(scale, 2.2); // chunk render resolution (capped for memory)
      const c0 = Math.floor(x0 / CHUNK), c1 = Math.floor(x1 / CHUNK);
      let budget = 1;
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || c * CHUNK > this.width) continue;
        let ch = this.chunks.get(c);
        const stale = ch && (ch.dirty || Math.abs(ch.rs - rs) / rs > 0.04 || ch.q !== quality);
        if (!ch || (stale && budget > 0)) { if (ch) budget--; ch = this.renderChunk(c, rs, quality, ch); this.chunks.set(c, ch); }
        ch.used = time;
        ctx.drawImage(ch.canvas, ch.x0, ch.y0, ch.w, ch.h);
        if (yBottom > ch.y0 + ch.h) { ctx.fillStyle = ch.deep; ctx.fillRect(ch.x0 + PAD, ch.y0 + ch.h - 1, CHUNK, yBottom - (ch.y0 + ch.h) + 60); }
      }
      // evict old chunks
      if (this.chunks.size > 14) {
        const old = [...this.chunks.entries()].sort((p, q) => p[1].used - q[1].used).slice(0, this.chunks.size - 10);
        for (const [k] of old) this.chunks.delete(k);
      }
      if (quality > 0) this.drawBlades(ctx, x0, x1, time, quality);
    }

    renderChunk(c, rs, quality, prev) {
      const st = this.step, h = this.h, x0 = c * CHUNK - PAD, x1 = (c + 1) * CHUNK + PAD;
      const i0 = Math.max(0, Math.floor(x0 / st)), i1 = Math.min(this.cols - 1, Math.ceil(x1 / st));
      let minH = 1e9, maxH = -1e9;
      for (let i = i0; i <= i1; i++) { if (h[i] < minH) minH = h[i]; if (h[i] > maxH) maxH = h[i]; }
      const y0 = Math.floor(minH - 34), y1 = Math.ceil(maxH + 560);
      const W = x1 - x0, H = y1 - y0;
      const cv = prev && prev.canvas && prev.canvas.width === Math.ceil(W * rs) && prev.canvas.height === Math.ceil(H * rs) ? prev.canvas : document.createElement('canvas');
      cv.width = Math.ceil(W * rs); cv.height = Math.ceil(H * rs);
      const g = cv.getContext('2d');
      g.setTransform(rs, 0, 0, rs, -x0 * rs, -y0 * rs);
      g.clearRect(x0, y0, W, H);
      const surface = () => { g.beginPath(); g.moveTo(i0 * st, h[i0]); for (let i = i0 + 1; i <= i1; i++) g.lineTo(i * st, h[i]); };
      // body: base biome texture, then cross-fade strips of the neighbour biome near borders
      surface(); g.lineTo(i1 * st, y1 + 2); g.lineTo(i0 * st, y1 + 2); g.closePath();
      g.save(); g.clip();
      const mid = this.blendAt((x0 + x1) / 2);
      const pat = k => { const p = g.createPattern(this.patternCanvases[k], 'repeat'); return p; };
      g.fillStyle = pat(mid.a); g.fillRect(x0, y0, W, H);
      const STRIP = 16;
      const blended = this.blendAt(x0).f || this.blendAt(x1).f || mid.f;
      if (blended) {
        const pb = pat(mid.b);
        for (let x = x0; x < x1; x += STRIP) {
          const m = this.blendAt(x + STRIP / 2);
          const wB = m.a === m.b ? (m.a === mid.b ? 1 : 0) : (m.b === mid.b ? m.f : m.a === mid.b ? 1 - m.f : 0);
          if (wB > 0.01) { g.globalAlpha = wB; g.fillStyle = pb; g.fillRect(x, y0, STRIP + 0.5, H); }
        }
        g.globalAlpha = 1;
      }
      const deepA = BIOMES[mid.a].deep, deepB = BIOMES[mid.b].deep;
      const deep = mid.f > 0.5 ? deepB : deepA;
      const gr = g.createLinearGradient(0, 0, 0, 560);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.3, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, deep);
      g.fillStyle = gr;
      for (let x = Math.floor(x0 / 8) * 8; x < x1; x += 8) {
        const sh = this.heightAt(x + 4);
        g.save(); g.translate(0, sh); g.fillRect(x, 0, 8.5, y1 - sh + 2); g.restore();
      }
      // topsoil band + grass + highlight, coloured per strip so borders blend
      g.lineJoin = 'round'; g.lineCap = 'round';
      const strips = blended ? Math.ceil(W / STRIP) : 1;
      for (let s = 0; s < strips; s++) {
        const sx0 = blended ? x0 + s * STRIP : x0, sx1 = blended ? sx0 + STRIP : x1;
        const m = this.blendAt((sx0 + sx1) / 2), A = BIOMES[m.a], Bm = BIOMES[m.b];
        const col = k => m.f ? lerpHex(A[k], Bm[k], m.f) : A[k];
        const j0 = Math.max(i0, Math.floor(sx0 / st) - 1), j1 = Math.min(i1, Math.ceil(sx1 / st) + 1);
        if (blended) { g.save(); g.beginPath(); g.rect(sx0, y0, sx1 - sx0, H); g.clip(); }
        g.beginPath(); g.moveTo(j0 * st, h[j0]); for (let i = j0 + 1; i <= j1; i++) g.lineTo(i * st, h[i]);
        g.globalAlpha = 0.85; g.strokeStyle = col('top'); g.lineWidth = 46; g.stroke(); g.globalAlpha = 1;
        // grass skips scorched ground
        g.beginPath();
        let pen = false;
        for (let i = j0; i <= j1; i++) {
          if (this.burn[i] > 120) { pen = false; continue; }
          if (!pen) { g.moveTo(i * st, h[i]); pen = true; } else g.lineTo(i * st, h[i]);
        }
        g.strokeStyle = col('grass'); g.lineWidth = 15; g.stroke();
        g.strokeStyle = col('grassHi'); g.lineWidth = 4; g.stroke();
        if (blended) g.restore();
      }
      // scorch marks: smooth soft strokes along the surface, darker where it burned more
      for (const [lo, w, a] of [[1, 22, 0.28], [90, 16, 0.38], [170, 10, 0.5]]) {
        g.beginPath(); let pen = false;
        for (let i = i0; i <= i1; i++) {
          if (this.burn[i] < lo) { pen = false; continue; }
          if (!pen) { g.moveTo(i * st, h[i] + 3); pen = true; } else g.lineTo(i * st, h[i] + 3);
        }
        g.strokeStyle = 'rgba(18,10,6,' + a + ')'; g.lineWidth = w; g.stroke();
      }
      g.restore();
      return { canvas: cv, x0, y0, w: W, h: H, rs, q: quality, dirty: false, deep, used: 0 };
    }

    drawBlades(ctx, x0, x1, time, quality) {
      const st = this.step, h = this.h;
      const i0 = Math.max(0, Math.floor(x0 / st) - 2), i1 = Math.min(this.cols - 1, Math.ceil(x1 / st) + 2);
      const every = quality > 1 ? 1 : 2;
      ctx.lineWidth = 1.6;
      // group into per-biome batches (2 paths at most on screen)
      let cur = -1;
      ctx.beginPath();
      for (let i = i0; i <= i1; i += every) {
        const x = i * st, k = this.biomeAt(x);
        if (k !== cur) { if (cur >= 0) { ctx.strokeStyle = BIOMES[cur].blade; ctx.stroke(); ctx.beginPath(); } cur = k; }
        if (this.burn[i] > 60) continue;
        const y = h[i], hh = this.bladeH[i];
        const sway = Math.sin(time * 2 + x * 0.05) * 2.2;
        ctx.moveTo(x, y + 2); ctx.lineTo(x + sway, y - hh);
      }
      if (cur >= 0) { ctx.strokeStyle = BIOMES[cur].blade; ctx.stroke(); }
    }

    drawDecor(ctx, x0, x1, back, time) {
      for (const d of this.decor) {
        if (!d.alive || d.back !== back || d.x < x0 - 200 || d.x > x1 + 200) continue;
        const y = this.heightAt(d.x) + 3;
        ctx.save(); ctx.translate(d.x, y); ctx.scale(d.s, d.s);
        if (back) ctx.globalAlpha = 0.75;
        drawProp(ctx, d, time);
        ctx.restore();
      }
    }
  }
  const CHUNK = 512, PAD = 24, BLEND = 600;
  function lerpHex(a, b, f) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = ((pa >> 16) & 255) * (1 - f) + ((pb >> 16) & 255) * f, gg = ((pa >> 8) & 255) * (1 - f) + ((pb >> 8) & 255) * f, bl = (pa & 255) * (1 - f) + (pb & 255) * f;
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(bl)).toString(16).slice(1);
  }
  Z.lerpHex = lerpHex;
  Z.Terrain = Terrain;

  function drawProp(ctx, d, time) {
    const sw = Math.sin(time * 1.3 + d.x * 0.01) * 0.03;
    switch (d.type) {
      case 'tree': {
        ctx.fillStyle = '#5b3a1e'; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-4, -70); ctx.lineTo(4, -70); ctx.lineTo(7, 0); ctx.fill();
        ctx.rotate(sw);
        const cols = ['#2f7d32', '#3d9a3a', '#55b84a'];
        const blobs = [[-22, -78, 26], [20, -82, 24], [0, -104, 30], [-8, -88, 26], [12, -96, 22]];
        blobs.forEach((b, i) => { ctx.fillStyle = cols[i % 3]; ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, 7); ctx.fill(); });
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(6, -112, 14, 0, 7); ctx.fill();
        break;
      }
      case 'pine': case 'snowpine': {
        ctx.fillStyle = '#4a2f18'; ctx.fillRect(-4, -26, 8, 26);
        ctx.rotate(sw);
        for (let i = 0; i < 4; i++) {
          const w = 34 - i * 7, y = -22 - i * 22;
          ctx.fillStyle = i % 2 ? '#1f5f3a' : '#26704a';
          ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(0, y - 38); ctx.lineTo(w, y); ctx.fill();
          if (d.type === 'snowpine') { ctx.fillStyle = '#f4fbff'; ctx.beginPath(); ctx.moveTo(-w * 0.5, y - 19); ctx.lineTo(0, y - 38); ctx.lineTo(w * 0.5, y - 19); ctx.fill(); }
        }
        break;
      }
      case 'bush':
        ctx.fillStyle = '#2f7d32'; ctx.beginPath(); ctx.arc(-10, -8, 13, 0, 7); ctx.arc(8, -10, 15, 0, 7); ctx.arc(0, -18, 12, 0, 7); ctx.fill();
        ctx.fillStyle = '#e04a5a'; ctx.beginPath(); ctx.arc(-4, -16, 2.5, 0, 7); ctx.arc(10, -12, 2.5, 0, 7); ctx.fill();
        break;
      case 'flower':
        ctx.strokeStyle = '#3d9a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -16); ctx.stroke();
        ctx.fillStyle = ['#ffd84d', '#ff6ab0', '#9ad4ff'][Math.floor(d.seed * 3)];
        for (let i = 0; i < 5; i++) { const a = i * 1.256; ctx.beginPath(); ctx.arc(Math.cos(a) * 4, -16 + Math.sin(a) * 4, 3, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#7a4a10'; ctx.beginPath(); ctx.arc(0, -16, 2.2, 0, 7); ctx.fill();
        break;
      case 'rock':
        ctx.fillStyle = '#6e6a66'; ctx.beginPath(); ctx.moveTo(-20, 2); ctx.lineTo(-14, -16); ctx.lineTo(4, -22); ctx.lineTo(20, -10); ctx.lineTo(22, 2); ctx.fill();
        ctx.fillStyle = '#8e8a84'; ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(4, -22); ctx.lineTo(6, -10); ctx.lineTo(-8, -6); ctx.fill();
        break;
      case 'cactus':
        ctx.fillStyle = '#3f8f3a';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-7, -70, 14, 70, 7) : ctx.rect(-7, -70, 14, 70); ctx.fill();
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-24, -48, 10, 26, 5) : ctx.rect(-24, -48, 10, 26); ctx.fill(); ctx.fillRect(-20, -28, 14, 8);
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(14, -58, 10, 24, 5) : ctx.rect(14, -58, 10, 24); ctx.fill(); ctx.fillRect(6, -40, 14, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-3, -66, 3, 62);
        break;
      case 'skull':
        ctx.fillStyle = '#efe6d0'; ctx.beginPath(); ctx.arc(0, -8, 8, 0, 7); ctx.fill(); ctx.fillRect(-5, -3, 10, 4);
        ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(-3, -9, 2, 0, 7); ctx.arc(3, -9, 2, 0, 7); ctx.fill();
        break;
      case 'deadtree':
        ctx.strokeStyle = '#4a3a2c'; ctx.lineCap = 'round';
        ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2, -60); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1, -35); ctx.lineTo(-20, -55); ctx.moveTo(2, -48); ctx.lineTo(22, -66); ctx.moveTo(2, -60); ctx.lineTo(-6, -80); ctx.stroke();
        ctx.lineCap = 'butt';
        break;
      case 'ice':
        ctx.fillStyle = 'rgba(170,220,255,0.85)'; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-6, -30); ctx.lineTo(0, -8); ctx.lineTo(6, -40); ctx.lineTo(14, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(6, -40); ctx.lineTo(8, -6); ctx.fill();
        break;
      case 'barrel':
        ctx.fillStyle = '#7a2a1a'; ctx.fillRect(-11, -30, 22, 30);
        ctx.fillStyle = '#a33a22'; ctx.fillRect(-11, -24, 22, 4); ctx.fillRect(-11, -10, 22, 4);
        ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(0, -21); ctx.lineTo(5, -14); ctx.fill();
        break;
      case 'tire':
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, -9, 14, 9, 0, 0, 7); ctx.stroke();
        break;
      case 'wreck':
        ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(-44, -24); ctx.lineTo(-18, -26); ctx.lineTo(-6, -42); ctx.lineTo(26, -42); ctx.lineTo(40, -22); ctx.lineTo(54, -18); ctx.lineTo(52, 0); ctx.fill();
        ctx.fillStyle = '#2a2420'; ctx.fillRect(-2, -38, 12, 12); ctx.fillRect(14, -38, 10, 12);
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-30, 0, 9, 0, 7); ctx.arc(34, 0, 9, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(160,80,30,0.5)'; ctx.fillRect(-40, -18, 30, 6);
        break;
    }
  }

  // ---- Sky & parallax ---------------------------------------------------------
  // Each biome has its own time of day. Expensive layers (gradient + sun, skyline, mountain
  // ranges) are pre-rendered into offscreen canvases and only rebuilt when the view changes.
  const SKIES = [
    { grad: ['#1b3c7e', '#3d72bd', '#9cc3e6', '#ffd9a0'], sun: [255, 236, 190], sunR: 0.06, stars: 0, mtn: ['#5d6fa8', '#45578f', '#2f3f72'], city: 'rgba(40,52,96,0.55)', cloud: 'rgba(255,255,255,0.22)', haze: 'rgba(255,220,170,0.0)' },
    { grad: ['#2a0f2a', '#7a2a3a', '#e8683a', '#ffc070'], sun: [255, 200, 120], sunR: 0.09, stars: 0.25, mtn: ['#8a3c34', '#64262a', '#401620'], city: 'rgba(60,18,30,0.55)', cloud: 'rgba(255,170,140,0.13)', haze: 'rgba(255,140,60,0.10)' },
    { grad: ['#02040f', '#07142e', '#15305a', '#3c5c8a'], sun: [220, 235, 255], sunR: 0.035, stars: 1, mtn: ['#33496f', '#243656', '#16233c'], city: 'rgba(14,24,48,0.6)', cloud: 'rgba(170,200,255,0.08)', haze: 'rgba(120,180,255,0.0)', aurora: true, moon: true },
    { grad: ['#120a08', '#3a1a12', '#8a3a1a', '#d97a2a'], sun: [255, 150, 80], sunR: 0.07, stars: 0.12, mtn: ['#4a2a1e', '#2e1a14', '#1a0e0a'], city: 'rgba(30,14,10,0.6)', cloud: 'rgba(120,80,60,0.18)', haze: 'rgba(160,80,30,0.15)' }
  ];
  const mix = (a, b, f) => f <= 0 ? a : f >= 1 ? b : lerpHex(a, b, f);
  const Sky = Z.Sky = {
    stars: null, clouds: null, cache: {},
    init(seed) {
      const R = Z.rng(seed + 7);
      this.stars = Array.from({ length: 180 }, () => ({ x: R(), y: R() * 0.6, r: R() * 1.4 + 0.3, tw: R() * 6 }));
      this.clouds = Array.from({ length: 14 }, () => ({ x: R() * 6000, y: 60 + R() * 260, s: 0.6 + R() * 1.4, sp: 6 + R() * 14, seed: R() }));
      this.layers = [0, 1, 2].map(() => { const P = []; for (let k = 0; k < 6; k++) P.push({ f: 0.6 + R() * 3, p: R() * 10, a: R() }); return P; });
      const RR = Z.rng(seed + 31);
      this.city = Array.from({ length: 70 }, () => ({ w: 30 + RR() * 60, h: 60 + RR() * 220, gap: 4 + RR() * 18, win: RR(), ant: RR() < 0.2 }));
      this.cityW = this.city.reduce((s, b) => s + b.w + b.gap, 0);
      this.cache = {};
    },
    gradCanvas(k, W, H) {
      const key = 'g' + k + 'x' + W + 'x' + H;
      if (this.cache[key]) return this.cache[key];
      const S = SKIES[k], c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, S.grad[0]); g.addColorStop(0.45, S.grad[1]); g.addColorStop(0.78, S.grad[2]); g.addColorStop(1, S.grad[3]);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const sx = W * 0.72, sy = H * (S.moon ? 0.22 : 0.6), [r, gg, b] = S.sun;
      const sg = x.createRadialGradient(sx, sy, 0, sx, sy, H * 0.5);
      sg.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',0.95)'); sg.addColorStop(S.sunR, 'rgba(' + r + ',' + gg + ',' + b + ',0.9)');
      sg.addColorStop(S.sunR * 1.3, 'rgba(' + r + ',' + gg + ',' + b + ',0.3)'); sg.addColorStop(1, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
      x.fillStyle = sg; x.fillRect(0, 0, W, H);
      if (S.moon) { x.fillStyle = 'rgba(200,215,240,0.35)'; x.beginPath(); x.arc(sx - H * 0.012, sy - H * 0.008, H * 0.03, 0, 7); x.fill(); }
      if (S.haze !== 'rgba(255,220,170,0.0)') { const hz = x.createLinearGradient(0, H * 0.55, 0, H); hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(1, S.haze); x.fillStyle = hz; x.fillRect(0, 0, W, H); }
      this.cache[key] = c;
      return c;
    },
    cityCanvas(k) { // skyline strip in world-ish units at scale k
      const key = 'c' + k.toFixed(3);
      if (this.cache[key]) return this.cache[key];
      for (const kk in this.cache) if (kk[0] === 'c') delete this.cache[kk];
      const W = Math.ceil(this.cityW * k), H = Math.ceil(300 * k);
      const c = document.createElement('canvas'); c.width = Math.min(8192, W); c.height = H;
      const x = c.getContext('2d');
      let px = 0;
      this.city.forEach((b, bi) => {
        const bw = b.w * k, bh = b.h * k;
        x.fillStyle = '#fff'; x.fillRect(px, H - bh, bw, bh);
        if (b.ant) x.fillRect(px + bw / 2 - k, H - bh - 18 * k, 2 * k, 18 * k);
        px += bw + b.gap * k;
      });
      // windows are cut as a separate tinted layer
      const win = document.createElement('canvas'); win.width = c.width; win.height = H;
      const wx = win.getContext('2d'); wx.fillStyle = 'rgba(255,210,120,0.55)';
      px = 0;
      this.city.forEach((b, bi) => {
        const bw = b.w * k, bh = b.h * k;
        if (b.win > 0.3) { let n = 0; for (let wy = 8; wy < b.h - 8; wy += 14) for (let wx2 = 5; wx2 < b.w - 8; wx2 += 11) { n++; if ((n * 7 + bi * 13) % 5 === 0) wx.fillRect(px + wx2 * k, H - bh + wy * k, 4 * k, 6 * k); } }
        px += bw + b.gap * k;
      });
      const out = { mask: c, win, W: c.width, H, tinted: {} };
      this.cache[key] = out;
      return out;
    },
    cityTinted(cc, color) {
      if (cc.tinted[color]) return cc.tinted[color];
      const c = document.createElement('canvas'); c.width = cc.W; c.height = cc.H;
      const x = c.getContext('2d');
      x.drawImage(cc.mask, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, cc.W, cc.H);
      x.globalCompositeOperation = 'source-over'; x.drawImage(cc.win, 0, 0);
      cc.tinted[color] = c;
      return c;
    },
    // a mountain range as a wide strip; re-rendered only when the camera has scrolled far or colours change
    layerStrip(L, off, scale, W, H, color) {
      const key = 'm' + L;
      let s = this.cache[key];
      const span = W / scale;
      if (!s || s.scale !== scale || s.W !== W || s.color !== color || off < s.off0 || off + span > s.off0 + s.span) {
        const off0 = off - span * 0.5, sw = Math.ceil(W * 2);
        const c = (s && s.canvas.width === sw && s.canvas.height === H) ? s.canvas : document.createElement('canvas');
        c.width = sw; c.height = H;
        const x = c.getContext('2d');
        x.clearRect(0, 0, sw, H);
        const P = this.layers[L], base = H * 0.55;
        x.fillStyle = color; x.beginPath(); x.moveTo(0, H);
        for (let px = 0; px <= sw + 8; px += 8) {
          const u = (px / scale + off0) / 300;
          let y = 0;
          for (const p of P) y += Math.sin(u * p.f + p.p) * (40 + p.a * 50) / (1 + p.f * 0.3);
          if (L === 0) y += Math.abs(Math.sin(u * 0.8)) * 30;
          x.lineTo(px, base - (y + 90 - L * 20) * scale * (1.2 - L * 0.15));
        }
        x.lineTo(sw, H); x.closePath(); x.fill();
        s = this.cache[key] = { canvas: c, off0, span: span * 2, scale, W, color, base };
      }
      return s;
    },
    // Draw in screen space. blend = { a, b, f } from terrain.blendAt
    draw(ctx, cam, scale, W, H, time, blend, quality) {
      const A = SKIES[blend.a], B = SKIES[blend.b], f = blend.f;
      ctx.drawImage(this.gradCanvas(blend.a, W, H), 0, 0);
      if (f > 0.01) { ctx.globalAlpha = f; ctx.drawImage(this.gradCanvas(blend.b, W, H), 0, 0); ctx.globalAlpha = 1; }
      // stars
      const starA = A.stars * (1 - f) + B.stars * f;
      if (starA > 0.02) {
        const L = this.starLayers(W, H, scale);
        const ox = -((cam.x * scale * 0.02) % W + W) % W;
        for (let i = 0; i < 2; i++) {
          ctx.globalAlpha = starA * (0.45 + 0.3 * Math.sin(time * 1.7 + i * 3.1));
          ctx.drawImage(L[i], ox, 0); ctx.drawImage(L[i], ox + W, 0);
        }
        ctx.globalAlpha = 1;
      }
      // aurora over the frozen peaks
      const auroraA = (A.aurora ? 1 - f : 0) + (B.aurora ? f : 0);
      if (auroraA > 0.02 && quality > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) {
          const y0 = H * (0.12 + k * 0.07), amp = H * 0.05;
          const gr = ctx.createLinearGradient(0, y0 - amp, 0, y0 + amp * 3);
          const hue = k === 1 ? '120,255,200' : k === 2 ? '170,120,255' : '90,255,150';
          gr.addColorStop(0, 'rgba(' + hue + ',0)'); gr.addColorStop(0.35, 'rgba(' + hue + ',' + 0.22 * auroraA + ')'); gr.addColorStop(1, 'rgba(' + hue + ',0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, y0 + amp * 3);
          for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, y0 + Math.sin(x / W * 6 + time * 0.25 + k * 2 - cam.x * 0.0004) * amp + Math.sin(x / W * 15 + time * 0.6 + k) * amp * 0.3);
          ctx.lineTo(W, y0 + amp * 3); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      // city skyline (furthest)
      const k = scale * 0.7;
      const cc = this.cityCanvas(k);
      const ccol = f > 0.5 ? B.city : A.city;
      const img = this.cityTinted(cc, ccol);
      const horizon = H * 0.86 - (cam.y - 300) * scale * 0.08;
      let x = -((cam.x * scale * 0.06) % cc.W);
      for (let rep = 0; x < W && rep < 8; rep++) { ctx.drawImage(img, x, horizon - cc.H + 4); x += cc.W; }
      if (horizon + 4 < H) { ctx.fillStyle = ccol; ctx.fillRect(0, horizon + 3, W, H - horizon); }
      // mountain ranges
      const par = [0.12, 0.22, 0.36], base = [0.70, 0.78, 0.86];
      const fq = Math.round(f * 8) / 8; // quantised blend so strips aren't rebuilt every frame
      for (let L = 0; L < 3; L++) {
        const col = mix(A.mtn[L], B.mtn[L], fq);
        const off = cam.x * par[L];
        const st = this.layerStrip(L, off, scale, W, H, col);
        const yb = H * base[L] - (cam.y - 300) * scale * par[L] * 0.5;
        const sx = -(off - st.off0) * scale, sy = yb - st.base;
        ctx.drawImage(st.canvas, sx, sy);
        if (sy + H < H) { ctx.fillStyle = col; ctx.fillRect(0, sy + H - 1, W, H - (sy + H) + 1); }
        if (L === 0 && (blend.a === 2 || blend.b === 2)) { ctx.globalAlpha = 0.08 * ((blend.a === 2 ? 1 - f : 0) + (blend.b === 2 ? f : 0)); ctx.fillStyle = '#fff'; ctx.fillRect(0, sy, W, H); ctx.globalAlpha = 1; }
      }
      // clouds
      const cloud = this.cloudSprite(f > 0.5 ? B.cloud : A.cloud);
      for (const c of this.clouds) {
        const cx = (((c.x + time * c.sp - cam.x * 0.18) % 6000) + 6000) % 6000 / 6000 * (W + 600 * scale) - 300 * scale;
        const cy = c.y * scale - (cam.y - 300) * scale * 0.1;
        const s = c.s * scale;
        ctx.drawImage(cloud, cx - 130 * s, cy - 40 * s, 260 * s, 66 * s);
      }
    },
    starLayers(W, H, scale) {
      const key = 's' + W + 'x' + H;
      if (this.cache[key]) return this.cache[key];
      const layers = [0, 1].map(i => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d'); x.fillStyle = '#fff';
        this.stars.forEach((s, j) => { if (j % 2 === i) { const r = s.r * Math.max(1, scale); x.globalAlpha = 0.6 + s.tw / 15; x.fillRect((s.x * W * 1.3) % W, s.y * H, r, r); } });
        return c;
      });
      this.cache[key] = layers;
      return layers;
    },
    cloudSprite(color) {
      const key = 'cl' + color;
      if (this.cache[key]) return this.cache[key];
      const c = document.createElement('canvas'); c.width = 260; c.height = 66;
      const x = c.getContext('2d'); x.fillStyle = color;
      x.beginPath(); x.ellipse(130, 40, 120, 22, 0, 0, 7); x.ellipse(170, 26, 70, 22, 0, 0, 7); x.ellipse(80, 32, 60, 18, 0, 0, 7); x.fill();
      this.cache[key] = c;
      return c;
    },
    clear() { this.cache = {}; }
  };
})();
