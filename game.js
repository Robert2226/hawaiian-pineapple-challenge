/* =========================================================================
   Hawaiian Pineapple Challenge
   Phase 1: playable core · Phase 2A: aiming feel · Phase 2B: island art
   Vanilla JS + HTML5 canvas. All art is drawn procedurally (no image files).
   ========================================================================= */

(() => {
  "use strict";

  // ---- Canvas setup ------------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // internal game resolution (logic units)
  const H = canvas.height;
  const GROUND_Y = H - 40;  // pineapples "land" here (on the sand)
  const HORIZON = 320;      // sky / ocean boundary
  const BEACH_TOP = 505;    // ocean / sand boundary (shoreline)

  // ---- Game constants ----------------------------------------------------
  const GRAVITY = 260;          // px/s^2, pineapple downward accel
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
  let best = parseInt(localStorage.getItem("hpc_best"), 10) || 0;
  let playerName = (localStorage.getItem("hpc_name") || "").trim();
  let combo = 0;
  const comboMult = () => 1 + Math.floor(combo / 3); // x2 at 3 hits, x3 at 6, ...

  // Waves: each wave spawns a fixed batch, then a short breather + banner.
  let wave = 1;
  let toSpawn = 0;         // drops remaining to spawn this wave
  let betweenWaves = false;
  let breatherTimer = 0;
  const waveSize = (w) => 4 + w * 2;
  const waveInterval = (w) => Math.max(0.5, 1.4 - w * 0.12);
  const waveFallMul = (w) => 1 + (w - 1) * 0.12;

  let spawnTimer = 0;
  let fireTimer = 0;

  function saveBestIfNeeded() {
    if (score > best) {
      best = score;
      localStorage.setItem("hpc_best", String(best));
    }
  }

  // Cannon lives at bottom-center; barrel eases toward targetAim.
  const cannon = { x: W / 2, y: GROUND_Y, aim: -Math.PI / 2, targetAim: -Math.PI / 2, barrel: 46 };

  // Pointer position in game space, and whether the trigger is held.
  const pointer = { x: W / 2, y: H / 2, active: false };
  let firing = false;

  // Animation clock (advances every frame) and screen-shake magnitude.
  let time = 0;
  let shake = 0;

  // ---- Helpers -----------------------------------------------------------
  const rand = (min, max) => min + Math.random() * (max - min);
  const TAU = Math.PI * 2;

  function addShake(amount) {
    shake = Math.min(shake + amount, 16);
  }

  // Rounded-rect path helper (uses native roundRect when available).
  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  // ---- Audio (Web Audio API — procedural, no files) ----------------------
  let audioCtx = null;
  let muted = localStorage.getItem("hpc_muted") === "1";

  // Must be (re)started from a user gesture per browser autoplay rules.
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  function noiseBurst(dur, gain) {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    const n = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const filt = audioCtx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 1400;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(audioCtx.destination);
    src.start(t0);
    src.stop(t0 + dur);
  }

  const sfx = {
    shoot() { tone(430, 0.12, "square", 0.10, 190); },
    hit() { noiseBurst(0.18, 0.28); tone(680, 0.12, "triangle", 0.10, 990); },
    miss() { tone(300, 0.4, "sawtooth", 0.18, 90); },
    start() { tone(523, 0.1, "sine", 0.14); setTimeout(() => tone(784, 0.16, "sine", 0.14), 110); },
    over() { tone(392, 0.25, "sine", 0.16, 180); setTimeout(() => tone(262, 0.4, "sine", 0.16, 120), 180); },
    wave() {
      tone(523, 0.12, "sine", 0.14);
      setTimeout(() => tone(784, 0.14, "sine", 0.14), 120);
      setTimeout(() => tone(1047, 0.2, "sine", 0.14), 250);
    },
  };

  // On-canvas mute button (game-space rect), top-right corner.
  const muteRect = { x: W - 54, y: 12, w: 42, h: 38 };
  function toggleMute() {
    muted = !muted;
    localStorage.setItem("hpc_muted", muted ? "1" : "0");
  }

  function reset() {
    pineapples = [];
    coconuts = [];
    particles = [];
    score = 0;
    lives = START_LIVES;
    combo = 0;
    wave = 1;
    toSpawn = waveSize(1);
    betweenWaves = false;
    breatherTimer = 0;
    spawnTimer = 0.6; // brief lead-in before the first drop
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
    const fm = waveFallMul(wave);
    pineapples.push({
      x,
      y: 70,
      vx: rand(-30, 30),
      vy: rand(20, 60) * fm,
      r: PINEAPPLE_R,
      spin: rand(-2, 2),
      angle: 0,
    });
  }

  function fire() {
    if (fireTimer > 0) return;
    fireTimer = FIRE_COOLDOWN;
    sfx.shoot();
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
      sfx.start();
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
    ensureAudio();
    // Mute button takes priority and must not start/fire the game.
    const gp = toGameCoords(e.clientX, e.clientY);
    if (
      gp.x >= muteRect.x && gp.x <= muteRect.x + muteRect.w &&
      gp.y >= muteRect.y && gp.y <= muteRect.y + muteRect.h
    ) {
      toggleMute();
      return;
    }
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
    if (e.code === "KeyM") {
      ensureAudio();
      toggleMute();
      return;
    }
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      ensureAudio();
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

    // Waves: spawn the batch, then breather + banner, then next wave.
    if (betweenWaves) {
      breatherTimer -= dt;
      if (breatherTimer <= 0) {
        wave++;
        toSpawn = waveSize(wave);
        betweenWaves = false;
        spawnTimer = 0.5;
        sfx.wave();
      }
    } else if (toSpawn > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = waveInterval(wave);
        spawnPineapple();
        toSpawn--;
      }
    } else if (pineapples.length === 0) {
      // wave cleared
      betweenWaves = true;
      breatherTimer = 2.0;
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
          combo++;
          score += 10 * comboMult();
          burst(p.x, p.y, "#ffd93b");
          addShake(3);
          sfx.hit();
          break;
        }
      }
    }

    // Pineapple hits ground -> lose life
    for (const p of pineapples) {
      if (!p.dead && p.y + p.r >= GROUND_Y) {
        p.dead = true;
        lives -= 1;
        combo = 0; // a miss breaks the streak
        burst(p.x, GROUND_Y, "#c0392b");
        addShake(11);
        sfx.miss();
        if (lives <= 0) {
          lives = 0;
          state = STATE.GAMEOVER;
          saveBestIfNeeded();
          sfx.over();
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

  // ---- Render: scenery ---------------------------------------------------
  const sunX = W * 0.5;
  const sunY = HORIZON - 26;

  function drawScene() {
    // --- Sky (sunset gradient) ---
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0.0, "#3b5a8c");
    sky.addColorStop(0.45, "#ff8c69");
    sky.addColorStop(0.78, "#ffb27f");
    sky.addColorStop(1.0, "#ffd9a0");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, HORIZON);

    // --- Sun glow + disc near the horizon ---
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 190);
    glow.addColorStop(0, "rgba(255,244,200,0.95)");
    glow.addColorStop(0.4, "rgba(255,200,120,0.5)");
    glow.addColorStop(1, "rgba(255,180,100,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, HORIZON + 60);
    ctx.fillStyle = "#fff2c2";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 44, 0, TAU);
    ctx.fill();

    // --- Drifting clouds ---
    drawCloud((time * 12) % (W + 200) - 100, 70, 1.0);
    drawCloud((time * 8 + 300) % (W + 200) - 100, 120, 0.7);
    drawCloud((time * 6 + 600) % (W + 200) - 100, 50, 0.55);

    // --- Volcano / island silhouette on the horizon ---
    ctx.fillStyle = "#5f6b7a";
    ctx.beginPath();
    ctx.moveTo(W * 0.6, HORIZON);
    ctx.lineTo(W * 0.72, HORIZON - 78);
    ctx.lineTo(W * 0.76, HORIZON - 60);
    ctx.lineTo(W * 0.82, HORIZON - 92);
    ctx.lineTo(W * 0.98, HORIZON);
    ctx.closePath();
    ctx.fill();

    // --- Ocean ---
    const sea = ctx.createLinearGradient(0, HORIZON, 0, BEACH_TOP);
    sea.addColorStop(0, "#2f96b8");
    sea.addColorStop(1, "#186a8f");
    ctx.fillStyle = sea;
    ctx.fillRect(0, HORIZON, W, BEACH_TOP - HORIZON);

    // sun reflection shimmering on the water
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffe9b0";
    ctx.beginPath();
    ctx.moveTo(sunX - 18, HORIZON);
    ctx.lineTo(sunX + 18, HORIZON);
    ctx.lineTo(sunX + 46, BEACH_TOP);
    ctx.lineTo(sunX - 46, BEACH_TOP);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // rolling wave lines
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const yy = HORIZON + 14 + i * ((BEACH_TOP - HORIZON - 14) / 6);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) {
        const yo = Math.sin(x * 0.03 + time * 1.5 + i) * 2;
        x === 0 ? ctx.moveTo(x, yy + yo) : ctx.lineTo(x, yy + yo);
      }
      ctx.stroke();
    }

    // --- Beach (sand) ---
    const sand = ctx.createLinearGradient(0, BEACH_TOP, 0, H);
    sand.addColorStop(0, "#f4dc95");
    sand.addColorStop(1, "#e4c268");
    ctx.fillStyle = sand;
    ctx.fillRect(0, BEACH_TOP, W, H - BEACH_TOP);

    // foamy shoreline
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) {
      const yo = Math.sin(x * 0.05 + time * 2) * 3;
      x === 0 ? ctx.moveTo(x, BEACH_TOP + yo) : ctx.lineTo(x, BEACH_TOP + yo);
    }
    ctx.stroke();
  }

  function drawCloud(x, y, s) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#ffe6cf";
    ctx.beginPath();
    ctx.ellipse(x, y, 34 * s, 16 * s, 0, 0, TAU);
    ctx.ellipse(x + 26 * s, y + 4 * s, 26 * s, 13 * s, 0, 0, TAU);
    ctx.ellipse(x - 26 * s, y + 5 * s, 22 * s, 11 * s, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // A single palm leaf pointing along +x in local space.
  function drawFrond(cx, cy, ang, len) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, "#256b2b");
    g.addColorStop(1, "#5cbf5c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -11, len, 4);
    ctx.quadraticCurveTo(len * 0.5, 13, 0, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(15,70,15,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.quadraticCurveTo(len * 0.5, 1, len, 4);
    ctx.stroke();
    ctx.restore();
  }

  // Palm rooted off the top edge; pineapples drop from beneath the canopy.
  function drawPalm(px, i) {
    const topY = 16;
    const baseY = 96;

    // trunk
    const tg = ctx.createLinearGradient(px - 9, 0, px + 9, 0);
    tg.addColorStop(0, "#6b4423");
    tg.addColorStop(0.5, "#a06f38");
    tg.addColorStop(1, "#6b4423");
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(px - 9, topY);
    ctx.quadraticCurveTo(px - 4, (topY + baseY) / 2, px - 6, baseY);
    ctx.lineTo(px + 6, baseY);
    ctx.quadraticCurveTo(px + 4, (topY + baseY) / 2, px + 9, topY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(80,50,18,0.5)";
    ctx.lineWidth = 1.5;
    for (let r = topY + 12; r < baseY; r += 12) {
      ctx.beginPath();
      ctx.moveTo(px - 7, r);
      ctx.lineTo(px + 7, r + 2);
      ctx.stroke();
    }

    // canopy fronds (sway with the clock)
    const cx = px;
    const cy = topY + 2;
    const sway = Math.sin(time * 1.3 + i) * 0.09;
    const fronds = 7;
    for (let f = 0; f < fronds; f++) {
      const t = f / (fronds - 1);
      const ang = Math.PI * (0.1 + 0.8 * t) + sway * Math.cos(Math.PI * t);
      drawFrond(cx, cy, ang, 72);
    }

    // coconuts nestled under the canopy
    ctx.fillStyle = "#4d3016";
    for (const [dx, dy] of [[-6, 10], [6, 11], [0, 14]]) {
      ctx.beginPath();
      ctx.arc(px + dx, cy + dy, 5, 0, TAU);
      ctx.fill();
    }
  }

  // Tiki torch planted in the sand with a flickering flame.
  function drawTorch(x) {
    const baseY = GROUND_Y + 18;
    ctx.strokeStyle = "#6b4423";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - 70);
    ctx.stroke();
    // cup
    ctx.fillStyle = "#4d3016";
    roundRectPath(x - 8, baseY - 82, 16, 14, 3);
    ctx.fill();
    // flame
    const flick = Math.sin(time * 14 + x) * 2 + Math.random() * 2;
    const fh = 22 + flick;
    const fg = ctx.createLinearGradient(x, baseY - 82, x, baseY - 82 - fh);
    fg.addColorStop(0, "#ffd23b");
    fg.addColorStop(0.6, "#ff8c1a");
    fg.addColorStop(1, "rgba(255,80,0,0.2)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(x - 7, baseY - 82);
    ctx.quadraticCurveTo(x - 5, baseY - 82 - fh * 0.6, x, baseY - 82 - fh);
    ctx.quadraticCurveTo(x + 5, baseY - 82 - fh * 0.6, x + 7, baseY - 82);
    ctx.closePath();
    ctx.fill();
  }

  function drawPineapple(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle * 0.3);
    const r = p.r;

    // soft depth shadow
    ctx.fillStyle = "rgba(80,45,10,0.25)";
    ctx.beginPath();
    ctx.ellipse(3, 4, r * 0.82, r, 0, 0, TAU);
    ctx.fill();

    // glossy body
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r * 1.25);
    g.addColorStop(0, "#ffd45c");
    g.addColorStop(0.6, "#e8a020");
    g.addColorStop(1, "#b9760f");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.82, r, 0, 0, TAU);
    ctx.fill();

    // diamond lattice (clipped to the body)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.82, r, 0, 0, TAU);
    ctx.clip();
    ctx.strokeStyle = "rgba(120,70,10,0.4)";
    ctx.lineWidth = 1.2;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-r, i * 8);
      ctx.lineTo(r, i * 8 + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r, i * 8 + 6);
      ctx.lineTo(r, i * 8);
      ctx.stroke();
    }
    ctx.restore();

    // highlight
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.38, r * 0.16, r * 0.26, 0, 0, TAU);
    ctx.fill();

    // leafy crown
    ctx.fillStyle = "#2e8b57";
    for (const [lx, ly] of [[-11, -12], [-5, -18], [0, -23], [5, -18], [11, -12]]) {
      ctx.beginPath();
      ctx.moveTo(0, -r + 2);
      ctx.quadraticCurveTo(lx * 0.5, -r + ly * 0.5, lx, -r + ly);
      ctx.quadraticCurveTo(lx * 0.3, -r + ly * 0.6 + 4, 0, -r + 2);
      ctx.fill();
    }
    ctx.fillStyle = "#3ba05f";
    ctx.beginPath();
    ctx.moveTo(-3, -r + 2);
    ctx.lineTo(0, -r - 16);
    ctx.lineTo(3, -r + 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCannon() {
    const bx = cannon.x;
    const by = cannon.y;

    // ground shadow
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(bx, by + 22, 34, 9, 0, 0, TAU);
    ctx.fill();

    // barrel
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(cannon.aim);
    const bg = ctx.createLinearGradient(0, -8, 0, 8);
    bg.addColorStop(0, "#8a5a2b");
    bg.addColorStop(0.5, "#5a3b1a");
    bg.addColorStop(1, "#3d260f");
    ctx.fillStyle = bg;
    roundRectPath(0, -8, cannon.barrel, 16, 6);
    ctx.fill();
    ctx.fillStyle = "#2a1808";
    roundRectPath(cannon.barrel - 6, -9, 6, 18, 3);
    ctx.fill();
    ctx.restore();

    // carved tiki base
    const tg = ctx.createLinearGradient(bx - 24, 0, bx + 24, 0);
    tg.addColorStop(0, "#6b4423");
    tg.addColorStop(0.5, "#9c6a34");
    tg.addColorStop(1, "#6b4423");
    ctx.fillStyle = tg;
    roundRectPath(bx - 24, by - 8, 48, 54, 10);
    ctx.fill();

    // tiki face
    ctx.fillStyle = "#3d260f";
    ctx.fillRect(bx - 16, by, 32, 4);            // brow
    ctx.beginPath();
    ctx.arc(bx - 9, by + 9, 5, 0, TAU);
    ctx.arc(bx + 9, by + 9, 5, 0, TAU);
    ctx.fill();                                   // eyes
    ctx.beginPath();
    ctx.moveTo(bx - 11, by + 26);
    ctx.lineTo(bx + 11, by + 26);
    ctx.lineTo(bx + 6, by + 36);
    ctx.lineTo(bx - 6, by + 36);
    ctx.closePath();
    ctx.fill();                                   // mouth
    ctx.fillStyle = "#f0e0c0";
    ctx.fillRect(bx - 9, by + 26, 18, 3);         // teeth
  }

  function drawCoconut(c) {
    const g = ctx.createRadialGradient(c.x - 3, c.y - 3, 1, c.x, c.y, c.r);
    g.addColorStop(0, "#7a4a1e");
    g.addColorStop(1, "#3d260f");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, TAU);
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
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Small helper: a tropical HUD plaque with left-aligned label text.
  function drawPlaque(x, w, label) {
    ctx.fillStyle = "rgba(61,38,15,0.4)";
    roundRectPath(x, 12, w, 38, 10);
    ctx.fill();
    ctx.fillStyle = "#fff8e6";
    ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 14, 32);
  }

  function drawHUD() {
    // score (top-left) + best score beside it
    drawPlaque(12, 150, "🍍 " + score);
    drawPlaque(172, 160, "🏆 " + best);

    // wave readout (top-center)
    if (state === STATE.PLAYING) drawPlaque(W / 2 - 65, 130, "🌊 Wave " + wave);

    // mute button (top-right corner)
    ctx.fillStyle = "rgba(61,38,15,0.4)";
    roundRectPath(muteRect.x, muteRect.y, muteRect.w, muteRect.h, 10);
    ctx.fill();
    ctx.fillStyle = "#fff8e6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "20px 'Trebuchet MS', sans-serif";
    ctx.fillText(muted ? "🔇" : "🔊", muteRect.x + muteRect.w / 2, muteRect.y + muteRect.h / 2 + 1);

    // lives (top-right, just left of the mute button)
    ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("❤️".repeat(lives), muteRect.x - 12, 31);

    // combo readout (top-center, only once the multiplier kicks in)
    if (state === STATE.PLAYING && comboMult() > 1) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 26px 'Trebuchet MS', sans-serif";
      ctx.fillStyle = "#ff6a00";
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 4;
      const txt = "🔥 x" + comboMult() + " (" + combo + " combo)";
      ctx.strokeText(txt, W / 2, 64);
      ctx.fillText(txt, W / 2, 64);
    }
    ctx.textBaseline = "alphabetic";
  }

  function drawWaveBanner() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 46px 'Trebuchet MS', sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    const main = "🌊 Wave " + wave + " cleared!";
    const sub = "Get ready for Wave " + (wave + 1) + "…";
    ctx.strokeText(main, W / 2, H / 2 - 10);
    ctx.fillStyle = "#fff";
    ctx.fillText(main, W / 2, H / 2 - 10);
    ctx.font = "22px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "#ffe9b0";
    ctx.fillText(sub, W / 2, H / 2 + 34);
    ctx.textBaseline = "alphabetic";
  }

  function drawCenterText(title, subtitle, footer) {
    ctx.fillStyle = "rgba(10,30,45,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 42px 'Trebuchet MS', sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.strokeText(title, W / 2, H / 2 - 26);
    ctx.fillStyle = "#fff";
    ctx.fillText(title, W / 2, H / 2 - 26);
    ctx.font = "20px 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "#ffe9b0";
    ctx.fillText(subtitle, W / 2, H / 2 + 22);
    if (footer) {
      ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
      ctx.fillStyle = "#ffd93b";
      ctx.fillText(footer, W / 2, H / 2 + 58);
    }
    ctx.textBaseline = "alphabetic";
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    // screen shake offsets the whole world (HUD/overlays stay steady)
    const ox = (Math.random() - 0.5) * shake;
    const oy = (Math.random() - 0.5) * shake;
    ctx.save();
    ctx.translate(ox, oy);

    drawScene();
    PALMS.forEach((px, i) => drawPalm(px, i));
    drawTorch(48);
    drawTorch(W - 48);

    for (const p of pineapples) drawPineapple(p);
    for (const c of coconuts) drawCoconut(c);
    drawParticles();
    if (state === STATE.PLAYING) drawAimGuide();
    drawCannon();

    ctx.restore();

    drawHUD();
    if (state === STATE.PLAYING && betweenWaves) drawWaveBanner();
    if (state === STATE.START) {
      drawCenterText(
        "🍍 Hawaiian Pineapple Challenge 🌴",
        playerName ? "Aloha, " + playerName + "! Click / tap to start" : "Click / tap to start",
        best > 0 ? "🏆 Best: " + best : ""
      );
    } else if (state === STATE.GAMEOVER) {
      drawCenterText(
        "Game Over — Score " + score,
        "Click / tap to play again",
        "🏆 Best: " + best
      );
    }
  }

  // ---- Debug hook (harmless; handy for testing) --------------------------
  window.HPC = {
    get state() { return state; },
    get score() { return score; },
    get lives() { return lives; },
    get pineapples() { return pineapples.length; },
    get coconuts() { return coconuts.length; },
    get best() { return best; },
    get name() { return playerName; },
    get combo() { return combo; },
    get mult() { return comboMult(); },
    get wave() { return wave; },
    get toSpawn() { return toSpawn; },
    get betweenWaves() { return betweenWaves; },
    get muted() { return muted; },
    toggleMute() { toggleMute(); },
    clearBest() { best = 0; localStorage.removeItem("hpc_best"); },
    setCombo(n) { combo = n; },   // debug/testing aid
    setLives(n) { lives = n; },   // debug/testing aid
    forceStart() { state = STATE.PLAYING; reset(); },
  };

  // ---- Name prompt (DOM modal, shown once) -------------------------------
  const nameModal = document.getElementById("name-modal");
  const nameInput = document.getElementById("name-input");
  const nameGo = document.getElementById("name-go");

  function showNameModal() {
    if (!nameModal) return;
    nameModal.classList.remove("hidden");
    if (nameInput) { nameInput.value = ""; nameInput.focus(); }
  }
  function submitName() {
    const v = (nameInput ? nameInput.value : "").trim().slice(0, 12);
    playerName = v || "Player";
    localStorage.setItem("hpc_name", playerName);
    if (nameModal) nameModal.classList.add("hidden");
    ensureAudio(); // this click is a user gesture — unlock audio early
  }
  if (nameGo) nameGo.addEventListener("click", submitName);
  if (nameInput) {
    nameInput.addEventListener("keydown", (e) => {
      if (e.code === "Enter" || e.key === "Enter") submitName();
    });
  }
  // Ask for a name on first visit only.
  if (!playerName) showNameModal();

  // ---- Main loop ---------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp big gaps (tab switches)
    time += dt;                        // animation clock (always runs)
    shake *= Math.exp(-dt * 9);        // screen shake settles
    if (shake < 0.05) shake = 0;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
