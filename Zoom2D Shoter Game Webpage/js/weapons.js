/* Zoom2D Shooter — weapon, armor and medical catalog.
   Every weapon is built from a category template, scaled by a "power" level,
   then tweaked with per-weapon overrides. Golden editions are generated too. */
(function (root) {
  const Z = root.Z = root.Z || {};

  // ---- Category templates -------------------------------------------------
  const T = {
    Pistols:   { kind: 'bullet', shape: 'pistol',  dmg: 14, rate: 4,   mag: 15,  reload: 1.3, spread: 0.035, speed: 1800, range: 950,  auto: false, recoil: 0.10, sound: 'pistol',  price: 150 },
    SMGs:      { kind: 'bullet', shape: 'smg',     dmg: 10, rate: 12,  mag: 30,  reload: 1.8, spread: 0.075, speed: 1750, range: 850,  auto: true,  recoil: 0.06, sound: 'smg',     price: 900 },
    Rifles:    { kind: 'bullet', shape: 'rifle',   dmg: 19, rate: 9,   mag: 30,  reload: 2.0, spread: 0.032, speed: 2300, range: 1350, auto: true,  recoil: 0.07, sound: 'rifle',   price: 2200 },
    Shotguns:  { kind: 'bullet', shape: 'shotgun', dmg: 9,  rate: 1.4, mag: 6,   reload: 2.4, spread: 0.20,  speed: 1500, range: 560,  auto: false, recoil: 0.35, sound: 'shotgun', price: 1300, pellets: 8 },
    Snipers:   { kind: 'bullet', shape: 'sniper',  dmg: 85, rate: 0.9, mag: 5,   reload: 2.6, spread: 0.004, speed: 3900, range: 2700, auto: false, recoil: 0.45, sound: 'sniper',  price: 2600, pierce: 1 },
    Heavy:     { kind: 'bullet', shape: 'lmg',     dmg: 16, rate: 11,  mag: 100, reload: 4.0, spread: 0.065, speed: 2150, range: 1250, auto: true,  recoil: 0.06, sound: 'lmg',     price: 6500, moveMul: 0.86 },
    Miniguns:  { kind: 'bullet', shape: 'minigun', dmg: 13, rate: 26,  mag: 300, reload: 5.0, spread: 0.095, speed: 2200, range: 1150, auto: true,  recoil: 0.03, sound: 'minigun', price: 26000, moveMul: 0.66, spinup: 0.7 },
    Explosives:{ kind: 'rocket', shape: 'launcher',dmg: 130,rate: 0.8, mag: 1,   reload: 2.2, spread: 0.01,  speed: 1150, range: 2400, auto: false, recoil: 0.5,  sound: 'rocket',  price: 6000, radius: 140, moveMul: 0.9 },
    Energy:    { kind: 'laser',  shape: 'energy',  dmg: 24, rate: 6,   mag: 40,  reload: 1.6, spread: 0.01,  speed: 0,    range: 1600, auto: true,  recoil: 0.04, sound: 'laser',   price: 9000, color: '#ff3355' },
    Melee:     { kind: 'melee',  shape: 'knife',   dmg: 34, rate: 2.2, mag: 0,   reload: 0,   spread: 0,     speed: 0,    range: 70,   auto: true,  recoil: 0,    sound: 'swing',   price: 60, arc: 1.5 }
  };

  // ---- Base weapon list: [name, power(1-10), overrides] -------------------
  // power raises damage (+16%/level) and price (x1.5/level). g:1 = also sold as Golden edition.
  const LIST = {
    Pistols: [
      ['Glock 17', 1, { g: 1, desc: 'The trusty starter. 17 rounds, never jams.', mag: 17 }],
      ['Glock 19', 1.2, { mag: 15, rate: 4.4, desc: 'Compact Glock, slightly snappier.' }],
      ['Glock 18C', 2.4, { auto: true, rate: 16, mag: 33, spread: 0.07, desc: 'Full-auto Glock. Bullet hose in your hand.' }],
      ['Beretta M9', 1.4, { mag: 15, desc: 'Classic military sidearm.' }],
      ['Colt M1911', 1.8, { g: 1, dmg: 20, mag: 7, rate: 3.4, desc: 'Big .45 slugs, old-school cool.' }],
      ['SIG P226', 1.7, { mag: 15, spread: 0.028, desc: 'Accurate and reliable.' }],
      ['SIG P320', 1.9, { mag: 17 }],
      ['H&K USP .45', 2.2, { dmg: 19, mag: 12 }],
      ['H&K VP9', 2.1, { mag: 15, rate: 4.6 }],
      ['Walther PPK', 1.1, { dmg: 12, mag: 7, rate: 4.8, desc: 'Tiny spy pistol.' }],
      ['Walther P99', 1.6, { mag: 16 }],
      ['FN Five-seveN', 2.6, { mag: 20, speed: 2400, pierce: 1, desc: 'High-velocity rounds punch through targets.' }],
      ['CZ 75', 1.9, { mag: 16, spread: 0.026 }],
      ['Desert Eagle .50', 3.4, { g: 1, dmg: 42, mag: 7, rate: 2.2, recoil: 0.32, sound: 'magnum', desc: 'Hand cannon. Huge kick, huger damage.' }],
      ['Ruger Mk IV', 1.3, { dmg: 10, rate: 6, mag: 10, spread: 0.02 }],
      ['S&W M&P9', 1.7, { mag: 17 }],
      ['Makarov PM', 1.2, { mag: 8 }],
      ['Tokarev TT-33', 1.5, { mag: 8, speed: 2100, pierce: 1 }],
      ['Luger P08', 2.0, { mag: 8, spread: 0.024, desc: 'Antique German precision.' }],
      ['Mauser C96', 2.3, { mag: 10, rate: 5, desc: 'The broomhandle.' }],
      ['Beretta 93R', 2.8, { auto: true, rate: 14, mag: 20, desc: 'Machine pistol with a fold-down grip.' }],
      ['Springfield XD-M', 2.2, { mag: 19 }],
      ['Kimber Custom II', 2.4, { dmg: 21, mag: 8, spread: 0.022 }],
      ['Colt Python', 3.0, { shape: 'revolver', dmg: 38, mag: 6, rate: 2.4, reload: 2.2, sound: 'magnum', recoil: 0.25, desc: '.357 Magnum revolver.' }],
      ['S&W Model 500', 4.2, { shape: 'revolver', g: 1, dmg: 70, mag: 5, rate: 1.4, reload: 2.4, recoil: 0.5, sound: 'magnum', pierce: 1, desc: 'The most powerful revolver ever made.' }],
      ['Ruger Super Redhawk', 3.6, { shape: 'revolver', dmg: 52, mag: 6, rate: 1.8, reload: 2.3, sound: 'magnum' }],
      ['Chiappa Rhino', 3.2, { shape: 'revolver', dmg: 40, mag: 6, rate: 2.6, recoil: 0.18 }],
      ['Taurus Judge', 3.0, { shape: 'revolver', pellets: 5, dmg: 11, spread: 0.14, mag: 5, rate: 1.8, range: 500, sound: 'shotgun', desc: 'Revolver that fires shotgun shells.' }],
      ['Derringer', 1.0, { dmg: 24, mag: 2, rate: 3, reload: 1.6, desc: 'Two shots. Make them count.' }],
      ['Flare Gun', 1.6, { kind: 'flame', dmg: 30, mag: 1, rate: 1.2, reload: 1.4, speed: 1100, burn: 4, color: '#ff5a1f', sound: 'flare', desc: 'Sets enemies on fire.', noTac: 1 }],
      ['Glock 26', 0.9, { mag: 10, rate: 4.4, desc: 'Baby Glock. Fits in a pocket.' }],
      ['Glock 34', 1.6, { mag: 17, spread: 0.022, desc: 'Competition Glock with a long slide.' }],
      ['FN 509', 1.8, { mag: 17 }],
      ['SIG P365', 1.3, { mag: 12, rate: 4.6 }],
      ['Browning Hi-Power', 1.5, { mag: 13, desc: 'The original wonder-nine.' }],
      ['Hi-Point C9', 0.7, { mag: 8, spread: 0.06, desc: 'Cheap. Very, very cheap.' }],
      ['Beretta 92FS Inox', 1.6, { mag: 15 }],
      ['Steyr M9-A1', 1.7, { mag: 17 }],
      ['Grand Power K100', 1.8, { mag: 15, recoil: 0.07 }],
      ['Nambu Type 14', 1.1, { mag: 8 }],
      ['Webley Mk VI', 1.9, { shape: 'revolver', dmg: 30, mag: 6, rate: 2.2, reload: 2.2, sound: 'magnum' }],
      ['Nagant M1895', 1.4, { shape: 'revolver', dmg: 24, mag: 7, rate: 2.6, reload: 2.4 }],
      ['Colt Single Action Army', 2.2, { shape: 'revolver', dmg: 34, mag: 6, rate: 3.2, reload: 2.4, sound: 'magnum', desc: 'Fan the hammer, cowboy.' }],
      ['Taurus Raging Bull', 3.8, { shape: 'revolver', dmg: 58, mag: 5, rate: 1.6, reload: 2.3, sound: 'magnum', recoil: 0.42, pierce: 1 }],
      ['Mateba Autorevolver', 3.3, { shape: 'revolver', dmg: 40, mag: 6, rate: 3, reload: 2.1, sound: 'magnum' }],
      ['Stechkin APS', 2.3, { auto: true, rate: 12, mag: 20, spread: 0.06, desc: 'Soviet machine pistol.' }],
      ['CZ 75 Auto', 2.5, { auto: true, rate: 15, mag: 26, spread: 0.07 }]
    ],
    SMGs: [
      ['H&K MP5', 1.4, { g: 1, desc: 'The SWAT classic.', spread: 0.06 }],
      ['H&K MP7', 2.2, { rate: 15, mag: 40, pierce: 1 }],
      ['H&K UMP45', 1.9, { dmg: 14, rate: 10, mag: 25 }],
      ['FN P90', 2.6, { g: 1, shape: 'bullpup', mag: 50, rate: 15, desc: '50-round top-loading magazine.' }],
      ['IMI Uzi', 1.2, { rate: 11, mag: 32 }],
      ['Mini Uzi', 1.3, { rate: 16, mag: 20, spread: 0.1 }],
      ['MAC-10', 1.5, { rate: 19, mag: 30, spread: 0.12, desc: 'Sprays like a garden hose.' }],
      ['TEC-9', 1.1, { rate: 10, mag: 32, spread: 0.1 }],
      ['Kriss Vector', 3.0, { g: 1, rate: 20, mag: 33, recoil: 0.03, desc: 'Super-fast fire rate, barely kicks.' }],
      ['Thompson M1928', 2.4, { dmg: 15, mag: 50, rate: 11, desc: 'The Tommy gun with drum mag.' }],
      ['PPSh-41', 2.1, { rate: 16, mag: 71, spread: 0.09 }],
      ['MP40', 1.6, { rate: 9, mag: 32, spread: 0.05 }],
      ['Skorpion vz.61', 1.3, { rate: 14, mag: 20 }],
      ['PP-19 Bizon', 2.0, { mag: 64 }],
      ['CZ Scorpion EVO', 2.2, { rate: 14, mag: 30 }],
      ['Sten Mk II', 1.0, { rate: 9, mag: 32, spread: 0.1 }],
      ['B&T MP9', 1.9, { rate: 15, mag: 30 }],
      ['SIG MPX', 2.5, { rate: 14, mag: 30, spread: 0.05 }],
      ['Spectre M4', 1.8, { mag: 50 }],
      ['Steyr TMP', 1.7, { rate: 15, mag: 30 }],
      ['Calico M960', 2.3, { mag: 100, rate: 12, reload: 2.6, desc: '100-round helical magazine.' }],
      ['H&K MP5K', 1.3, { rate: 14, spread: 0.08, desc: 'Ultra-compact MP5.' }],
      ['H&K MP5SD', 1.6, { sound: 'suppressed', desc: 'Built-in suppressor.' }],
      ['H&K UMP9', 1.6, { rate: 11 }],
      ['AKS-74U', 2.0, { dmg: 16, rate: 11, desc: 'The Krinkov. Rifle rounds in an SMG.' }],
      ['M3 Grease Gun', 1.0, { dmg: 14, rate: 7 }],
      ['Sterling L2A3', 1.1, { rate: 9 }],
      ['Owen Gun', 1.0, { rate: 11 }],
      ['Beretta M12', 1.3, { rate: 9.5 }],
      ['Ingram M11', 1.2, { rate: 20, mag: 32, spread: 0.13 }],
      ['PP-2000', 1.7, { rate: 14, mag: 44 }],
      ['Type 100', 0.9, { rate: 8 }],
      ['Saiga-9', 1.8, { rate: 11 }],
      ['Jatimatic', 1.2, { rate: 10 }],
      ['Lanchester Mk I', 1.0, { rate: 10, mag: 50 }],
      ['Vityaz-SN', 2.0, { rate: 12 }],
      ['MP5 Navy', 1.5, { rate: 13 }]
    ],
    Rifles: [
      ['M4A1 Carbine', 1.4, { g: 1, desc: 'Modern all-rounder.' }],
      ['M16A4', 1.6, { auto: false, burst: 3, rate: 8, spread: 0.022, desc: '3-round burst, very accurate.' }],
      ['AK-47', 1.6, { g: 1, dmg: 23, rate: 8, spread: 0.045, desc: 'Hits hard, kicks hard, never quits.' }],
      ['AKM', 1.8, { dmg: 23, rate: 8.5 }],
      ['AK-74', 1.9, { rate: 9.5 }],
      ['AK-12', 2.6, { rate: 10, spread: 0.028 }],
      ['AN-94', 2.9, { auto: false, burst: 2, rate: 14, spread: 0.018, desc: 'Hyper-burst: two rounds at once.' }],
      ['FN SCAR-L', 2.4, { spread: 0.026 }],
      ['FN SCAR-H', 3.0, { g: 1, dmg: 28, rate: 7, mag: 20, desc: 'Battle rifle with big 7.62 rounds.' }],
      ['H&K 416', 2.7, { rate: 10, spread: 0.024 }],
      ['H&K G36C', 2.0, { rate: 10 }],
      ['FAMAS F1', 2.2, { shape: 'bullpup', rate: 15, mag: 25, desc: 'The French bugle, very fast.' }],
      ['Steyr AUG A3', 2.5, { shape: 'bullpup', spread: 0.022 }],
      ['IWI Tavor TAR-21', 2.4, { shape: 'bullpup' }],
      ['Galil ACE', 2.1, { dmg: 21 }],
      ['SIG 552 Commando', 2.3, { rate: 11 }],
      ['FN F2000', 2.8, { shape: 'bullpup', rate: 11 }],
      ['Remington ACR', 2.6, {}],
      ['QBZ-95', 2.0, { shape: 'bullpup' }],
      ['M14 EBR', 3.1, { dmg: 34, auto: false, rate: 4.5, mag: 20, spread: 0.012, pierce: 1 }],
      ['FN FAL', 2.8, { dmg: 30, rate: 6.5, mag: 20 }],
      ['H&K G3', 2.7, { dmg: 30, rate: 6.5, mag: 20 }],
      ['OTs-14 Groza', 2.5, { shape: 'bullpup', dmg: 24 }],
      ['Honey Badger', 3.2, { rate: 12, recoil: 0.04, sound: 'smg', desc: 'Whisper-quiet .300 Blackout.' }],
      ['MCX Spear', 3.6, { g: 1, dmg: 32, rate: 8, spread: 0.02, desc: 'Next-gen army rifle.' }],
      ['AK-101', 2.0, {}],
      ['AK-103', 2.1, { dmg: 23 }],
      ['AK-15', 2.9, { dmg: 24, spread: 0.026 }],
      ['L85A2', 2.0, { shape: 'bullpup' }],
      ['Vz. 58', 1.8, { rate: 10 }],
      ['Type 56', 1.3, { dmg: 22, rate: 8 }],
      ['Type 81', 1.5, {}],
      ['QBZ-191', 2.6, { spread: 0.025 }],
      ['Beretta ARX-160', 2.4, {}],
      ['H&K G11', 3.0, { burst: 3, auto: false, rate: 12, mag: 45, spread: 0.018, desc: 'Caseless future rifle from the 80s.' }],
      ['H&K 33', 1.7, {}],
      ['MSBS Grot', 2.3, { shape: 'bullpup' }],
      ['Daewoo K2', 1.8, {}],
      ['INSAS', 1.3, { burst: 3, auto: false, rate: 9 }],
      ['CETME Model L', 1.5, {}],
      ['Valmet Rk 62', 1.7, {}],
      ['AR-15', 1.3, { auto: false, rate: 6, spread: 0.022, desc: 'Semi-auto sporter rifle.' }],
      ['M1 Carbine', 1.1, { auto: false, rate: 5, mag: 15, dmg: 17 }],
      ['StG 44', 1.7, { rate: 9, desc: 'The very first assault rifle.' }],
      ['AS Val', 2.5, { rate: 14, mag: 20, sound: 'suppressed', desc: 'Integrally suppressed.' }],
      ['CZ Bren 2', 2.3, {}],
      ['Mk 18 Mod 1', 2.2, { rate: 11 }],
      ['LVOA-C', 2.8, {}],
      ['Steyr AUG A1', 2.1, { shape: 'bullpup' }],
      ['SIG MCX Virtus', 2.9, { spread: 0.024 }],
      ['FN FNC', 1.6, {}],
      ['DSA SA58 OSW', 2.7, { dmg: 30, rate: 9, mag: 20 }],
      ['Ruger Mini-14', 1.2, { auto: false, rate: 5, mag: 20, dmg: 24 }],
      ['Kel-Tec RFB', 2.4, { shape: 'bullpup', auto: false, rate: 5, dmg: 30, mag: 20 }]
    ],
    Shotguns: [
      ['Remington 870', 1.2, { g: 1, desc: 'Pump-action hometown hero.' }],
      ['Mossberg 500', 1.3, {}],
      ['Benelli M4', 2.4, { mode: 'semi', rate: 3, mag: 7, desc: 'Semi-auto, fires as fast as you click.' }],
      ['SPAS-12', 2.2, { g: 1, mode: 'pump', modes: ['pump', 'semi'], rate: 2, mag: 8, desc: 'Switch between pump and semi-auto with V.' }],
      ['AA-12', 3.6, { g: 1, auto: true, rate: 5, mag: 20, reload: 3, desc: 'Full-auto shotgun. Absolute chaos.' }],
      ['Saiga-12', 2.8, { mode: 'semi', rate: 3.5, mag: 10, desc: 'AK-style semi-auto shotgun with box mags.' }],
      ['Kel-Tec KSG', 2.6, { mag: 14, rate: 1.6, shape: 'bullpup' }],
      ['Double-Barrel', 1.0, { mag: 2, rate: 4, reload: 1.8, pellets: 10, desc: 'Two barrels of BOOM.' }],
      ['Sawed-Off', 1.4, { mag: 2, rate: 5, reload: 1.6, pellets: 12, spread: 0.32, range: 380 }],
      ['Winchester 1887', 1.8, { mag: 5, rate: 1.6, desc: 'Lever-action, terminator style.' }],
      ['USAS-12', 3.2, { auto: true, rate: 4, mag: 20 }],
      ['Armsel Striker', 2.7, { mode: 'semi', rate: 3, mag: 12, desc: 'Revolving 12-round drum shotgun.' }],
      ['Dragon\'s Breath 870', 3.4, { kind: 'flame', burn: 3, color: '#ff7a1a', desc: 'Incendiary shells. Fire everywhere.' }],
      ['Slug Thrower', 3.0, { pellets: 1, dmg: 80, spread: 0.01, range: 1100, pierce: 1, desc: 'One giant slug. Goes through enemies.' }],
      ['Benelli Nova', 1.2, {}],
      ['Beretta 1301 Tactical', 2.3, { mode: 'semi', rate: 3.2, mag: 7 }],
      ['Franchi SPAS-15', 2.5, { mode: 'semi', rate: 3, mag: 6 }],
      ['Mossberg 590A1', 1.6, { mag: 8 }],
      ['Remington 1100', 1.8, { mode: 'semi', rate: 3 }],
      ['Ithaca 37', 1.3, { rate: 1.8, desc: 'Slam-fire pump action.' }],
      ['Browning Auto-5', 1.9, { mode: 'semi', rate: 2.8 }],
      ['Kel-Tec KS7', 1.6, { shape: 'bullpup' }],
      ['Vepr-12', 2.9, { mode: 'semi', rate: 3.8, mag: 8 }],
      ['Fostech Origin-12', 3.3, { mode: 'semi', rate: 4.2, mag: 20 }],
      ['Standard DP-12', 2.7, { mode: 'semi', rate: 4, mag: 16, desc: 'Double-barrel pump. Two shots per pump.' }],
      ['UTS-15', 2.6, { mag: 15 }],
      ['Rossi Overland', 1.1, { mag: 2, rate: 4, reload: 1.7, pellets: 10, mode: 'break' }],
      ['Hawk 982', 1.0, {}],
      ['Mossberg Shockwave', 1.5, { spread: 0.26, range: 420 }]
    ],
    Snipers: [
      ['Remington 700', 1.0, { desc: 'Bolt-action hunting rifle.' }],
      ['M24 SWS', 1.6, { g: 1 }],
      ['AWM .338', 2.8, { g: 1, dmg: 150, pierce: 2, desc: 'The legend. Two-shot nearly anything.' }],
      ['L96A1', 2.0, {}],
      ['Barrett M82A1', 3.6, { g: 1, mode: 'semi', dmg: 190, rate: 1.4, mag: 10, pierce: 3, recoil: 0.7, desc: '.50 cal anti-materiel. Pierces 3 enemies.' }],
      ['Barrett M107', 3.9, { mode: 'semi', dmg: 200, rate: 1.5, mag: 10, pierce: 3, recoil: 0.7 }],
      ['CheyTac Intervention', 4.2, { g: 1, dmg: 260, pierce: 3, mag: 7, desc: 'Ultra long range monster.' }],
      ['Dragunov SVD', 1.8, { rate: 2.2, mag: 10, dmg: 70 }],
      ['Mosin-Nagant', 0.8, { mag: 5, desc: 'Cheap and deadly.' }],
      ['Kar98k', 1.2, { mag: 5 }],
      ['M1 Garand', 1.3, { rate: 3, mag: 8, dmg: 50, sound: 'rifle', desc: 'PING! Eight-shot classic.' }],
      ['SKS', 1.0, { rate: 3.5, mag: 10, dmg: 45, sound: 'rifle' }],
      ['Mk 14 EBR', 2.2, { rate: 3.5, mag: 20, dmg: 60 }],
      ['SR-25', 2.4, { rate: 3.2, mag: 20, dmg: 62 }],
      ['Lee-Enfield', 1.1, { mag: 10, rate: 1.4 }],
      ['Springfield M1903', 1.2, {}],
      ['Accuracy Intl AXMC', 3.2, { dmg: 170, pierce: 2 }],
      ['Desert Tech SRS', 3.0, { dmg: 160, pierce: 2, shape: 'bullpup' }],
      ['VSS Vintorez', 1.9, { auto: true, rate: 7, mag: 20, dmg: 40, sound: 'smg', desc: 'Silent auto sniper.' }],
      ['PGM Hecate II', 3.7, { dmg: 210, pierce: 3, mag: 7 }],
      ['Elephant Gun', 4.5, { dmg: 340, mag: 2, rate: 1.2, pierce: 4, recoil: 0.9, mode: 'break', desc: 'Two shots, each one a train.' }],
      ['Steyr Scout', 1.5, { rate: 1.2 }],
      ['McMillan TAC-50', 3.8, { dmg: 200, pierce: 3, recoil: 0.7 }],
      ['SV-98', 2.0, {}],
      ['Orsis T-5000', 2.9, { dmg: 150, pierce: 2 }],
      ['Sako TRG-42', 2.7, { dmg: 140, pierce: 2 }],
      ['Blaser R93', 2.2, { rate: 1.3, mode: 'bolt', desc: 'Straight-pull bolt. Fast follow-ups.' }],
      ['M40A5', 2.1, {}],
      ['M21', 1.9, { rate: 3, mag: 20, dmg: 55 }],
      ['M110 SASS', 2.5, { rate: 3.4, mag: 20, dmg: 62 }],
      ['H&K PSG-1', 2.8, { rate: 3, mag: 20, dmg: 66, spread: 0.002 }],
      ['Walther WA2000', 3.0, { shape: 'bullpup', rate: 2.8, mag: 6, dmg: 72 }],
      ['Steyr HS .50', 3.4, { dmg: 190, pierce: 3, recoil: 0.7 }],
      ['KSVK 12.7', 3.5, { dmg: 195, pierce: 3, shape: 'bullpup', recoil: 0.7 }],
      ['Ruger Precision', 1.6, {}],
      ['Savage 110', 1.1, {}],
      ['Tikka T3x', 1.4, {}],
      ['Mk 12 SPR', 1.9, { rate: 4, mag: 20, dmg: 48, sound: 'rifle' }]
    ],
    Heavy: [
      ['M249 SAW', 1.0, { g: 1, desc: 'Belt-fed squad weapon.' }],
      ['M60', 1.6, { dmg: 22, rate: 9 }],
      ['M240B', 1.9, { dmg: 22, rate: 10 }],
      ['PKM', 1.7, { dmg: 21, rate: 10 }],
      ['RPK-74', 1.1, { mag: 75 }],
      ['MG42', 2.4, { rate: 20, spread: 0.08, desc: 'Hitler\'s Buzzsaw — 1200 rounds/min.' }],
      ['IWI Negev', 1.8, { rate: 13 }],
      ['Ultimax 100', 1.5, { recoil: 0.03 }],
      ['Stoner 63', 1.6, {}],
      ['M2 Browning', 3.4, { g: 1, dmg: 40, rate: 9, mag: 100, pierce: 1, moveMul: 0.7, desc: 'A .50 cal you carry by hand. Ridiculous.' }],
      ['Lewis Gun', 1.2, { mag: 47, rate: 8 }],
      ['M2 Flamethrower', 2.0, { kind: 'flame', shape: 'flamer', dmg: 7, rate: 30, mag: 200, spread: 0.12, speed: 750, range: 380, burn: 3, color: '#ff8a1a', sound: 'flame', desc: 'Short range, long burns.' }],
      ['Napalm Thrower', 3.2, { kind: 'flame', shape: 'flamer', g: 1, dmg: 10, rate: 30, mag: 300, spread: 0.1, speed: 850, range: 460, burn: 5, color: '#ff4a10', sound: 'flame' }],
      ['Cryo Sprayer', 2.6, { kind: 'flame', shape: 'flamer', dmg: 6, rate: 30, mag: 220, spread: 0.12, speed: 760, range: 380, freeze: 1, color: '#7fe8ff', sound: 'flame', desc: 'Freezes enemies in place.' }],
      ['M27 IAR', 1.4, { mag: 45, spread: 0.04, moveMul: 0.95 }],
      ['MG3', 2.3, { rate: 19, spread: 0.075 }],
      ['MG4', 1.5, {}],
      ['MG5', 2.0, { dmg: 22 }],
      ['H&K 21', 1.8, { dmg: 21 }],
      ['L7A2 GPMG', 1.8, { dmg: 22 }],
      ['QJY-88', 1.6, {}],
      ['Bren Gun', 1.1, { mag: 30, rate: 8, spread: 0.04 }],
      ['BAR M1918', 1.4, { mag: 20, rate: 8, dmg: 26, moveMul: 0.95 }],
      ['DP-28', 1.0, { mag: 47, rate: 9 }],
      ['Pecheneg', 2.2, { dmg: 22 }],
      ['Chauchat', 0.6, { mag: 20, rate: 4, spread: 0.09, desc: 'Possibly the worst machine gun ever made.' }],
      ['Hotchkiss M1914', 1.2, { rate: 7 }],
      ['Inferno Cannon', 3.8, { kind: 'flame', shape: 'flamer', dmg: 14, rate: 30, mag: 350, burn: 6, range: 520, speed: 900, spread: 0.1, color: '#ff3a00', sound: 'flame', desc: 'A wall of fire.' }]
    ],
    Miniguns: [
      ['M134 Minigun', 1.0, { g: 1, desc: 'Six barrels. Spin up, then delete everything.' }],
      ['XM556 Microgun', 0.8, { dmg: 10, rate: 30, moveMul: 0.82, spinup: 0.45 }],
      ['GAU-19 Gatling', 1.8, { dmg: 22, rate: 20, pierce: 1 }],
      ['Vulcan Cannon', 2.6, { dmg: 26, rate: 32, mag: 500, moveMul: 0.55, desc: 'Ripped off a fighter jet.' }],
      ['Dual Miniguns', 2.4, { pellets: 2, spread: 0.12, mag: 600, moveMul: 0.55 }],
      ['Gatling Gun 1862', 0.6, { rate: 12, spinup: 0.4, mag: 200, desc: 'Hand-cranked history.' }],
      ['Shredder', 2.0, { rate: 40, dmg: 9, spread: 0.13 }],
      ['Laser Minigun', 3.2, { kind: 'laser', shape: 'minigun', g: 1, dmg: 16, rate: 24, color: '#ff2b4a', sound: 'laser', desc: 'A storm of red lasers.' }],
      ['Plasma Gatling', 3.6, { kind: 'plasma', dmg: 26, rate: 18, color: '#7a5cff', speed: 1400, radius: 34, sound: 'plasma' }],
      ['Meat Grinder', 2.2, { dmg: 16, rate: 28 }],
      ['Gatling Laser', 4.0, { kind: 'laser', dmg: 20, rate: 22, color: '#2bff9b', sound: 'laser' }],
      ['Tesla Minigun', 3.8, { kind: 'tesla', dmg: 22, rate: 10, range: 600, color: '#9fd8ff', sound: 'zap', desc: 'Chain lightning, ten times a second.' }],
      ['Rotary Grenade Gun', 3.4, { kind: 'grenade', dmg: 70, rate: 6, radius: 90, speed: 1050, mag: 60, sound: 'thump', spinup: 0.9, desc: 'A minigun... that fires grenades.' }]
    ],
    Explosives: [
      ['RPG-7', 1.0, { g: 1, desc: 'Classic rocket-propelled grenade.' }],
      ['M72 LAW', 0.8, { dmg: 115 }],
      ['AT4', 1.3, { dmg: 160 }],
      ['Panzerfaust 3', 1.2, {}],
      ['Carl Gustaf M4', 1.8, { dmg: 170, radius: 160 }],
      ['SMAW', 1.6, {}],
      ['FGM-148 Javelin', 2.8, { g: 1, homing: 1, dmg: 220, speed: 900, desc: 'Homing missiles that track the closest enemy.' }],
      ['FIM-92 Stinger', 2.4, { homing: 1, dmg: 160, speed: 1300 }],
      ['M79 Thumper', 0.9, { kind: 'grenade', shape: 'tube', dmg: 100, speed: 1050, radius: 120, rate: 1.4, sound: 'thump', desc: 'Lobbed grenades that bounce.' }],
      ['M32 MGL', 2.0, { kind: 'grenade', shape: 'tube', g: 1, dmg: 105, mag: 6, rate: 3, reload: 3.2, speed: 1050, radius: 120, sound: 'thump', desc: 'Six-shot revolving grenade launcher.' }],
      ['China Lake', 1.5, { kind: 'grenade', shape: 'tube', mag: 4, rate: 1.4, speed: 1100, radius: 125, sound: 'thump' }],
      ['M203 Launcher', 1.1, { kind: 'grenade', shape: 'tube', mag: 1, rate: 1.4, speed: 1050, radius: 115, sound: 'thump' }],
      ['Milkor Mk1', 1.8, { kind: 'grenade', shape: 'tube', mag: 6, rate: 2.6, speed: 1060, radius: 120, sound: 'thump' }],
      ['Rocket Pod', 2.6, { mag: 6, rate: 4, reload: 3.6, spread: 0.06, dmg: 110, desc: 'Six rockets, fired fast.' }],
      ['Nuke Launcher', 5.4, { dmg: 900, radius: 420, rate: 0.3, reload: 5, speed: 800, desc: 'Fat Man. Don\'t stand close.' }],
      ['Mk 19 AGL', 2.6, { kind: 'grenade', shape: 'tube', auto: true, rate: 5, mag: 32, radius: 100, dmg: 80, speed: 1150, reload: 4, sound: 'thump', moveMul: 0.7, desc: 'Full-auto grenade launcher.' }],
      ['RPG-29 Vampir', 2.2, { dmg: 200 }],
      ['M1 Bazooka', 0.7, { dmg: 105, speed: 950 }],
      ['PIAT', 0.6, { dmg: 100, speed: 850 }],
      ['Hydra Rocket Pod', 3.2, { mag: 4, rate: 3, dmg: 140, homing: 1, desc: 'Four homing rockets per load.' }],
      ['XM25 Airburst', 2.4, { kind: 'grenade', shape: 'tube', mag: 5, rate: 2.5, dmg: 70, radius: 100, speed: 1400, fuse: 0.6, sound: 'thump', desc: 'Grenades burst in mid-air.' }],
      ['Cluster Launcher', 3.6, { cluster: 1, dmg: 120, desc: 'Each rocket splits into bomblets.' }]
    ],
    Energy: [
      ['Laser Pistol', 0.5, { shape: 'ePistol', auto: false, rate: 5, mag: 20, dmg: 20, color: '#ff3355', desc: 'Pew pew!' }],
      ['Laser Rifle', 1.0, { g: 1, shape: 'eRifle', desc: 'Instant-hit red beam.' }],
      ['Pulse Rifle', 1.4, { shape: 'eRifle', auto: false, burst: 3, rate: 10, color: '#33c3ff' }],
      ['Plasma Pistol', 0.8, { kind: 'plasma', shape: 'ePistol', auto: false, rate: 4, dmg: 34, speed: 1300, radius: 34, mag: 18, color: '#4cff7a', sound: 'plasma' }],
      ['Plasma Rifle', 1.6, { kind: 'plasma', shape: 'eRifle', g: 1, rate: 8, dmg: 30, speed: 1400, radius: 36, color: '#4cff7a', sound: 'plasma' }],
      ['Plasma Cannon', 2.6, { kind: 'plasma', shape: 'eHeavy', auto: false, rate: 1.4, dmg: 140, speed: 1000, radius: 110, mag: 6, color: '#7cff4c', sound: 'plasma', moveMul: 0.85 }],
      ['Railgun', 2.8, { kind: 'rail', shape: 'eRifle', g: 1, auto: false, rate: 0.9, dmg: 260, mag: 4, reload: 2.4, range: 3000, color: '#53e2ff', sound: 'rail', recoil: 0.6, desc: 'Pierces every enemy in a line.' }],
      ['Gauss Rifle', 3.2, { kind: 'rail', shape: 'eRifle', auto: false, rate: 1.1, dmg: 240, mag: 6, range: 3000, color: '#c08cff', sound: 'rail', recoil: 0.5 }],
      ['Ion Blaster', 1.8, { kind: 'plasma', shape: 'eRifle', rate: 9, dmg: 26, speed: 1700, radius: 26, color: '#55aaff', sound: 'plasma' }],
      ['Tesla Coil Gun', 2.4, { kind: 'tesla', shape: 'eHeavy', g: 1, rate: 4, dmg: 45, range: 650, mag: 30, color: '#9fd8ff', sound: 'zap', desc: 'Lightning chains between enemies.' }],
      ['Arc Thrower', 2.0, { kind: 'tesla', shape: 'eHeavy', rate: 3, dmg: 52, range: 520, mag: 20, color: '#c3a6ff', sound: 'zap' }],
      ['Photon Blaster', 1.2, { shape: 'ePistol', rate: 7, mag: 30, dmg: 22, color: '#ffe14d' }],
      ['Quantum Beam', 3.4, { shape: 'eHeavy', rate: 14, dmg: 22, mag: 120, color: '#ff4dff', desc: 'Continuous pink death ray.' }],
      ['Freeze Ray', 1.6, { shape: 'eRifle', freeze: 1, rate: 8, dmg: 14, color: '#9ff3ff', desc: 'Slows enemies to a crawl.' }],
      ['Disintegrator', 4.0, { kind: 'rail', shape: 'eHeavy', auto: false, rate: 0.7, dmg: 520, mag: 3, range: 3200, color: '#ff9b1f', sound: 'rail', recoil: 0.8, desc: 'Turns anything in a line into dust.' }],
      ['Antimatter Launcher', 4.6, { kind: 'plasma', shape: 'eHeavy', auto: false, rate: 0.6, dmg: 500, speed: 800, radius: 260, mag: 3, color: '#ffffff', sound: 'plasma', desc: 'Matter, meet anti-matter.' }],
      ['Plasma Shotgun', 2.2, { kind: 'plasma', shape: 'eRifle', auto: false, rate: 1.6, dmg: 26, pellets: 7, spread: 0.18, speed: 1300, radius: 22, mag: 8, color: '#4cffd0', sound: 'plasma' }],
      ['Sonic Cannon', 2.6, { kind: 'plasma', shape: 'eHeavy', auto: false, rate: 1.5, dmg: 90, speed: 1600, radius: 80, mag: 8, color: '#e6e6ff', sound: 'plasma' }],
      ['Gamma Lance', 3.8, { kind: 'rail', shape: 'eRifle', auto: true, rate: 4, dmg: 120, mag: 20, range: 2600, color: '#7dff2b', sound: 'rail', recoil: 0.2 }],
      ['Singularity Gun', 5.2, { kind: 'plasma', shape: 'eHeavy', auto: false, rate: 0.5, dmg: 700, speed: 650, radius: 320, mag: 2, color: '#b04dff', sound: 'plasma', desc: 'Fires a tiny black hole.' }],
      ['Proton Cannon', 3.0, { kind: 'rail', shape: 'eHeavy', auto: false, rate: 1, dmg: 300, mag: 5, range: 2800, color: '#ff5ad2', sound: 'rail', recoil: 0.5 }],
      ['Blaster Carbine', 1.3, { kind: 'plasma', shape: 'eRifle', rate: 9, mag: 45, color: '#ff4433', speed: 2000, radius: 14, dmg: 22, sound: 'laser' }],
      ['Neutron Pistol', 1.4, { kind: 'plasma', shape: 'ePistol', auto: false, rate: 5, dmg: 36, speed: 1800, radius: 20, mag: 16, color: '#7af0ff', sound: 'plasma' }],
      ['Ray Gun', 1.0, { kind: 'plasma', shape: 'ePistol', auto: false, rate: 3, dmg: 60, speed: 1300, radius: 50, mag: 20, color: '#3aff3a', sound: 'plasma', desc: 'Retro sci-fi classic.' }],
      ['Microwave Emitter', 2.0, { shape: 'eHeavy', rate: 20, dmg: 9, range: 600, mag: 200, color: '#ffb84d', burn: 2, desc: 'Cooks enemies from the inside.' }],
      ['Prism Laser', 2.6, { shape: 'eRifle', pellets: 3, spread: 0.06, rate: 4, dmg: 30, color: '#ffffff', desc: 'Splits into three beams.' }],
      ['Void Rifle', 3.6, { kind: 'rail', shape: 'eRifle', auto: false, rate: 1.4, dmg: 220, mag: 8, range: 2800, color: '#6a2bff', sound: 'rail' }],
      ['Starfall Lance', 4.4, { kind: 'rail', shape: 'eHeavy', auto: true, rate: 3, dmg: 180, mag: 30, range: 3000, color: '#ffe14d', sound: 'rail', recoil: 0.25, desc: 'Full-auto railgun. Yes, really.' }]
    ],
    Melee: [
      ['Combat Knife', 1.0, { desc: 'Fast stabby knife.' , rate: 3.2, dmg: 30 }],
      ['Machete', 1.6, { shape: 'blade', rate: 2.4, range: 80 }],
      ['Baseball Bat', 1.3, { shape: 'blunt', dmg: 40, rate: 1.8, range: 85, knock: 1 }],
      ['Crowbar', 1.4, { shape: 'blunt', color: '#d33' }],
      ['Frying Pan', 0.8, { shape: 'pan', dmg: 30, rate: 2, knock: 1, desc: 'CLANG.' }],
      ['Fire Axe', 2.2, { shape: 'axe', dmg: 60, rate: 1.4, range: 90 }],
      ['Sledgehammer', 2.6, { shape: 'hammer', dmg: 90, rate: 0.9, range: 95, knock: 1 }],
      ['Katana', 2.8, { g: 1, shape: 'blade', rate: 2.8, range: 95, desc: 'Razor-sharp and fast.' }],
      ['Claymore Sword', 3.0, { shape: 'blade', dmg: 70, rate: 1.4, range: 110 }],
      ['Spear', 2.0, { shape: 'spear', range: 130, arc: 0.6 }],
      ['Chainsaw', 3.4, { shape: 'chainsaw', dmg: 22, rate: 12, range: 85, arc: 0.9, sound: 'saw', desc: 'Brrrrrrrrrr.' }],
      ['Laser Sword (Blue)', 4.4, { shape: 'lsword', g: 1, dmg: 95, rate: 3, range: 115, color: '#3ab4ff', deflect: 1, sound: 'saber', desc: 'Deflects bullets back at enemies!' }],
      ['Laser Sword (Red)', 4.5, { shape: 'lsword', dmg: 100, rate: 3, range: 115, color: '#ff2a3a', deflect: 1, sound: 'saber', desc: 'Deflects bullets back at enemies!' }],
      ['Laser Sword (Green)', 4.5, { shape: 'lsword', dmg: 98, rate: 3.1, range: 115, color: '#3aff6a', deflect: 1, sound: 'saber' }],
      ['Laser Sword (Purple)', 4.7, { shape: 'lsword', dmg: 105, rate: 3.1, range: 118, color: '#b04dff', deflect: 1, sound: 'saber' }],
      ['Double Laser Saber', 5.2, { shape: 'dsaber', dmg: 100, rate: 3.6, range: 125, arc: 2.6, color: '#ff2a3a', deflect: 1, sound: 'saber', desc: 'Two blades, double the deflection.' }],
      ['Energy Katana', 4.8, { shape: 'lsword', dmg: 110, rate: 3.6, range: 110, color: '#ffe14d', deflect: 1, sound: 'saber' }],
      ['Plasma Axe', 4.6, { shape: 'axe', dmg: 160, rate: 1.4, range: 100, color: '#4cff7a', glow: 1, sound: 'saber' }],
      ['Vibro-Blade', 3.8, { shape: 'blade', dmg: 70, rate: 4, range: 90, color: '#9fd8ff', glow: 1 }],
      ['Thunder Hammer', 5.4, { shape: 'hammer', g: 1, dmg: 240, rate: 0.9, range: 110, knock: 1, color: '#9fd8ff', glow: 1, shock: 1, sound: 'saber', desc: 'Every hit calls down lightning.' }],
      ['Brass Knuckles', 0.7, { dmg: 22, rate: 4, range: 50, desc: 'Punchy.' }],
      ['Kukri', 1.8, { shape: 'blade', rate: 2.6, range: 80 }],
      ['Meat Cleaver', 1.5, { shape: 'axe', rate: 2.2 }],
      ['Trench Shovel', 1.2, { shape: 'axe', knock: 1, rate: 1.8 }],
      ['Golf Club', 1.1, { shape: 'blunt', knock: 1, color: '#c9ced6', range: 90 }],
      ['Hockey Stick', 1.2, { shape: 'blunt', knock: 1, color: '#2a2a2a', range: 95 }],
      ['Halberd', 3.0, { shape: 'spear', dmg: 80, range: 140, arc: 1, knock: 1 }],
      ['Reaper Scythe', 3.4, { shape: 'axe', dmg: 85, range: 120, arc: 2.2 }],
      ['Lightning Spear', 4.2, { shape: 'spear', glow: 1, color: '#9fd8ff', shock: 1, dmg: 120, range: 150, sound: 'saber' }],
      ['Dark Saber', 5.6, { shape: 'lsword', dmg: 125, rate: 3.2, range: 120, color: '#f0f0ff', deflect: 1, sound: 'saber', desc: 'A legendary black-bladed saber.' }]
    ]
  };

  // ---- Armory expansion: 92 more models (+8 golden editions) take the arsenal to 600 ----------
  // They never get Tactical editions, so the original Tactical line-up (and everyone's saves) stays put.
  const MORE = {
    Pistols: [
      ['Glock 45', 1.6, { mag: 17, desc: 'Crossover Glock: full grip, compact slide.' }],
      ['SIG P229', 1.8, { mag: 13, spread: 0.026 }],
      ['Walther PDP', 1.9, { mag: 18, rate: 4.6 }],
      ['H&K P30', 1.9, { mag: 15 }],
      ['Beretta PX4 Storm', 1.8, { mag: 17 }],
      ['FN FNX-45', 2.2, { dmg: 19, mag: 15 }],
      ['Ruger GP100', 2.4, { shape: 'revolver', dmg: 32, mag: 6, rate: 2.6, reload: 2.2, sound: 'magnum' }],
      ['S&W Model 29', 3.1, { shape: 'revolver', dmg: 44, mag: 6, rate: 2.2, reload: 2.3, recoil: 0.3, sound: 'magnum', desc: '.44 Magnum. Feeling lucky?' }],
      ['Wildey .475', 3.6, { g: 1, dmg: 48, mag: 7, rate: 2, recoil: 0.36, sound: 'magnum', desc: 'Gas-operated hand cannon.' }],
      ['Mauser M712 Schnellfeuer', 2.6, { auto: true, rate: 15, mag: 20, spread: 0.08, desc: 'Full-auto broomhandle. Wild.' }]
    ],
    SMGs: [
      ['Sten Mk V', 1.0, { rate: 9, mag: 32 }],
      ['PPS-43', 1.1, { rate: 11, mag: 35 }],
      ['PP-91 Kedr', 1.3, { rate: 14, mag: 30 }],
      ['Suomi KP/-31', 1.4, { g: 1, rate: 15, mag: 50, desc: 'Finnish drum-fed classic.' }],
      ['Colt 9mm SMG', 1.5, { rate: 13, mag: 32 }],
      ['CMMG Banshee', 1.6, {}],
      ['Uzi Pro', 1.6, { rate: 13, mag: 25 }],
      ['Daewoo K7', 1.6, { mag: 30, sound: 'suppressed', desc: 'Built-in suppressor. Whisper quiet.' }],
      ['B&T APC9', 2.0, { rate: 15, mag: 30 }]
    ],
    Rifles: [
      ['Howa Type 89', 1.5, {}],
      ['Vektor R4', 1.5, {}],
      ['Colt Canada C7', 1.6, { desc: 'Canadian service rifle. Hold the trigger for full-auto fire.' }],
      ['AK-74M', 1.4, {}],
      ['AK-104', 1.5, { dmg: 21 }],
      ['H&K G36K', 1.7, { rate: 12 }],
      ['SIG 516', 1.8, {}],
      ['IWI ARAD', 2.0, {}],
      ['SIG SG 510', 2.0, { dmg: 28, rate: 7 }],
      ['Steyr AUG HBAR', 2.0, { shape: 'bullpup', mag: 42 }],
      ['H&K XM8', 2.2, { g: 1, rate: 12, spread: 0.028, desc: 'Sleek prototype from the future that never came.' }],
      ['Desert Tech MDR', 2.4, { shape: 'bullpup', dmg: 26, rate: 9 }]
    ],
    Shotguns: [
      ['Stoeger Coach Gun', 1.1, { mode: 'break', mag: 2, rate: 3, reload: 2.0, desc: 'Two barrels, two big booms.' }],
      ['Browning BPS', 1.3, {}],
      ['Winchester Model 12', 1.4, { mode: 'pump', desc: 'The "Perfect Repeater" pump gun.' }],
      ['Remington 11-87', 1.5, { mode: 'semi', rate: 2.8 }],
      ['Benelli M3 Super 90', 1.6, {}],
      ['Beretta 686 Silver Pigeon', 1.6, { g: 1, mode: 'break', mag: 2, rate: 3, reload: 2.0, desc: 'A fancy over-under for gentleman hunters.' }],
      ['Mossberg 930 SPX', 1.7, { mode: 'semi', rate: 3, desc: 'Semi-auto tactical shotgun.' }],
      ['Akdal MKA 1919', 1.9, { mode: 'semi', rate: 3.2, mag: 8 }]
    ],
    Snipers: [
      ['Henry Big Boy', 0.9, { mode: 'lever', rate: 1.8, mag: 10, dmg: 55, sound: 'magnum', desc: 'Lever-action cowboy rifle.' }],
      ['Springfield M1A', 1.4, { mode: 'semi', rate: 3.5, mag: 20, dmg: 52, sound: 'rifle' }],
      ['M40A1', 1.5, {}],
      ['SVU-AS', 2.2, { rate: 2.4, mag: 10, dmg: 66 }],
      ['Sako TRG-22', 2.3, {}],
      ['Remington MSR', 2.5, {}],
      ['Barrett MRAD', 2.9, { dmg: 150, pierce: 2 }],
      ['Accuracy Intl AW50', 3.4, { g: 1, dmg: 180, pierce: 2, mag: 5, desc: '.50 cal precision from Britain.' }],
      ['Lobaev SVLK-14S', 4.0, { dmg: 240, pierce: 3, mag: 1, rate: 0.7, desc: 'Record-breaking extreme range rifle.' }]
    ],
    Heavy: [
      ['RPD', 1.2, { mag: 100, rate: 11 }],
      ['M1919 Browning', 1.3, { rate: 8, dmg: 21 }],
      ['FN Minimi Mk3', 1.3, {}],
      ['Vickers Gun', 1.4, { g: 1, rate: 8, mag: 250, moveMul: 0.75, desc: 'Water-cooled WWI legend.' }],
      ['Type 80 GPMG', 1.6, { dmg: 21 }],
      ['M60E4', 1.9, { dmg: 22, rate: 10 }],
      ['Thermite Projector', 3.5, { kind: 'flame', shape: 'flamer', dmg: 12, rate: 30, mag: 280, burn: 7, range: 480, speed: 880, spread: 0.1, color: '#ffd23a', sound: 'flame', desc: 'Burns white-hot.' }]
    ],
    Miniguns: [
      ['Mini Gatling', 0.9, { rate: 24, dmg: 13, moveMul: 0.78 }],
      ['XM214 Microgun', 1.2, { rate: 26, dmg: 12 }],
      ['GShG-7.62', 1.6, { rate: 34, dmg: 12, spread: 0.11 }],
      ['Flame Gatling', 1.9, { kind: 'flame', dmg: 13, rate: 34, mag: 400, burn: 4, range: 440, speed: 900, spread: 0.12, color: '#ff6a1a', sound: 'flame', desc: 'Six barrels of fire.' }],
      ['Ice Gatling', 1.4, { kind: 'flame', dmg: 8, rate: 30, mag: 360, freeze: 1, range: 400, speed: 800, spread: 0.12, color: '#7fe8ff', sound: 'flame', desc: 'Freezes everything in front of you.' }]
    ],
    Explosives: [
      ['Bazooka M9', 0.8, { dmg: 110, speed: 950 }],
      ['RGM-40 Kastet', 1.0, { kind: 'grenade', shape: 'tube', mag: 1, rate: 1.4, speed: 1040, radius: 115, sound: 'thump' }],
      ['Type 69 RPG', 1.1, {}],
      ['M320 Launcher', 1.2, { kind: 'grenade', shape: 'tube', mag: 1, rate: 1.5, speed: 1080, radius: 120, sound: 'thump' }],
      ['Firework Launcher', 1.4, { cluster: 1, dmg: 70, radius: 110, desc: 'Every shot is a celebration.' }],
      ['RPG-32 Hashim', 1.6, { dmg: 165 }],
      ['GM-94', 1.7, { kind: 'grenade', shape: 'tube', mag: 3, rate: 2, speed: 1080, radius: 125, sound: 'thump', desc: 'Pump-action grenade launcher.' }],
      ['NLAW', 2.0, { homing: 1, dmg: 180, speed: 1000, desc: 'Fire-and-forget guided missile.' }]
    ],
    Energy: [
      ['Ion Pistol', 1.0, { kind: 'plasma', shape: 'ePistol', auto: false, rate: 5, dmg: 30, speed: 1700, radius: 18, mag: 18, color: '#55aaff', sound: 'plasma' }],
      ['Laser Carbine', 1.2, { shape: 'eRifle', rate: 8, mag: 50, dmg: 22, color: '#ff5a2b' }],
      ['Sun Pistol', 1.6, { kind: 'plasma', shape: 'ePistol', auto: false, rate: 3.5, dmg: 48, speed: 1500, radius: 40, mag: 14, color: '#ffb02b', sound: 'plasma', desc: 'A tiny star in your hand.' }],
      ['Dual Laser Pistols', 1.8, { shape: 'ePistol', pellets: 2, spread: 0.05, rate: 6, mag: 40, dmg: 20, color: '#33c3ff', desc: 'One in each hand.' }],
      ['Nova Blaster', 2.0, { kind: 'plasma', shape: 'eRifle', rate: 7, dmg: 34, speed: 1600, radius: 34, mag: 40, color: '#ff4dc4', sound: 'plasma' }],
      ['Plasma Repeater', 2.2, { kind: 'plasma', shape: 'eRifle', rate: 12, dmg: 22, speed: 1800, radius: 22, mag: 60, color: '#4cff7a', sound: 'plasma' }],
      ['Cryo Lance', 2.4, { kind: 'rail', shape: 'eRifle', auto: false, rate: 1.2, dmg: 180, mag: 6, range: 2600, freeze: 1, color: '#9ff3ff', sound: 'rail', desc: 'Pierces a whole line and freezes it.' }],
      ['Heat Ray', 2.8, { shape: 'eHeavy', rate: 18, dmg: 12, range: 700, mag: 180, burn: 3, color: '#ff6a1a', desc: 'Sets everything ablaze.' }],
      ['Storm Caller', 3.0, { kind: 'tesla', shape: 'eHeavy', rate: 5, dmg: 50, range: 700, mag: 40, color: '#b6e3ff', sound: 'zap', desc: 'A bottled thunderstorm.' }],
      ['Photon Sniper', 3.4, { kind: 'rail', shape: 'eRifle', auto: false, rate: 0.8, dmg: 340, mag: 4, range: 3400, color: '#ffffff', sound: 'rail', recoil: 0.5, desc: 'Light-speed headshots.' }],
      ['Graviton Cannon', 4.2, { kind: 'plasma', shape: 'eHeavy', auto: false, rate: 0.8, dmg: 380, speed: 900, radius: 220, mag: 4, color: '#5a7bff', sound: 'plasma', desc: 'Crushes enemies with gravity.' }],
      ['Omega Beam', 4.8, { g: 1, shape: 'eHeavy', rate: 16, dmg: 30, mag: 160, color: '#ff2bd6', desc: 'The final laser.' }]
    ],
    Melee: [
      ['Bowie Knife', 1.2, { rate: 3, dmg: 32, desc: 'Big knife energy.' }],
      ['Nunchucks', 1.3, { shape: 'blunt', dmg: 26, rate: 4, range: 80, color: '#a0703a', desc: 'Whirling and fast.' }],
      ['Cricket Bat', 1.4, { shape: 'blunt', dmg: 42, rate: 1.8, range: 88, knock: 1, color: '#d9b98a' }],
      ['Tactical Tomahawk', 1.6, { shape: 'axe', dmg: 48, rate: 2, range: 80 }],
      ['Pickaxe', 1.9, { shape: 'axe', dmg: 58, rate: 1.4, range: 90, desc: 'Mine your way through enemies.' }],
      ['Rapier', 2.2, { shape: 'blade', dmg: 40, rate: 3.6, range: 100, arc: 0.8, desc: 'En garde!' }],
      ['Longsword', 2.5, { g: 1, shape: 'blade', dmg: 62, rate: 1.8, range: 105, desc: 'A knight\'s blade.' }],
      ['Trident', 2.6, { shape: 'spear', dmg: 70, range: 140, arc: 0.7 }],
      ['Battle Axe', 2.8, { shape: 'axe', dmg: 80, rate: 1.2, range: 100 }],
      ['War Hammer', 2.9, { shape: 'hammer', dmg: 95, rate: 1, range: 95, knock: 1 }],
      ['Inferno Blade', 4.4, { shape: 'blade', dmg: 90, rate: 3, range: 100, color: '#ff6a1a', glow: 1, burn: 3, sound: 'saber', desc: 'A blade wreathed in fire.' }],
      ['Laser Sword (Orange)', 4.9, { shape: 'lsword', dmg: 108, rate: 3.2, range: 118, color: '#ff8a1f', deflect: 1, sound: 'saber', desc: 'Deflects bullets back at enemies!' }]
    ]
  };
  for (const cat of Object.keys(MORE)) for (const [name, power, o] of MORE[cat]) LIST[cat].push([name, power, Object.assign({ noTac: 1 }, o)]);

  // ---- Build -------------------------------------------------------------
  function nicePrice(p) {
    if (p < 100) return Math.round(p / 5) * 5;
    if (p < 1000) return Math.round(p / 25) * 25;
    if (p < 10000) return Math.round(p / 100) * 100;
    if (p < 100000) return Math.round(p / 500) * 500;
    if (p < 1e6) return Math.round(p / 5000) * 5000;
    if (p < 1e7) return Math.round(p / 50000) * 50000;
    return Math.round(p / 500000) * 500000;
  }
  Z.nicePrice = nicePrice;
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  // Fire-mode names shown in the shop and HUD.
  const MODE_LABEL = { auto: 'Full-Auto', semi: 'Semi-Auto', burst: 'Burst', pump: 'Pump-Action', bolt: 'Bolt-Action', break: 'Break-Action', lever: 'Lever-Action', melee: 'Melee', beam: 'Beam' };
  Z.MODE_LABEL = MODE_LABEL;

  function fireMode(w, o) {
    if (w.cat === 'Melee') return 'melee';
    if (o.mode) return o.mode;
    if (w.cat === 'Shotguns') return w.auto ? 'auto' : /Winchester/.test(w.name) ? 'lever' : /Double|Sawed/.test(w.name) ? 'break' : 'pump';
    if (w.cat === 'Snipers' && w.kind === 'bullet') return w.auto ? 'auto' : w.rate >= 2 ? 'semi' : 'bolt';
    if (w.burst) return 'burst';
    return w.auto ? 'auto' : 'semi';
  }
  // Select-fire weapons can switch modes with V.
  function fireModes(w) {
    if (w.mode === 'auto' && (w.cat === 'Rifles' || w.cat === 'SMGs' || w.cat === 'Pistols')) return w.cat === 'Rifles' ? ['auto', 'burst', 'semi'] : ['auto', 'semi'];
    if (w.mode === 'burst' && (w.cat === 'Rifles' || w.cat === 'Pistols')) return ['burst', 'semi'];
    if (w.mode === 'semi' && w.cat === 'Rifles' && w.rate >= 6) return ['semi'];
    return [w.mode];
  }

  // deterministic per-model hash: look-alike guns still get their own handling and art
  function hash(s, k) { let h = 2166136261 ^ (k * 7919); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return ((h >>> 0) % 100000) / 100000; }
  Z.hash = hash;

  const weapons = [];
  for (const cat of Object.keys(LIST)) {
    const tpl = T[cat];
    for (const [name, power, o] of LIST[cat]) {
      const w = Object.assign({}, tpl, o);
      w.name = name; w.cat = cat; w.power = power;
      const scale = 1 + 0.16 * (power - 1);
      w.id = slug(name);
      w.dmg = Math.round((o.dmg != null ? o.dmg * (1 + 0.06 * (power - 1)) : tpl.dmg * scale * (0.94 + hash(w.id, 1) * 0.12)) * 10) / 10;
      // small per-model differences so no two guns share identical stats (explicit overrides stay exact)
      if (o.rate == null && cat !== 'Melee') w.rate = Math.round(w.rate * (0.93 + hash(w.id, 2) * 0.14) * 100) / 100;
      if (o.spread == null) w.spread = w.spread * (0.85 + hash(w.id, 3) * 0.3);
      if (o.reload == null && w.reload) w.reload = Math.round(w.reload * (0.9 + hash(w.id, 4) * 0.2) * 100) / 100;
      if (o.mag == null && w.mag > 4 && cat !== 'Explosives') w.mag = Math.max(2, Math.round(w.mag * (0.9 + hash(w.id, 5) * 0.2)));
      if (o.range == null && cat !== 'Melee') w.range = Math.round(w.range * (0.92 + hash(w.id, 6) * 0.16));
      w.price = nicePrice(tpl.price * Math.pow(1.5, power - 1) * (o.priceMul || 1));
      w.tier = Math.max(1, Math.min(5, Math.round(power * 0.9)));
      w.mode = fireMode(w, o);
      if (w.mode === 'semi' || w.mode === 'pump' || w.mode === 'bolt' || w.mode === 'break' || w.mode === 'lever') w.auto = false;
      if (w.mode === 'auto') w.auto = true;
      if (w.mode === 'burst' && !w.burst) w.burst = 3;
      w.modes = o.modes ? o.modes.slice() : fireModes(w);
      if (w.modes.includes('burst') && !w.burst) w.burst = 3;
      delete w.g; delete w.noTac;
      w.flags = { g: !!o.g, noTac: !!o.noTac || /Tactical/.test(name) };
      weapons.push(w);
    }
  }

  function edition(base, kind) {
    const e = Object.assign({}, base);
    e.modes = base.modes.slice();
    if (kind === 'golden') {
      e.name = 'Golden ' + base.name; e.id = 'golden-' + base.id; e.gold = true;
      e.dmg = Math.round(base.dmg * 1.3 * 10) / 10;
      e.rate = Math.round(base.rate * 1.08 * 100) / 100;
      if (base.mag && base.mode !== 'break') e.mag = Math.round(base.mag * 1.25);
      e.reload = base.reload * 0.85; e.spread = base.spread * 0.85;
      e.price = nicePrice(base.price * 3.2);
      e.tier = Math.min(5, base.tier + 1);
      e.desc = '24-karat edition: +30% damage' + (base.mode === 'break' ? '' : ', bigger mags') + '. ' + (base.desc || '');
    } else {
      e.name = base.name + ' Tactical'; e.id = base.id + '-tactical'; e.tactical = true;
      e.spread = base.spread * 0.7; e.recoil = base.recoil * 0.75;
      e.dmg = Math.round(base.dmg * 1.12 * 10) / 10;
      if (base.mag) e.mag = Math.round(base.mag * 1.15);
      e.reload = base.reload * 0.9;
      e.price = nicePrice(base.price * 1.8);
      e.tier = Math.min(5, base.tier + 1);
      if (base.sound === 'sniper' || base.sound === 'magnum' || base.sound === 'lmg') e.sound = 'suppressed-heavy';
      else if (/^(pistol|smg|rifle)$/.test(base.sound)) e.sound = 'suppressed';
      e.desc = 'Laser sight, suppressor and extended mag. ' + (base.desc || '');
    }
    return e;
  }

  // ---- generated descriptions for models without a hand-written one --------------------------
  const NOUN = { Pistols: 'pistol', SMGs: 'submachine gun', Rifles: 'rifle', Shotguns: 'shotgun', Snipers: 'sniper rifle', Heavy: 'machine gun', Miniguns: 'rotary gun', Explosives: 'launcher', Energy: 'energy weapon', Melee: 'melee weapon' };
  const ORIGIN = [
    [/^(AK|AKM|AKS|AN-94|PP-|PKM|RPK|Dragunov|Mosin|Makarov|Tokarev|SV-98|Orsis|KSVK|Vityaz|OTs|AS Val|VSS|Stechkin|DP-28|Pecheneg|PPSh|Nagant|RPG|Saiga|Vepr|MP-)/, 'Russian'],
    [/^(H&K|MP5|Walther|Mauser|Luger|MP40|MG42|MG3|MG4|MG5|StG|Kar98|Blaser|Panzerfaust)/, 'German'],
    [/^(FN |FAL|SCAR|P90)/, 'Belgian'], [/^(SIG|Swiss)/, 'Swiss'], [/^(IWI|Galil|Tavor|Negev|IMI|Mini Uzi|Desert Eagle)/, 'Israeli'],
    [/^(Beretta|Benelli|Franchi|Chiappa|Spectre|Mateba|Jatimatic)/, 'Italian'], [/^(Glock|Steyr)/, 'Austrian'],
    [/^(CZ|Skorpion|Vz)/, 'Czech'], [/^(Type |QBZ|QJY)/, 'Chinese'], [/^(L85|L96|L7|Lee-Enfield|Sterling|Webley|Sten|Bren|Lanchester|Accuracy|PIAT)/, 'British'],
    [/^(FAMAS|PGM|Chauchat|Hotchkiss)/, 'French'], [/^(Daewoo)/, 'South Korean'], [/^(INSAS)/, 'Indian'], [/^(Sako|Valmet|Tikka)/, 'Finnish'],
    [/^(Owen)/, 'Australian'], [/^(Nambu)/, 'Japanese'], [/^(Taurus|Rossi)/, 'Brazilian'], [/^(CETME)/, 'Spanish'], [/^(Armsel)/, 'South African'],
    [/^(M1 |M1911|M16|M4|M14|M21|M24|M27|M40|M60|M79|M110|M134|M2 |M240|M249|M3 |M32|M72|M203|Mk |Colt|Remington|Barrett|Ruger|S&W|Springfield|Thompson|Browning|Mossberg|Winchester|Kimber|Kel-Tec|Calico|MAC|Ingram|TEC|Kriss|AR-15|McMillan|CheyTac|Savage|Ithaca|Hi-Point|Honey|BAR|Lewis|Stoner|Gatling|XM|GAU|FGM|FIM|AA-12|USAS|Standard|UTS|Desert Tech|LVOA|DSA|Fostech|Smith)/, 'American']
  ];
  const MODE_SENT = { auto: 'Hold the trigger for full-auto fire.', semi: 'One shot per click.', burst: 'Fires in tight bursts.', pump: 'Rack it between every shot.', bolt: 'Work the bolt between shots — make each one count.', break: 'Two quick shots, then reload.', lever: 'Lever-action between shots.', melee: 'Up close and personal.' };
  function describe(w, med) {
    const traits = [];
    if (w.dmg * (w.pellets || 1) > med.dmg * 1.2) traits.push('hard-hitting');
    if (w.cat !== 'Melee' && w.rate > med.rate * 1.15) traits.push('fast-firing');
    if (w.mag && w.mag > med.mag * 1.3) traits.push('high-capacity');
    if (w.cat !== 'Melee' && w.spread < med.spread * 0.8) traits.push('pinpoint-accurate');
    if (w.reload && w.reload < med.reload * 0.88) traits.push('quick-reloading');
    if (!traits.length) traits.push(w.power < 1.2 ? 'budget-friendly' : 'dependable');
    const org = (ORIGIN.find(([re]) => re.test(w.name)) || [])[1];
    const t = traits.slice(0, 2).join(', ');
    const lead = (org ? org + ' ' : '') + t + ' ' + NOUN[w.cat] + '.';
    return lead[0].toUpperCase() + lead.slice(1) + ' ' + (MODE_SENT[w.mode] || '');
  }
  const median = (arr) => { const s = arr.filter(v => v != null && isFinite(v)).sort((a, b) => a - b); return s[Math.floor(s.length / 2)] || 1; };
  const catMed = {};
  for (const c of Object.keys(LIST)) {
    const ws = weapons.filter(w => w.cat === c);
    catMed[c] = { dmg: median(ws.map(w => w.dmg * (w.pellets || 1))), rate: median(ws.map(w => w.rate)), mag: median(ws.map(w => w.mag)), spread: median(ws.map(w => w.spread)), reload: median(ws.map(w => w.reload)) };
  }
  for (const w of weapons) if (!w.desc) w.desc = describe(w, catMed[w.cat]);

  const bases = weapons.slice();
  for (const b of bases) if (b.flags.g) weapons.push(edition(b, 'golden'));
  // Tactical editions fill the arsenal to exactly 600 — highest-power real firearms first.
  const TAC_CATS = ['Pistols', 'SMGs', 'Rifles', 'Shotguns', 'Snipers', 'Heavy'];
  const tacPool = bases.filter(b => TAC_CATS.includes(b.cat) && b.kind === 'bullet' && !b.flags.noTac)
    .sort((a, b) => b.power - a.power || a.name.localeCompare(b.name));
  const need = Math.max(0, 600 - weapons.length);
  weapons.push(...tacPool.slice(0, need).map(b => edition(b, 'tactical')));

  // ---- value-based pricing ------------------------------------------------------------------
  // Price can never undercut what a weapon actually does: damage per second, squared, scaled by
  // utility (splash, piercing, homing, deflection...). Melee is discounted for its short reach.
  function dpsOf(w) {
    if (w.kind === 'melee') return w.dmg * w.rate;
    const shots = w.mag ? Math.min(w.mag, w.rate * 6) : w.rate * 6;
    const t = shots / w.rate + (w.mag && w.mag < w.rate * 6 ? w.reload : 0);
    return w.dmg * (w.pellets || 1) * shots / Math.max(0.1, t);
  }
  Z.dpsOf = dpsOf;
  function utility(w) {
    let u = 1;
    if (w.kind === 'melee') u *= 0.45 * (w.deflect ? 2.6 : 1) * (w.shock ? 1.6 : 1);
    if (w.radius && /rocket|grenade|plasma/.test(w.kind)) u *= 1 + w.radius / 140;
    if (w.pierce) u *= 1 + 0.25 * Math.min(4, w.pierce);
    if (w.kind === 'rail') u *= 2;
    if (w.kind === 'tesla') u *= 1.8;
    if (w.kind === 'laser') u *= 1.25;
    if (w.homing) u *= 1.4;
    if (w.cluster) u *= 1.6;
    if (w.burn) u *= 1.3;
    if (w.freeze) u *= 1.3;
    if (w.range >= 2000) u *= 1.2;
    return u;
  }
  // Economy: everything is deliberately expensive — the arsenal runs from a few hundred dollars
  // to the high hundreds of thousands, so every upgrade is something you work for.
  const PRICE_MUL = 4;
  Z.PRICE_MUL = PRICE_MUL;
  // ---- weapon types: how the shop is organised -------------------------------------------------
  const TYPES = ['Semi-Auto', 'Full-Auto', 'Manual Action', 'Machine Guns', 'Explosives', 'Melee', 'Futuristic'];
  const TYPE_INFO = {
    'Semi-Auto': { icon: '🔫', desc: 'One shot per click: pistols, revolvers, marksman rifles and semi-auto shotguns.' },
    'Full-Auto': { icon: '💨', desc: 'Hold the trigger: SMGs, assault rifles, machine pistols and burst-fire guns.' },
    'Manual Action': { icon: '🎯', desc: 'Pump, bolt, lever and break-action — work the action between every shot.' },
    'Machine Guns': { icon: '🪖', desc: 'Belt-fed machine guns, miniguns and flamethrowers.' },
    'Explosives': { icon: '🚀', desc: 'Rocket and grenade launchers. Mind the blast.' },
    'Melee': { icon: '⚔️', desc: 'Knives, bats, blades and hammers.' },
    'Futuristic': { icon: '⚡', desc: 'Lasers, plasma, railguns and laser swords. Ridiculously expensive.' }
  };
  const isFuturistic = w => w.cat === 'Energy' || (w.cat === 'Miniguns' && /laser|plasma|tesla/.test(w.kind)) || (w.cat === 'Melee' && (w.deflect || w.glow || w.shape === 'lsword' || w.shape === 'dsaber'));
  function typeOf(w) {
    if (isFuturistic(w)) return 'Futuristic';
    if (w.cat === 'Melee') return 'Melee';
    if (w.cat === 'Explosives') return 'Explosives';
    if (w.cat === 'Heavy' || w.cat === 'Miniguns') return 'Machine Guns';
    if (/^(pump|bolt|lever|break)$/.test(w.mode)) return 'Manual Action';
    if (w.mode === 'auto' || w.mode === 'burst') return 'Full-Auto';
    return 'Semi-Auto';
  }
  for (const w of weapons) {
    w.type = typeOf(w);
    const base = w.id === 'glock-17' ? 150 : Math.max(w.price, nicePrice(0.12 * Math.pow(dpsOf(w), 2) * utility(w)));
    let p = base * PRICE_MUL;
    if (w.type === 'Machine Guns') p *= w.cat === 'Miniguns' ? 1.5 : 1.2;
    if (w.type === 'Explosives') p *= 1.25;
    if (w.type === 'Futuristic') {
      // the sci-fi tier is the end-game grind: laser swords start at $10 million
      const saber = w.shape === 'lsword' || w.shape === 'dsaber';
      p = Math.max(saber ? 1e7 : w.cat === 'Melee' ? 3e6 : 1e6, base * (saber ? 600 : w.cat === 'Melee' ? 450 : 250));
    }
    w.price = nicePrice(p);
  }

  for (const w of weapons) {
    if (w.type !== 'Futuristic') continue;
    const saber = w.shape === 'lsword' || w.shape === 'dsaber';
    w.dmg = Math.round(w.dmg * (saber ? 2.5 : w.cat === 'Melee' ? 2.2 : 3) * 10) / 10;
  }

  // Catalog order: by type (cheapest families first, futuristic last), then by price.
  const typeIdx = Object.fromEntries(TYPES.map((t, i) => [t, i]));
  weapons.sort((a, b) => typeIdx[a.type] - typeIdx[b.type] || a.price - b.price || a.name.localeCompare(b.name));
  weapons.forEach((w, i) => { w.index = i; delete w.flags; });

  // ---- Weapon upgrades ------------------------------------------------------------
  const UPGRADES = [
    { key: 'dmg', name: 'Damage', per: 0.12, max: 5, icon: '💥', fmt: l => '+' + Math.round(l * 12) + '% damage' },
    { key: 'rate', name: 'Fire Rate', per: 0.07, max: 5, icon: '⚡', fmt: l => '+' + Math.round(l * 7) + '% fire rate' },
    { key: 'mag', name: 'Magazine', per: 0.2, max: 5, icon: '📦', fmt: l => '+' + Math.round(l * 20) + '% capacity', ranged: true },
    { key: 'reload', name: 'Reload Speed', per: 0.1, max: 5, icon: '🔄', fmt: l => '-' + Math.round(l * 10) + '% reload time', ranged: true },
    { key: 'acc', name: 'Accuracy', per: 0.14, max: 5, icon: '🎯', fmt: l => '-' + Math.round(l * 14) + '% spread', ranged: true },
    { key: 'reach', name: 'Reach', per: 0.1, max: 5, icon: '📏', fmt: l => '+' + Math.round(l * 10) + '% reach', melee: true }
  ];
  Z.UPGRADES = UPGRADES;
  Z.upgradesFor = w => UPGRADES.filter(u => (w.cat === 'Melee' ? !u.ranged : !u.melee));
  // weapon upgrades cost a small fraction of the weapon (the weapons themselves are the expensive part)
  Z.upgradeCost = (w, lvl) => nicePrice(Math.max(50, w.price * 0.05) * Math.pow(1.35, lvl));
  // Effective stats of a weapon after upgrades.
  Z.applyUpgrades = function (w, u) {
    if (!u) return w;
    const e = Object.assign({}, w);
    e.dmg = w.dmg * (1 + 0.12 * (u.dmg || 0));
    e.rate = w.rate * (1 + 0.07 * (u.rate || 0));
    if (w.mag) e.mag = Math.ceil(w.mag * (1 + 0.2 * (u.mag || 0)));
    e.reload = w.reload * (1 - 0.1 * (u.reload || 0));
    e.spread = w.spread * (1 - 0.14 * (u.acc || 0));
    if (w.cat === 'Melee') e.range = w.range * (1 + 0.1 * (u.reach || 0));
    e.upgraded = Object.values(u).reduce((s, v) => s + v, 0);
    return e;
  };

  // ---- Player perks (Training) ----------------------------------------------------
  // "Upgrade You": permanent upgrades for your character. Cheap early levels, pricier later ones.
  Z.PERKS = [
    { id: 'vitality', name: 'Vitality', icon: '❤️', max: 10, base: 500, desc: '+20 max HP per level' },
    { id: 'skin', name: 'Thick Skin', icon: '🛡️', max: 8, base: 900, desc: '-4% damage taken per level' },
    { id: 'regen', name: 'Second Wind', icon: '💚', max: 5, base: 1200, desc: 'Regenerate 1 HP/s per level after 4 s without getting hit' },
    { id: 'medic', name: 'Field Medic', icon: '🩹', max: 5, base: 600, desc: '+20% healing from medical items per level' },
    { id: 'gunslinger', name: 'Gunslinger', icon: '🎯', max: 10, base: 1500, desc: '+5% damage with every weapon per level' },
    { id: 'agility', name: 'Agility', icon: '🏃', max: 6, base: 450, desc: '+5% move speed & jump per level' },
    { id: 'hands', name: 'Quick Hands', icon: '✋', max: 5, base: 700, desc: '-8% reload time on all weapons per level' },
    { id: 'bounty', name: 'Bounty Hunter', icon: '💰', max: 10, base: 1000, desc: '+10% cash from every kill per level' },
    { id: 'magnet', name: 'Loot Magnet', icon: '🧲', max: 5, base: 250, desc: '+40% pickup range per level' },
    { id: 'builder', name: 'Engineer', icon: '🔧', max: 5, base: 1500, desc: '+20% barricade & turret health per level' }
  ];
  Z.PERK_BY_ID = Object.fromEntries(Z.PERKS.map(p => [p.id, p]));
  Z.perkCost = (p, lvl) => nicePrice(p.base * Math.pow(1.7, lvl));

  // ---- Base building ---------------------------------------------------------------
  Z.BUILD = [
    { id: 'sandbags', name: 'Sandbag Wall', w: 74, h: 50, hp: 450, price: 150, solid: true, desc: 'Cheap cover. Stand on it to shoot over.' },
    { id: 'crates', name: 'Supply Crate Stack', w: 60, h: 64, hp: 550, price: 250, solid: true, desc: 'Wooden crates. Good for climbing.' },
    { id: 'wood-wall', name: 'Wooden Barricade', w: 26, h: 112, hp: 750, price: 400, solid: true, desc: 'Tall plank wall that blocks enemies.' },
    { id: 'barbed', name: 'Barbed Wire', w: 92, h: 34, hp: 400, price: 300, solid: false, dps: 22, slow: 0.4, desc: 'Hurts and slows enemies walking through.' },
    { id: 'spikes', name: 'Spike Strip', w: 70, h: 14, hp: 600, price: 450, solid: false, dps: 40, desc: 'Steel spikes. Ouch.' },
    { id: 'mine', name: 'Landmine', w: 26, h: 8, hp: 50, price: 600, solid: false, mine: { dmg: 260, radius: 150 }, desc: 'Explodes when an enemy steps on it.' },
    { id: 'steel-wall', name: 'Steel Wall', w: 24, h: 124, hp: 2000, price: 1400, solid: true, desc: 'Riveted steel plates.' },
    { id: 'jersey', name: 'Concrete Barrier', w: 84, h: 70, hp: 3200, price: 2200, solid: true, desc: 'Heavy jersey barrier.' },
    { id: 'watchtower', name: 'Watchtower', w: 96, h: 150, hp: 1800, price: 4000, solid: true, tower: true, desc: 'High ground! Climb up and snipe.' },
    { id: 'med-station', name: 'Med Station', w: 44, h: 62, hp: 600, price: 5000, solid: false, heal: 6, radius: 170, desc: 'Heals you 6 HP/s while you stand nearby.' },
    { id: 'field-hospital', name: 'Field Hospital', w: 90, h: 76, hp: 2400, price: 20000, solid: false, heal: 14, radius: 260, desc: 'Big medical tent. Heals you 14 HP/s in a wide area.' },
    { id: 'sentry', name: 'Sentry Gun', w: 42, h: 58, hp: 700, price: 6000, solid: false, turret: { kind: 'bullet', dmg: 11, rate: 6, range: 950, spread: 0.05, speed: 2300, sound: 'rifle' }, desc: 'Auto-turret that shoots the nearest enemy.' },
    { id: 'bunker', name: 'Bunker Wall', w: 32, h: 142, hp: 6500, price: 6500, solid: true, desc: 'Reinforced concrete and rebar.' },
    { id: 'cash-printer', name: 'Money Printer', w: 46, h: 46, hp: 500, price: 9000, solid: false, income: 120, every: 10, desc: 'Prints $120 every 10 seconds. Protect it!' },
    { id: 'gold-printer', name: 'Gold Printer', w: 52, h: 54, hp: 2200, price: 125000, solid: false, income: 1500, every: 10, desc: 'Prints $1,500 every 10 seconds. Raiders love it.' },
    { id: 'crypto-rig', name: 'Crypto Mining Rig', w: 64, h: 72, hp: 6000, price: 1250000, solid: false, income: 20000, every: 10, desc: 'Mines $20,000 every 10 seconds. The ultimate grind machine.' },
    { id: 'heavy-sentry', name: 'Minigun Sentry', w: 52, h: 66, hp: 1400, price: 22000, solid: false, turret: { kind: 'bullet', dmg: 10, rate: 18, range: 1050, spread: 0.08, speed: 2300, sound: 'minigun' }, desc: 'Shreds anything in range.' },
    { id: 'blast-wall', name: 'Titanium Blast Wall', w: 32, h: 160, hp: 16000, price: 25000, solid: true, desc: 'Practically indestructible.' },
    { id: 'rocket-sentry', name: 'Rocket Turret', w: 52, h: 62, hp: 1200, price: 30000, solid: false, turret: { kind: 'rocket', dmg: 120, rate: 0.7, range: 1300, spread: 0.02, speed: 900, radius: 120, sound: 'rocket' }, desc: 'Fires homing rockets.' },
    { id: 'energy-shield', name: 'Energy Shield', w: 18, h: 156, hp: 5000, price: 32000, solid: true, regen: 80, shield: true, desc: 'Regenerates 80 HP/s per block. Glows!' },
    { id: 'tesla-tower', name: 'Tesla Tower', w: 40, h: 96, hp: 1500, price: 38000, solid: false, turret: { kind: 'tesla', dmg: 45, rate: 2, range: 460, color: '#9fd8ff', sound: 'zap' }, desc: 'Chain lightning zaps groups of enemies.' },
    { id: 'laser-sentry', name: 'Laser Turret', w: 46, h: 64, hp: 1600, price: 45000, solid: false, turret: { kind: 'laser', dmg: 34, rate: 5, range: 1400, spread: 0.01, color: '#ff2b4a', sound: 'laser' }, desc: 'Pinpoint lasers at long range.' }
  ];
  // Solid blocks of the same kind can be stacked: they merge into one taller, seamless structure.
  for (const b of Z.BUILD) if (b.solid && !b.tower) b.stack = true;
  // Never let a stack grow taller than this (pixels above the ground).
  Z.MAX_STACK_H = 420;
  for (const b of Z.BUILD) b.price = nicePrice(b.price * PRICE_MUL);
  Z.BUILD_BY_ID = Object.fromEntries(Z.BUILD.map(b => [b.id, b]));

  // ---- Armor ---------------------------------------------------------------
  const armor = [
    { id: 'padded-jacket', slot: 'body', name: 'Padded Jacket', reduce: 0.10, dur: 60, price: 250, color: '#6b5a45', desc: 'Better than a T-shirt.' },
    { id: 'kevlar-2a', slot: 'body', name: 'Kevlar Vest IIA', reduce: 0.20, dur: 110, price: 1100, color: '#3c4a3a', desc: 'Stops pistol rounds.' },
    { id: 'kevlar-3a', slot: 'body', name: 'Kevlar Vest IIIA', reduce: 0.30, dur: 160, price: 3000, color: '#2f3d4f', desc: 'Stops SMG rounds too.' },
    { id: 'plate-3', slot: 'body', name: 'Plate Carrier III', reduce: 0.40, dur: 230, price: 7500, color: '#4b4f3a', desc: 'Steel plates front and back.' },
    { id: 'ceramic-4', slot: 'body', name: 'Ceramic Plates IV', reduce: 0.50, dur: 320, price: 16000, color: '#55585e', desc: 'Stops rifle rounds.' },
    { id: 'eod-suit', slot: 'body', name: 'EOD Bomb Suit', reduce: 0.60, dur: 480, price: 36000, color: '#3a5a7a', moveMul: 0.85, blast: 0.5, desc: 'Halves explosion damage. A bit slow.' },
    { id: 'juggernaut', slot: 'body', name: 'Juggernaut Suit', reduce: 0.70, dur: 750, price: 85000, color: '#2a2a30', moveMul: 0.8, desc: 'Walking tank.' },
    { id: 'nano-suit', slot: 'body', name: 'Nano Exo-Suit', reduce: 0.75, dur: 950, price: 170000, color: '#1aa0c8', regen: 6, desc: 'Self-repairing armor, no slowdown.' },
    { id: 'bike-helmet', slot: 'head', name: 'Bike Helmet', reduce: 0.04, head: 0.25, dur: 40, price: 120, color: '#e04a3a', desc: 'Safety first!' },
    { id: 'combat-helmet', slot: 'head', name: 'Combat Helmet', reduce: 0.08, head: 0.5, dur: 90, price: 1500, color: '#4a5a3a', desc: 'Takes the sting out of headshots.' },
    { id: 'ballistic-helmet', slot: 'head', name: 'Ballistic Helmet', reduce: 0.12, head: 0.75, dur: 160, price: 6000, color: '#2e3540', desc: 'Visor included.' },
    { id: 'jugg-helmet', slot: 'head', name: 'Juggernaut Helmet', reduce: 0.16, head: 0.95, dur: 300, price: 30000, color: '#202024', desc: 'Basically immune to headshots.' },
    { id: 'nano-visor', slot: 'head', name: 'Nano Visor', reduce: 0.2, head: 1, dur: 400, price: 70000, color: '#1aa0c8', regen: 3, desc: 'Headshots? Never heard of them.' }
  ];

  // ---- Medical -------------------------------------------------------------
  const meds = [
    { id: 'gauze', key: 'Z', name: 'Gauze', heal: 15, time: 1.2, price: 40, color: '#f2f2f2', desc: '+15 HP over 1.2s.' },
    { id: 'bandage', key: 'X', name: 'Bandage Roll', heal: 25, time: 1.6, price: 70, color: '#f3e6c8', desc: '+25 HP over 1.6s.' },
    { id: 'painkillers', key: 'C', name: 'Painkillers', heal: 20, time: 6, price: 120, color: '#ffd84d', resist: 0.2, resistTime: 10, desc: '+20 HP slowly and 20% less damage for 10s.' },
    { id: 'first-aid', key: 'F', name: 'First Aid Kit', heal: 50, time: 2.5, price: 260, color: '#ff4040', desc: '+50 HP over 2.5s.' },
    { id: 'medkit', key: 'G', name: 'Medkit', heal: 80, time: 2.5, price: 520, color: '#ff2b2b', desc: '+80 HP over 2.5s.' },
    { id: 'adrenaline', key: 'T', name: 'Adrenaline Shot', heal: 30, time: 0.2, price: 400, color: '#4cd4ff', speed: 1.35, speedTime: 8, desc: '+30 HP instantly and 35% speed for 8s.' },
    { id: 'trauma-kit', key: 'Y', name: 'Trauma Kit', heal: 999, time: 3, price: 1300, color: '#c81e1e', desc: 'Full heal over 3s.' },
    { id: 'nano-med', key: 'U', name: 'Nano-Med Injector', heal: 999, time: 0.5, price: 3200, color: '#3aff9b', regen: 8, regenTime: 15, desc: 'Instant full heal + regeneration for 15s.' },
    { id: 'energy-bar', key: 'J', name: 'Energy Bar', heal: 10, time: 0.2, price: 60, color: '#c8873a', regen: 1.5, regenTime: 20, desc: '+10 HP and +1.5 HP/s for 20s. Tasty!' },
    { id: 'splint', key: 'K', name: 'SAM Splint', heal: 35, time: 2, price: 150, color: '#ff8a3a', desc: '+35 HP over 2s.' },
    { id: 'morphine', key: 'L', name: 'Morphine Syringe', heal: 40, time: 1, price: 450, color: '#b9a6ff', resist: 0.4, resistTime: 6, desc: '+40 HP and 40% less damage for 6s.' },
    { id: 'combat-stim', key: 'I', name: 'Combat Stim', heal: 25, time: 0.2, price: 700, color: '#ff4dc4', dmgBoost: 1.25, dmgTime: 10, desc: '+25 HP instantly and +25% weapon damage for 10s.' },
    { id: 'blood-bag', key: 'O', name: 'Blood Bag', heal: 150, time: 8, price: 900, color: '#a3001b', desc: '+150 HP slowly over 8s. Great after a big fight.' },
    { id: 'defibrillator', key: 'P', name: 'Defibrillator', heal: 0, time: 0, price: 2500, color: '#ffd84d', revive: 0.6, max: 3, desc: 'Works by itself: when you go down, it shocks you back up with 60% HP. Carry up to 3.' }
  ];

  for (const a of armor) a.price = nicePrice(a.price * PRICE_MUL);
  // medical supplies stay cheap so you can always patch yourself up

  Z.WEAPONS = weapons;
  Z.WEAPON_BY_ID = Object.fromEntries(weapons.map(w => [w.id, w]));
  Z.ARMOR = armor;
  Z.ARMOR_BY_ID = Object.fromEntries(armor.map(a => [a.id, a]));
  Z.MEDS = meds;
  Z.MED_BY_ID = Object.fromEntries(meds.map(m => [m.id, m]));
  Z.CATEGORIES = Object.keys(LIST);
  Z.TYPES = TYPES; Z.TYPE_INFO = TYPE_INFO;
  Z.CLASS_LABEL = { Pistols: 'Pistol', SMGs: 'SMG', Rifles: 'Rifle', Shotguns: 'Shotgun', Snipers: 'Sniper', Heavy: 'Heavy', Miniguns: 'Minigun', Explosives: 'Launcher', Energy: 'Energy', Melee: 'Melee' };

  if (typeof module !== 'undefined' && module.exports) module.exports = { weapons, armor, meds, categories: Z.CATEGORIES, types: TYPES, typeInfo: TYPE_INFO, build: Z.BUILD, perks: Z.PERKS, upgrades: UPGRADES, modeLabel: MODE_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
