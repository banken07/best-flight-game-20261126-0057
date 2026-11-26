import { project, drawPoly3 } from "./gl3d.js";

const num = v => typeof v === "number" && isFinite(v);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function hexToRgb(h) {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  const c = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
function shadeHex(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * f, g * f, b * f);
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function triNormal(a, b, c) {
  return norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
}

const SUN = norm([0.5, 0.35, 1]);

function rotY(p, a) { // bank around forward y: +x right, +z up
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
function rotX(p, a) { // pitch around right x: +y forward tilts toward +z up
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
function rotZ(p, a) { // heading around world up z
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

function makeXform(jet) {
  const bank = (jet.bankDeg || 0) * Math.PI / 180;
  const pitch = (jet.pitchDeg || 0) * Math.PI / 180;
  const head = (jet.headingDeg || 0) * Math.PI / 180;
  return p => {
    // Bank right (bankDeg > 0) drops the right wing: rotY with +bank.
    // Heading 90 must point east (+x): rotZ with -head.
    let q = rotY(p, bank);
    q = rotX(q, pitch);
    q = rotZ(q, -head);
    return [q[0] + jet.x, q[1] + jet.y, q[2] + jet.z];
  };
}

function pushTri(out, xf, a, b, c, color) {
  const A = xf(a), B = xf(b), C = xf(c);
  const n = triNormal(A, B, C);
  const d = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2];
  const light = 0.72 + 0.28 * Math.max(0, d);
  out.push({ pts: [A, B, C], color: shadeHex(color, light) });
}

function pushQuad(out, xf, a, b, c, d, color) {
  pushTri(out, xf, a, b, c, color);
  pushTri(out, xf, a, c, d, color);
}

function ringCorners(y, w, h) {
  return [
    [0, y, h],   // top
    [w, y, 0],   // right
    [0, y, -h],  // bottom
    [-w, y, 0],  // left
  ];
}

export function planeTris(jet) {
  if (!jet) return [];
  for (const k of ["x", "y", "z", "headingDeg", "pitchDeg", "bankDeg", "speedMs"]) {
    if (!num(jet[k])) return [];
  }
  const out = [];
  const xf = makeXform(jet);
  const WHITE = "#f2f5f7";
  const BLUE = "#1e4fa3";
  const RED = "#d23b2e";
  const DARK = "#22262b";
  const CANOPY = "#7ec8e8";

  // Fuselage stations
  const stations = [
    { y: 8, w: 0.8, h: 0.9 },
    { y: 0, w: 1.1, h: 1.2 },
    { y: -8, w: 0.9, h: 1.0 },
    { y: -13, w: 0.4, h: 0.6 },
  ];
  const rings = stations.map(s => ringCorners(s.y, s.w, s.h));
  // side quads between consecutive stations
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      pushQuad(out, xf, A[k], A[k2], B[k2], B[k], WHITE);
    }
  }
  // nose cone from station 8 to point (0,14,0)
  const nose = [0, 14, 0];
  const R0 = rings[0];
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    pushTri(out, xf, nose, R0[k], R0[k2], WHITE);
  }
  // tail cap at station -13
  const RT = rings[rings.length - 1];
  pushTri(out, xf, RT[0], RT[1], RT[2], WHITE);
  pushTri(out, xf, RT[0], RT[2], RT[3], WHITE);

  // Main wings
  const rwRootL = [1.0, 4.5, 0.1];
  const rwRootT = [1.0, -1.5, 0.1];
  const rwTipT = [16, -2.5, 1.1];
  const rwTipL = [16, 3.5, 1.1];
  const lwRootL = [-1.0, 4.5, 0.1];
  const lwRootT = [-1.0, -1.5, 0.1];
  const lwTipT = [-16, -2.5, 1.1];
  const lwTipL = [-16, 3.5, 1.1];
  // inner wing (root to x=13)
  const rwMidL = [13, 3.9, 1.0];
  const rwMidT = [13, -2.4, 1.0];
  const lwMidL = [-13, 3.9, 1.0];
  const lwMidT = [-13, -2.4, 1.0];
  pushQuad(out, xf, rwRootL, rwRootT, rwMidT, rwMidL, BLUE);
  pushQuad(out, xf, lwRootL, lwRootT, lwMidT, lwMidL, BLUE);
  // wingtips (outer 3m)
  pushQuad(out, xf, rwMidL, rwMidT, rwTipT, rwTipL, RED);
  pushQuad(out, xf, lwMidL, lwMidT, lwTipT, lwTipL, RED);

  // Tailplane
  pushQuad(out, xf, [0.8, -9.5, 0.3], [0.8, -12.5, 0.3], [7, -13, 0.8], [7, -10, 0.8], BLUE);
  pushQuad(out, xf, [-0.8, -9.5, 0.3], [-0.8, -12.5, 0.3], [-7, -13, 0.8], [-7, -10, 0.8], BLUE);

  // Fin
  pushQuad(out, xf, [0, -9.5, 0.5], [0, -12.5, 0.5], [0, -12.5, 4.2], [0, -9.5, 4.2], BLUE);

  // Canopy box: x -0.9..0.9, y 4..9, z 1.0..2.3
  const cTop = [[-0.9, 4, 2.3], [0.9, 4, 2.3], [0.9, 9, 2.3], [-0.9, 9, 2.3]];
  const cBot = [[-0.9, 4, 1.0], [0.9, 4, 1.0], [0.9, 9, 1.0], [-0.9, 9, 1.0]];
  pushQuad(out, xf, cTop[0], cTop[1], cTop[2], cTop[3], CANOPY); // top
  pushQuad(out, xf, cBot[0], cBot[1], cTop[1], cTop[0], CANOPY); // front (y=4)
  pushQuad(out, xf, cBot[3], cBot[2], cTop[2], cTop[3], CANOPY); // back (y=9)
  pushQuad(out, xf, cBot[0], cBot[3], cTop[3], cTop[0], CANOPY); // left
  pushQuad(out, xf, cBot[1], cBot[2], cTop[2], cTop[1], CANOPY); // right

  // Nose spinner
  const apex = [0, 15.2, 0];
  const base = [];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    base.push([0.5 * Math.cos(a), 14, 0.5 * Math.sin(a)]);
  }
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    pushTri(out, xf, apex, base[k], base[k2], DARK);
  }

  // Landing gear
  function strut(x, y, zTop, zBot) {
    const w = 0.15;
    pushQuad(out, xf, [x - w, y, zTop], [x + w, y, zTop], [x + w, y, zBot], [x - w, y, zBot], DARK);
  }
  function wheel(x, y, z) {
    const w = 0.45, h = 0.35;
    pushQuad(out, xf, [x - w, y, z - h], [x + w, y, z - h], [x + w, y, z + h], [x - w, y, z + h], DARK);
  }
  strut(0, 9, -1.2, -2.6); wheel(0, 9, -2.6);
  strut(1.6, 1, -1.2, -2.6); wheel(1.6, 1, -2.6);
  strut(-1.6, 1, -1.2, -2.6); wheel(-1.6, 1, -2.6);

  return out;
}

export function drawRings(ctx, cam, rings, jet) {
  if (!ctx || !cam || !Array.isArray(rings) || !jet) return;
  if (!num(jet.x) || !num(jet.y) || !num(jet.headingDeg)) return;
  const headingRad = jet.headingDeg * Math.PI / 180;
  const sinH = Math.sin(headingRad), cosH = Math.cos(headingRad);

  let nextIdx = -1;
  for (let i = 0; i < rings.length; i++) {
    if (rings[i] && rings[i].passed === false) { nextIdx = i; break; }
  }

  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (!r || !num(r.x) || !num(r.y) || !num(r.z) || !num(r.radius)) continue;
    const R = r.radius;
    const pts = [];
    for (let k = 0; k < 20; k++) {
      const a = k / 20 * Math.PI * 2;
      pts.push([r.x + R * Math.cos(a), r.y, r.z + R * Math.sin(a)]);
    }
    const isNext = i === nextIdx;
    const isPassed = r.passed === true;

    if (isPassed) {
      drawPoly3(ctx, cam, pts, { stroke: "rgba(90,255,150,0.35)", lineWidth: 3, close: true });
    } else if (isNext) {
      drawPoly3(ctx, cam, pts, { stroke: "#7df9ff", lineWidth: 5, glow: true, glowColor: "#7df9ff", close: true });
      const inner = [];
      const R2 = R * 0.55;
      for (let k = 0; k < 20; k++) {
        const a = k / 20 * Math.PI * 2;
        inner.push([r.x + R2 * Math.cos(a), r.y, r.z + R2 * Math.sin(a)]);
      }
      drawPoly3(ctx, cam, inner, { stroke: "rgba(125,249,255,0.4)", lineWidth: 2, close: true });
      const p = project(cam, r.x, r.y, r.z);
      if (p) {
        const radiusPx = R * p.s;
        const forward = (r.x - jet.x) * sinH + (r.y - jet.y) * cosH;
        ctx.font = "13px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#7df9ff";
        ctx.fillText(Math.round(forward) + " m", p.x, p.y + radiusPx + 18);
      }
    } else {
      drawPoly3(ctx, cam, pts, { stroke: "rgba(125,249,255,0.55)", lineWidth: 3, close: true });
    }
  }
}

export function drawDropZones(ctx, cam, zones, time) {
  if (!ctx || !cam || !Array.isArray(zones)) return;
  const t = num(time) ? time : 0;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z || !num(z.x) || !num(z.y) || !num(z.radius)) continue;
    const R = z.radius;
    const ground = [], top = [];
    for (let k = 0; k < 20; k++) {
      const a = k / 20 * Math.PI * 2;
      ground.push([z.x + R * Math.cos(a), z.y + R * Math.sin(a), 2]);
      top.push([z.x + R * Math.cos(a), z.y + R * Math.sin(a), 70]);
    }
    if (z.done === true) {
      const p = project(cam, z.x, z.y, 40);
      if (p) {
        ctx.fillStyle = "#ffd27a";
        ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
      }
      const pl = project(cam, z.x, z.y, 82);
      if (pl) {
        ctx.font = "14px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffd27a";
        ctx.fillText("SUPPLIED", pl.x, pl.y);
      }
    } else {
      const alpha = 0.5 + 0.3 * Math.sin(t * 4);
      drawPoly3(ctx, cam, ground, { stroke: "rgba(57,255,136," + alpha.toFixed(2) + ")", lineWidth: 3, close: true });
      drawPoly3(ctx, cam, top, { stroke: "rgba(57,255,136,0.5)", lineWidth: 2, close: true });
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        const x = z.x + R * Math.cos(a), y = z.y + R * Math.sin(a);
        drawPoly3(ctx, cam, [[x, y, 2], [x, y, 70]], { stroke: "rgba(57,255,136,0.35)", lineWidth: 1 });
      }
      const pl = project(cam, z.x, z.y, 82);
      if (pl) {
        ctx.font = "14px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#39ff88";
        ctx.fillText("DROP " + (i + 1), pl.x, pl.y);
      }
    }
  }
}
