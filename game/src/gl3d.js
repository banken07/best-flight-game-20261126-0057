// gl3d.js — compact 3D helpers for a chase-view flight game. Canvas 2D only, no deps.

export const W = 1280;
export const H = 720;
export const CX = 640;
export const CY = 360;
export const FOCAL = 720;

// ---------- internal helpers ----------

// Coerce anything to a finite number, else fallback.
const num = (v, fallback = 0) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const dot = (ax, ay, az, bx, by, bz) => ax * bx + ay * by + az * bz;

const cross = (ax, ay, az, bx, by, bz) => [
  ay * bz - az * by,
  az * bx - ax * bz,
  ax * by - ay * bx,
];

// Normalize; returns fallback vector when degenerate/NaN.
const norm = (x, y, z, fbx = 0, fby = 0, fbz = 1) => {
  const l = Math.hypot(x, y, z);
  if (!Number.isFinite(l) || l < 1e-9) return [fbx, fby, fbz];
  return [x / l, y / l, z / l];
};

// "#rgb"/"#rrggbb" -> [r,g,b] or null.
const parseHex = (h) => {
  if (typeof h !== "string") return null;
  let s = h.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
};

const rgbStr = (r, g, b) => `rgb(${r},${g},${b})`;

// ---------- exported API ----------

// Chase camera: behind (-34 fwd) and above (+11 up) the jet — pulled back
// slightly from -30/+10 so the sleeker aircraft sits a touch smaller and
// more forward-balanced in frame. Render-only: nothing in the physics,
// autopilot, or scoring reads the camera (see render.js smoothedCam).
export const cameraFor = (jet) => {
  const j = jet && typeof jet === "object" ? jet : {};
  const jx = num(j.x), jy = num(j.y), jz = num(j.z);
  const h = (num(j.headingDeg) * Math.PI) / 180;
  const pitch = (num(j.pitchDeg) * 0.3 - 6) * (Math.PI / 180);

  const ch = Math.cos(h), sh = Math.sin(h);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  // Forward (unit by construction).
  const fx = sh * cp, fy = ch * cp, fz = sp;

  // Right = normalize(cross(fwd, up0)); fall back to horizontal right when degenerate.
  let [rx, ry, rz] = norm(...cross(fx, fy, fz, 0, 0, 1), ch, -sh, 0);
  // Up = cross(right, fwd).
  let [ux, uy, uz] = norm(...cross(rx, ry, rz, fx, fy, fz), 0, 0, 1);

  // Final NaN guard.
  if (!Number.isFinite(fx + fy + fz)) { /* unreachable, kept for safety */ }
  if (!Number.isFinite(rx + ry + rz)) { rx = 1; ry = 0; rz = 0; }
  if (!Number.isFinite(ux + uy + uz)) { ux = 0; uy = 0; uz = 1; }

  const ex = jx - fx * 34 + ux * 11;
  const ey = jy - fy * 34 + uy * 11;
  const ez = jz - fz * 34 + uz * 11;

  return {
    ex, ey, ez,
    fx, fy, fz,
    rx, ry, rz,
    ux, uy, uz,
    f: FOCAL, cx: CX, cy: CY,
  };
};

// World point -> camera space { r, u, d } or null (behind/near or bad data).
export const toCam = (cam, x, y, z) => {
  if (!cam) return null;
  const px = num(x), py = num(y), pz = num(z);
  const dx = px - num(cam.ex), dy = py - num(cam.ey), dz = pz - num(cam.ez);
  const d = dot(dx, dy, dz, num(cam.fx), num(cam.fy), num(cam.fz));
  const r = dot(dx, dy, dz, num(cam.rx), num(cam.ry), num(cam.rz));
  const u = dot(dx, dy, dz, num(cam.ux), num(cam.uy), num(cam.uz));
  if (!Number.isFinite(d) || !Number.isFinite(r) || !Number.isFinite(u)) return null;
  if (d < 4) return null;
  return { r, u, d };
};

// World point -> screen { x, y, s, d } or null.
export const project = (cam, x, y, z) => {
  const c = toCam(cam, x, y, z);
  if (!c) return null;
  const f = num(cam && cam.f, FOCAL);
  const cx = num(cam && cam.cx, CX);
  const cy = num(cam && cam.cy, CY);
  const sx = cx + (c.r * f) / c.d;
  const sy = cy - (c.u * f) / c.d;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  return { x: sx, y: sy, s: f / c.d, d: c.d };
};

// Screen y of a far point straight ahead (the horizon line), or 300.
export const horizonY = (cam) => {
  if (!cam) return 300;
  const p = project(
    cam,
    num(cam.ex) + num(cam.fx) * 9000,
    num(cam.ey) + num(cam.fy) * 9000,
    num(cam.ez) + num(cam.fz) * 9000,
  );
  return p ? p.y : 300;
};

// Multiply a "#rrggbb" color by f, return "rgb(r,g,b)". Bad input returns hex unchanged.
export const shade = (hex, f) => {
  const c = parseHex(hex);
  if (!c) return hex;
  const k = num(f, 1);
  return rgbStr(
    Math.round(clamp(c[0] * k, 0, 255)),
    Math.round(clamp(c[1] * k, 0, 255)),
    Math.round(clamp(c[2] * k, 0, 255)),
  );
};

// Linear interpolate between two "#rrggbb" colors, t clamped 0..1.
export const mix = (hexA, hexB, t) => {
  const A = parseHex(hexA);
  const B = parseHex(hexB);
  if (!A || !B) return typeof hexA === "string" ? hexA : "rgb(0,0,0)";
  const k = clamp(num(t, 0), 0, 1);
  return rgbStr(
    Math.round(A[0] + (B[0] - A[0]) * k),
    Math.round(A[1] + (B[1] - A[1]) * k),
    Math.round(A[2] + (B[2] - A[2]) * k),
  );
};

// 0 below 900 m, 1 above 6000 m, linear between.
export const fogFactor = (d) => {
  const x = num(d, 0);
  if (x <= 900) return 0;
  if (x >= 6000) return 1;
  return (x - 900) / 5100;
};

// Painter-sorted triangle fill. tris: [{ pts: [[x,y,z]x3], color: "#rrggbb" }].
// Returns the number of triangles actually drawn.
export const drawTris = (ctx, cam, tris, fogHex) => {
  if (!ctx || !cam || !Array.isArray(tris) || tris.length === 0) return 0;
  const fog = parseHex(fogHex) ? fogHex : "#9db4cc";
  const list = [];
  for (let i = 0; i < tris.length; i += 1) {
    const t = tris[i];
    if (!t || !Array.isArray(t.pts) || t.pts.length < 3) continue;
    let sum = 0;
    let cnt = 0;
    for (let k = 0; k < 3; k += 1) {
      const p = t.pts[k];
      const c = toCam(cam, p && p[0], p && p[1], p && p[2]);
      if (c) { sum += c.d; cnt += 1; }
    }
    list.push({ t, depth: cnt ? sum / cnt : 1e9 });
  }
  list.sort((a, b) => b.depth - a.depth);
  let drawn = 0;
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i].t;
    const p0 = project(cam, t.pts[0][0], t.pts[0][1], t.pts[0][2]);
    const p1 = project(cam, t.pts[1][0], t.pts[1][1], t.pts[1][2]);
    const p2 = project(cam, t.pts[2][0], t.pts[2][1], t.pts[2][2]);
    if (!p0 || !p1 || !p2) continue;
    if ((p0.x < -200 && p1.x < -200 && p2.x < -200) ||
        (p0.x > 1480 && p1.x > 1480 && p2.x > 1480) ||
        (p0.y < -200 && p1.y < -200 && p2.y < -200) ||
        (p0.y > 920 && p1.y > 920 && p2.y > 920)) continue;
    const area = Math.abs((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)) * 0.5;
    if (!(area >= 0.5)) continue;
    const avgD = (p0.d + p1.d + p2.d) / 3;
    ctx.fillStyle = mix(t.color, fog, fogFactor(avgD));
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
    drawn += 1;
  }
  return drawn;
};

// Project a 3D polyline and stroke/fill it. Returns false when any point is behind the camera.
export const drawPoly3 = (ctx, cam, pts, opts) => {
  if (!ctx || !cam || !Array.isArray(pts) || pts.length < 2) return false;
  const o = opts && typeof opts === "object" ? opts : {};
  const screen = [];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = project(cam, p && p[0], p && p[1], p && p[2]);
    if (!q) return false;
    screen.push(q);
  }
  ctx.beginPath();
  ctx.moveTo(screen[0].x, screen[0].y);
  for (let i = 1; i < screen.length; i += 1) ctx.lineTo(screen[i].x, screen[i].y);
  if (o.close) ctx.closePath();
  if (o.fill) {
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    const lw = num(o.lineWidth, 2);
    ctx.lineWidth = lw > 0 ? lw : 2;
    if (o.glow) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = o.glowColor || o.stroke;
    }
    ctx.stroke();
    if (o.glow) ctx.shadowBlur = 0;
  }
  return true;
};
