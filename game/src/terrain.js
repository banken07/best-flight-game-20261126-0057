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

function vertexLight(n, h) {
  const d = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2];
  const diffuse = Math.max(0, d);
  const hemi = 0.5 + 0.5 * n[2];
  const skyR = 0.96, skyG = 1.01, skyB = 1.10;
  const gndR = 1.05, gndG = 0.97, gndB = 0.88;
  const ambR = (gndR + (skyR - gndR) * hemi) * 0.62;
  const ambG = (gndG + (skyG - gndG) * hemi) * 0.62;
  const ambB = (gndB + (skyB - gndB) * hemi) * 0.62;
  const sunR = 1.0 * diffuse * 0.55;
  const sunG = 0.95 * diffuse * 0.55;
  const sunB = 0.85 * diffuse * 0.55;
  const nd = -(n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
  const shadow = 1 - 0.22 * smoothstep(0.25, 0.7, nd) * smoothstep(0.35, 0.8, 1 - n[2]);
  const ao = 0.86 + 0.14 * smoothstep(0, 70, h);
  const s = shadow * ao;
  return [
    clamp((ambR + sunR) * s, 0, 1.15),
    clamp((ambG + sunG) * s, 0, 1.15),
    clamp((ambB + sunB) * s, 0, 1.15)
  ];
}

function sunLight(n) {
  const l = vertexLight(n, 40);
  return (l[0] + l[1] + l[2]) / 3;
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
  // The flat strip is 90 m half-wide, NOT 45: the terrain grid step is ~77 m,
  // so with a 45 m flat zone the only flat vertices are on the centreline and
  // the triangles spanning to the next vertices (±77 m) slope steeply up and
  // BURY the 60 m runway (z=2) under ~35 m of terrain at its edges — the
  // runway was invisible from the air. At 90 m the ±77 m vertices are flat
  // and the strip sits on truly level ground.
  const inY = y >= -1600 && y <= 300;
  if (inY) {
    if (dRun < 90) h = 0;
    else if (dRun < 150) {
      const t = smoothstep(90, 150, dRun);
      h = lerp(0, h, t);
    }
  }
  return clamp(h, -12, 220);
}

function terrainColorSmooth(h, r, x, y, seed) {
  let col = "#d8c08a";
  const w1 = smoothstep(3, 16, h);
  col = hexLerp(col, "#79b657", w1);
  const w2 = smoothstep(35, 60, h);
  col = hexLerp(col, "#4d8a3a", w2);
  const w3 = smoothstep(85, 125, h);
  col = hexLerp(col, "#8a6a44", w3);
  const w4 = smoothstep(150, 210, h);
  col = hexLerp(col, "#7a7568", w4);
  const beachIn = smoothstep(950, 1000, r);
  const beachOut = 1 - smoothstep(1100, 1150, r);
  const beachW = beachIn * beachOut * 0.85;
  if (beachW > 0) col = hexLerp(col, "#d8c08a", beachW);
  const cs = 260;
  const gx = x / cs, gy = y / cs;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(ix, iy, seed + 555);
  const n10 = hash2(ix + 1, iy, seed + 555);
  const n01 = hash2(ix, iy + 1, seed + 555);
  const n11 = hash2(ix + 1, iy + 1, seed + 555);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  const noise = nx0 + (nx1 - nx0) * sy;
  const bright = 1 + (noise - 0.5) * 0.08;
  const rgb = hexToRgb(col);
  return rgbToHex(rgb[0] * bright, rgb[1] * bright, rgb[2] * bright);
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
  const normals = new Float64Array((N + 1) * (N + 1) * 3);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const iL = i > 0 ? i - 1 : i;
      const iR = i < N ? i + 1 : i;
      const jD = j > 0 ? j - 1 : j;
      const jU = j < N ? j + 1 : j;
      const hL = heights[j * (N + 1) + iL];
      const hR = heights[j * (N + 1) + iR];
      const hD = heights[jD * (N + 1) + i];
      const hU = heights[jU * (N + 1) + i];
      const dx = (iR - iL) * step;
      const dy = (jU - jD) * step;
      const dhdx = dx > 0 ? (hR - hL) / dx : 0;
      const dhdy = dy > 0 ? (hU - hD) / dy : 0;
      const n = norm([-dhdx, -dhdy, 1]);
      const k = (j * (N + 1) + i) * 3;
      normals[k] = n[0];
      normals[k + 1] = n[1];
      normals[k + 2] = n[2];
    }
  }
  const lights = new Float64Array((N + 1) * (N + 1) * 3);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const k = (j * (N + 1) + i) * 3;
      const n = [normals[k], normals[k + 1], normals[k + 2]];
      const h = heights[j * (N + 1) + i];
      const l = vertexLight(n, h);
      lights[k] = l[0];
      lights[k + 1] = l[1];
      lights[k + 2] = l[2];
    }
  }
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
      const idx = [
        [j * (N + 1) + i, j * (N + 1) + i + 1, (j + 1) * (N + 1) + i + 1],
        [j * (N + 1) + i, (j + 1) * (N + 1) + i + 1, (j + 1) * (N + 1) + i]
      ];
      for (let q = 0; q < 2; q++) {
        const t = quads[q];
        const ccx = (t[0][0] + t[1][0] + t[2][0]) / 3;
        const ccy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        if (t[0][2] <= 0.5 && t[1][2] <= 0.5 && t[2][2] <= 0.5 && Math.hypot(ccx, ccy) > 1100) continue;
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
        const cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        const cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
        const r = Math.hypot(cx, cy);
        const base = terrainColorSmooth(cz, r, cx, cy, seed);
        const ia = idx[q][0] * 3, ib = idx[q][1] * 3, ic = idx[q][2] * 3;
        const lr = (lights[ia] + lights[ib] + lights[ic]) / 3;
        const lg = (lights[ia + 1] + lights[ib + 1] + lights[ic + 1]) / 3;
        const lb = (lights[ia + 2] + lights[ib + 2] + lights[ic + 2]) / 3;
        const rgb = hexToRgb(base);
        const col = rgbToHex(rgb[0] * lr, rgb[1] * lg, rgb[2] * lb);
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
}

// The runway is collected separately from the terrain: it is drawn in its
// own drawTris pass AFTER the terrain (see render.js), so a terrain
// triangle can never painter-sort in front of it and bury the strip.
export function collectRunwayTris(island, cam, out) {
  if (!island || !cam || !out) return;
  const ex = cam.ex || 0, ey = cam.ey || 0, ez = cam.ez || 0;
  const rw = island.runway;
  if (rw) {
    const rcx = (rw.x0 + rw.x1) / 2, rcy = (rw.y0 + rw.y1) / 2, rcz = rw.z || 2;
    if (Math.hypot(rcx - ex, rcy - ey, rcz - ez) <= 5200) {
      const segLen = 50;
      const dz = rw.z + 0.5;
      for (let y = rw.y0; y < rw.y1; y += segLen) {
        const yb = Math.min(y + segLen, rw.y1);
        pushQuad(out,
          [rw.x0, y, rw.z], [rw.x1, y, rw.z],
          [rw.x1, yb, rw.z], [rw.x0, yb, rw.z], "#5a5f66");
        pushQuad(out,
          [-38, y, rw.z], [-30, y, rw.z],
          [-30, yb, rw.z], [-38, yb, rw.z], "#4a4f55");
        pushQuad(out,
          [30, y, rw.z], [38, y, rw.z],
          [38, yb, rw.z], [30, yb, rw.z], "#4a4f55");
        pushQuad(out,
          [-29, y, dz], [-27, y, dz],
          [-27, yb, dz], [-29, yb, dz], "#f0f0f0");
        pushQuad(out,
          [27, y, dz], [29, y, dz],
          [29, yb, dz], [27, yb, dz], "#f0f0f0");
      }
      for (let y = -280; y <= 280; y += 40) {
        pushQuad(out,
          [-1.5, y - 9, dz], [1.5, y - 9, dz],
          [1.5, y + 9, dz], [-1.5, y + 9, dz], "#e8e8e8");
      }
      const ends = [rw.y0 + 10, rw.y1 - 10];
      for (let e = 0; e < 2; e++) {
        const yc = ends[e];
        for (let k = 0; k < 6; k++) {
          const xc = -26.25 + k * 10.5;
          pushQuad(out,
            [xc - 3, yc - 6, dz], [xc + 3, yc - 6, dz],
            [xc + 3, yc + 6, dz], [xc - 3, yc + 6, dz], "#e8e8e8");
        }
      }
      for (let y = -300; y <= 300; y += 50) {
        pushQuad(out,
          [-31.25, y - 1.25, dz + 0.3], [-28.75, y - 1.25, dz + 0.3],
          [-28.75, y + 1.25, dz + 0.3], [-31.25, y + 1.25, dz + 0.3], "#ffe9a8");
        pushQuad(out,
          [28.75, y - 1.25, dz + 0.3], [31.25, y - 1.25, dz + 0.3],
          [31.25, y + 1.25, dz + 0.3], [28.75, y + 1.25, dz + 0.3], "#ffe9a8");
      }
    }
  }
}
