// Renderer-only script — toggles OS-level click-through on/off only when the
// cursor transitions into/out of the pet's current bounding box, so we don't
// spam IPC on every mousemove. Attached to window.PetClickThrough.
(function () {
  function setup({ getPetRect, petAPI }) {
    let inside = false;

    window.addEventListener('mousemove', (event) => {
      const rect = getPetRect();
      const isInside =
        !!rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (isInside !== inside) {
        inside = isInside;
        petAPI.setIgnoreMouseEvents(!inside);
      }
    });
  }

  window.PetClickThrough = { setup };
})();
