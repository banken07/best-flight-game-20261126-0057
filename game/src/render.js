import { cameraFor, project, drawTris } from "./gl3d.js";
import { buildIsland, collectIslandTris, collectRunwayTris } from "./terrain.js";
import { planeTris, drawRings, drawDropZones } from "./plane3d.js";

let island = null, islandSeed = -1;

let cloudSprites = null;
let seaRing = null;

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

function wrap(v, lo, hi) {
  const range = hi - lo;
  let x = v - lo;
  x = x - Math.floor(x / range) * range;
  return x + lo;
}

export function drawScene(ctx, world, fx) {
  try {
    if (!ctx || !world || !world.jet) { if (ctx) skyFill(ctx); return; }
    const jet = world.jet;
    const time = num(fx && fx.time, 0);

    if (world.seed !== islandSeed) { island = buildIsland(world.seed); islandSeed = world.seed; }

    if (!cloudSprites) cloudSprites = buildCloudSprites();
    if (!seaRing) seaRing = buildSeaRing();

    const cam = cameraFor(jet);
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

    // 3D tris, in three painter passes so the draw order is guaranteed:
    // terrain first, runway over the terrain (a terrain triangle can never
    // bury the strip again), plane last (wheels over the runway).
    const out = [];

    // update sea ring vertices in place, then push tris
    for (let i = 0; i < seaRing.verts.length; i++) {
      const vd = seaRing.verts[i];
      vd.v[2] = vd.baseZ + 1.2 * Math.sin(time * 0.8 + vd.angle * 2 + vd.radius * 0.01);
    }
    for (let i = 0; i < seaRing.tris.length; i++) out.push(seaRing.tris[i]);

    collectIslandTris(island, cam, out);
    const rwOut = [];
    collectRunwayTris(island, cam, rwOut);
    const pt = planeTris(jet);
    drawTris(ctx, cam, out, "#cfe8f2");
    drawTris(ctx, cam, rwOut, "#cfe8f2");
    drawTris(ctx, cam, pt, "#cfe8f2");

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
    drawRings(ctx, cam, world.course.rings, jet);
    drawDropZones(ctx, cam, world.course.dropZones, time);

    // vignette
    const vg = ctx.createRadialGradient(640, 360, 320, 640, 360, 720);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, 1280, 720);
  } catch (e) {
    try { ctx.fillStyle = "#7ec3e8"; ctx.fillRect(0, 0, 1280, 720); } catch (e2) {}
  }
}
