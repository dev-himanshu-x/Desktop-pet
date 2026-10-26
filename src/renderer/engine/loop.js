// Renderer-only script — a drift-free requestAnimationFrame driver.
// Attached to window.PetLoop.
(function () {
  function start(callback) {
    let lastTs = null;
    let rafId = null;
    let stopped = false;

    function tick(ts) {
      if (stopped) return;
      if (lastTs == null) lastTs = ts;
      const dt = Math.min(ts - lastTs, 50); // clamp to avoid huge jumps after throttling
      lastTs = ts;
      callback(dt);
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    return function stop() {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }

  window.PetLoop = { start };
})();
