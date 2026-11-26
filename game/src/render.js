import { cameraFor, project, drawTris } from "./gl3d.js";
import { buildIsland, collectIslandTris } from "./terrain.js";
import { planeTris, drawRings, drawDropZones } from "./plane3d.js";

let island = null, islandSeed = -1;

function speck(n) { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }
function num(v, f) { return typeof v === "number" && isFinite(v) ? v : f; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function skyFill(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 720);
  g.addColorStop(0, "#2f7fd0"); g.addColorStop(0.6, "#7ec3e8"); g.addColorStop(1, "#cfe8f2");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
}

export function drawScene(ctx, world, fx) {
  try {
    if (!ctx || !world || !world.jet) { if (ctx) skyFill(ctx); return; }
    const jet = world.jet;
    const time = num(fx && fx.time, 0);

    if (world.seed !== islandSeed) { island = buildIsland(world.seed); islandSeed = world.seed; }

    const cam = cameraFor(jet);
    const den = Math.sqrt(cam.fx * cam.fx + cam.fy * cam.fy);
    const lookPitchTan = den > 1e-6 ? cam.fz / den : 0;
    let hy = 360 - lookPitchTan * cam.f;
    hy = clamp(num(hy, 360), 150, 560);

    // sky
    const sg = ctx.createLinearGradient(0, 0, 0, hy);
    sg.addColorStop(0, "#2f7fd0"); sg.addColorStop(0.6, "#7ec3e8"); sg.addColorStop(1, "#cfe8f2");
    ctx.fillStyle = sg; ctx.fillRect(0, 0, 1280, hy);

    // sun glow
    if (hy > 120) {
      const rg = ctx.createRadialGradient(1020, 120, 0, 1020, 120, 190);
      rg.addColorStop(0, "rgba(255,244,200,0.55)"); rg.addColorStop(1, "rgba(255,244,200,0)");
      ctx.fillStyle = rg; ctx.fillRect(830, -70, 380, 380);
    }

    // sea
    if (hy < 720) {
      const eg = ctx.createLinearGradient(0, hy, 0, 720);
      eg.addColorStop(0, "#2f7fa8"); eg.addColorStop(0.5, "#1a6a9e"); eg.addColorStop(1, "#0b3a5e");
      ctx.fillStyle = eg; ctx.fillRect(0, hy, 1280, 720 - hy);
      ctx.fillStyle = "rgba(207,232,242,0.5)"; ctx.fillRect(0, hy - 2, 1280, 4);
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const gx = speck(i * 7 + 1) * 1280;
        const gy = hy + 12 + speck(i * 13 + 5) * (720 - hy - 20);
        const len = 14 + speck(i * 3 + 2) * 30;
        const a = 0.10 + 0.12 * speck(i * 11 + 9);
        ctx.strokeStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + len, gy); ctx.stroke();
      }
    }

    // 3D tris
    const out = [];
    collectIslandTris(island, cam, out);
    const pt = planeTris(jet);
    for (let i = 0; i < pt.length; i++) out.push(pt[i]);
    drawTris(ctx, cam, out, "#9db4cc");

    // clouds
    if (island && island.clouds) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < island.clouds.length; i++) {
        const c = island.clouds[i];
        const p = project(cam, c.x, c.y, c.z);
        if (!p || p.s <= 0.02) continue;
        const base = c.rx * p.s;
        if (base < 2 || base > 4000) continue;
        ctx.beginPath(); ctx.ellipse(p.x - base * 0.55, p.y, base * 0.9, base * 0.32, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(p.x, p.y - base * 0.1, base * 0.8, base * 0.28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(p.x + base * 0.6, p.y + base * 0.05, base * 0.7, base * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      }
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
