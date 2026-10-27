// Renderer-only script — pure animation/movement state machine, no DOM
// access. Attached to window.PetStateMachine.
//
// Movement model: the pet mostly lives on the ground, walking smoothly
// forward (X axis only) at whatever height it currently rests — straight,
// continuous movement (not the body oscillating back and forth). To change
// height it does a "jump": a short diagonal hop (X and Y both move, with a
// visual arc), capped to a small max distance per hop — reaching a far
// point on screen takes several hops in a row, not one long leap. Jumps are
// biased to return to ground level, so climbing elsewhere is an occasional
// event, not the norm.
(function () {
  const BEHAVIOR_TABLE = {
    idle: [
      ['walk', 0.28], ['jump', 0.25], ['sit', 0.08], ['sleep', 0.05],
      ['groom', 0.05], ['scratch', 0.05], ['play', 0.05], ['angry', 0.02],
      ['beg', 0.04], ['idle', 0.07],
    ],
    walk: [['idle', 0.3], ['run', 0.1], ['jump', 0.25], ['sit', 0.1], ['walk', 0.25]],
    run: [['walk', 0.6], ['idle', 0.4]],
    jump: [['idle', 0.3], ['walk', 0.2], ['jump', 0.5]],
    sit: [['idle', 0.4], ['sleep', 0.25], ['groom', 0.15], ['sit', 0.2]],
    sleep: [['idle', 1.0]],
    stretch: [['idle', 1.0]],
    groom: [['idle', 0.6], ['sit', 0.4]],
    scratch: [['idle', 1.0]],
    play: [['idle', 1.0]],
    angry: [['dizzy', 0.5], ['idle', 0.5]],
    beg: [['idle', 0.7], ['sit', 0.3]],
    dizzy: [['idle', 1.0]],
  };

  const DURATION_RANGE = {
    idle: [1500, 4000],
    walk: [2000, 5000],
    run: [1000, 2000],
    sit: [2000, 4000],
    sleep: [4000, 9000],
    stretch: [1200, 2000],
    groom: [1500, 2500],
    scratch: [1200, 2000],
    play: [1500, 2500],
    angry: [800, 1500],
    beg: [1200, 2200],
    dizzy: [1000, 1800],
  };

  // px/sec, X axis only — states not listed here are stationary.
  const SPEED = { idle: 0, walk: 50, run: 80 };

  const JUMP_RANGE_X = 73; // max horizontal distance covered by a single hop
  const JUMP_RANGE_Y = 50; // max vertical distance covered by a single hop
  const JUMP_SPEED = 160; // px/sec, used to size hop duration to hop distance — slow, deliberate hop
  const JUMP_DURATION_MIN = 350;
  const JUMP_DURATION_MAX = 1100;
  const JUMP_ARC_HEIGHT = 14; // px, visual hop bump at the midpoint

  // The pet mostly lives on the ground, roaming left/right. Jumps mostly
  // return to (or stay near) ground level; only occasionally does it climb
  // to some other height, and from up there it's even more likely to head
  // back down on its next jump.
  const GROUND_JITTER = 10; // px variance around ground level when a jump targets it
  const GROUND_SNAP_CHANCE = 0.85; // chance a jump targets the ground when already near it
  const GROUND_RETURN_CHANCE = 0.45; // chance a jump heads back to ground when currently elsewhere — low enough that a climb can chain a few hops before coming back down
  const AWAY_FROM_GROUND_THRESHOLD = 20; // px

  const HOP_RANGE_X = 120; // max horizontal distance of one real-cat hop
  const HOP_RANGE_Y = 90; // max vertical distance of one hop
  const HOP_SPEED = 260; // px/sec, sizes hop duration to hop distance
  const HOP_DURATION_MIN = 400;
  const HOP_DURATION_MAX = 800;
  const GOAL_REACHED = 8; // px, jump goal counts as reached within this
  const GOAL_GROUND_CHANCE = 0.3; // chance a new jump goal is the floor

  const GROUND_MARGIN_VH = 0.03; // lift "ground" 3vh above the literal bottom edge, so the pet doesn't look sunk in

  function groundY(screenHeight, spriteHeight) {
    const margin = screenHeight * GROUND_MARGIN_VH;
    return Math.max(0, screenHeight - spriteHeight - margin);
  }

  // Periodic "roam burst": most of the time jumps are small and ground-
  // biased, but every few minutes the cat gets a window where it roams much
  // more freely (bigger hops, far less ground-snapping) before settling
  // back down — "mostly stay down, but for a while roam around the screen."
  const ROAM_BURST_INTERVAL = [180000, 360000]; // 3–6 min between bursts
  const ROAM_BURST_DURATION = [30000, 60000]; // 30–60s per burst
  const ROAM_JUMP_RANGE_MULT = 7; // big enough that a couple of hops can cross most of the screen
  const ROAM_GROUND_SNAP_CHANCE = 0.15;
  const ROAM_GROUND_RETURN_CHANCE = 0.15;

  // Cursor chase: when the (moving) cursor comes near the cat it drops what
  // it's doing and runs after it, hopping up/down when the cursor is at a
  // different height, then pounces ('play') once it catches up. The forwarded
  // mousemove events only fire while the cursor moves, so a cursor that stops
  // for CHASE_IDLE_MS is forgotten and the cat goes back to normal behavior.
  const CHASE_ENTER_RADIUS = 70; // px from cat centre — cursor must touch the cat's body to start a chase
  const CHASE_MIN_MS = 800; // chase at least this long before a catch can end it
  const CHASE_LEAVE_RADIUS = 450; // hysteresis: give up only beyond this
  const CHASE_IDLE_MS = 2500;
  const CHASE_SPEED = 150; // px/sec, faster than a normal run
  const CHASE_CATCH_X = 30; // px horizontal gap that counts as caught
  const CHASE_HOP_DY = 50; // vertical gap beyond which the cat hops instead of running
  const CHASE_COOLDOWN_MS = 2000; // pause after a catch before chasing again

  function randomBetween([min, max]) {
    return min + Math.random() * (max - min);
  }

  // A wander now commits to one real destination (picked
  // anywhere on screen, not relative to the current spot) and KEEPS heading
  // there across multiple walk bursts — even through brief idle/sit/jump
  // interruptions — until it's actually reached, instead of re-rolling an
  // independent nearby target (and therefore direction) every single time
  // walk is re-entered. Without that persistence, many short, independently-
  // randomized bursts statistically net out to wandering a bounded area,
  // which still reads as "sliding back and forth" even though no single
  // burst reverses mid-stride.
  const WALK_DURATION_MIN = 800;
  const WALK_DURATION_MAX = 6000;

  // With no leg-swap frames in the source art, pure horizontal translation
  // has no visual walking cue at all — it reads as gliding regardless of
  // direction. A small procedural bob (tied to distance traveled, not time,
  // so it tracks actual speed) fakes a scurrying gait cheaply.
  const BOB_AMPLITUDE = 3; // px
  const TILT_DEG = 1.5; // alternating body sway per stride
  const SQUASH_AMOUNT = 0.01; // scaleY compression per half-stride
  const WALK_BRAKE_PX = 40; // distance over which walking slows to a stop
  const WALK_EASE_MS = 600; // time to reach full walking speed
  const STRIDE_PX_PER_FRAME = 9; // px travelled per leg pose
  const BOB_STRIDE = 18; // px of travel per half bob-cycle

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomDuration(state) {
    const [min, max] = DURATION_RANGE[state] || [2000, 3000];
    return min + Math.random() * (max - min);
  }

  function pickNext(state) {
    const table = BEHAVIOR_TABLE[state] || BEHAVIOR_TABLE.idle;
    const roll = Math.random();
    let cumulative = 0;
    for (const [next, weight] of table) {
      cumulative += weight;
      if (roll <= cumulative) return next;
    }
    return table[table.length - 1][0];
  }

  class PetStateMachine {
    constructor({ spriteWidth, spriteHeight, screenWidth, screenHeight }) {
      this.spriteWidth = spriteWidth;
      this.spriteHeight = spriteHeight;
      this.x = Math.random() * Math.max(0, screenWidth - spriteWidth);
      this.y = groundY(screenHeight, spriteHeight); // start on the ground
      this.jumpFromX = this.x;
      this.jumpFromY = this.y;
      this.jumpToX = this.x;
      this.jumpToY = this.y;
      this.direction = Math.random() < 0.5 ? -1 : 1;
      this.walkTargetX = this.x;
      this.jumpGoalX = null; // persistent hop destination; null = pick on next jump
      this.jumpGoalY = null;
      this.tilt = 0; // degrees, gait sway
      this.squash = 1; // scaleY, gait compression
      this.walkSpeedScale = 0; // 0..1 ease-in/out of walking speed
      this.wanderX = null; // persistent destination; null = none active, pick on next walk
      this.wanderDirection = this.direction; // tracks wander trend only — not overwritten by jump's own independent direction
      this.bobOffset = 0;
      this.distanceTraveled = 0;
      this.state = 'idle';
      this.stateElapsed = 0;
      this.stateDuration = randomDuration('idle');
      this.frameIndex = 0;
      this.frameElapsed = 0;
      this.paused = false;

      this.cursorX = 0;
      this.cursorY = 0;
      this.cursorIdle = Infinity; // ms since the cursor last moved
      this.chasing = false;
      this.chaseCooldown = 0;
      this.chaseTime = 0;

      this.inRoamBurst = false;
      this.timeToNextBurst = randomBetween(ROAM_BURST_INTERVAL);
      this.burstTimeLeft = 0;
    }

    setCursor(x, y) {
      this.cursorX = x;
      this.cursorY = y;
      this.cursorIdle = 0;
    }

    setPaused(paused) {
      this.paused = paused;
    }

    // The renderer constructs this with window.innerHeight as a placeholder
    // before the real usableHeight (workArea, i.e. above the Dock/taskbar)
    // arrives over IPC. Without re-snapping here, a cat already resting at
    // the placeholder's lower ground would stay too low — visually sunk
    // into the Dock — until its next unrelated jump happened to correct it.
    // Skip the snap mid-jump so we don't interrupt that animation; its own
    // target is already clamped against the current bound.
    syncGround(screenHeight) {
      if (this.state === 'jump') return;
      this.y = groundY(screenHeight, this.spriteHeight);
    }

    update(dt, screenWidth, screenHeight, frameDuration, frameCountForState) {
      if (this.paused) return;

      this.stateElapsed += dt;
      this.bobOffset = 0; // only the walk/run branch below overrides this
      this.tilt = 0;
      this.squash = 1;

      if (this.inRoamBurst) {
        this.burstTimeLeft -= dt;
        if (this.burstTimeLeft <= 0) {
          this.inRoamBurst = false;
          this.timeToNextBurst = randomBetween(ROAM_BURST_INTERVAL);
        }
      } else {
        this.timeToNextBurst -= dt;
        if (this.timeToNextBurst <= 0) {
          this.inRoamBurst = true;
          this.burstTimeLeft = randomBetween(ROAM_BURST_DURATION);
        }
      }

      this.updateChase(dt, screenWidth, screenHeight);

      if (this.state === 'jump') {
        const rawT = Math.min(1, this.stateElapsed / this.stateDuration);
        // Real cat jumps have a brief crouch/anticipation beat before the
        // actual leap, then a quick parabolic flight — not a smooth float
        // the whole duration.
        const anticipation = 0.22;
        const flightT = rawT < anticipation ? 0 : (rawT - anticipation) / (1 - anticipation);
        const arc = Math.sin(flightT * Math.PI) * (this.jumpArc || JUMP_ARC_HEIGHT);
        this.x = this.jumpFromX + (this.jumpToX - this.jumpFromX) * flightT;
        this.y = this.jumpFromY + (this.jumpToY - this.jumpFromY) * flightT - arc;
        // Crouched pose held through anticipation, airborne pose for the leap.
        this.frameIndex = rawT < anticipation ? 0 : (flightT < 0.55 ? 0 : 1);
      } else {
        if (this.state !== 'walk' && this.state !== 'run') this.walkSpeedScale = 0;
        this.frameElapsed += dt;
        if (this.state !== 'walk' && this.state !== 'run' && this.frameElapsed >= frameDuration) {
          this.frameElapsed = 0;
          this.frameIndex = (this.frameIndex + 1) % frameCountForState(this.state);
        }

        const speed = this.chasing && this.state === 'run' ? CHASE_SPEED : SPEED[this.state] || 0;
        if ((this.state === 'walk' || this.state === 'run') && speed > 0) {
          const maxX = Math.max(0, screenWidth - this.spriteWidth);
          this.walkTargetX = clamp(this.walkTargetX, 0, maxX);
          this.direction = this.walkTargetX >= this.x ? 1 : -1;
          const remaining = this.walkTargetX - this.x;

          // Ease in from standstill and ease out as the destination nears, so
          // the cat never lurches to full speed or halts dead.
          const easeIn = Math.min(1, this.walkSpeedScale + dt / WALK_EASE_MS);
          const easeOut = Math.max(0.2, Math.min(1, Math.abs(remaining) / WALK_BRAKE_PX));
          this.walkSpeedScale = Math.min(easeIn, easeOut);
          const step = this.direction * speed * this.walkSpeedScale * (dt / 1000);
          if (Math.abs(step) >= Math.abs(remaining)) {
            // Arrived — stop exactly there and let the normal duration-based
            // transition (already sized to land around now) hand off to
            // whatever's next, same variety as before (idle/run/sit/jump),
            // just no more overshoot/bounce.
            this.x = this.walkTargetX;
            this.distanceTraveled += Math.abs(remaining);
            if (this.wanderX !== null && Math.abs(this.x - this.wanderX) < 1) {
              this.wanderX = null; // fully reached the persistent destination — pick a fresh one next time
            }
          } else {
            this.x += step;
            this.distanceTraveled += Math.abs(step);
          }
          // Leg pose follows distance walked (not time), so feet never slide.
          this.frameIndex = Math.floor(this.distanceTraveled / STRIDE_PX_PER_FRAME) % frameCountForState(this.state);
          const phase = this.distanceTraveled / BOB_STRIDE;
          this.bobOffset = Math.abs(Math.sin(phase)) * BOB_AMPLITUDE;
          this.tilt = Math.sin(phase) * TILT_DEG;
          this.squash = 1 + Math.cos(phase * 2) * SQUASH_AMOUNT;
        }
      }

      if (this.stateElapsed >= this.stateDuration) {
        this.transitionTo(pickNext(this.state), screenWidth, screenHeight);
      }
    }

    updateChase(dt, screenWidth, screenHeight) {
      this.cursorIdle += dt;
      this.chaseCooldown = Math.max(0, this.chaseCooldown - dt);

      const dx = this.cursorX - (this.x + this.spriteWidth / 2);
      const dy = this.cursorY - (this.y + this.spriteHeight / 2);
      const dist = Math.hypot(dx, dy);
      const radius = this.chasing ? CHASE_LEAVE_RADIUS : CHASE_ENTER_RADIUS;
      const wanted = this.cursorIdle < CHASE_IDLE_MS && dist < radius && this.chaseCooldown === 0;

      if (!wanted) {
        if (this.chasing) {
          this.chasing = false;
          this.chaseTime = 0;
          this.jumpGoalX = null; // drop the chase hop goal so normal jumps pick their own
          this.jumpGoalY = null;
          if (this.state === 'run') this.transitionTo('idle', screenWidth, screenHeight);
        }
        return;
      }
      this.chasing = true;
      this.chaseTime += dt;
      if (this.state === 'jump') return; // finish the hop in flight

      const maxX = Math.max(0, screenWidth - this.spriteWidth);
      const targetX = clamp(this.cursorX - this.spriteWidth / 2, 0, maxX);
      const gapX = Math.abs(targetX - this.x);

      if (this.chaseTime > CHASE_MIN_MS && gapX < CHASE_CATCH_X && Math.abs(dy) < this.spriteHeight) {
        this.chaseCooldown = CHASE_COOLDOWN_MS;
        this.chasing = false;
        this.chaseTime = 0;
        this.transitionTo('play', screenWidth, screenHeight);
        return;
      }

      if (Math.abs(dy) > CHASE_HOP_DY) {
        const maxY = Math.max(0, screenHeight - this.spriteHeight);
        this.jumpGoalX = targetX;
        this.jumpGoalY = clamp(this.cursorY - this.spriteHeight / 2, 0, maxY);
        this.transitionTo('jump', screenWidth, screenHeight);
        return;
      }

      if (this.state !== 'run') this.transitionTo('run', screenWidth, screenHeight);
      this.walkTargetX = targetX;
      this.stateElapsed = 0; // keep running as long as the chase lasts
      this.stateDuration = 1000;
    }

    transitionTo(newState, screenWidth, screenHeight) {
      this.state = newState;
      this.stateElapsed = 0;
      this.frameIndex = 0;
      this.frameElapsed = 0;

      if (newState === 'jump') {
        const maxX = Math.max(0, (screenWidth || this.x + this.spriteWidth) - this.spriteWidth);
        const maxY = Math.max(0, (screenHeight || this.y + this.spriteHeight) - this.spriteHeight);
        const ground = groundY(screenHeight || this.y + this.spriteHeight, this.spriteHeight);

        // A trip is a persistent goal anywhere on screen; each hop covers
        // at most HOP_RANGE of it, so a far destination takes several hops.
        if (this.jumpGoalX === null || Math.hypot(this.jumpGoalX - this.x, this.jumpGoalY - this.y) < GOAL_REACHED) {
          this.jumpGoalX = Math.random() * maxX;
          this.jumpGoalY = Math.random() < GOAL_GROUND_CHANCE ? ground : Math.random() * maxY;
        }
        const stepX = clamp(this.jumpGoalX - this.x, -HOP_RANGE_X, HOP_RANGE_X);
        const stepY = clamp(this.jumpGoalY - this.y, -HOP_RANGE_Y, HOP_RANGE_Y);

        this.jumpFromX = this.x;
        this.jumpFromY = this.y;
        this.jumpToX = clamp(this.x + stepX, 0, maxX);
        this.jumpToY = clamp(this.y + stepY, 0, maxY);
        const distance = Math.hypot(this.jumpToX - this.jumpFromX, this.jumpToY - this.jumpFromY);
        this.stateDuration = clamp((distance / HOP_SPEED) * 1000, HOP_DURATION_MIN, HOP_DURATION_MAX);
        this.jumpArc = clamp(distance * 0.3, JUMP_ARC_HEIGHT, 40);
        if (Math.abs(this.jumpToX - this.jumpFromX) > 1) {
          this.direction = this.jumpToX >= this.jumpFromX ? 1 : -1;
        }
      } else if (newState === 'walk' || newState === 'run') {
        const maxX = Math.max(0, (screenWidth || this.x + this.spriteWidth) - this.spriteWidth);

        // 'run' only ever follows 'walk' (see BEHAVIOR_TABLE) — keep
        // chasing the same destination instead of rolling a new random one,
        // so a speed burst reads as "speeding up", not "changing its mind"
        // mid-stride. BUT: if the inherited target is already reached
        // (the preceding walk finished its journey in the same tick its
        // duration expired, which happens often since duration is sized to
        // match distance/speed), there's nothing left to run toward — pick
        // a fresh one the same way a new walk would, otherwise 'run' just
        // plays its animation standing still for its whole duration.
        const alreadyThere = Math.abs(this.walkTargetX - this.x) < 2;
        if (newState === 'walk' || (newState === 'run' && alreadyThere)) {
          // Keep heading to the SAME persistent destination across
          // repeated walk/run bursts (through brief idle/sit/jump breaks)
          // until actually reached — only pick a new one once there's no
          // active destination. This is what makes the cat commit to a
          // real trek instead of a bunch of independently-randomized
          // short hops that statistically cancel out.
          if (this.wanderX === null) {
            // Mostly keep exploring the direction it was already drifting
            // (sustained travel across the screen, like something actually
            // exploring) rather than a pure uniform-random pick, which —
            // even with each individual leg being monotonic — has no
            // overall drift and can still look like backtracking over a
            // short window since ~50% of fresh picks would reverse it.
            // Uses wanderDirection, not the general `direction` field,
            // since jumps independently randomize `direction` too and
            // would otherwise dilute this bias whenever a jump happens to
            // land between one wander leg and the next.
            const continueSameDirection = Math.random() < 0.75;
            if (continueSameDirection && this.wanderDirection > 0) {
              this.wanderX = this.x + Math.random() * (maxX - this.x);
            } else if (continueSameDirection) {
              this.wanderX = Math.random() * this.x;
            } else {
              this.wanderX = Math.random() * maxX;
            }
            this.wanderDirection = this.wanderX >= this.x ? 1 : -1;
          }
          this.walkTargetX = this.wanderX;
        }

        const speed = SPEED[newState] || SPEED.walk;
        const distance = Math.abs(this.walkTargetX - this.x);
        this.stateDuration = clamp((distance / speed) * 1000, WALK_DURATION_MIN, WALK_DURATION_MAX);
        this.direction = this.walkTargetX >= this.x ? 1 : -1;
      } else {
        this.stateDuration = randomDuration(newState);
      }
    }

    forceState(state) {
      this.transitionTo(state);
    }
  }

  window.PetStateMachine = PetStateMachine;
})();
