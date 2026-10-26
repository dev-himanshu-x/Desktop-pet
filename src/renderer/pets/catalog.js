// Shared pet catalog — required from both the main process (tray menu) and
// the preload script (which exposes it to the renderer via contextBridge).
// Plain data only, so it is safe to require() from any context.
// Poses extracted from the user-provided, licensed reference sheet
// (~/Downloads/be525f1a....jpg) via scripts/extract-cat-poses.py,
// recolored into a few variants.
module.exports = [
  {
    "id": "white-cat",
    "name": "White Cat",
    "spriteFile": "assets/sprites/white-cat.png"
  },
  {
    "id": "cream-cat",
    "name": "Cream Cat",
    "spriteFile": "assets/sprites/cream-cat.png"
  },
  {
    "id": "tan-cat",
    "name": "Tan Cat",
    "spriteFile": "assets/sprites/tan-cat.png"
  },
  {
    "id": "smoke-cat",
    "name": "Smoke Cat",
    "spriteFile": "assets/sprites/smoke-cat.png"
  },
  {
    "id": "slate-cat",
    "name": "Slate Cat",
    "spriteFile": "assets/sprites/slate-cat.png"
  },
  {
    "id": "onyx-cat",
    "name": "Onyx Cat",
    "spriteFile": "assets/sprites/onyx-cat.png"
  },
  {
    "id": "ginger-cat",
    "name": "Ginger Cat",
    "spriteFile": "assets/sprites/ginger-cat.png"
  },
  {
    "id": "chocolate-cat",
    "name": "Chocolate Cat",
    "spriteFile": "assets/sprites/chocolate-cat.png"
  }
];
