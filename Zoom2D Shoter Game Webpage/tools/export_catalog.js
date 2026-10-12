// Exports the in-game catalog to JSON so the PDF manual always matches the game.
// Usage: node tools/export_catalog.js > tools/catalog.json
const path = require('path');
const data = require(path.join(__dirname, '..', 'js', 'weapons.js'));
const out = {
  weapons: data.weapons.map(w => ({
    name: w.name, cat: w.cat, type: w.type, mode: data.modeLabel[w.mode], modes: w.modes.map(m => data.modeLabel[m]),
    dmg: w.dmg, pellets: w.pellets || 1, rate: w.rate, mag: w.mag, price: w.price, gold: !!w.gold, tactical: !!w.tactical, desc: w.desc || ''
  })),
  types: data.types, typeInfo: data.typeInfo,
  armor: data.armor, meds: data.meds, build: data.build,
  perks: data.perks.map(p => Object.assign({}, p, { first: globalThis.Z.perkCost(p, 0), last: globalThis.Z.perkCost(p, p.max - 1) })),
  upgrades: data.upgrades.map(u => ({ name: u.name, max: u.max, per: u.per }))
};
process.stdout.write(JSON.stringify(out));
