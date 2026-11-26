import { toCam } from "./gl3d.js";

export const HUT_SPOTS = [{ x: -420, y: 200 }, { x: 430, y: 900 }];

function mulberry32(a) {
  a = (a | 0) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  const s = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothstep(a, b, x) {
  if (!isFinite(a) || !isFinite(b) || a === b) return 0;
  let t = (x - a) / (b - a);
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return t * t * (3 - 2 * t);
}

function clamp(x, a, b) {
  if (!isFinite(x)) return a;
  return x < a ? a : x > b ? b : x;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function hexToRgb(h) {
  if (typeof h !== "string" || h.length < 7) return [128, 128, 128];
  const n = parseInt(h.slice(1), 16);
  if (!isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  r = clamp(Math.round(r), 0, 255);
  g = clamp(Math.round(g), 0, 255);
  b = clamp(Math.round(b), 0, 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function hexLerp(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  t = clamp(t, 0, 1);
  return rgbToHex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
}

function shadeHex(hex, f) {
  const c = hexToRgb(hex);
  return rgbToHex(c[0] * f, c[1] * f, c[2] * f);
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (!isFinite(l) || l < 1e-9) return [0, 0, 1];
  return [v[0] / l, v[1] / l, v[2] / l];
}

function triNormal(a, b, c) {
  return norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
}

const SUN = norm([0.5, 0.35, 1]);

function sunLight(n) {
  const d = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2];
  return 0.70 + 0.30 * Math.max(0, d);
}

export function heightAt(x, y, seed) {
  if (!isFinite(x) || !isFinite(y)) return -12;
  const r = Math.hypot(x, y);
  let h = 115 * Math.max(0, 1 - (r / 1500) * (r / 1500));
  const hills = [[-600, 400, 55, 380], [500, -500, 70, 420], [200, 800, 45, 300]];
  for (let i = 0; i < hills.length; i++) {
    const hx = x - hills[i][0], hy = y - hills[i][1];
    const d2 = hx * hx + hy * hy;
    const s2 = hills[i][3] * hills[i][3];
    h += hills[i][2] * Math.exp(-d2 / (2 * s2));
  }
  const cs = [260, 130], amps = [8, 4];
  for (let o = 0; o < 2; o++) {
    const cs2 = cs[o];
    const ix = Math.floor(x / cs2), iy = Math.floor(y / cs2);
    const fx = x / cs2 - ix, fy = y / cs2 - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v00 = hash2(ix, iy, seed + o * 17);
    const v10 = hash2(ix + 1, iy, seed + o * 17);
    const v01 = hash2(ix, iy + 1, seed + o * 17);
    const v11 = hash2(ix + 1, iy + 1, seed + o * 17);
    const v = lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
    h += (v - 0.5) * 2 * amps[o];
  }
  if (r > 950 && r < 1150) {
    const t = smoothstep(950, 1150, r);
    h = lerp(h, 0, t);
  }
  const dRun = Math.abs(x);
  // Runway strip plus a cleared approach corridor to the south (y -1600..300),
  // so the 5.5-degree final stays above the ground all the way to the threshold.
  const inY = y >= -1600 && y <= 300;
  if (inY) {
    if (dRun < 45) h = 0;
    else if (dRun < 90) {
      const t = smoothstep(45, 90, dRun);
      h = lerp(0, h, t);
    }
  }
  return clamp(h, -12, 220);
}

function terrainColor(h, r) {
  if (r > 900 && r < 1150) return "#d8c08a";
  if (h < 6) return "#d8c08a";
  if (h < 55) return hexLerp("#79b657", "#4d8a3a", (h - 6) / 49);
  if (h < 110) return hexLerp("#4d8a3a", "#8a6a44", (h - 55) / 55);
  return "#7a7568";
}

export function buildIsland(seed) {
  seed = (seed | 0) || 1;
  const tris = [];
  const N = 44;
  const min = -1700, max = 1700;
  const step = (max - min) / N;
  const heights = new Float64Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = min + i * step, y = min + j * step;
      heights[j * (N + 1) + i] = heightAt(x, y, seed);
    }
  }
  const jitter = (ix, iy) => 0.94 + hash2(ix, iy, seed + 999) * 0.12;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x0 = min + i * step, x1 = x0 + step;
      const y0 = min + j * step, y1 = y0 + step;
      const h00 = heights[j * (N + 1) + i];
      const h10 = heights[j * (N + 1) + i + 1];
      const h01 = heights[(j + 1) * (N + 1) + i];
      const h11 = heights[(j + 1) * (N + 1) + i + 1];
      const quads = [
        [[x0, y0, h00], [x1, y0, h10], [x1, y1, h11]],
        [[x0, y0, h00], [x1, y1, h11], [x0, y1, h01]]
      ];
      for (let q = 0; q < 2; q++) {
        const t = quads[q];
        if (t[0][2] <= 0.5 && t[1][2] <= 0.5 && t[2][2] <= 0.5) continue;
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
        const cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        const cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
        const r = Math.hypot(cx, cy);
        let col = terrainColor(cz, r);
        const n = triNormal(t[0], t[1], t[2]);
        const light = sunLight(n);
        const jf = jitter(i * 2 + q, j);
        const rgb = hexToRgb(col);
        col = rgbToHex(rgb[0] * light * jf, rgb[1] * light * jf, rgb[2] * light * jf);
        tris.push({ pts: [t[0], t[1], t[2]], color: col });
      }
    }
  }
  const rng = mulberry32(seed + 11);
  const trees = [];
  let guard = 0;
  while (trees.length < 70 && guard < 5000) {
    guard++;
    const x = (rng() * 2 - 1) * 950;
    const y = (rng() * 2 - 1) * 950;
    const r = Math.hypot(x, y);
    if (r >= 950) continue;
    const h = heightAt(x, y, seed);
    if (h < 8 || h > 60) continue;
    if (!(Math.abs(x) > 90 || Math.abs(y) > 400)) continue;
    let ok = true;
    for (let k = 0; k < HUT_SPOTS.length; k++) {
      if (Math.hypot(x - HUT_SPOTS[k].x, y - HUT_SPOTS[k].y) < 120) { ok = false; break; }
    }
    if (!ok) continue;
    trees.push({ x, y, z: h, s: 8 + rng() * 8 });
  }
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    clouds.push({
      x: (rng() * 2 - 1) * 3200,
      y: (rng() * 2 - 1) * 3200,
      z: 480 + rng() * 180,
      rx: 120 + rng() * 140
    });
  }
  const huts = HUT_SPOTS.map(p => ({ x: p.x, y: p.y, z: heightAt(p.x, p.y, seed) }));
  const runway = { x0: -30, x1: 30, y0: -300, y1: 300, z: 2 };
  return { seed, tris, trees, clouds, huts, runway };
}

function pushTri(out, a, b, c, color) {
  const n = triNormal(a, b, c);
  const l = sunLight(n);
  out.push({ pts: [a, b, c], color: shadeHex(color, l) });
}

function pushQuad(out, a, b, c, d, color) {
  pushTri(out, a, b, c, color);
  pushTri(out, a, c, d, color);
}

export function collectIslandTris(island, cam, out) {
  if (!island || !cam || !out) return;
  const ex = cam.ex || 0, ey = cam.ey || 0, ez = cam.ez || 0;
  const tris = island.tris || [];
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    if (!t || !t.pts || t.pts.length < 3) continue;
    const a = t.pts[0], b = t.pts[1], c = t.pts[2];
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    if (Math.hypot(cx - ex, cy - ey, cz - ez) > 5200) continue;
    if (toCam(cam, cx, cy, cz) == null) continue;
    out.push(t);
  }
  const trees = island.trees || [];
  for (let i = 0; i < trees.length; i++) {
    const tr = trees[i];
    if (!tr) continue;
    const dx = tr.x - ex, dy = tr.y - ey, dz = tr.z - ez;
    if (Math.hypot(dx, dy, dz) > 4000) continue;
    const s = tr.s || 8;
    const apex = [tr.x, tr.y, tr.z + s * 2.4];
    const baseZ = tr.z + s * 0.4;
    const ring = [];
    for (let k = 0; k < 4; k++) {
      const ang = k * Math.PI / 2;
      ring.push([tr.x + Math.cos(ang) * s, tr.y + Math.sin(ang) * s, baseZ]);
    }
    for (let k = 0; k < 4; k++) {
      const p0 = ring[k], p1 = ring[(k + 1) % 4];
      pushTri(out, apex, p0, p1, "#2e6b34");
    }
    const tz0 = tr.z, tz1 = tr.z + s * 0.5;
    pushQuad(out,
      [tr.x - 1, tr.y, tz0], [tr.x + 1, tr.y, tz0],
      [tr.x + 1, tr.y, tz1], [tr.x - 1, tr.y, tz1], "#5a4632");
  }
  const huts = island.huts || [];
  for (let i = 0; i < huts.length; i++) {
    const hu = huts[i];
    if (!hu) continue;
    const dx = hu.x - ex, dy = hu.y - ey, dz = hu.z - ez;
    if (Math.hypot(dx, dy, dz) > 4000) continue;
    const w = 8, d = 7, hh = 7, rh = 5;
    const x0 = hu.x - w, x1 = hu.x + w;
    const y0 = hu.y - d, y1 = hu.y + d;
    const z0 = hu.z, z1 = hu.z + hh;
    pushQuad(out, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], "#8a6a44");
    pushQuad(out, [x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], "#8a6a44");
    pushQuad(out, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], "#8a6a44");
    pushQuad(out, [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], "#8a6a44");
    const apex = [hu.x, hu.y, z1 + rh];
    pushTri(out, [x0, y0, z1], [x1, y0, z1], apex, "#a85a32");
    pushTri(out, [x1, y1, z1], [x0, y1, z1], apex, "#a85a32");
    pushTri(out, [x1, y0, z1], [x1, y1, z1], apex, "#a85a32");
    pushTri(out, [x0, y1, z1], [x0, y0, z1], apex, "#a85a32");
  }
  const rw = island.runway;
  if (rw) {
    const rcx = (rw.x0 + rw.x1) / 2, rcy = (rw.y0 + rw.y1) / 2, rcz = rw.z || 2;
    if (Math.hypot(rcx - ex, rcy - ey, rcz - ez) <= 5200) {
      // Medium-grey asphalt: dark enough to read as a runway against the
      // green grass, light enough not to be mistaken for the sea.
      // Drawn in short segments, not one long quad: the painter's
      // algorithm sorts by centre distance, and one 600 m quad sorts
      // behind the nearer terrain triangles and vanishes under them.
      const segLen = 50;
      for (let y = rw.y0; y < rw.y1; y += segLen) {
        const yb = Math.min(y + segLen, rw.y1);
        pushQuad(out,
          [rw.x0, y, rw.z], [rw.x1, y, rw.z],
          [rw.x1, yb, rw.z], [rw.x0, yb, rw.z], "#5a5f66");
      }
      const dz = rw.z + 0.5;
      for (let y = -280; y <= 280; y += 40) {
        pushQuad(out,
          [-1, y - 9, dz], [1, y - 9, dz],
          [1, y + 9, dz], [-1, y + 9, dz], "#e8e8e8");
      }
      const ends = [rw.y0 + 10, rw.y1 - 10];
      for (let e = 0; e < 2; e++) {
        const yc = ends[e];
        for (let k = 0; k < 4; k++) {
          const xc = -22.5 + k * 15;
          pushQuad(out,
            [xc - 3, yc - 6, dz], [xc + 3, yc - 6, dz],
            [xc + 3, yc + 6, dz], [xc - 3, yc + 6, dz], "#e8e8e8");
        }
      }
    }
  }
}
