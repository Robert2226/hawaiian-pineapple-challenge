/* =========================================================================
   Hawaiian Pineapple Challenge — Phase 1: playable core
   Vanilla JS + HTML5 canvas. Placeholder shapes for art (themed in Phase 2).
   ========================================================================= */

(() => {
  "use strict";

  // ---- Canvas setup ------------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // internal game resolution (logic units)
  const H = canvas.height;
  const GROUND_Y = H - 40;  // pineapples "land" here

  // ---- Game constants ----------------------------------------------------
  const GRAVITY = 260;          // px/s^2, pineapple downward accel
  const SPAWN_INTERVAL = 1.4;   // seconds between spawns (Phase 3 will ramp)
  const PINEAPPLE_R = 22;
  const COCONUT_R = 8;
  const COCONUT_SPEED = 620;    // px/s
  const FIRE_COOLDOWN = 0.16;   // seconds between shots (hold to auto-fire)
  const START_LIVES = 3;
  const AIM_EASE = 18;          // higher = snappier barrel tracking
  const AIM_MIN_UP = 0.18;      // radians below horizon the barrel refuses to dip

  // Palm tree x-positions (spawn points) across the top.
  const PALMS = [W * 0.15, W * 0.38, W * 0.62, W * 0.85];

  // ---- Game state --------------------------------------------------------
  const STATE = { START: "start", PLAYING: "playing", GAMEOVER: "gameover" };
  let state = STATE.START;

  let pineapples = [];
  let coconuts = [];
  let particles = [];
  let score = 0;
  let lives = START_LIVES;
  let spawnTimer = 0;
  let fireTimer = 0;

  // Cannon lives at bottom-center; barrel eases toward targetAim.
  const cannon = { x: W / 2, y: GROUND_Y, aim: -Math.PI / 2, targetAim: -Math.PI / 2, barrel: 46 };

  // Pointer position in game space, and whether the trigger is held.
  const pointer = { x: W / 2, y: H / 2, active: false };
  let firing = false;

  // ---- Helpers -----------------------------------------------------------
  const rand = (min, max) => min + Math.random() * (max - min);

  function reset() {
    pineapples = [];
    coconuts = [];
    particles = [];
    score = 0;
    lives = START_LIVES;
    spawnTimer = 0;
    fireTimer = 0;
    firing = false;
    cannon.aim = -Math.PI / 2;
    cannon.targetAim = -Math.PI / 2;
  }

  // Keep the barrel in the upper arc so it never fires into the ground.
  // Screen y grows downward, so "up" is the range (-PI, 0).
  function clampAim(a) {
    const hiR = -AIM_MIN_UP;            // right-most allowed (just above horizon)
    const hiL = -Math.PI + AIM_MIN_UP;  // left-most allowed (just above horizon)
    if (a >= 0) {
      // Pointer is at/below the horizon: snap to the nearer upper limit.
      return a <= Math.PI / 2 ? hiR : hiL;
    }
    if (a > hiR) return hiR;
    if (a < hiL) return hiL;
    return a;
  }

  // Convert a client (screen) coordinate to internal game coordinates.
  function toGameCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    return { x, y };
  }

  // ---- Spawning ----------------------------------------------------------
  function spawnPineapple() {
    const x = PALMS[Math.floor(Math.random() * PALMS.length)] + rand(-18, 18);
    pineapples.push({
      x,
      y: 70,
      vx: rand(-30, 30),
      vy: rand(20, 60),
      r: PINEAPPLE_R,
      spin: rand(-2, 2),
      angle: 0,
    });
  }

  function fire() {
    if (fireTimer > 0) return;
    fireTimer = FIRE_COOLDOWN;
    const bx = cannon.x + Math.cos(cannon.aim) * cannon.barrel;
    const by = cannon.y + Math.sin(cannon.aim) * cannon.barrel;
    coconuts.push({
      x: bx,
      y: by,
      vx: Math.cos(cannon.aim) * COCONUT_SPEED,
      vy: Math.sin(cannon.aim) * COCONUT_SPEED,
      r: COCONUT_R,
    });
  }

  function burst(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, 220);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.3, 0.7),
        maxLife: 0.7,
        color,
      });
    }
  }

  // ---- Input -------------------------------------------------------------
  function aimAt(clientX, clientY) {
    const p = toGameCoords(clientX, clientY);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.active = true;
    cannon.targetAim = clampAim(
      Math.atan2(pointer.y - cannon.y, pointer.x - cannon.x)
    );
  }

  function handlePress(clientX, clientY) {
    if (state === STATE.START) {
      state = STATE.PLAYING;
      reset();
      return;
    }
    if (state === STATE.GAMEOVER) {
      state = STATE.START;
      return;
    }
    // PLAYING: aim, snap the barrel there instantly, and start firing.
    aimAt(clientX, clientY);
    cannon.aim = cannon.targetAim;
    firing = true;
    fire();
  }

  canvas.addEventListener("pointermove", (e) => {
    e.preventDefault();
    if (state === STATE.PLAYING) aimAt(e.clientX, e.clientY);
  });

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handlePress(e.clientX, e.clientY);
  });

  const stopFiring = () => { firing = false; };
  canvas.addEventListener("pointerup", stopFiring);
  canvas.addEventListener("pointercancel", stopFiring);
  canvas.addEventListener("pointerleave", stopFiring);
  window.addEventListener("blur", stopFiring);

  // Keyboard: space to shoot (hold to auto-fire), Enter to start/restart.
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") firing = false;
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (state === STATE.PLAYING) { firing = true; fire(); }
      else handlePress(cannon.x, 0);
    }
  });

  // ---- Update ------------------------------------------------------------
  function update(dt) {
    if (state !== STATE.PLAYING) return;

    fireTimer = Math.max(0, fireTimer - dt);

    // Ease the barrel toward the target aim (framerate-independent).
    const t = 1 - Math.exp(-AIM_EASE * dt);
    cannon.aim += (cannon.targetAim - cannon.aim) * t;

    // Auto-fire while the trigger is held.
    if (firing) fire();

    // Spawn
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = SPAWN_INTERVAL;
      spawnPineapple();
    }

    // Pineapples fall
    for (const p of pineapples) {
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      // bounce off side walls a little
      if (p.x < p.r) { p.x = p.r; p.vx *= -0.6; }
      if (p.x > W - p.r) { p.x = W - p.r; p.vx *= -0.6; }
    }

    // Coconuts fly
    for (const c of coconuts) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    coconuts = coconuts.filter(
      (c) => c.y > -20 && c.y < H + 20 && c.x > -20 && c.x < W + 20
    );

    // Collisions: coconut vs pineapple
    for (const p of pineapples) {
      if (p.dead) continue;
      for (const c of coconuts) {
        if (c.dead) continue;
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const rr = p.r + c.r;
        if (dx * dx + dy * dy <= rr * rr) {
          p.dead = true;
          c.dead = true;
          score += 10;
          burst(p.x, p.y, "#ffd93b");
          break;
        }
      }
    }

    // Pineapple hits ground -> lose life
    for (const p of pineapples) {
      if (!p.dead && p.y + p.r >= GROUND_Y) {
        p.dead = true;
        lives -= 1;
        burst(p.x, GROUND_Y, "#c0392b");
        if (lives <= 0) {
          lives = 0;
          state = STATE.GAMEOVER;
        }
      }
    }

    pineapples = pineapples.filter((p) => !p.dead);
    coconuts = coconuts.filter((c) => !c.dead);

    // Particles
    for (const pt of particles) {
      pt.vy += 400 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    particles = particles.filter((pt) => pt.life > 0);
  }

  // ---- Render ------------------------------------------------------------
  function drawBackdrop() {
    // ground / sand strip
    ctx.fillStyle = "#f4e0a1";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, GROUND_Y, W, 4);

    // simple palm markers at spawn points (placeholder art)
    for (const px of PALMS) {
      ctx.fillStyle = "#6b4423";
      ctx.fillRect(px - 4, 30, 8, 34);
      ctx.fillStyle = "#2e8b57";
      ctx.beginPath();
      ctx.ellipse(px, 30, 34, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPineapple(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // body
    ctx.fillStyle = "#e9a319";
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 0.8, p.r, 0, 0, Math.PI * 2);
    ctx.fill();
    // crosshatch
    ctx.strokeStyle = "rgba(120,70,10,0.5)";
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-p.r * 0.8, i * 7);
      ctx.lineTo(p.r * 0.8, i * 7 + 6);
      ctx.stroke();
    }
    // leaves
    ctx.fillStyle = "#2e8b57";
    ctx.beginPath();
    ctx.moveTo(0, -p.r);
    ctx.lineTo(-8, -p.r - 14);
    ctx.lineTo(0, -p.r - 6);
    ctx.lineTo(8, -p.r - 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCannon() {
    // barrel
    ctx.save();
    ctx.translate(cannon.x, cannon.y);
    ctx.rotate(cannon.aim);
    ctx.fillStyle = "#5a3b1a";
    ctx.fillRect(0, -7, cannon.barrel, 14);
    ctx.restore();
    // base (tiki)
    ctx.fillStyle = "#7a4a1e";
    ctx.beginPath();
    ctx.arc(cannon.x, cannon.y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8c07d";
    ctx.beginPath();
    ctx.arc(cannon.x, cannon.y, 22, 0, Math.PI, true);
    ctx.fill();
  }

  function drawCoconut(c) {
    ctx.fillStyle = "#5a3b1a";
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAimGuide() {
    const bx = cannon.x + Math.cos(cannon.aim) * cannon.barrel;
    const by = cannon.y + Math.sin(cannon.aim) * cannon.barrel;

    // Dotted trajectory line from the barrel tip along the aim direction.
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(cannon.aim) * 900, by + Math.sin(cannon.aim) * 900);
    ctx.stroke();
    ctx.restore();

    // Crosshair reticle at the pointer.
    if (pointer.active) {
      const { x, y } = pointer;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.moveTo(x - 18, y); ctx.lineTo(x - 6, y);
      ctx.moveTo(x + 6, y); ctx.lineTo(x + 18, y);
      ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 6);
      ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 18);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    ctx.fillStyle = "#3a2410";
    ctx.font = "bold 24px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Score: " + score, 16, 34);

    ctx.textAlign = "right";
    ctx.fillText("🍍".repeat(lives), W - 16, 34);
  }

  function drawCenterText(title, subtitle) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 46px 'Trebuchet MS', sans-serif";
    ctx.fillText(title, W / 2, H / 2 - 20);
    ctx.font = "22px 'Trebuchet MS', sans-serif";
    ctx.fillText(subtitle, W / 2, H / 2 + 24);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackdrop();

    for (const p of pineapples) drawPineapple(p);
    for (const c of coconuts) drawCoconut(c);
    drawParticles();
    if (state === STATE.PLAYING) drawAimGuide();
    drawCannon();
    drawHUD();

    if (state === STATE.START) {
      drawCenterText("🍍 Hawaiian Pineapple Challenge 🌴", "Click / tap to start");
    } else if (state === STATE.GAMEOVER) {
      drawCenterText("Game Over — Score " + score, "Click / tap to play again");
    }
  }

  // ---- Debug hook (harmless; handy for testing) --------------------------
  window.HPC = {
    get state() { return state; },
    get score() { return score; },
    get lives() { return lives; },
    get pineapples() { return pineapples.length; },
    get coconuts() { return coconuts.length; },
    forceStart() { state = STATE.PLAYING; reset(); },
  };

  // ---- Main loop ---------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp big gaps (tab switches)
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
