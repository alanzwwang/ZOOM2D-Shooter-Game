"""Builds manual.pdf — the Zoom2D Shooter field manual — from tools/catalog.json.

Usage (from the game folder):
    node tools/export_catalog.js > tools/catalog.json
    python tools/make_manual.py
"""
import json
import os
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CAT = json.load(open(os.path.join(HERE, 'catalog.json'), encoding='utf-8'))

INK = colors.HexColor('#14162a')
GOLD = colors.HexColor('#ff9b1f')
BLUE = colors.HexColor('#2a7fff')
MUTED = colors.HexColor('#5d6380')
ZEBRA = colors.HexColor('#f3f4fa')

ss = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=ss['Heading1'], fontName='Helvetica-Bold', fontSize=22, textColor=INK, spaceAfter=10, spaceBefore=6)
H2 = ParagraphStyle('H2', parent=ss['Heading2'], fontName='Helvetica-Bold', fontSize=14, textColor=GOLD, spaceAfter=6, spaceBefore=10)
BODY = ParagraphStyle('B', parent=ss['BodyText'], fontName='Helvetica', fontSize=10, leading=14, textColor=INK)
SMALL = ParagraphStyle('S', parent=BODY, fontSize=8, leading=10)
CELL = ParagraphStyle('C', parent=BODY, fontSize=7.5, leading=9)
TITLE = ParagraphStyle('T', parent=H1, fontSize=54, leading=60, alignment=TA_CENTER, textColor=INK)
SUB = ParagraphStyle('Sub', parent=BODY, fontSize=16, leading=22, alignment=TA_CENTER, textColor=MUTED)

ENEMIES = [
    ('Dimwit', 1, 30, '12-26', 'Clueless rookies who throw rocks, trip over their own feet and forget how to aim.'),
    ('Goon', 2, 55, '28-50', 'Cheap pistol, shaky aim. Usually first through the door.'),
    ('Thug', 3, 90, '60-105', 'Sprays a MAC-10 in long bursts. Dangerous up close.'),
    ('Mercenary', 4, 140, '140-210', 'Helmet, vest and an AK-47. Leads moving targets.'),
    ('Rocketeer', 4, 120, '250-360', 'Fires RPGs that blow holes in the ground and in your walls.'),
    ('Marksman', 5, 100, '270-390', 'Long-range sniper. Watch for the red laser before the shot.'),
    ('Big Henchman', 6, 460, '380-500', 'Huge, armored, machine-gun wielding and very accurate. Shows up after about 10 minutes at high threat, and only one at a time.'),
    ('Boss Brute', 7, 1500, '3,300-4,500', 'Minigun-toting boss. Only appears after about 20 minutes at very high threat, and only one at a time.'),
]

CONTROLS = [
    ('A / D or arrow keys', 'Move'), ('Space / W', 'Jump (hold to jump higher)'), ('Shift', 'Sprint'),
    ('Left click', 'Shoot / swing'), ('Right click (hold)', 'Aim down sights: half the spread; snipers zoom out'),
    ('R', 'Reload'), ('V', 'Switch fire mode on select-fire guns'), ('1-9 / mouse wheel', 'Switch weapon'),
    ('Q', 'Quick-swap to your last weapon'), ('E or click a SHOP sign', 'Open the Armory (pauses the game)'),
    ('B', 'Build mode: 1-0 (Shift+1-9 for 11-19) / wheel pick, left click place, right click sell'), ('H', 'Quick heal'),
    ('Z X C F G T Y U', 'Use a specific medical item'), ('J K L I O', 'More medical items (the P Defibrillator works by itself)'), ('M', 'Mute music'), ('Esc', 'Pause / close menus'),
]


def money(v):
    return '${:,.0f}'.format(v)


def table(rows, widths, header=True, font=8.5):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ('FONT', (0, 0), (-1, -1), 'Helvetica', font),
        ('TEXTCOLOR', (0, 0), (-1, -1), INK),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, ZEBRA]),
        ('LINEBELOW', (0, 0), (-1, -1), 0.25, colors.HexColor('#dfe1ee')),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [('BACKGROUND', (0, 0), (-1, 0), INK), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                  ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', font)]
    t.setStyle(TableStyle(style))
    return t


def on_page(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFillColor(INK)
        canvas.rect(0, letter[1] - 0.45 * inch, letter[0], 0.45 * inch, fill=1, stroke=0)
        canvas.setFillColor(GOLD)
        canvas.setFont('Helvetica-Bold', 11)
        canvas.drawString(0.6 * inch, letter[1] - 0.3 * inch, 'ZOOM2D SHOOTER')
        canvas.setFillColor(colors.white)
        canvas.setFont('Helvetica', 9)
        canvas.drawRightString(letter[0] - 0.6 * inch, letter[1] - 0.3 * inch, 'Field Manual')
        canvas.setFillColor(MUTED)
        canvas.drawCentredString(letter[0] / 2, 0.4 * inch, 'Page %d' % doc.page)
    canvas.restoreState()


def build():
    weapons = CAT['weapons']
    story = []
    # cover
    story += [Spacer(1, 1.8 * inch), Paragraph('<font color="#ff9b1f">ZOOM</font><font color="#2a7fff">2D</font>', TITLE),
              Paragraph('SHOOTER', ParagraphStyle('T2', parent=TITLE, fontSize=28, leading=34)), Spacer(1, 0.3 * inch),
              Paragraph('Official Field Manual', SUB), Spacer(1, 0.2 * inch),
              Paragraph('%d weapons &middot; %d base structures &middot; %d enemy types &middot; 4 biomes' % (len(weapons), len(CAT['build']), len(ENEMIES)), SUB),
              Spacer(1, 2.2 * inch),
              Paragraph('Open <b>index.html</b> in Chrome, Edge or Firefox to play. No install needed.', ParagraphStyle('c', parent=BODY, alignment=TA_CENTER)),
              PageBreak()]

    story.append(Paragraph('Getting Started', H1))
    story.append(Paragraph(
        'You drop into a huge side-scrolling world of hills, canyons, frozen peaks and wasteland. Enemies hunt you, and every one you take down '
        'drops cash. Spend it at the glowing <b>SHOP</b> signs on a massive arsenal, armor, medical supplies, barricades and training. '
        'The game pauses completely while you shop.', BODY))
    story.append(Paragraph('Controls', H2))
    story.append(table([['Key', 'Action']] + [list(r) for r in CONTROLS], [2.2 * inch, 4.6 * inch]))
    story.append(Paragraph('Making money', H2))
    for line in [
        'Everything is expensive on purpose: cheap pistols cost a few hundred dollars, good rifles tens of thousands, miniguns hundreds of thousands '
        'and futuristic weapons millions. <b>Laser swords start at $10,000,000</b> &mdash; they take serious grinding.',
        'Medical supplies are cheap and drop often: about half of all kills leave something to heal with, and gauze, bandages, energy bars and splints lie around the map. '
        'Carry a <b>Defibrillator</b> (up to 3) and it revives you automatically when you go down.',
        'Every kill drops cash. <b>Headshots</b> pay 25% more, a <b>combo</b> (kills within 3.5 s of each other) adds +10% per link, '
        'and bounties climb steeply with the <b>threat level</b>: about double at threat 5 and five times at threat 10.',
        'Free loot is scattered everywhere, but it is mostly small change. Gold bars and briefcases are rare jackpots.',
        '<b>Supply drops</b> parachute in every couple of minutes with cash and a medical item.',
        'Build income buildings in your base: <b>Money Printer</b> ($120 every 10 s), <b>Gold Printer</b> ($1,500) and <b>Crypto Mining Rig</b> ($20,000). '
        'Raiders go after them first, so wall them in.',
        'Dying costs 10% of your cash (at most $50,000). You keep your weapons, upgrades, perks and base, and enemies ease off for a while.']:
        story.append(Paragraph('&bull; ' + line, BODY))
    story.append(Paragraph('Threat level &amp; raids', H2))
    story.append(Paragraph(
        'Threat rises with time survived, kills and distance explored. At low threat you mostly meet Dimwits; as it climbs, Goons, Thugs, '
        'Mercenaries, Rocketeers and Marksmen arrive, then machine-gun Big Henchmen and finally the minigun Boss Brute. About every three '
        'minutes a <b>RAID</b> sends a large wave straight at you. A countdown appears 30 seconds before it hits.', BODY))

    shots = [f for f in ['title.jpg', 'combat.jpg', 'base.jpg', 'shop.jpg'] if os.path.exists(os.path.join(HERE, 'screens', f))]
    if shots:
        story.append(PageBreak())
        story.append(Paragraph('Screenshots', H1))
        for f in shots:
            story.append(Image(os.path.join(HERE, 'screens', f), width=6.6 * inch, height=6.6 * inch * 9 / 16))
            story.append(Spacer(1, 0.12 * inch))

    story.append(PageBreak())
    story.append(Paragraph('Know Your Enemy', H1))
    story.append(Paragraph('Cash is the base bounty before headshot, combo and threat-level bonuses.', BODY))
    story.append(table([['Enemy', 'Tier', 'HP', 'Cash', 'Notes']] + [[n, t, hp, '$' + c, Paragraph(escape(d), CELL)] for n, t, hp, c, d in ENEMIES],
                       [1.2 * inch, 0.45 * inch, 0.55 * inch, 0.8 * inch, 3.8 * inch]))
    story.append(Paragraph('Armor', H2))
    story.append(Paragraph('Armor absorbs a share of every hit and wears down as it does. A vest and a helmet stack; helmets also protect against headshots. Repair worn armor at the shop.', BODY))
    story.append(table([['Armor', 'Slot', 'Damage cut', 'Durability', 'Price']] +
                       [[a['name'], 'Body' if a['slot'] == 'body' else 'Head', '%d%%' % round(a['reduce'] * 100), a['dur'], money(a['price'])] for a in CAT['armor']],
                       [2.2 * inch, 0.8 * inch, 1.1 * inch, 1.1 * inch, 1.2 * inch]))
    story.append(Paragraph('Medical supplies', H2))
    story.append(table([['Item', 'Key', 'Effect', 'Price']] + [[m['name'], m['key'], Paragraph(escape(m['desc']), CELL), money(m['price'])] for m in CAT['meds']],
                       [1.7 * inch, 0.5 * inch, 3.6 * inch, 0.9 * inch]))

    story.append(PageBreak())
    story.append(Paragraph('Base Building', H1))
    story.append(Paragraph(
        'Press <b>B</b> to enter build mode. Pick a structure with 1-0, Q or the mouse wheel, then left-click to place it. Items you bought '
        'in the shop are used first; otherwise the price comes out of your wallet. Right-click a structure to sell it back for half its value. '
        'Solid walls block enemies and their bullets, but your own shots pass straight through. You can stand on top of walls and watchtowers. '
        'Enemies will shoot and smash barricades that block their way, and they target turrets and Money Printers first.', BODY))
    story.append(Paragraph(
        '<b>Stacking:</b> build a wall on top of the same kind of wall and the two merge into one taller, tougher wall. Sandbags, crates, '
        'wooden, steel, bunker and blast walls, concrete barriers and energy shields all stack (up to 420 pixels high). Turrets, med stations '
        'and printers can sit on top of a wall that is wide enough. Right-click a stack to take its top block off. If a wall is destroyed, '
        'whatever stood on it drops down.', BODY))
    story.append(table([['Structure', 'Type', 'HP', 'Price', 'What it does']] +
                       [[b['name'], 'Turret' if b.get('turret') else ('Wall' if b['solid'] else 'Trap / utility'), '{:,}'.format(b['hp']), money(b['price']), Paragraph(escape(b['desc']), CELL)] for b in CAT['build']],
                       [1.6 * inch, 0.9 * inch, 0.6 * inch, 0.8 * inch, 2.9 * inch]))
    story.append(Paragraph('Upgrades &amp; Upgrade You', H2))
    story.append(Paragraph('Every weapon you own has its own upgrade tracks (Damage, Fire Rate, Magazine, Reload Speed and Accuracy, or Reach for melee), each with 5 levels; '
                           'an upgrade costs about a tenth of the weapon. The <b>Upgrade You</b> tab sells permanent upgrades for your character (early levels are cheap):', BODY))
    story.append(table([['Upgrade', 'Levels', 'Effect', 'Level 1', 'Max level']] + [[p['name'], p['max'], Paragraph(escape(p['desc']), CELL), money(p.get('first', 0)), money(p.get('last', 0))] for p in CAT['perks']], [1.3 * inch, 0.55 * inch, 3.05 * inch, 0.9 * inch, 1.0 * inch]))

    story.append(PageBreak())
    story.append(Paragraph('The Arsenal: all %d weapons' % len(weapons), H1))
    story.append(Paragraph('Fire modes: <b>Semi-Auto</b> fires once per click; <b>Full-Auto</b> fires while held; <b>Burst</b> fires 2-3 rounds per click; '
                           '<b>Pump</b>, <b>Bolt</b>, <b>Lever</b> and <b>Break-Action</b> guns cycle between shots. Guns with more than one mode can switch with <b>V</b>. '
                           '<b>Golden</b> editions do +30% damage with bigger mags; <b>Tactical</b> editions add a laser sight, suppressor and tighter spread.', BODY))
    types = CAT.get('types') or sorted({w['type'] for w in weapons})
    info = CAT.get('typeInfo', {})
    story.append(Paragraph('Weapons are grouped by type and sorted from cheapest to most expensive, exactly like the in-game shop.', BODY))
    rng = [['Type', 'Weapons', 'Cheapest', 'Most expensive']]
    for t in types:
        ws = [w for w in weapons if w['type'] == t]
        rng.append([t, len(ws), money(min(w['price'] for w in ws)), money(max(w['price'] for w in ws))])
    story.append(table(rng, [2.2 * inch, 1.0 * inch, 1.6 * inch, 2.0 * inch]))
    for c in types:
        rows = [['Weapon', 'Class', 'Fire mode(s)', 'Damage', 'Rate/s', 'Mag', 'Price']]
        for w in [x for x in weapons if x['type'] == c]:
            dmg = ('%g' % w['dmg']) + (' x%d' % w['pellets'] if w['pellets'] > 1 else '')
            name = escape(w['name'])
            if w['gold']:
                name = '<font color="#b8860b"><b>%s</b></font>' % name
            elif w['tactical']:
                name = '<font color="#4b5a32"><b>%s</b></font>' % name
            rows.append([Paragraph(name, CELL), w['cat'], Paragraph(' / '.join(w['modes']), CELL), dmg, '%g' % round(w['rate'], 2), w['mag'] or '-', money(w['price'])])
        head = [Paragraph('%s (%d)' % (c, len(rows) - 1), H2)]
        if info.get(c):
            head.append(Paragraph(escape(info[c]['desc']), SMALL))
        story.append(KeepTogether(head))
        story.append(table(rows, [2.15 * inch, 0.75 * inch, 1.3 * inch, 0.7 * inch, 0.5 * inch, 0.45 * inch, 1.0 * inch], font=7.5))

    doc = SimpleDocTemplate(os.path.join(ROOT, 'manual.pdf'), pagesize=letter, leftMargin=0.6 * inch, rightMargin=0.6 * inch,
                            topMargin=0.75 * inch, bottomMargin=0.65 * inch, title='Zoom2D Shooter Field Manual', author='Zoom2D')
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)


if __name__ == '__main__':
    build()
    print('wrote manual.pdf')
