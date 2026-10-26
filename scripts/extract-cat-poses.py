#!/usr/bin/env python3
"""
Extracts pose frames from the user's licensed cat pose-reference sheet
(~/Downloads/be525f1adb80ee9a86313036f429f160.jpg) into desktop-pet's
renderer layout: one PNG per color variant, frames laid out states (rows) x
frame-index (cols). The source has one frame per pose (no walk-cycle), so
"movement" for single-frame states comes from the engine's own position
updates; a couple of states get two similar poses to alternate.

Also produces a few recolored variants via simple hue remapping, since the
source only ships the one white/blue cat.
"""
from PIL import Image, ImageDraw
import colorsys
import json
import math
import os

SRC = os.path.expanduser('~/Downloads/be525f1adb80ee9a86313036f429f160.jpg')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'renderer', 'assets', 'sprites')

COLS, ROWS = 5, 5
# Only the pink cell-padding color — NOT white/near-white, since the cat's
# own fur is white and keying that out as "background" punches holes in it.
BG_REFS = [(255, 211, 248)]
BG_THRESHOLD = 38

# (row, col) cells to pull from the source grid for each app state.
POSE_MAP = {
    'idle': [(0, 0), (0, 2), (0, 1), (0, 3)],
    'walk': [(1, 1)],
    'run': [(1, 1)],
    'jump': [(1, 0), (2, 3)],
    'sit': [(1, 2), (3, 0), (1, 3)],
    'sleep': [(2, 2)],
    'stretch': [(4, 0), (4, 1)],
    'groom': [(3, 3)],
    'scratch': [(3, 2)],
    'play': [(2, 0)],
    'angry': [(4, 3)],
    'beg': [(3, 1)],
    'dizzy': [(4, 4)],
}
STATES = list(POSE_MAP.keys())
FRAMES_PER_STATE = {state: len(cells) for state, cells in POSE_MAP.items()}
COLUMNS = max(FRAMES_PER_STATE.values())

def bg_distance(px, ref):
    return sum((a - b) ** 2 for a, b in zip(px, ref)) ** 0.5

def is_pink_background(r, g, b):
    """Euclidean distance alone misclassifies near-white fur highlights as
    background, since pale pink (255,211,248) is numerically close to white
    in raw RGB — both are "bright". The real distinguishing feature of the
    pink padding is its dip in the green channel relative to red/blue (a
    magenta/pink tint); true white/near-white fur has r≈g≈b. Require both:
    close enough to the reference AND actually tinted pink."""
    close_enough = any(bg_distance((r, g, b), ref) < BG_THRESHOLD for ref in BG_REFS)
    pink_tinted = (r - g) > 15 and (b - g) > 15
    return close_enough and pink_tinted

def remove_background(cell):
    cell = cell.convert('RGBA')
    px = cell.load()
    for y in range(cell.height):
        for x in range(cell.width):
            r, g, b, a = px[x, y]
            if is_pink_background(r, g, b):
                px[x, y] = (r, g, b, 0)
    return cell

def fill_interior_holes(cell):
    """Belt-and-suspenders pass: any transparent pixel surrounded on most
    sides by opaque pixels is a stray hole (JPEG/threshold edge case in
    background removal), not a real concave contour — fill it from a
    neighbor instead of leaving a see-through speck in the cat's body."""
    cell = cell.convert('RGBA')
    px = cell.load()
    w, h = cell.size
    to_fill = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] != 0:
                continue
            neighbors = []
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    neighbors.append(px[nx, ny])
            opaque_neighbors = [n for n in neighbors if n[3] != 0]
            if len(opaque_neighbors) >= 3:
                avg = tuple(sum(c[i] for c in opaque_neighbors) // len(opaque_neighbors) for i in range(3))
                to_fill.append((x, y, (*avg, 255)))
    for x, y, color in to_fill:
        px[x, y] = color
    return cell

def tight_crop(cell):
    """Crop to this cell's own content bbox — each pose gets cropped to
    exactly its own drawn pixels, independent of any other pose's cell."""
    bbox = cell.getbbox()
    return cell.crop(bbox) if bbox else cell

def recolor(cell, target_hue=None, sat_mult=1.0, light_mult=1.0, fill_sat=0.55):
    """target_hue: absolute 0..1 hue to SET on the cat's fur (None = keep
    original). The source art is a white cat with light-blue shading, so
    most fur pixels start at ~0 saturation — recoloring only saturated
    pixels (the old approach) left the fur itself white with just tinted
    shadows. Instead: repaint everything except true near-black outline
    linework, and force a minimum saturation so originally-white fur
    actually fills with color instead of stating white."""
    cell = cell.convert('RGBA')
    px = cell.load()
    for y in range(cell.height):
        for x in range(cell.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            is_outline = l < 0.16  # near-black linework — leave it alone
            if target_hue is not None and not is_outline:
                h = target_hue
                s = fill_sat  # set directly, not floored — needed to desaturate toward gray too
            s = max(0, min(1, s * sat_mult))
            l = max(0, min(1, l * light_mult))
            nr, ng, nb = colorsys.hls_to_rgb(h, l, s)
            px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    return cell

def draw_yarn_ball(frame, cx, cy, radius, yarn_color=(196, 64, 58), shade_color=(140, 40, 36)):
    """Draws an original, solid-filled (no holes) pixel-art ball of yarn
    directly onto a copy of `frame` at (cx, cy) — a filled circle plus a
    few crossing arcs for yarn-strand texture, all opaque."""
    out = frame.copy()
    draw = ImageDraw.Draw(out)
    bbox = (cx - radius, cy - radius, cx + radius, cy + radius)
    draw.ellipse(bbox, fill=(*yarn_color, 255))
    # crossing arcs to read as wound yarn, not a flat dot
    for angle_offset in (20, 80, 140):
        draw.arc(bbox, start=angle_offset, end=angle_offset + 200, fill=(*shade_color, 255), width=2)
    # a couple of trailing strand pixels so it doesn't look stuck to nothing
    draw.line([(cx + radius - 2, cy + 2), (cx + radius + 5, cy + 6)], fill=(*yarn_color, 255), width=2)
    return out

def main():
    sheet = Image.open(SRC).convert('RGB')
    w, h = sheet.size
    cw, ch = w // COLS, h // ROWS

    # Crop + clean every cell we need, keep by (row,col).
    needed = {cell for cells in POSE_MAP.values() for cell in cells}
    cleaned = {}
    inset = 7  # shave a few px off each cell edge to avoid neighbor-cell bleed
    for (r, c) in needed:
        raw = sheet.crop((c * cw + inset, r * ch + inset, (c + 1) * cw - inset, (r + 1) * ch - inset))
        cleaned[(r, c)] = fill_interior_holes(remove_background(raw))

    # Crop every pose tightly to its own content first, so each pose's size
    # reflects only what it actually draws.
    tight = {key: tight_crop(cell) for key, cell in cleaned.items()}

    pad = 6
    max_w = max(img.width for img in tight.values())
    max_h = max(img.height for img in tight.values())
    fw = max_w + pad * 2
    fh = max_h + pad * 2

    def place(cell):
        # Bottom-align + horizontally-center every pose in the shared frame,
        # so each pose's lowest drawn pixel (paws/belly on the ground) always
        # lands at the same frame-bottom offset — critical since the engine
        # positions sprites by the frame's bottom edge as "ground".
        out = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
        x = (fw - cell.width) // 2
        y = fh - pad - cell.height
        out.paste(cell, (x, y), cell)
        return out

    framed = {key: place(cell) for key, cell in tight.items()}

    # All variants are real-world solid cat coat colors (no fantasy hues).
    variants = [
        {'id': 'white-cat', 'name': 'White Cat', 'hue': 0.0, 'sat': 1.0, 'light': 1.0, 'fillSat': 0.03},
        {'id': 'cream-cat', 'name': 'Cream Cat', 'hue': 0.11, 'sat': 1.0, 'light': 0.92, 'fillSat': 0.35},
        {'id': 'tan-cat', 'name': 'Tan Cat', 'hue': 0.08, 'sat': 1.0, 'light': 0.68, 'fillSat': 0.45},
        {'id': 'smoke-cat', 'name': 'Smoke Cat', 'hue': 0.6, 'sat': 1.0, 'light': 0.45, 'fillSat': 0.05},
        {'id': 'slate-cat', 'name': 'Slate Cat', 'hue': 0.58, 'sat': 1.0, 'light': 0.78, 'fillSat': 0.03},
        {'id': 'onyx-cat', 'name': 'Onyx Cat', 'hue': 0.6, 'sat': 1.0, 'light': 0.22, 'fillSat': 0.08},
        {'id': 'ginger-cat', 'name': 'Ginger Cat', 'hue': 0.07, 'sat': 1.0, 'light': 0.92, 'fillSat': 0.65},
        {'id': 'chocolate-cat', 'name': 'Chocolate Cat', 'hue': 0.07, 'sat': 1.0, 'light': 0.5, 'fillSat': 0.45},
    ]

    os.makedirs(OUT_DIR, exist_ok=True)
    catalog = []

    ball_radius = 11
    ball_cx = pad + ball_radius + 2  # bottom-left corner of the frame — clear of the centered cat pose
    ball_cy = fh - pad - ball_radius

    for variant in variants:
        out_sheet = Image.new('RGBA', (fw * COLUMNS, fh * len(STATES)), (0, 0, 0, 0))
        for row, state in enumerate(STATES):
            for col, cell_key in enumerate(POSE_MAP[state]):
                frame = framed[cell_key]
                frame = recolor(frame, variant['hue'], variant['sat'], variant['light'], variant.get('fillSat', 0.55))
                if state == 'play':
                    frame = draw_yarn_ball(frame, ball_cx, ball_cy, ball_radius)
                out_sheet.paste(frame, (col * fw, row * fh), frame)
        out_path = os.path.join(OUT_DIR, f"{variant['id']}.png")
        out_sheet.save(out_path)
        catalog.append({'id': variant['id'], 'name': variant['name'], 'spriteFile': f"assets/sprites/{variant['id']}.png"})
        print('wrote', out_path, f'{fw*COLUMNS}x{fh*len(STATES)}')

    manifest = {
        'frameWidth': fw,
        'frameHeight': fh,
        'states': STATES,
        'framesPerState': FRAMES_PER_STATE,
        'columns': COLUMNS,
    }
    with open(os.path.join(OUT_DIR, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)

    with open(os.path.join(os.path.dirname(__file__), '..', 'src', 'renderer', 'pets', 'catalog.js'), 'w') as f:
        f.write(
            '// Shared pet catalog — required from both the main process (tray menu) and\n'
            '// the preload script (which exposes it to the renderer via contextBridge).\n'
            '// Plain data only, so it is safe to require() from any context.\n'
            '// Poses extracted from the user-provided, licensed reference sheet\n'
            '// (~/Downloads/be525f1a....jpg) via scripts/extract-cat-poses.py,\n'
            '// recolored into a few variants.\n'
            'module.exports = ' + json.dumps(catalog, indent=2) + ';\n'
        )
    print('Done. Frame size:', fw, 'x', fh)

if __name__ == '__main__':
    main()
