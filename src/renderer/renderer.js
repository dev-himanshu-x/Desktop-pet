(function () {
  const manifest = window.petAPI.spriteManifest;
  const SPRITE_WIDTH = manifest.frameWidth;
  const SPRITE_HEIGHT = manifest.frameHeight;

  const petEl = document.getElementById('pet');
  petEl.style.width = SPRITE_WIDTH + 'px';
  petEl.style.height = SPRITE_HEIGHT + 'px';
  petEl.style.backgroundSize = `${SPRITE_WIDTH * manifest.columns}px ${SPRITE_HEIGHT * manifest.states.length}px`;

  const catalog = window.petAPI.catalog;
  let currentPet = catalog[0] || null;
  let currentSpriteUrl = null;
  // "Ground" is the visible desktop floor (just above the Dock/taskbar), not
  // the literal bottom of the screen — corrected as soon as the main process
  // reports it; window.innerHeight is just a reasonable starting guess.
  let usableHeight = window.innerHeight;
  let stateMachine = new window.PetStateMachine({
    spriteWidth: SPRITE_WIDTH,
    spriteHeight: SPRITE_HEIGHT,
    screenWidth: window.innerWidth,
    screenHeight: usableHeight,
  });
  let visible = true;

  function findPet(petId) {
    if (catalog.length === 0) return null;
    return catalog.find((pet) => pet.id === petId) || catalog[0];
  }

  function render() {
    if (!visible || !currentPet) {
      petEl.style.display = 'none';
      return;
    }
    petEl.style.display = 'block';

    if (currentSpriteUrl !== currentPet.spriteFile) {
      currentSpriteUrl = currentPet.spriteFile;
      petEl.style.backgroundImage = `url("${currentSpriteUrl}")`;
    }

    const { row, col } = window.PetFrames.spriteCell(
      stateMachine.state,
      stateMachine.frameIndex,
      Math.max(0, manifest.states.indexOf(stateMachine.state)),
    );
    petEl.style.backgroundPosition = `-${col * SPRITE_WIDTH}px -${row * SPRITE_HEIGHT}px`;

    const y = stateMachine.y - (stateMachine.bobOffset || 0);
    let transform = `translate(${Math.round(stateMachine.x)}px, ${Math.round(y)}px)`;
    petEl.style.transformOrigin = `${SPRITE_WIDTH / 2}px ${SPRITE_HEIGHT}px`; // feet stay planted
    transform += ` rotate(${(stateMachine.tilt || 0).toFixed(2)}deg) scaleY(${(stateMachine.squash || 1).toFixed(3)})`;
    // Sprite art faces left, so flip when travelling right.
    if (stateMachine.direction > 0) transform += ' scaleX(-1)';
    petEl.style.transform = transform;
  }

  window.PetLoop.start((dt) => {
    stateMachine.update(dt, window.innerWidth, usableHeight, window.PetFrames.FRAME_DURATION, window.PetFrames.frameCount);
    render();
  });

  // Mouse moves are forwarded even while the window is click-through.
  window.addEventListener('mousemove', (event) => {
    stateMachine.setCursor(event.clientX, event.clientY);
  });

  window.PetClickThrough.setup({
    getPetRect: () => (visible && currentPet ? petEl.getBoundingClientRect() : null),
    petAPI: window.petAPI,
  });

  window.petAPI.onSetPetType((petId) => {
    currentPet = findPet(petId);
  });

  window.petAPI.onSetVisibility((isVisible) => {
    visible = isVisible;
    stateMachine.setPaused(!isVisible);
  });

  window.petAPI.onScreenResized((payload) => {
    if (payload && typeof payload.usableHeight === 'number') {
      usableHeight = payload.usableHeight;
      stateMachine.syncGround(usableHeight);
    }
  });

  window.petAPI.onInitialState((state) => {
    currentPet = findPet(state.petId);
    visible = state.visible;
    stateMachine.setPaused(!visible);
    if (typeof state.usableHeight === 'number') {
      usableHeight = state.usableHeight;
      stateMachine.syncGround(usableHeight);
    }
  });

  window.petAPI.ready();
})();
