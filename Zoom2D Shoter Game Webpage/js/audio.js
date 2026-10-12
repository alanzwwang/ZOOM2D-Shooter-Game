/* Zoom2D Shooter — Web Audio engine.
   Procedural adaptive battle music: an arranger strings together sections (ambient, groove,
   drive, build, drop, break) with randomised progressions, riffs and fills, and reacts to combat,
   raids and bosses. Sound effects are layered, stereo-panned, distance-filtered and run through
   a reverb send and a master limiter. No audio files needed. */
(function () {
  const Z = window.Z;

  const A = Z.audio = {
    ctx: null, ready: false, intensity: 0, targetIntensity: 0,
    musicVol: 0.7, sfxVol: 0.8, muted: false, muffled: false, mood: 'normal', section: null
  };

  let ctx, master, limiter, comp, musicBus, musicFilter, sfxBus, ambBus, noiseBuf, delay, delayFb, delayWet, distCurve, verb, verbIn;
  const lastPlayed = {};
  const loops = {};
  const hasPanner = typeof window.StereoPannerNode !== 'undefined';

  A.init = function () {
    if (A.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = A.ctx = new AC();
    // master chain: glue compressor -> gain -> brickwall-ish limiter -> speakers
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0.85;
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2.5; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
    comp.connect(master); master.connect(limiter); limiter.connect(ctx.destination);

    // shared reverb (generated impulse response)
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir;
    verbIn = ctx.createGain(); verbIn.gain.value = 0.28;
    verbIn.connect(verb); verb.connect(comp);

    musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 18000; musicFilter.Q.value = 0.7;
    musicBus = ctx.createGain(); musicBus.gain.value = A.musicVol * 0.5;
    musicBus.connect(musicFilter); musicFilter.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.gain.value = A.sfxVol;
    sfxBus.connect(comp);
    ambBus = ctx.createGain(); ambBus.gain.value = 0;
    ambBus.connect(comp);

    // tempo-synced ping-pong-ish echo for arps and leads
    delay = ctx.createDelay(1); delay.delayTime.value = beat() * 0.75;
    delayFb = ctx.createGain(); delayFb.gain.value = 0.32;
    delayWet = ctx.createGain(); delayWet.gain.value = 0.3;
    delay.connect(delayFb); delayFb.connect(delay); delay.connect(delayWet); delayWet.connect(musicBus);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 4.5); }

    A.ready = true;
    A.applyVolumes();
    startAmbience();
  };

  A.applyVolumes = function () {
    if (!A.ready) return;
    const t = ctx.currentTime;
    musicBus.gain.setTargetAtTime(A.muted ? 0 : A.musicVol * 0.5, t, 0.05);
    sfxBus.gain.setTargetAtTime(A.sfxVol, t, 0.05);
    ambBus.gain.setTargetAtTime(A.sfxVol * 0.5, t, 0.3);
  };

  A.setMuffled = function (on) {
    A.muffled = on;
    if (!A.ready) return;
    musicFilter.frequency.setTargetAtTime(on ? 650 : 18000, ctx.currentTime, 0.12);
    ambBus.gain.setTargetAtTime(on ? 0 : A.sfxVol * 0.5, ctx.currentTime, 0.2);
    if (on) for (const k in loops) A.loop(k, 0);
  };

  // ---- Music: arranger ------------------------------------------------------------
  let bpm = 150;
  const beat = () => 60 / bpm;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const KEY = 40; // E
  // chords as [semitones above E, quality]; all diatonic to E natural minor except the B-major turnaround
  const PROGS = {
    a: [[0, 'm'], [8, 'M'], [10, 'M'], [7, 'm']],   // Em C D Bm
    b: [[0, 'm'], [3, 'M'], [10, 'M'], [8, 'M']],   // Em G D C
    c: [[5, 'm'], [0, 'm'], [8, 'M'], [10, 'M']],   // Am Em C D
    d: [[0, 'm'], [0, 'm'], [8, 'M'], [7, 'M']],    // Em Em C B  (tension)
    e: [[8, 'M'], [10, 'M'], [0, 'm'], [0, 'm']],   // C D Em Em  (lift)
    boss: [[0, 'm'], [1, 'M'], [0, 'm'], [10, 'M']] // Em F Em D  (phrygian menace)
  };
  const triad = q => q === 'm' ? [0, 3, 7] : [0, 4, 7];
  // riffs: [step, chord-tone index (3 = octave root, 4 = octave third), length in steps]
  const RIFFS = {
    climb: [[0, 0, 2], [3, 1, 2], [6, 2, 2], [8, 3, 3], [11, 2, 1], [12, 1, 2], [14, 2, 2]],
    hook: [[0, 2, 1], [2, 2, 1], [4, 3, 2], [6, 2, 1], [7, 1, 1], [8, 0, 3], [12, 1, 2], [14, 2, 2]],
    anthem: [[0, 3, 6], [6, 2, 2], [8, 1, 4], [12, 2, 4]],
    stab: [[0, 0, 1], [3, 0, 1], [6, 2, 1], [8, 3, 1], [10, 2, 1], [11, 1, 1], [14, 0, 2]],
    boss: [[0, 0, 1], [1, 0, 1], [3, 0, 1], [4, 2, 1], [6, 0, 1], [7, 3, 1], [8, 0, 1], [9, 0, 1], [11, 1, 1], [12, 2, 1], [14, 4, 2]]
  };
  const ARPS = [[0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3], [0, 2, 1, 3, 0, 2, 1, 4, 0, 2, 1, 3, 2, 1, 0, 2], [0, 0, 2, 0, 1, 0, 2, 3, 0, 0, 2, 0, 3, 2, 1, 2]];
  const SECTIONS = {
    ambient: { bars: 8, progs: ['a', 'c', 'e'], drums: 'none', bass: 'pulse', arp: 'soft', lead: null, energy: 0 },
    groove: { bars: 8, progs: ['a', 'b', 'c'], drums: 'groove', bass: 'eighths', arp: 'on', lead: null, energy: 1 },
    drive: { bars: 8, progs: ['a', 'b', 'd'], drums: 'drive', bass: 'offbeat', arp: 'on', lead: 'climb|stab', energy: 2 },
    build: { bars: 4, progs: ['d', 'e'], drums: 'build', bass: 'eighths', arp: 'on', lead: null, energy: 2, riser: true },
    drop: { bars: 8, progs: ['a', 'b', 'd'], drums: 'drop', bass: 'sixteenths', arp: 'on', lead: 'hook|anthem|climb', energy: 3, impact: true },
    break: { bars: 4, progs: ['e', 'c'], drums: 'half', bass: 'pulse', arp: 'soft', lead: 'anthem', energy: 1.5 },
    bossdrop: { bars: 8, progs: ['boss'], drums: 'drop', bass: 'sixteenths', arp: 'on', lead: 'boss', energy: 3, impact: true }
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let step = 0, nextTime = 0, timer = null, cur = null, barInSec = 0, keyShift = 0;

  function chooseNext(prev) {
    const I = A.intensity, mood = A.mood;
    if (mood === 'boss') return prev === 'bossdrop' && Math.random() < 0.35 ? 'build' : 'bossdrop';
    if (mood === 'raid') return prev === 'build' ? 'drop' : prev === 'drop' ? pick(['drop', 'drive']) : 'build';
    if (I < 0.9) return prev === 'ambient' && Math.random() < 0.5 ? 'groove' : 'ambient';
    if (I < 1.8) return pick(prev === 'groove' ? ['drive', 'break', 'groove'] : ['groove', 'drive']);
    if (prev === 'build') return 'drop';
    if (prev === 'drop') return pick(['drop', 'drive', 'break']);
    return 'build';
  }
  function enterSection(name) {
    const S = SECTIONS[name];
    cur = { name, S, prog: PROGS[pick(S.progs)], riff: S.lead ? RIFFS[pick(S.lead.split('|'))] : null, arp: pick(ARPS), bar0: Math.floor(step / 16) };
    A.section = name;
    bpm = A.mood === 'boss' ? 164 : A.mood === 'raid' ? 158 : 150;
    if (delay) delay.delayTime.setValueAtTime(beat() * 0.75, ctx.currentTime);
    // every few drops, lift the key a tone for freshness
    if (name === 'drop' && Math.random() < 0.3) keyShift = keyShift ? 0 : 2;
    if (name === 'ambient' || A.mood === 'boss') keyShift = 0;
  }

  A.startMusic = function () {
    if (!A.ready || timer) return;
    nextTime = ctx.currentTime + 0.1; step = 0; cur = null;
    timer = setInterval(schedule, 30);
  };
  A.stopMusic = function () { clearInterval(timer); timer = null; };

  // music reacts to big moments
  A.event = function (type) {
    if (!A.ready) return;
    if (type === 'raid') { A.mood = 'raid'; A.raidUntil = ctx.currentTime + 45; forceNext = 'build'; A.sfx('stinger-raid'); }
    if (type === 'boss' && A.mood !== 'boss') { A.mood = 'boss'; forceNext = 'bossdrop'; A.sfx('stinger-boss'); }
    if (type === 'boss-dead' && A.mood === 'boss') { A.mood = 'normal'; forceNext = 'break'; }
    if (type === 'calm') { A.mood = 'normal'; forceNext = 'ambient'; }
  };
  let forceNext = null;

  function schedule() {
    A.intensity += (A.targetIntensity - A.intensity) * 0.03;
    if (A.mood === 'raid' && ctx.currentTime > A.raidUntil) A.mood = 'normal';
    // resync if the main thread stalled (tab hidden, heavy frame) instead of firing a burst of late notes
    if (nextTime < ctx.currentTime - 0.1) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.3) {
      playStep(step, nextTime);
      nextTime += beat() / 4; step++;
    }
  }

  function playStep(s, t) {
    const st = s % 16;
    if (st === 0) {
      const bar = Math.floor(s / 16);
      // switch on the bar line: forced events can cut a section short at a 4-bar boundary
      if (!cur || bar - cur.bar0 >= cur.S.bars || (forceNext && (bar - cur.bar0) % 4 === 0)) {
        enterSection(forceNext || chooseNext(cur && cur.name)); forceNext = null;
      }
      barInSec = bar - cur.bar0;
    }
    const S = cur.S, I = A.intensity;
    const chord = cur.prog[barInSec % 4];
    const root = KEY + keyShift + chord[0], tones = triad(chord[1]);
    const tone = idx => root + tones[idx % 3] + 12 * Math.floor(idx / 3);
    const lastBar = barInSec === S.bars - 1;

    drums(S.drums, st, t, lastBar, barInSec, S);
    // bass
    const bp = { pulse: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], eighths: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1], offbeat: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1], sixteenths: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }[S.bass];
    if (bp[st]) {
      const oct = S.bass !== 'pulse' && (st === 6 || st === 14) ? 12 : 0;
      bass(t, mtof(root + oct), beat() / 4 * (S.bass === 'pulse' ? 7 : 0.9), S.bass === 'pulse' ? 0.22 : 0.3, S.energy);
    }
    // pad on each bar
    if (st === 0) pad(t, root, tones, beat() * 4, S.energy >= 3 ? 0.05 : 0.075);
    // arpeggio
    if (S.arp && (S.arp === 'on' || st % 2 === 0)) {
      const idx = cur.arp[st];
      arp(t, mtof(tone(idx) + 24), beat() / 4 * 0.8, (S.arp === 'soft' ? 0.035 : 0.055) * (0.7 + Math.min(1, I) * 0.3));
    }
    // lead riff from chord tones (always consonant with the harmony)
    if (cur.riff && !(S.drums === 'half' && barInSec % 2)) {
      for (const [rs, ti, len] of cur.riff) if (rs === st) lead(t, mtof(tone(ti) + 12), beat() / 4 * len, S.energy >= 3 ? 0.07 : 0.055);
    }
    // riser into drops, impacts on the downbeat
    if (S.riser && st === 0 && barInSec === 0) riser(t, beat() * 4 * S.bars);
    if (S.impact && st === 0 && barInSec === 0) { crash(t, 0.22); sub(t); }
    else if (S.energy >= 2 && st === 0 && barInSec % 4 === 0) crash(t, 0.14);
  }

  function drums(kind, st, t, lastBar, bar, S) {
    if (kind === 'none') {
      if (st % 4 === 2) shaker(t, 0.05);
      return;
    }
    const fill = lastBar && st >= 12;
    switch (kind) {
      case 'groove':
        if (st === 0 || st === 8 || st === 10) kick(t, 0.85);
        if (st === 4 || st === 12) snare(t, 0.5);
        if (st % 2 === 0) hat(t, st % 4 === 2 ? 0.18 : 0.1, 0.03);
        if (st === 7 && Math.random() < 0.4) snare(t, 0.12); // ghost
        break;
      case 'drive':
        if (st % 4 === 0 || st === 14) kick(t, 0.9);
        if (st === 4 || st === 12) snare(t, 0.55);
        hat(t, st % 2 ? 0.07 : 0.15, 0.025);
        if (st === 6 || st === 15) snare(t, 0.12);
        break;
      case 'half':
        if (st === 0 || st === 10) kick(t, 0.8);
        if (st === 8) snare(t, 0.55);
        if (st % 4 === 0) hat(t, 0.12, 0.08);
        break;
      case 'build': {
        // snare roll that doubles in speed each bar
        const div = [4, 2, 1, 1][Math.min(3, bar)];
        if (st % div === 0) snare(t, 0.18 + (bar * 16 + st) / 64 * 0.4);
        if (st % 4 === 0 && bar < 3) kick(t, 0.7);
        break;
      }
      case 'drop':
        if (st % 4 === 0 || st === 7 || st === 14 || (st === 10 && Math.random() < 0.5)) kick(t, 0.95);
        if (st === 4 || st === 12) { snare(t, 0.6); clap(t, 0.3); }
        hat(t, st % 2 ? 0.08 : 0.16, 0.025);
        if (st % 4 === 2) hat(t, 0.13, 0.11); // open hat
        break;
    }
    if (fill) { // tom/snare fill on the last beat of a section
      if (Math.random() < 0.7) tom(t, 180 - (st - 12) * 25, 0.35);
      if (st === 15) snare(t, 0.4);
    }
  }

  function env(g, t, a, peak, d, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end || 0.0001), t + a + d);
  }
  function kick(t, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    env(g, t, 0.002, v, 0.3);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.34);
    const c = ctx.createOscillator(), cg = ctx.createGain();
    c.type = 'square'; c.frequency.value = 1300; env(cg, t, 0.001, v * 0.12, 0.012);
    c.connect(cg); cg.connect(musicBus); c.start(t); c.stop(t + 0.03);
  }
  function noise(t, dur, type, freq, q, v, bus, sendAmt) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); env(g, t, 0.002, v, dur);
    n.connect(f); f.connect(g); g.connect(bus || musicBus);
    if (sendAmt) { const s = ctx.createGain(); s.gain.value = sendAmt; g.connect(s); s.connect(verbIn); }
    n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.05);
    return { n, f, g };
  }
  function snare(t, v) {
    noise(t, 0.18, 'bandpass', 2100, 0.8, v, musicBus, 0.35);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    env(g, t, 0.001, v * 0.55, 0.1); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.15);
  }
  function clap(t, v) { for (let i = 0; i < 3; i++) noise(t + i * 0.011, 0.09, 'bandpass', 1500, 1.2, v, musicBus, 0.4); }
  function tom(t, f, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.18);
    env(g, t, 0.002, v, 0.22); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.26);
  }
  function hat(t, v, d) { noise(t, d, 'highpass', 8000, 0.7, v); }
  function shaker(t, v) { noise(t, 0.05, 'highpass', 6000, 0.7, v); }
  function crash(t, v) { noise(t, 1.6, 'highpass', 4500, 0.5, v, musicBus, 0.5); }
  function bass(t, f, d, v, energy) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f / 2;
    const ws = ctx.createWaveShaper(); ws.curve = distCurve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300 + energy * 380 + A.intensity * 150, t); lp.frequency.exponentialRampToValueAtTime(130, t + Math.max(0.05, d));
    lp.Q.value = 6;
    const g = ctx.createGain(); env(g, t, 0.004, v, d);
    o.connect(ws); o2.connect(ws); ws.connect(lp); lp.connect(g); g.connect(musicBus);
    o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
  }
  function pad(t, root, tones, d, v) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.5); g.gain.linearRampToValueAtTime(0.0001, t + d);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
    const send = ctx.createGain(); send.gain.value = 0.5;
    lp.connect(g); g.connect(musicBus); g.connect(send); send.connect(verbIn);
    for (const iv of tones) for (const det of [-9, 9]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = mtof(root + 12 + iv); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + d + 0.05);
    }
  }
  function arp(t, f, d, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400 + A.intensity * 800;
    env(g, t, 0.003, v, d);
    o.connect(lp); lp.connect(g); g.connect(musicBus); g.connect(delay);
    o.start(t); o.stop(t + d + 0.05);
  }
  function lead(t, f, d, v) {
    const g = ctx.createGain(); env(g, t, 0.012, v, d + 0.05, v * 0.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
    const send = ctx.createGain(); send.gain.value = 0.4;
    lp.connect(g); g.connect(musicBus); g.connect(delay); g.connect(send); send.connect(verbIn);
    for (const det of [-11, 11]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.5; vg.gain.value = 7;
      vib.connect(vg); vg.connect(o.detune);
      o.connect(lp); o.start(t); o.stop(t + d + 0.12); vib.start(t); vib.stop(t + d + 0.12);
    }
  }
  function riser(t, d) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + d);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + d * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + d);
    n.connect(f); f.connect(g); g.connect(musicBus); n.start(t); n.stop(t + d + 0.05);
  }
  function sub(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    env(g, t, 0.01, 0.45, 1.3); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 1.4);
  }

  // ---- Ambience (per biome) ------------------------------------------------------------
  let amb = null, ambBiome = -1, chirpT = 0;
  function startAmbience() {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.0;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 200;
    lfo.connect(lg); lg.connect(f.frequency);
    n.connect(f); f.connect(g); g.connect(ambBus); n.start(); lfo.start();
    amb = { n, f, g, lfo, lg };
  }
  // 0 grass, 1 desert, 2 frozen, 3 wasteland; -1 = silence (title/menus)
  A.setAmbience = function (biome) {
    if (!A.ready || !amb || biome === ambBiome) return;
    ambBiome = biome;
    const t = ctx.currentTime;
    const P = [[700, 0.6, 0.05, 150], [450, 0.9, 0.16, 260], [1300, 3, 0.11, 500], [160, 0.7, 0.2, 60]][biome] || [500, 1, 0, 100];
    amb.f.frequency.setTargetAtTime(P[0], t, 1); amb.f.Q.setTargetAtTime(P[1], t, 1);
    amb.g.gain.setTargetAtTime(P[2], t, 1.2); amb.lg.gain.setTargetAtTime(P[3], t, 1);
  };
  A.ambienceTick = function (dt) {
    if (!A.ready || A.muffled) return;
    chirpT -= dt;
    if (chirpT > 0) return;
    chirpT = 0.4 + Math.random() * 2.5;
    const t = ctx.currentTime;
    if (ambBiome === 0) { // crickets & birds
      const f = Math.random() < 0.8 ? 4200 + Math.random() * 600 : 1800 + Math.random() * 1200;
      for (let i = 0; i < 3; i++) toneTo(ambBus, 'sine', f, f * 0.97, 0.03, 0.04, t + i * 0.06, (Math.random() - 0.5) * 1.6);
    } else if (ambBiome === 3 && Math.random() < 0.3) { // distant war rumble
      noise(t, 2.5, 'lowpass', 120, 0.7, 0.25, ambBus);
    } else if (ambBiome === 2 && Math.random() < 0.3) { // ice creak
      toneTo(ambBus, 'triangle', 300 + Math.random() * 300, 200, 0.4, 0.03, t, (Math.random() - 0.5) * 1.6);
    }
  };

  // ---- Sound effects ---------------------------------------------------------------------
  let out = null; // destination node for the current sfx call (panner / distance filter / bus)
  function sfxOk(key, gap) {
    const now = ctx.currentTime;
    if (lastPlayed[key] && now - lastPlayed[key] < gap) return false;
    lastPlayed[key] = now;
    return true;
  }
  function toneTo(dest, type, f0, f1, dur, v, t, pan) {
    t = t || ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.002, v, dur); o.connect(g);
    if (pan && hasPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest); } else g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function tone(type, f0, f1, dur, v, t) { toneTo(out, type, f0, f1, dur, v, t); }
  function burst(dur, type, freq, q, v, t, send) { return noise(t || ctx.currentTime, dur, type, freq, q, v, out, send); }
  // layered gunshot: transient crack + body + low thump + reverb tail
  function gun(p, vol) {
    const t = ctx.currentTime;
    const v = 1 + (Math.random() - 0.5) * 0.08; // no two shots sound exactly alike
    vol *= 0.85 + Math.random() * 0.3;
    p = Object.assign({}, p, { freq: p.freq * v, thump: p.thump * v, mech: p.mech && p.mech * v });
    burst(0.012, 'highpass', 4000, 0.7, (p.crack || 0.5) * vol);
    burst(p.body, 'bandpass', p.freq, p.q || 0.7, p.level * vol, t, p.tail || 0.12);
    toneTo(out, 'sine', p.thump, p.thump * 0.35, p.body * 0.9, (p.low || 0.35) * vol, t);
    if (p.mech) toneTo(out, 'square', p.mech, p.mech * 0.7, 0.02, 0.06 * vol, t + 0.02);
  }
  const GUNS = {
    pistol: { body: 0.11, freq: 1700, level: 0.65, thump: 180, low: 0.3, mech: 2400, gap: 0.03 },
    magnum: { body: 0.28, freq: 1300, level: 0.9, thump: 140, low: 0.5, crack: 0.8, tail: 0.25, gap: 0.05 },
    smg: { body: 0.07, freq: 2300, level: 0.42, thump: 220, low: 0.18, gap: 0.035 },
    rifle: { body: 0.14, freq: 1300, level: 0.68, thump: 160, low: 0.32, crack: 0.6, tail: 0.18, gap: 0.04 },
    lmg: { body: 0.13, freq: 1100, level: 0.62, thump: 130, low: 0.32, tail: 0.15, gap: 0.045 },
    minigun: { body: 0.06, freq: 1900, level: 0.4, thump: 120, low: 0.15, gap: 0.04 },
    shotgun: { body: 0.34, freq: 900, level: 1.0, thump: 110, low: 0.5, crack: 0.8, tail: 0.3, q: 0.5, gap: 0.06 },
    sniper: { body: 0.55, freq: 1500, level: 0.9, thump: 200, low: 0.5, crack: 1, tail: 0.45, gap: 0.06 },
    suppressed: { body: 0.07, freq: 900, level: 0.32, thump: 260, low: 0.1, crack: 0.12, tail: 0.02, mech: 2000, gap: 0.03 },
    'suppressed-heavy': { body: 0.14, freq: 700, level: 0.42, thump: 160, low: 0.25, crack: 0.2, tail: 0.05, mech: 1600, gap: 0.04 }
  };

  // vol: 0..1 loudness; opts: { pan: -1..1, far: 0..1 (distance), key: throttle key }
  A.sfx = function (name, vol, opts) {
    if (vol == null) vol = 1;
    if (vol < 0.03 || !A.ready || A.sfxVol <= 0) return;
    const t = ctx.currentTime;
    const key = (opts && opts.key) || name;
    // build the output chain for this sound
    out = sfxBus;
    if (opts && (opts.pan || opts.far > 0.05)) {
      let node = sfxBus;
      if (opts.far > 0.05) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000 * Math.pow(0.12, opts.far); lp.connect(node); node = lp; const s = ctx.createGain(); s.gain.value = opts.far * 0.6; lp.connect(s); s.connect(verbIn); }
      if (opts.pan && hasPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); p.connect(node); node = p; }
      out = node;
    }
    if (GUNS[name]) { const p = GUNS[name]; if (!sfxOk(key, p.gap)) return; gun(p, vol); return; }
    switch (name) {
      case 'laser': if (!sfxOk(key, 0.04)) return; tone('square', 1500, 180, 0.12, 0.18 * vol); tone('sawtooth', 900, 120, 0.1, 0.1 * vol); break;
      case 'plasma': if (!sfxOk(key, 0.05)) return; tone('sine', 600, 90, 0.25, 0.35 * vol); tone('square', 300, 1200, 0.08, 0.08 * vol); burst(0.15, 'bandpass', 600, 2, 0.15 * vol, t, 0.3); break;
      case 'rail': if (!sfxOk(key, 0.08)) return; tone('sawtooth', 2400, 80, 0.5, 0.3 * vol); burst(0.4, 'highpass', 3000, 0.7, 0.4 * vol, t, 0.4); tone('sine', 80, 30, 0.4, 0.5 * vol); break;
      case 'zap': if (!sfxOk(key, 0.05)) return; for (let i = 0; i < 4; i++) tone('sawtooth', 300 + Math.random() * 900, 100, 0.06, 0.12 * vol, t + i * 0.025); burst(0.18, 'bandpass', 4000, 3, 0.25 * vol); break;
      case 'rocket': if (!sfxOk(key, 0.08)) return; burst(0.7, 'bandpass', 700, 0.6, 0.6 * vol, t, 0.2); tone('sawtooth', 90, 40, 0.3, 0.3 * vol); break;
      case 'thump': if (!sfxOk(key, 0.06)) return; tone('sine', 220, 50, 0.15, 0.6 * vol); burst(0.08, 'lowpass', 900, 1, 0.4 * vol); break;
      case 'flame': if (!sfxOk(key, 0.09)) return; burst(0.14, 'lowpass', 900, 0.5, 0.3 * vol); break;
      case 'flare': if (!sfxOk(key, 0.06)) return; burst(0.3, 'bandpass', 1200, 0.6, 0.5 * vol); tone('sine', 400, 900, 0.3, 0.12 * vol); break;
      case 'explosion': if (!sfxOk(key, 0.05)) return;
        burst(1.4, 'lowpass', 800, 0.7, 1.1 * vol, t, 0.5); burst(0.25, 'lowpass', 3200, 0.4, 0.6 * vol);
        tone('sine', 110, 24, 1.1, 0.9 * vol); burst(0.6, 'bandpass', 2500, 1, 0.12 * vol, t + 0.15); // debris patter
        break;
      case 'swing': if (!sfxOk(key, 0.05)) return; { const b = burst(0.16, 'bandpass', 900, 2, 0.35 * vol); b.f.frequency.exponentialRampToValueAtTime(3000, t + 0.15); } break;
      case 'saber': if (!sfxOk(key, 0.06)) return; tone('sawtooth', 110, 220, 0.25, 0.18 * vol); tone('sine', 180, 90, 0.28, 0.2 * vol); break;
      case 'saw': if (!sfxOk(key, 0.06)) return; tone('sawtooth', 70, 90, 0.08, 0.2 * vol); burst(0.08, 'bandpass', 1500, 2, 0.2 * vol); break;
      case 'melee-hit': if (!sfxOk(key, 0.04)) return; tone('square', 160, 60, 0.08, 0.35 * vol); burst(0.08, 'lowpass', 1500, 1, 0.4 * vol); break;
      case 'deflect': if (!sfxOk(key, 0.03)) return; tone('square', 2400, 1200, 0.06, 0.14 * vol); tone('sine', 3200, 2800, 0.12, 0.06 * vol); break;
      case 'hit': if (!sfxOk(key, 0.025)) return; tone('square', 1800, 1400, 0.035, 0.1 * vol); burst(0.03, 'bandpass', 3000, 2, 0.08 * vol); break;
      case 'headshot': if (!sfxOk(key, 0.05)) return; tone('square', 2400, 2600, 0.06, 0.14 * vol); tone('sine', 1200, 1200, 0.1, 0.1 * vol, t + 0.04); break;
      case 'kill': if (!sfxOk(key, 0.05)) return; tone('triangle', 660, 660, 0.06, 0.18 * vol); tone('triangle', 990, 990, 0.12, 0.16 * vol, t + 0.05); break;
      case 'hurt': if (!sfxOk(key, 0.08)) return; tone('sawtooth', 160, 70, 0.15, 0.3 * vol); burst(0.1, 'lowpass', 600, 1, 0.3 * vol); break;
      case 'whiz': if (!sfxOk(key, 0.07)) return; { const b = burst(0.13, 'bandpass', 3500, 6, 0.22 * vol); b.f.frequency.exponentialRampToValueAtTime(900, t + 0.12); } break;
      case 'heartbeat': tone('sine', 70, 45, 0.12, 0.45); tone('sine', 65, 42, 0.14, 0.35, t + 0.2); break;
      case 'step': if (!sfxOk(key, 0.12)) return; {
        const b = opts && opts.biome;
        const f = b === 2 ? 2600 : b === 1 ? 1800 : b === 3 ? 500 : 900;
        burst(b === 2 ? 0.07 : 0.045, b === 2 ? 'highpass' : 'bandpass', f, 1, 0.09 * vol);
      } break;
      case 'impact-wood': if (!sfxOk(key, 0.05)) return; burst(0.06, 'bandpass', 600, 2, 0.25 * vol); tone('triangle', 220, 160, 0.06, 0.12 * vol); break;
      case 'impact-metal': if (!sfxOk(key, 0.05)) return; tone('square', 1900 + Math.random() * 600, 1500, 0.08, 0.08 * vol); tone('sine', 3100, 2900, 0.18, 0.05 * vol); break;
      case 'impact-concrete': if (!sfxOk(key, 0.05)) return; burst(0.07, 'lowpass', 1800, 1, 0.3 * vol); break;
      case 'impact-shield': if (!sfxOk(key, 0.05)) return; tone('sine', 900, 1400, 0.1, 0.1 * vol); burst(0.08, 'highpass', 5000, 1, 0.08 * vol); break;
      case 'ricochet': if (!sfxOk(key, 0.06)) return; tone('sine', 2200 + Math.random() * 1500, 600, 0.12, 0.05 * vol); break;
      case 'dirt': if (!sfxOk(key, 0.04)) return; burst(0.06, 'lowpass', 700, 1, 0.12 * vol); break;
      case 'coin': if (!sfxOk(key, 0.05)) return; tone('square', 990, 990, 0.06, 0.1); tone('square', 1320, 1320, 0.14, 0.1, t + 0.06); break;
      case 'pickup-med': if (!sfxOk(key, 0.05)) return; tone('sine', 660, 990, 0.12, 0.16); burst(0.08, 'highpass', 4000, 1, 0.08, t + 0.05); break;
      case 'cash-big': tone('triangle', 784, 784, 0.08, 0.2); tone('triangle', 988, 988, 0.08, 0.2, t + 0.08); tone('triangle', 1318, 1318, 0.3, 0.2, t + 0.16); break;
      case 'reload': case 'reload-pistol': if (!sfxOk('reload', 0.2)) return; burst(0.03, 'bandpass', 2500, 3, 0.25); burst(0.04, 'bandpass', 1600, 3, 0.3, t + 0.25); tone('square', 900, 700, 0.03, 0.08, t + 0.27); break;
      case 'reload-rifle': if (!sfxOk('reload', 0.2)) return; burst(0.04, 'bandpass', 2200, 3, 0.25); burst(0.05, 'bandpass', 1400, 3, 0.32, t + 0.35); burst(0.04, 'bandpass', 3000, 4, 0.25, t + 0.6); tone('square', 700, 900, 0.04, 0.08, t + 0.62); break;
      case 'reload-shotgun': if (!sfxOk('reload', 0.2)) return; for (let i = 0; i < 3; i++) { burst(0.04, 'bandpass', 1300, 3, 0.28, t + i * 0.22); tone('triangle', 400, 300, 0.03, 0.08, t + i * 0.22 + 0.02); } break;
      case 'reload-sniper': if (!sfxOk('reload', 0.2)) return; burst(0.05, 'bandpass', 1800, 3, 0.3); burst(0.05, 'bandpass', 2600, 3, 0.25, t + 0.4); tone('square', 600, 900, 0.05, 0.1, t + 0.42); break;
      case 'reload-heavy': if (!sfxOk('reload', 0.2)) return; for (let i = 0; i < 6; i++) burst(0.03, 'bandpass', 2000 + Math.random() * 800, 4, 0.18, t + 0.2 + i * 0.05); burst(0.06, 'lowpass', 900, 1, 0.4, t + 0.6); break;
      case 'reload-energy': if (!sfxOk('reload', 0.2)) return; tone('sine', 200, 1600, 0.6, 0.12); tone('square', 1600, 1600, 0.04, 0.06, t + 0.62); break;
      case 'reload-launcher': if (!sfxOk('reload', 0.2)) return; burst(0.08, 'lowpass', 600, 1, 0.4); burst(0.05, 'bandpass', 1500, 3, 0.3, t + 0.5); break;
      case 'reload-done': tone('square', 1100, 1100, 0.03, 0.12); burst(0.04, 'highpass', 3000, 1, 0.2); break;
      case 'pump': burst(0.06, 'bandpass', 1800, 2, 0.28); tone('square', 500, 300, 0.05, 0.12); burst(0.06, 'bandpass', 1300, 2, 0.28, t + 0.13); tone('square', 380, 260, 0.05, 0.12, t + 0.13); break;
      case 'lever': burst(0.05, 'bandpass', 2400, 3, 0.25); tone('square', 800, 500, 0.04, 0.1); burst(0.06, 'bandpass', 1600, 3, 0.28, t + 0.16); break;
      case 'bolt': tone('square', 900, 600, 0.03, 0.12); burst(0.05, 'bandpass', 2500, 2, 0.2); tone('square', 700, 900, 0.04, 0.12, t + 0.14); burst(0.05, 'bandpass', 2200, 2, 0.2, t + 0.14); break;
      case 'build': tone('square', 200, 160, 0.06, 0.2); burst(0.08, 'lowpass', 1200, 1, 0.35); tone('square', 260, 200, 0.06, 0.2, t + 0.1); burst(0.08, 'lowpass', 1200, 1, 0.35, t + 0.1); break;
      case 'upgrade': tone('triangle', 523, 1046, 0.25, 0.22); tone('triangle', 784, 1568, 0.3, 0.16, t + 0.08); break;
      case 'achievement': tone('triangle', 659, 659, 0.1, 0.2); tone('triangle', 880, 880, 0.1, 0.2, t + 0.1); tone('triangle', 1318, 1318, 0.4, 0.2, t + 0.2); break;
      case 'empty': if (!sfxOk(key, 0.15)) return; tone('square', 1400, 1400, 0.02, 0.1); break;
      case 'heal': tone('sine', 440, 880, 0.35, 0.2); tone('sine', 660, 1320, 0.35, 0.12, t + 0.1); break;
      case 'buy': tone('triangle', 523, 523, 0.07, 0.25); tone('triangle', 659, 659, 0.07, 0.25, t + 0.07); tone('triangle', 784, 784, 0.07, 0.25, t + 0.14); tone('triangle', 1046, 1046, 0.25, 0.25, t + 0.21); break;
      case 'deny': tone('square', 200, 140, 0.18, 0.2); break;
      case 'click': tone('square', 1500, 1500, 0.02, 0.06); break;
      case 'jump': if (!sfxOk(key, 0.1)) return; tone('sine', 220, 440, 0.08, 0.06); burst(0.05, 'lowpass', 600, 1, 0.08); break;
      case 'land': if (!sfxOk(key, 0.15)) return; burst(0.08, 'lowpass', 400, 1, 0.25 * vol); break;
      case 'spin': if (!sfxOk(key, 0.25)) return; tone('sawtooth', 60, 260, 0.6, 0.08); break;
      case 'drop': tone('sine', 300, 600, 0.4, 0.15); break;
      case 'shop': tone('sine', 880, 880, 0.08, 0.15); tone('sine', 1175, 1175, 0.2, 0.15, t + 0.08); break;
      case 'death': tone('sawtooth', 300, 40, 1.2, 0.4); burst(0.8, 'lowpass', 500, 1, 0.4, t, 0.4); break;
      case 'alert': if (!sfxOk(key, 0.4)) return; tone('square', 700, 700, 0.05, 0.05 * vol); tone('square', 900, 900, 0.05, 0.05 * vol, t + 0.07); break;
      case 'stinger-raid': for (let i = 0; i < 3; i++) { tone('sawtooth', 500, 900, 0.45, 0.12, t + i * 0.5); tone('sawtooth', 900, 500, 0.05, 0.12, t + i * 0.5 + 0.45); } burst(1.2, 'lowpass', 300, 0.7, 0.5, t, 0.4); break;
      case 'stinger-boss': tone('sawtooth', 55, 41, 1.6, 0.45); tone('sawtooth', 82, 61, 1.6, 0.3); burst(1.6, 'lowpass', 200, 0.7, 0.6, t, 0.6); tone('square', 110, 110, 0.12, 0.15, t + 0.8); break;
    }
  };

  // Positional helper: plays a world sound with distance volume, stereo pan and a separate
  // throttle key so enemy/turret gunfire never swallows the player's own shots.
  A.sfxAt = function (name, x, volMul) {
    const g = Z.game;
    if (!g || !A.ready) return;
    const half = g.viewW / 2, d = Math.abs(x - g.cam.x);
    const vol = (d < half ? 1 : Math.max(0, 1 - (d - half) / 1500)) * (volMul == null ? 1 : volMul);
    if (vol < 0.03) return;
    A.sfx(name, vol, { pan: Math.max(-1, Math.min(1, (x - g.cam.x) / (half * 1.2))) * 0.85, far: Math.min(1, Math.max(0, (d - half * 0.6) / 1800)), key: name + '@w' });
  };

  // Continuous sounds (minigun barrel spin, flamethrower roar). level 0 stops.
  A.loop = function (name, level) {
    if (!A.ready) return;
    let L = loops[name];
    if (!L && level <= 0) return;
    const t = ctx.currentTime;
    if (!L) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(sfxBus);
      if (name === 'minigun') {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 40;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 2;
        const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
        const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2200; nf.Q.value = 1.5;
        const ng = ctx.createGain(); ng.gain.value = 0.25;
        o.connect(f); f.connect(g); n.connect(nf); nf.connect(ng); ng.connect(g); o.start(); n.start();
        L = loops[name] = { g, o, f, nodes: [o, n] };
      } else {
        const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.8;
        n.connect(f); f.connect(g); n.start();
        L = loops[name] = { g, f, nodes: [n] };
      }
    }
    if (level <= 0) {
      L.g.gain.setTargetAtTime(0, t, 0.06);
      const dead = L; delete loops[name];
      setTimeout(() => dead.nodes.forEach(n => { try { n.stop(); } catch (e) { } }), 400);
      return;
    }
    if (name === 'minigun') { L.o.frequency.setTargetAtTime(30 + level * 70, t, 0.05); L.f.frequency.setTargetAtTime(200 + level * 900, t, 0.05); L.g.gain.setTargetAtTime(0.18 * level, t, 0.05); }
    else { L.f.frequency.setTargetAtTime(600 + level * 900, t, 0.05); L.g.gain.setTargetAtTime(0.35 * level, t, 0.05); }
  };
})();
