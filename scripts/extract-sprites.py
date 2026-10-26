#!/usr/bin/env python3
"""
Extracts per-color pet sprite sheets from the user's licensed asset pack
(~/Downloads/CatRecolors3.png) into the layout desktop-pet's renderer
expects: one PNG per pet, frames laid out states (rows) x frame-index (cols).

Source sheet: 48x48 frames, 12 color columns, rows 0-3 used here:
  row 0 = idle (front view)
  row 1 = walk, facing left
  row 2 = walk, facing right
  row 3 = jump / vertical-move (back view, works for up or down)
There's no dedicated sit/sleep pose in the pack, so those reuse the idle frame.
"""
from PIL import Image
import json
import os

SRC = os.path.expanduser('~/Downloads/CatRecolors3.png')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'renderer', 'assets', 'sprites')
FW, FH = 48, 48

STATES = ['idle', 'walk', 'run', 'jump', 'sit', 'sleep']
FRAMES_PER_STATE = {'idle': 1, 'walk': 2, 'run': 2, 'jump': 1, 'sit': 1, 'sleep': 1}
COLUMNS = max(FRAMES_PER_STATE.values())

COLOR_NAMES = [
    'Rusty', 'Chestnut', 'Copper', 'Umber', 'Cocoa', 'Hazel',
    'Honey', 'Caramel', 'Wheat', 'Sandy', 'Cream', 'Snow',
]

def crop(sheet, col, row):
    x, y = col * FW, row * FH
    return sheet.crop((x, y, x + FW, y + FH))

def build_pet_sheet(sheet, col):
    idle = crop(sheet, col, 0)
    walk_left = crop(sheet, col, 1)   # row 1 faces left (eye visible on the left)
    walk_right = crop(sheet, col, 2)  # row 2 faces right
    jump = crop(sheet, col, 3)

    out = Image.new('RGBA', (FW * COLUMNS, FH * len(STATES)), (0, 0, 0, 0))
    frame_by_state = {
        'idle': [idle],
        'walk': [walk_left, walk_right],
        'run': [walk_left, walk_right],
        'jump': [jump],
        'sit': [idle],
        'sleep': [idle],
    }
    for row, state in enumerate(STATES):
        for c, frame in enumerate(frame_by_state[state]):
            out.paste(frame, (c * FW, row * FH), frame)
    return out

def main():
    sheet = Image.open(SRC).convert('RGBA')
    os.makedirs(OUT_DIR, exist_ok=True)

    catalog = []
    for col, name in enumerate(COLOR_NAMES):
        pet_id = f'{name.lower()}-squirrel'
        out_sheet = build_pet_sheet(sheet, col)
        out_path = os.path.join(OUT_DIR, f'{pet_id}.png')
        out_sheet.save(out_path)
        catalog.append({'id': pet_id, 'name': f'{name} Squirrel', 'spriteFile': f'assets/sprites/{pet_id}.png'})
        print('wrote', out_path)

    manifest = {
        'frameWidth': FW,
        'frameHeight': FH,
        'states': STATES,
        'framesPerState': FRAMES_PER_STATE,
        'columns': COLUMNS,
        'directional': ['walk', 'run'],  # frame index is direction-selected, not time-animated
    }
    with open(os.path.join(OUT_DIR, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)

    with open(os.path.join(os.path.dirname(__file__), '..', 'src', 'renderer', 'pets', 'catalog.js'), 'w') as f:
        f.write(
            '// Shared pet catalog — required from both the main process (tray menu) and\n'
            "// the preload script (which exposes it to the renderer via contextBridge).\n"
            '// Plain data only, so it is safe to require() from any context.\n'
            '// Sprites extracted from the user-provided, licensed asset pack\n'
            '// (~/Downloads/CatRecolors3.png) via scripts/extract-sprites.py.\n'
            'module.exports = ' + json.dumps(catalog, indent=2) + ';\n'
        )
    print('Done.')

if __name__ == '__main__':
    main()
