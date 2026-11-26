import { cameraFor, project, drawTris } from "./gl3d.js";
import { buildIsland, collectIslandTris, collectRunwayTris, collectPadTris, heightAt } from "./terrain.js";
import { planeTris, drawRings, drawDropZones, wingtipPositions, nosePosition } from "./plane3d.js";

let island = null, islandSeed = -1;
let hutZ = null;

let cloudSprites = null;
let seaRing = null;
let foamRing = null;

function speck(n) { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }
function num(v, f) { return typeof v === "number" && isFinite(v) ? v : f; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function skyFill(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 720);
  g.addColorStop(0, "#1e6cc4"); g.addColorStop(0.55, "#6fbde8"); g.addColorStop(0.85, "#cfe8f2"); g.addColorStop(1, "#eef4ee");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
}

function buildCloudSprites() {
  const sprites = [];
  for (let v = 0; v < 3; v++) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 128;
    const c = cv.getContext("2d");
    const n = 6 + (v % 2);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const px = 40 + t * 176 + (speck(v * 31 + i * 7 + 1) - 0.5) * 40;
      const py = 78 - Math.sin(t * Math.PI) * 26 + (speck(v * 17 + i * 11 + 3) - 0.5) * 14;
      const pr = 26 + speck(v * 13 + i * 5 + 2) * 22;
      const lower = py > 66;
      const g = c.createRadialGradient(px, py, 0, px, py, pr);
      if (lower) {
        g.addColorStop(0, "rgba(210,222,238,0.9)");
        g.addColorStop(0.6, "rgba(210,222,238,0.45)");
        g.addColorStop(1, "rgba(210,222,238,0)");
      } else {
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(0.6, "rgba(255,255,255,0.5)");
        g.addColorStop(1, "rgba(255,255,255,0)");
      }
      c.fillStyle = g;
      c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
    }
    sprites.push(cv);
  }
  return sprites;
}

function buildSeaRing() {
  const segs = 48;
  const tris = [];
  const verts = [];
  const innerR = 1000, outerR = 1250;
  const innerZ = 0.6, outerZ = 0.2;
  const innerCol = "#3fb8a8";
  const outerCol = "#1a6a9e";
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const ix0 = Math.cos(a0) * innerR, iy0 = Math.sin(a0) * innerR;
    const ix1 = Math.cos(a1) * innerR, iy1 = Math.sin(a1) * innerR;
    const ox0 = Math.cos(a0) * outerR, oy0 = Math.sin(a0) * outerR;
    const ox1 = Math.cos(a1) * outerR, oy1 = Math.sin(a1) * outerR;

    const vI0 = [ix0, iy0, innerZ];
    const vI1 = [ix1, iy1, innerZ];
    const vO0 = [ox0, oy0, outerZ];
    const vO1 = [ox1, oy1, outerZ];

    const tri1 = { pts: [vI0, vI1, vO0], color: innerCol };
    const tri2 = { pts: [vI1, vO1, vO0], color: outerCol };
    tris.push(tri1, tri2);

    verts.push(
      { v: vI0, baseZ: innerZ, angle: a0, radius: innerR },
      { v: vI1, baseZ: innerZ, angle: a1, radius: innerR },
      { v: vO0, baseZ: outerZ, angle: a0, radius: outerR },
      { v: vI1, baseZ: innerZ, angle: a1, radius: innerR },
      { v: vO1, baseZ: outerZ, angle: a1, radius: outerR },
      { v: vO0, baseZ: outerZ, angle: a0, radius: outerR }
    );
  }
  return { tris, verts };
}

function buildFoamRing() {
  // Scalloped pale surf band hugging the waterline (terrain height hits ~0
  // near r 1140-1150, so the band sits at r 1135-1210, just above the sea
  // ring). Drawn after the sea ring so the stable painter sort keeps it
  // on top where the two overlap.
  const segs = 48;
  const tris = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const rIn0 = 1135 + speck(i * 3 + 1) * 40;
    const rIn1 = 1135 + speck((i + 1) * 3 + 1) * 40;
    const rOut = 1210;
    const p = (a, r) => [Math.cos(a) * r, Math.sin(a) * r, 0.7];
    tris.push({ pts: [p(a0, rIn0), p(a1, rIn1), p(a0, rOut)], color: "#dfeef2" });
    tris.push({ pts: [p(a1, rIn1), p(a1, rOut), p(a0, rOut)], color: "#dfeef2" });
  }
  return tris;
}

function wrap(v, lo, hi) {
  const range = hi - lo;
  let x = v - lo;
  x = x - Math.floor(x / range) * range;
  return x + lo;
}

// ---- camera lag (camera-only: the jet's physics state is never touched) ----
// Smooths the camera pitch toward the jet's pitch and rolls the camera with
// the bank at 30%, so turns feel dynamic instead of locked upright. On
// frozen ?shot= pages dt is 0, so the values snap to the jet (no lag) and
// only the roll shows; on a world reset (time jumps backwards) it snaps.
let camSm = null;
function smoothedCam(jet, time) {
  if (!camSm || time < camSm.lastTime - 0.001 || Math.abs(time - camSm.lastTime) > 5) {
    camSm = { pitch: jet.pitchDeg || 0, roll: jet.bankDeg || 0, lastTime: time };
  }
  const dt = clamp(time - camSm.lastTime, 0, 0.1);
  camSm.lastTime = time;
  const k = 1 - Math.exp(-dt * 3.5);
  camSm.pitch += ((jet.pitchDeg || 0) - camSm.pitch) * k;
  camSm.roll += ((jet.bankDeg || 0) - camSm.roll) * k;
  const cam = cameraFor({ x: jet.x, y: jet.y, z: jet.z, headingDeg: jet.headingDeg, pitchDeg: camSm.pitch });
  const th = (camSm.roll * 0.3) * Math.PI / 180;
  const c = Math.cos(th), s = Math.sin(th);
  const rx = cam.rx, ry = cam.ry, rz = cam.rz;
  const ux = cam.ux, uy = cam.uy, uz = cam.uz;
  cam.rx = rx * c + ux * s; cam.ry = ry * c + uy * s; cam.rz = rz * c + uz * s;
  cam.ux = -rx * s + ux * c; cam.uy = -ry * s + uy * c; cam.uz = -rz * s + uz * c;
  return cam;
}

// ---- dynamic aircraft shadow: cheap flat silhouette projected onto the ----
// ---- terrain/water directly below the jet; fades with altitude. Drawn ----
// ---- between the runway and plane passes so the plane paints over it. ----
function drawPlaneShadow(ctx, cam, jet) {
  const ground = heightAt(jet.x, jet.y, islandSeed);
  const gz = Math.max(ground, 0.3);
  const alt = jet.z - gz;
  if (!(alt > 0.5) || alt > 450) return;
  const alpha = clamp(0.32 * (1 - alt / 450), 0.04, 0.32);
  const h = (jet.headingDeg || 0) * Math.PI / 180;
  const fx = Math.sin(h), fy = Math.cos(h);
  const rx = Math.cos(h), ry = -Math.sin(h);
  const outline = [
    [jet.x + fx * 14, jet.y + fy * 14],
    [jet.x + rx * 16 + fx * 0.5, jet.y + ry * 16 + fy * 0.5],
    [jet.x + rx * 7 - fx * 12, jet.y + ry * 7 - fy * 12],
    [jet.x - fx * 13, jet.y - fy * 13],
    [jet.x - rx * 7 - fx * 12, jet.y - ry * 7 - fy * 12],
    [jet.x - rx * 16 + fx * 0.5, jet.y - ry * 16 + fy * 0.5]
  ];
  for (let pass = 0; pass < 2; pass++) {
    const sc = pass === 0 ? 1.3 : 1.0;
    const a = pass === 0 ? alpha * 0.45 : alpha;
    const sp = [];
    for (let i = 0; i < outline.length; i++) {
      const px = jet.x + (outline[i][0] - jet.x) * sc;
      const py = jet.y + (outline[i][1] - jet.y) * sc;
      const p = project(cam, px, py, gz + 0.6);
      if (!p) return;
      sp.push(p);
    }
    ctx.fillStyle = "rgba(8,18,28," + a.toFixed(3) + ")";
    ctx.beginPath();
    ctx.moveTo(sp[0].x, sp[0].y);
    for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
    ctx.closePath();
    ctx.fill();
  }
}

// ---- spinning propeller blur disc at the nose (screen-space overlay) ----
function drawPropDisc(ctx, cam, jet, time) {
  const nose = nosePosition(jet);
  if (!nose) return;
  const p = project(cam, nose[0], nose[1], nose[2]);
  if (!p || p.s <= 0.02) return;
  const rad = 2.4 * p.s;
  if (rad < 2 || rad > 400) return;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
  g.addColorStop(0, "rgba(210,225,235,0.16)");
  g.addColorStop(0.7, "rgba(210,225,235,0.08)");
  g.addColorStop(1, "rgba(210,225,235,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
  ctx.fill();
  const a0 = time * 9;
  ctx.strokeStyle = "rgba(220,230,240,0.20)";
  ctx.lineWidth = Math.max(1, rad * 0.12);
  for (let k = 0; k < 2; k++) {
    const a = a0 + k * Math.PI;
    ctx.beginPath();
    ctx.moveTo(p.x - Math.cos(a) * rad * 0.9, p.y - Math.sin(a) * rad * 0.9);
    ctx.lineTo(p.x + Math.cos(a) * rad * 0.9, p.y + Math.sin(a) * rad * 0.9);
    ctx.stroke();
  }
}

// ---- wingtip trails: fixed ring buffers, no per-frame allocation. ----
// ---- Only recorded while turning hard or flying fast; frozen ?shot= ----
const TRAIL_N = 26;
const trailL = new Float64Array(TRAIL_N * 3);
const trailR = new Float64Array(TRAIL_N * 3);
const trailAgeL = new Float64Array(TRAIL_N);
const trailAgeR = new Float64Array(TRAIL_N);
let trailCount = 0, trailHead = 0, trailLastTime = -1;

function updateTrails(jet, time) {
  if (trailLastTime < 0) { trailLastTime = time; return; }
  if (time < trailLastTime - 0.001) { trailCount = 0; trailLastTime = time; return; }
  const dt = time - trailLastTime;
  trailLastTime = time;
  if (!(dt > 0)) return;
  for (let i = 0; i < TRAIL_N; i++) { trailAgeL[i]++; trailAgeR[i]++; }
  const bank = Math.abs(jet.bankDeg || 0);
  const sp = jet.speedMs || 0;
  if (!(bank > 12 || sp > 130)) return;
  const tips = wingtipPositions(jet);
  if (!tips || tips.length < 2) return;
  trailL.set(tips[0], trailHead * 3);
  trailR.set(tips[1], trailHead * 3);
  trailAgeL[trailHead] = 0;
  trailAgeR[trailHead] = 0;
  trailHead = (trailHead + 1) % TRAIL_N;
  if (trailCount < TRAIL_N) trailCount++;
}

function drawTrails(ctx, cam) {
  if (trailCount < 2) return;
  for (let side = 0; side < 2; side++) {
    const arr = side === 0 ? trailL : trailR;
    const age = side === 0 ? trailAgeL : trailAgeR;
    let prev = null;
    for (let j = 0; j < trailCount; j++) {
      const idx = (((trailHead - trailCount + j) % TRAIL_N) + TRAIL_N) % TRAIL_N;
      const a = age[idx];
      if (a > 26) { prev = null; continue; }
      const p = project(cam, arr[idx * 3], arr[idx * 3 + 1], arr[idx * 3 + 2]);
      if (p && prev) {
        const al = 0.45 * (1 - Math.min(a, 26) / 26);
        ctx.strokeStyle = "rgba(207,232,255," + al.toFixed(3) + ")";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      prev = p;
    }
  }
}

// ---- high-speed wind streaks at the screen edges (live play only) ----
function drawWindStreaks(ctx, jet, time) {
  const sp = jet.speedMs || 0;
  if (sp <= 130) return;
  const k = clamp((sp - 130) / 50, 0, 1);
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const ang = speck(i * 11 + 3) * Math.PI * 2;
    const r0 = 480 + speck(i * 7 + 1) * 180;
    const len = 30 + k * 70 + speck(i * 5 + 2) * 30;
    const rr = r0 + ((time * 40 + i * 37) % 120) * 0.3;
    if (rr > 760) continue;
    const x0 = 640 + Math.cos(ang) * rr, y0 = 360 + Math.sin(ang) * rr;
    const x1 = 640 + Math.cos(ang) * (rr + len), y1 = 360 + Math.sin(ang) * (rr + len);
    const a = 0.10 + 0.18 * k;
    ctx.strokeStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

export function drawScene(ctx, world, fx) {
  try {
    if (!ctx || !world || !world.jet) { if (ctx) skyFill(ctx); return; }
    const jet = world.jet;
    const time = num(fx && fx.time, 0);

    if (world.seed !== islandSeed) {
      island = buildIsland(world.seed);
      islandSeed = world.seed;
      hutZ = island.huts ? island.huts.map(h => h.z) : null;
    }

    if (!cloudSprites) cloudSprites = buildCloudSprites();
    if (!seaRing) seaRing = buildSeaRing();
    if (!foamRing) foamRing = buildFoamRing();

    const cam = smoothedCam(jet, time);
    const den = Math.sqrt(cam.fx * cam.fx + cam.fy * cam.fy);
    const lookPitchTan = den > 1e-6 ? cam.fz / den : 0;
    let hy = 360 - lookPitchTan * cam.f;
    hy = clamp(num(hy, 360), 150, 560);

    // sky
    const sg = ctx.createLinearGradient(0, 0, 0, hy);
    sg.addColorStop(0, "#1e6cc4"); sg.addColorStop(0.55, "#6fbde8"); sg.addColorStop(0.85, "#cfe8f2"); sg.addColorStop(1, "#eef4ee");
    ctx.fillStyle = sg; ctx.fillRect(0, 0, 1280, hy);

    // sun glow
    if (hy > 120) {
      const rg = ctx.createRadialGradient(1020, 120, 0, 1020, 120, 220);
      rg.addColorStop(0, "rgba(255,244,200,0.55)"); rg.addColorStop(1, "rgba(255,244,200,0)");
      ctx.fillStyle = rg; ctx.fillRect(800, -100, 440, 440);
    }

    // sea
    if (hy < 720) {
      const eg = ctx.createLinearGradient(0, hy, 0, 720);
      eg.addColorStop(0, "#2f7fa8"); eg.addColorStop(0.5, "#1a6a9e"); eg.addColorStop(1, "#0b3a5e");
      ctx.fillStyle = eg; ctx.fillRect(0, hy, 1280, 720 - hy);

      // horizon haze band
      const hz = ctx.createLinearGradient(0, hy - 40, 0, hy + 40);
      hz.addColorStop(0, "rgba(207,232,242,0)");
      hz.addColorStop(0.5, "rgba(207,232,242,0.55)");
      hz.addColorStop(1, "rgba(207,232,242,0)");
      ctx.fillStyle = hz; ctx.fillRect(0, hy - 40, 1280, 80);

      ctx.fillStyle = "rgba(207,232,242,0.5)"; ctx.fillRect(0, hy - 2, 1280, 4);

      // animated glints
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const gx = (speck(i * 7 + 1) * 1280 + time * (6 + (i % 3) * 4)) % 1280;
        const gy = hy + 12 + speck(i * 13 + 5) * Math.max(1, 720 - hy - 20);
        const len = 14 + speck(i * 3 + 2) * 30;
        const a = 0.10 + 0.12 * (0.5 + 0.5 * Math.sin(time * 1.3 + i * 1.7));
        ctx.strokeStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + len, gy); ctx.stroke();
      }

      // sun glitter
      if (hy < 700) {
        for (let i = 0; i < 24; i++) {
          const gx = 860 + speck(i * 5 + 3) * 320;
          const gy = hy + 8 + speck(i * 7 + 11) * Math.max(1, Math.min(720, hy + 180) - hy - 8);
          const len = 10 + speck(i * 3 + 1) * 16;
          const a = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(time * 2.1 + i * 2.3));
          ctx.strokeStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
          ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + len, gy); ctx.stroke();
        }
      }
    }

    // 3D tris, in painter passes so the draw order is guaranteed:
    // terrain first, runway over the terrain (a terrain triangle can never
    // bury the strip again), shadow on the ground, plane last (wheels over
    // the runway), then screen-space overlays (prop disc, trails, streaks).
    const out = [];

    // update sea ring vertices in place, then push tris
    for (let i = 0; i < seaRing.verts.length; i++) {
      const vd = seaRing.verts[i];
      vd.v[2] = vd.baseZ + 1.2 * Math.sin(time * 0.8 + vd.angle * 2 + vd.radius * 0.01);
    }
    for (let i = 0; i < seaRing.tris.length; i++) out.push(seaRing.tris[i]);
    for (let i = 0; i < foamRing.length; i++) out.push(foamRing[i]);

    collectIslandTris(island, cam, out);
    collectPadTris(island, cam, out, world.drop && world.drop.done);
    const rwOut = [];
    collectRunwayTris(island, cam, rwOut);
    const pt = planeTris(jet);
    drawTris(ctx, cam, out, "#cfe8f2");
    drawTris(ctx, cam, rwOut, "#cfe8f2");
    drawPlaneShadow(ctx, cam, jet);
    drawTris(ctx, cam, pt, "#cfe8f2");
    drawPropDisc(ctx, cam, jet, time);
    updateTrails(jet, time);
    drawTrails(ctx, cam);
    drawWindStreaks(ctx, jet, time);

    // clouds
    if (island && island.clouds) {
      ctx.globalAlpha = 0.92;
      for (let i = 0; i < island.clouds.length; i++) {
        const c = island.clouds[i];
        const dx = wrap(c.x + time * 8, -3400, 3400);
        const p = project(cam, dx, c.y, c.z);
        if (!p || p.s <= 0.02) continue;
        const base = c.rx * p.s;
        if (base < 2 || base > 4000) continue;
        const sprite = cloudSprites[i % 3];
        ctx.drawImage(sprite, p.x - base, p.y - base * 0.45, base * 2, base * 0.9);
      }
      ctx.globalAlpha = 1;
    }

    // rings + drop zones
    drawRings(ctx, cam, world.course.rings, jet, time);
    drawDropZones(ctx, cam, world.course.dropZones, time, world.drop && world.drop.done, hutZ);

    // vignette
    const vg = ctx.createRadialGradient(640, 360, 320, 640, 360, 720);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, 1280, 720);
  } catch (e) {
    try { ctx.fillStyle = "#7ec3e8"; ctx.fillRect(0, 0, 1280, 720); } catch (e2) {}
  }
}
