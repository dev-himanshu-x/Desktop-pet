// Renderer-only script — frame-count/timing lookup backed by the sprite
// manifest (see scripts/generate-sprites.js), exposed to the renderer via
// preload as window.petAPI.spriteManifest. Attached to window.PetFrames.
(function () {
  const FRAME_DURATION = 150; // ms each sprite frame is held before advancing

  // The sheet's own walk/run/jump/stretch frames are single poses or have
  // the tail/body cropped off, so those states borrow the uncut leg poses
  // from the idle row (row 0): 0 stand, 1 step, 2 front paw lifted, 3 back leg extended.
  const FRAME_MAP = {
    walk: [[0, 0], [0, 2], [0, 3], [0, 1]],
    run: [[0, 3], [0, 2], [0, 1], [0, 2]],
    jump: [[0, 1], [0, 3]], // crouch, airborne
  };

  function spriteCell(state, frameIndex, defaultRow) {
    const map = FRAME_MAP[state];
    if (!map) return { row: defaultRow, col: frameIndex };
    const [row, col] = map[frameIndex % map.length];
    return { row, col };
  }

  function frameCount(state) {
    if (FRAME_MAP[state]) return FRAME_MAP[state].length;
    const manifest = window.petAPI.spriteManifest;
    return (manifest.framesPerState && manifest.framesPerState[state]) || 1;
  }

  window.PetFrames = { FRAME_DURATION, frameCount, spriteCell };
})();
