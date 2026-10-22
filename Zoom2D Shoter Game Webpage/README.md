# Zoom2D Shooter

**Version:** V.2.0

- V.2.0: 600 weapons, 14 medical items (including a self-activating Defibrillator), a Field Hospital, stackable walls, only one Big Henchman at a time
- V.1.0: the first release (500 weapons)

A 2D side-scrolling shooter that runs in any modern browser. Double-click **index.html** to play. No install needed.

- 600 weapons grouped by type — Semi-Auto, Full-Auto, Manual Action, Machine Guns, Explosives, Melee and Futuristic — and sorted by price, from a $500 pistol to $50,000,000 futuristic gear (laser swords start at $10,000,000)
- A deliberately grindy economy: weapon upgrades (5 tracks × 5 levels), armor, 14 medical supplies (including a self-activating Defibrillator), training perks, and income buildings (Money Printer, Gold Printer, Crypto Mining Rig)
- Base building: walls, traps, turrets, med stations, a Field Hospital and money printers — stack walls into taller walls and put turrets on top
- Destructible terrain across 4 biomes, enemies that scale from clueless Dimwits to minigun Boss Brutes, and raids every few minutes
- Procedural battle music that gets more intense as fights heat up
- Auto dynamic resolution (keeps it smooth on big or high-DPI screens), plus manual resolution scale (50–200%), HiDPI, quality presets and HUD size in Settings
- Autosaves to your browser

See **manual.pdf** for the full field manual and weapon catalog.

## Files

| Path | What it is |
|---|---|
| `index.html` | The game page |
| `css/style.css` | Menus, shop and overlays |
| `js/weapons.js` | Weapon, armor, medical, upgrade, perk and building catalog |
| `js/art.js` | Procedural weapon and character art |
| `js/audio.js` | Music sequencer and sound effects (Web Audio) |
| `js/terrain.js` | Destructible terrain, biomes, sky and parallax |
| `js/entities.js` | Player, enemy AI, projectiles, pickups and effects |
| `js/build.js` | Base building: barricades, traps and turrets |
| `js/shop.js` | The Armory shop UI |
| `js/ui.js` | Title, pause, settings, help and death screens |
| `js/main.js` | Game loop, camera, rendering, HUD, spawning and saving |
| `tools/` | Scripts that rebuild `manual.pdf` from the game data |

To rebuild the manual: `node tools/export_catalog.js > tools/catalog.json` then `python tools/make_manual.py` (needs `reportlab`).
