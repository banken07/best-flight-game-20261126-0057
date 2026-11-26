// ATOLL RUN — boot, game loop, screens, test hooks.
// Loads as a module script from game/index.html. Reads ?shot=, ?seed=
// and ?auto= from the URL. The ?shot= scenes stage the world with the
// autopilot so screenshots show real flown frames.

import { STAGE, STEP, KEYS, SORTIE } from "./config.js";
import { createInput } from "./input.js";
import { createAudio } from "./audio.js";
import { createWorld, resetWorld, stepWorld } from "./world.js";
import { drawScene } from "./render.js";
import { drawHud, glassBox, drawKeyChips, replayPillRect, roundRectPath } from "./hud.js";
import { stageShot, autopilot } from "./shots.js";

const canvas = document.getElementById("game");
if (canvas) {
  const ctx = canvas.getContext("2d");
  canvas.width = STAGE.width;
  canvas.height = STAGE.height;
  const statusEl = document.getElementById("status");
  const params = new URLSearchParams(location.search);
  const shotParam = params.get("shot");
  const seedParam = Number(params.get("seed") || 1) || 1;
  const autoParam = params.get("auto") === "1";
  const input = createInput();
  input.attach();
  const audio = createAudio();
  let seed = seedParam;
  let world = createWorld(seed);
  let screen = "title";
  let paused = false;
  let lastPhase = world.phase;
  let clicked = false;
  let clickX = 0, clickY = 0;
  canvas.addEventListener("click", (e) => {
    clicked = true;
    // Map the click into 1280x720 canvas space (the canvas is CSS-scaled
    // to the viewport, so scale the client coords back).
    const rect = canvas.getBoundingClientRect();
    const sx = STAGE.width / Math.max(1, rect.width);
    const sy = STAGE.height / Math.max(1, rect.height);
    clickX = (e.clientX - rect.left) * sx;
    clickY = (e.clientY - rect.top) * sy;
  });
  if (shotParam) {
    const staged = stageShot(shotParam, world);
    if (staged && staged.screen) screen = staged.screen;
    lastPhase = world.phase;
  }
  // Staged ?shot= pages are frozen frames for screenshots: the render loop
  // draws them but never advances the world, so an uncontrolled plane
  // cannot fly into a hill during the screenshot wait.
  const frozen = !!shotParam;
  function setStatus(text) { if (statusEl) statusEl.textContent = text; }
  function startGame() { audio.ensure(); screen = "play"; setStatus("Sortie started"); }
  function restartMission() { resetWorld(world, seed); lastPhase = world.phase; screen = "play"; setStatus("Sortie restarted"); }
  function result() {
    return { phase: world.phase, score: world.score, stage: world.stage, ringsHit: world.stats.ringsHit, ringScores: world.stats.ringScores.slice(), dropScores: world.stats.dropScores.slice(), breakdown: world.breakdown, timeLeft: world.timeLeft, elapsed: world.elapsed };
  }
  window.__atollRun = {
    get world() { return world; },
    get screen() { return screen; },
    version: "atoll-run-1",
    result,
    step(n, controls) {
      const count = Math.max(0, Math.floor(n) || 0);
      for (let i = 0; i < count; i += 1) stepWorld(world, controls || autopilot(world), STEP);
      return result();
    }
  };
  let titleScrim = null;
  function drawTitleOverlay() {
    ctx.save();

    // Full-screen vertical scrim gradient (keeps the live 3D scene visible).
    // Static: build once, reuse every title frame.
    if (!titleScrim) {
      titleScrim = ctx.createLinearGradient(0, 0, 0, 720);
      titleScrim.addColorStop(0, "rgba(4,12,20,0.50)");
      titleScrim.addColorStop(0.5, "rgba(4,12,20,0.12)");
      titleScrim.addColorStop(1, "rgba(4,12,20,0.45)");
    }
    ctx.fillStyle = titleScrim;
    ctx.fillRect(0, 0, 1280, 720);

    // Opaque backing under the glass title card: the live 3D scene used to
    // ghost through the translucent glass — notably the glowing mission
    // ring centred behind the card (plus its "1235 m" distance label),
    // which read as HUD clutter. The backing keeps the card's glass
    // border/highlight while nothing from the scene shows through it; the
    // scene stays visible around the card. (The HUD attitude indicator was
    // already suppressed on the title screen — the ghost was the 3D ring,
    // not the indicator; the bottom-left corner was already empty.)
    const cardX = 260, cardY = 150, cardW = 760, cardH = 430;
    ctx.save();
    roundRectPath(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fillStyle = "rgba(5,14,22,0.94)";
    ctx.fill();
    ctx.restore();
    glassBox(ctx, cardX, cardY, cardW, cardH, 16);

    // Title with cyan glow.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#7df9ff";
    ctx.fillStyle = "#eaf7ff";
    ctx.font = "bold 58px monospace";
    ctx.fillText("ATOLL RUN", 640, 225);
    ctx.restore();

    // Accent rule under title.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(640 - 60, 258.5);
    ctx.lineTo(640 + 60, 258.5);
    ctx.strokeStyle = "#7df9ff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Tagline.
    ctx.fillStyle = "#7df9ff";
    ctx.font = "18px monospace";
    ctx.textBaseline = "middle";
    ctx.fillText("ONE SORTIE, THREE MISSIONS", 640, 273);

    // Three stage mini-cards.
    const miniW = 226, miniH = 92, miniGap = 8;
    const miniTotal = miniW * 3 + miniGap * 2;
    const miniStartX = 640 - miniTotal / 2;
    const miniY = 300;

    for (let i = 0; i < 3; i += 1) {
      const mx = miniStartX + i * (miniW + miniGap);
      glassBox(ctx, mx, miniY, miniW, miniH, 10);

      // Parse briefing: "STAGE 1 — RING COURSE: fly 5 glowing rings."
      const raw = (SORTIE && SORTIE.briefings && SORTIE.briefings[i]) ? String(SORTIE.briefings[i]) : "";
      let name = "", objective = "";
      const dashIdx = raw.indexOf("—");
      let afterDash = raw;
      if (dashIdx >= 0) afterDash = raw.slice(dashIdx + 1).trim();
      const colonIdx = afterDash.indexOf(":");
      if (colonIdx >= 0) {
        name = afterDash.slice(0, colonIdx).trim();
        objective = afterDash.slice(colonIdx + 1).trim();
      } else {
        name = afterDash.trim();
      }
      if (objective.length > 0 && objective.charAt(objective.length - 1) === ".") {
        objective = objective.slice(0, -1);
      }

      const numStr = "0" + (i + 1);

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#7df9ff";
      ctx.font = "bold 15px monospace";
      ctx.fillText(numStr, mx + 12, miniY + 24);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px monospace";
      ctx.fillText(name, mx + 12, miniY + 48);

      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.font = "12px monospace";
      ctx.fillText(objective, mx + 12, miniY + 70);
    }

    // Keybind chips row.
    drawKeyChips(ctx, [
      ["W/S", "THROTTLE"],
      ["ARROWS", "FLY"],
      ["SPACE", "DROP"],
      ["R", "RESTART"],
      ["M", "MUTE"]
    ], 640, 445);

    // CTA pill (blinking).
    const ctaW = 380, ctaH = 46;
    const ctaX = 640 - ctaW / 2;
    const ctaY = 520 - ctaH / 2;
    ctx.save();
    ctx.beginPath();
    const rr = 23;
    ctx.moveTo(ctaX + rr, ctaY);
    ctx.lineTo(ctaX + ctaW - rr, ctaY);
    ctx.arcTo(ctaX + ctaW, ctaY, ctaX + ctaW, ctaY + rr, rr);
    ctx.lineTo(ctaX + ctaW, ctaY + ctaH - rr);
    ctx.arcTo(ctaX + ctaW, ctaY + ctaH, ctaX + ctaW - rr, ctaY + ctaH, rr);
    ctx.lineTo(ctaX + rr, ctaY + ctaH);
    ctx.arcTo(ctaX, ctaY + ctaH, ctaX, ctaY + ctaH - rr, rr);
    ctx.lineTo(ctaX, ctaY + rr);
    ctx.arcTo(ctaX, ctaY, ctaX + rr, ctaY, rr);
    ctx.closePath();
    ctx.fillStyle = "rgba(6,18,28,0.72)";
    ctx.fill();
    ctx.strokeStyle = "#7df9ff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.fillStyle = "#7df9ff";
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PRESS ENTER OR CLICK TO FLY", 640, 520);
    }

    ctx.restore();
  }
  function anyDown(codes) { for (let i = 0; i < codes.length; i += 1) if (input.isDown(codes[i])) return true; return false; }
  function anyPressed(codes) { for (let i = 0; i < codes.length; i += 1) if (input.pressed(codes[i])) return true; return false; }
  function buildControls() {
    if (autoParam) return autopilot(world);
    const throttle = (anyDown(KEYS.throttleUp) ? 1 : 0) + (anyDown(KEYS.throttleDown) ? -1 : 0);
    const pitch = (anyDown(KEYS.pitchUp) ? 1 : 0) + (anyDown(KEYS.pitchDown) ? -1 : 0);
    const bank = (anyDown(KEYS.bankRight) ? 1 : 0) + (anyDown(KEYS.bankLeft) ? -1 : 0);
    const action = anyPressed(KEYS.action);
    return { throttle, pitch, bank, action };
  }
  function drainEvents() {
    for (let i = 0; i < world.events.length; i += 1) {
      const type = world.events[i].type;
      if (type === "ring") audio.chime();
      else if (type === "trap") audio.clunk();
      else if (type === "crash") { audio.clunk(); audio.beep(180, 0.4); }
      else if (type === "alarm") audio.alarm();
      else if (type === "drop") audio.beep(660, 0.12);
      else if (type === "win") audio.chime();
    }
    world.events.length = 0;
  }
  function handlePhaseChange() {
    if (world.phase !== lastPhase) {
      if (world.phase === "won") { screen = "won"; setStatus("Sortie complete, score " + world.score); }
      else if (world.phase === "lost") { screen = "lost"; setStatus("Sortie failed"); }
      else if (world.phase === "crashed") { screen = "crashed"; setStatus("Crashed"); }
      if (autoParam) window.__result = result();
      lastPhase = world.phase;
    }
  }
  function handleGlobalKeys() {
    if (anyPressed(KEYS.restart)) restartMission();
    if (anyPressed(KEYS.mute)) audio.setMuted(!audio.muted);
    if (anyPressed(KEYS.pause)) paused = !paused;
  }
  let lastTime = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
    lastTime = now;
    if (screen === "title") {
      if (anyPressed(["Enter", "NumpadEnter"]) || clicked) { startGame(); clicked = false; }
    } else if (screen === "play") {
      handleGlobalKeys();
      // Consume any click made during play so it cannot leak into the
      // end-screen replay pill on the frame the sortie ends.
      clicked = false;
      if (!paused && !frozen) {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 5) {
          stepWorld(world, buildControls(), STEP);
          drainEvents();
          acc -= STEP;
          steps += 1;
        }
        if (steps === 5) acc = 0;
        handlePhaseChange();
        audio.engine(world.jet.throttle, world.jet.speedMs / 180);
      }
    } else {
      handleGlobalKeys();
      // Clicking the "PRESS R TO FLY AGAIN" pill restarts the mission.
      if (clicked) {
        const wasClicked = clicked;
        clicked = false;
        if (wasClicked && (screen === "won" || screen === "lost" || screen === "crashed")) {
          const ph = (screen === "won" && world.breakdown) ? 380 : 240;
          const pill = replayPillRect(ph);
          if (clickX >= pill.x && clickX <= pill.x + pill.w && clickY >= pill.y && clickY <= pill.y + pill.h) restartMission();
        }
      }
    }
    ctx.clearRect(0, 0, STAGE.width, STAGE.height);
    drawScene(ctx, world, { time: world.elapsed });
    // Title overlay first, HUD on top of it: the overlay's dark bands
    // used to be drawn AFTER the HUD and greyed out the top ALT/SPD/HDG
    // boxes on the title screen. HUD elements sit in the corners and do
    // not overlap the centred title text.
    if (screen === "title") drawTitleOverlay();
    const hudScreen = screen === "title" ? "title" : (world.phase === "fly" ? "play" : world.phase);
    drawHud(ctx, world, hudScreen);
    if (paused && screen === "play") {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#7df9ff";
      ctx.fillStyle = "#eaf7ff";
      ctx.font = "bold 30px monospace";
      ctx.fillText("PAUSED", 640, 360);
      ctx.restore();
    }
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
