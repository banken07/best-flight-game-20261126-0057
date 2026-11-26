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

// Raw push: no lighting applied — the caller already shaded the color.
function pushTriRaw(out, xf, a, b, c, color) {
  out.push({ pts: [xf(a), xf(b), xf(c)], color });
}

// Smooth-shaded push: shade ONCE from the average of the three per-vertex
// light factors. Must NOT go through pushTri (which would light a second
// time and darken the fuselage twice over).
function pushTriLit(out, xf, a, b, c, color, la, lb, lc) {
  pushTriRaw(out, xf, a, b, c, shadeHex(color, (la + lb + lc) / 3));
}

function pushQuadLit(out, xf, a, b, c, d, color, la, lb, lc, ld) {
  pushTriLit(out, xf, a, b, c, color, la, lb, lc);
  pushTriLit(out, xf, a, c, d, color, la, lc, ld);
}

const COL_BELLY = "#1e4fa3";
const COL_TOP = "#f2f5f7";
const COL_NOSE = "#d23b2e";
const COL_GLASS = "#3f9fd8";
const COL_GLINT = "#dff4ff";
const COL_DARK = "#22262b";
const COL_TIRE = "#16181c";
const COL_HUB = "#9aa2ab";
const COL_NAV_L = "#ff3b30";
const COL_NAV_R = "#39ff88";
const COL_PANEL = "#163a78";
const COL_SPINE = "#eaf7ff";

function jetValid(jet) {
  return jet &&
    Number.isFinite(jet.x) && Number.isFinite(jet.y) && Number.isFinite(jet.z) &&
    Number.isFinite(jet.headingDeg) && Number.isFinite(jet.pitchDeg) &&
    Number.isFinite(jet.bankDeg) && Number.isFinite(jet.speedMs);
}

export function planeTris(jet) {
  if (!jetValid(jet)) return [];
  const out = [];
  const xf = makeXform(jet);

  // ---- FUSELAGE (10-station, 10-sided loft, smooth vertex-normal shading) ----
  // 10 sides give a flat top edge (72-108 deg band) for the canopy to sit
  // on and a much rounder rear silhouette than the old octagon; the light
  // per ring vertex is the elliptical radial normal, averaged per triangle
  // (same trick as the terrain's vertexLight), so the tube reads smooth.
  const stations = [
    [12, 0.55, 0.60],
    [9, 0.92, 0.98],
    [6, 1.10, 1.18],
    [3, 1.16, 1.26],
    [0, 1.15, 1.24],
    [-3, 1.08, 1.16],
    [-6, 0.95, 1.02],
    [-9, 0.78, 0.84],
    [-11, 0.58, 0.62],
    [-13, 0.34, 0.38]
  ];
  const N = 10;
  const rings = [];
  const ringLights = [];
  for (let i = 0; i < stations.length; i++) {
    const [y, w, h] = stations[i];
    const r = [];
    const l = [];
    for (let k = 0; k < N; k++) {
      const a = k * 2 * Math.PI / N;
      const ca = Math.cos(a), sa = Math.sin(a);
      r.push([w * ca, y, h * sa]);
      const n = norm([ca / w, 0, sa / h]);
      const d = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2];
      l.push(0.72 + 0.28 * Math.max(0, d));
    }
    rings.push(r);
    ringLights.push(l);
  }

  // nose cone
  const noseTip = [0, 14, 0];
  const noseLight = 0.72 + 0.28 * Math.max(0, SUN[1]);
  const r0 = rings[0];
  const l0 = ringLights[0];
  for (let k = 0; k < N; k++) {
    const k2 = (k + 1) % N;
    pushTriLit(out, xf, noseTip, r0[k], r0[k2], COL_NOSE, noseLight, l0[k], l0[k2]);
  }

  // side quads — the top band (k=2, 72-108 deg) is the bright spine stripe
  for (let i = 0; i < rings.length - 1; i++) {
    const ra = rings[i];
    const rb = rings[i + 1];
    const la = ringLights[i];
    const lb = ringLights[i + 1];
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      const a = ra[k], b = ra[k2], c = rb[k2], d = rb[k];
      const mz = (a[2] + b[2] + c[2] + d[2]) / 4;
      let col;
      if (k === 2) col = COL_SPINE;
      else col = mz < 0 ? COL_BELLY : COL_TOP;
      pushQuadLit(out, xf, a, b, c, d, col, la[k], la[k2], lb[k2], lb[k]);
    }
  }

  // tail cap
  const rl = rings[rings.length - 1];
  const ll = ringLights[ringLights.length - 1];
  const tailCenter = [0, -13, 0];
  const tailLight = 0.72 + 0.28 * Math.max(0, -SUN[1]);
  for (let k = 0; k < N; k++) {
    const k2 = (k + 1) % N;
    pushTriLit(out, xf, tailCenter, rl[k2], rl[k], COL_TOP, tailLight, ll[k2], ll[k]);
  }

  // ---- CANOPY (low teardrop half-loft, base sunk into the fuselage top) ----
  const canopySections = [
    [3.5, 0.72, 1.10, 1.55],
    [6, 0.80, 1.05, 1.85],
    [8.5, 0.40, 0.95, 1.45]
  ];
  const arcs = [];
  const arcLights = [];
  for (let i = 0; i < canopySections.length; i++) {
    const [y, w, baseZ, topZ] = canopySections[i];
    const midZ = (baseZ + topZ) / 2;
    const pts = [
      [-w, y, baseZ],
      [-0.75 * w, y, midZ],
      [0, y, topZ],
      [0.75 * w, y, midZ],
      [w, y, baseZ]
    ];
    const ctr = [0, y, baseZ];
    const ls = [];
    for (let p = 0; p < pts.length; p++) {
      const v = [pts[p][0] - ctr[0], pts[p][1] - ctr[1], pts[p][2] - ctr[2]];
      const n = norm(v);
      const d = n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2];
      ls.push(0.72 + 0.28 * Math.max(0, d));
    }
    arcs.push(pts);
    arcLights.push(ls);
  }
  for (let i = 0; i < arcs.length - 1; i++) {
    const A = arcs[i], B = arcs[i + 1];
    const LA = arcLights[i], LB = arcLights[i + 1];
    for (let p = 0; p < 4; p++) {
      pushQuadLit(out, xf, A[p], A[p + 1], B[p + 1], B[p], COL_GLASS,
        LA[p], LA[p + 1], LB[p + 1], LB[p]);
    }
  }
  // front cap (faces forward) and back cap (faces backward)
  const frontCtr = [0, 3.5, 1.10];
  const frontL = arcLights[0];
  const frontCtrLight = 0.72 + 0.28 * Math.max(0, SUN[1]);
  for (let p = 0; p < 4; p++) {
    pushTriLit(out, xf, frontCtr, arcs[0][p], arcs[0][p + 1], COL_GLASS,
      frontCtrLight, frontL[p], frontL[p + 1]);
  }
  const backCtr = [0, 8.5, 0.95];
  const backL = arcLights[2];
  const backCtrLight = 0.72 + 0.28 * Math.max(0, -SUN[1]);
  for (let p = 0; p < 4; p++) {
    pushTriLit(out, xf, backCtr, arcs[2][p + 1], arcs[2][p], COL_GLASS,
      backCtrLight, backL[p + 1], backL[p]);
  }
  // glint streak on the canopy top
  pushQuad(out, xf,
    [-0.45, 4.2, 1.70], [0.45, 4.2, 1.70],
    [0.45, 7.0, 1.90], [-0.45, 7.0, 1.90], COL_GLINT);

  // ---- WINGS ----
  function wing(sign) {
    const s = sign;
    const rootF = [s * 1.0, 4.5, 0.1];
    const rootB = [s * 1.0, -1.5, 0.1];
    const midF = [s * 13, 3.8, 0.7];
    const midB = [s * 13, -2.0, 0.7];
    const tipF = [s * 16, 3.5, 1.1];
    const tipB = [s * 16, -2.5, 1.1];
    // inner panel
    pushQuad(out, xf, rootF, midF, midB, rootB, COL_BELLY);
    // outer tip panel
    pushQuad(out, xf, midF, tipF, tipB, midB, COL_NOSE);
    // aileron
    const aF = [s * 9, -1.6, 0.53];
    const aB = [s * 9, -2.5, 0.53];
    const aF2 = [s * 15.5, -1.6, 1.06];
    const aB2 = [s * 15.5, -2.5, 1.06];
    pushQuad(out, xf, aF, aF2, aB2, aB, COL_PANEL);
    // flap
    const fF = [s * 1.5, -0.7, 0.16];
    const fB = [s * 1.5, -1.5, 0.16];
    const fF2 = [s * 8, -0.7, 0.48];
    const fB2 = [s * 8, -1.5, 0.48];
    pushQuad(out, xf, fF, fF2, fB2, fB, COL_PANEL);
    // winglet: small vertical fin at the tip, swept slightly back
    pushQuad(out, xf,
      [s * 16, 3.2, 1.1], [s * 16, -2.2, 1.1],
      [s * 16, -2.9, 2.5], [s * 16, 2.2, 2.5], COL_NOSE);
  }
  wing(1);
  wing(-1);

  // nav lights
  pushQuad(out, xf,
    [-16.2, 0.2, 1.1], [-15.6, 0.2, 1.1],
    [-15.6, 1.0, 1.1], [-16.2, 1.0, 1.1], COL_NAV_L);
  pushQuad(out, xf,
    [15.6, 0.2, 1.1], [16.2, 0.2, 1.1],
    [16.2, 1.0, 1.1], [15.6, 1.0, 1.1], COL_NAV_R);

  // ---- TAIL (swept, tapered stabilizers) ----
  pushQuad(out, xf,
    [0.8, -9.5, 0.3], [0.8, -12.5, 0.3],
    [6.5, -13.0, 0.9], [6.5, -11.2, 0.9], COL_BELLY);
  pushQuad(out, xf,
    [-0.8, -9.5, 0.3], [-0.8, -12.5, 0.3],
    [-6.5, -13.0, 0.9], [-6.5, -11.2, 0.9], COL_BELLY);

  // fin
  pushQuad(out, xf,
    [0, -9.0, 0.5], [0, -12.8, 0.5],
    [0, -12.4, 4.2], [0, -10.8, 4.4], COL_BELLY);
  // fin tip
  pushQuad(out, xf,
    [-0.12, -11.2, 4.0], [0.12, -11.2, 4.0],
    [0.12, -12.2, 4.2], [-0.12, -12.2, 4.2], COL_NOSE);

  // ---- NOSE SPINNER ----
  const spinApex = [0, 15.2, 0];
  const spinRing = [];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    spinRing.push([0.5 * Math.cos(a), 14, 0.5 * Math.sin(a)]);
  }
  for (let k = 0; k < 4; k++) {
    pushTri(out, xf, spinApex, spinRing[k], spinRing[(k + 1) % 4], COL_DARK);
  }

  // ---- LANDING GEAR ----
  const gearDown = jet.speedMs < 110;
  if (gearDown) {
    const legs = [[0, 9], [1.6, 1], [-1.6, 1]];
    for (const [lx, ly] of legs) {
      const hw = 0.15;
      // strut
      pushQuad(out, xf,
        [lx - hw, ly, -1.2], [lx + hw, ly, -1.2],
        [lx + hw, ly, -2.6], [lx - hw, ly, -2.6], COL_DARK);
      // tire
      pushQuad(out, xf,
        [lx - 0.45, ly, -2.25], [lx + 0.45, ly, -2.25],
        [lx + 0.45, ly, -2.95], [lx - 0.45, ly, -2.95], COL_TIRE);
      // hub
      pushQuad(out, xf,
        [lx - 0.225, ly - 0.02, -2.425], [lx + 0.225, ly - 0.02, -2.425],
        [lx + 0.225, ly - 0.02, -2.775], [lx - 0.225, ly - 0.02, -2.775], COL_HUB);
    }
  }

  return out;
}

export function wingtipPositions(jet) {
  if (!jetValid(jet)) return [];
  const xf = makeXform(jet);
  const L = xf([-16, 0.5, 1.1]);
  const R = xf([16, 0.5, 1.1]);
  return [L, R];
}

export function nosePosition(jet) {
  if (!jetValid(jet)) return null;
  const xf = makeXform(jet);
  return xf([0, 15.2, 0]);
}

const ringBursts = [null, null, null, null, null];
let prevPassedCount = 0;
const dustBursts = [null, null];
let prevDoneArr = null;

function prand(n) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

(function initRingBurstParts() {
  for (let s = 0; s < 5; s++) {
    const parts = [];
    for (let k = 0; k < 36; k++) {
      let dx = prand(k * 3 + s * 100) - 0.5;
      let dy = prand(k * 3 + 1 + s * 100) - 0.5;
      let dz = prand(k * 3 + 2 + s * 100) - 0.5;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= len; dy /= len; dz /= len;
      const sp = 40 + prand(k * 7 + s * 100) * 50;
      parts.push({ dx, dy, dz, sp });
    }
    ringBursts[s] = { parts, t0: -1e9 };
  }
})();

(function initDustBurstParts() {
  for (let s = 0; s < 2; s++) {
    const parts = [];
    for (let k = 0; k < 16; k++) {
      let dx = prand(k * 5 + s * 200) - 0.5;
      let dy = prand(k * 5 + 1 + s * 200) - 0.5;
      let dz = 0.25 + prand(k * 5 + 2 + s * 200) * 0.5;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= len; dy /= len; dz /= len;
      const sp = 8 + prand(k * 11 + s * 200) * 14;
      parts.push({ dx, dy, dz, sp });
    }
    dustBursts[s] = { parts, t0: -1e9 };
  }
})();

export function drawRings(ctx, cam, rings, jet, time) {
  if (!ctx || !cam || !Array.isArray(rings) || !jet) return;
  let nextIdx = -1;
  for (let i = 0; i < rings.length; i++) {
    if (rings[i] && rings[i].passed === false) { nextIdx = i; break; }
  }

  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (!r) continue;
    if (!num(r.x) || !num(r.y) || !num(r.z) || !num(r.radius)) continue;
    const R = r.radius;
    const isNext = (i === nextIdx);
    const passed = r.passed === true;

    const outerPts = [];
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      outerPts.push([r.x + Math.cos(a) * R, r.y, r.z + Math.sin(a) * R]);
    }
    let stroke, lw, glow = false, glowColor;
    if (isNext) {
      stroke = "#7df9ff";
      lw = 4 + 1.5 * Math.sin(time * 3 + i);
      glow = true;
      glowColor = "#7df9ff";
    } else if (passed) {
      stroke = "rgba(90,255,150,0.30)";
      lw = 3;
    } else {
      stroke = "rgba(125,249,255,0.55)";
      lw = 3;
    }
    drawPoly3(ctx, cam, outerPts, { close: true, stroke, lineWidth: lw, glow, glowColor });

    const R2 = R * 1.18;
    const innerPts = [];
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      innerPts.push([r.x + Math.cos(a) * R2, r.y, r.z + Math.sin(a) * R2]);
    }
    let stroke2;
    if (passed) stroke2 = "rgba(90,255,150,0.18)";
    else if (isNext) stroke2 = "rgba(125,249,255,0.35)";
    else stroke2 = "rgba(125,249,255,0.22)";
    drawPoly3(ctx, cam, innerPts, { close: true, stroke: stroke2, lineWidth: 2 });

    if (isNext) {
      const off = time * 0.5;
      for (let c = 0; c < 8; c++) {
        const a = off + (c / 8) * Math.PI * 2;
        const bx = r.x + Math.cos(a) * R * 0.92;
        const bz = r.z + Math.sin(a) * R * 0.92;
        const tx = r.x + Math.cos(a) * R * 0.78;
        const tz = r.z + Math.sin(a) * R * 0.78;
        const w1x = r.x + Math.cos(a - 0.09) * R * 0.86;
        const w1z = r.z + Math.sin(a - 0.09) * R * 0.86;
        const w2x = r.x + Math.cos(a + 0.09) * R * 0.86;
        const w2z = r.z + Math.sin(a + 0.09) * R * 0.86;
        drawPoly3(ctx, cam, [
          [w1x, r.y, w1z],
          [tx, r.y, tz],
          [w2x, r.y, w2z]
        ], { stroke: "#aefcff", lineWidth: 2 });
      }

      if (num(jet.x) && num(jet.y) && num(jet.headingDeg)) {
        const p = project(cam, r.x, r.y, r.z);
        if (p) {
          const hRad = jet.headingDeg * Math.PI / 180;
          const sinH = Math.sin(hRad), cosH = Math.cos(hRad);
          const forward = (r.x - jet.x) * sinH + (r.y - jet.y) * cosH;
          ctx.font = "13px monospace";
          ctx.fillStyle = "#7df9ff";
          ctx.textAlign = "center";
          ctx.fillText(Math.round(forward) + " m", p.x, p.y + R * p.s + 18);
        }
      }
    }
  }

  let passedCount = 0;
  for (let i = 0; i < rings.length; i++) {
    if (rings[i] && rings[i].passed === true) passedCount++;
  }
  if (passedCount < prevPassedCount) {
    for (let s = 0; s < ringBursts.length; s++) {
      if (ringBursts[s]) ringBursts[s].t0 = -1e9;
    }
  }
  prevPassedCount = passedCount;

  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (!r || r.passed !== true) continue;
    if (!num(r.x) || !num(r.y) || !num(r.z)) continue;
    const slot = (r.index != null && r.index >= 0 && r.index < 5) ? r.index : (i % 5);
    const b = ringBursts[slot];
    if (b && b.t0 < -1e8) {
      b.t0 = time;
      b.cx = r.x; b.cy = r.y; b.cz = r.z;
      // The burst rides the plane's own velocity: the plane outruns a
      // static burst in ~0.5 s (72 m/s), so without this the whole cloud
      // ends up behind the chase camera almost immediately.
      const hRad = (num(jet.headingDeg) ? jet.headingDeg : 0) * Math.PI / 180;
      const sp = num(jet.speedMs) ? jet.speedMs : 0;
      b.vx = Math.sin(hRad) * sp;
      b.vy = Math.cos(hRad) * sp;
      b.vz = num(jet.vspeedMs) ? jet.vspeedMs : 0;
    }
  }

  for (let s = 0; s < ringBursts.length; s++) {
    const b = ringBursts[s];
    if (!b || b.t0 < -1e8) continue;
    const age = time - b.t0;
    if (age < 0 || age >= 2.0) continue;
    const parts = b.parts;
    for (let k = 0; k < parts.length; k++) {
      const pt = parts[k];
      const px = b.cx + pt.dx * (age * pt.sp) + (b.vx || 0) * age;
      const py = b.cy + pt.dy * (age * pt.sp) + (b.vy || 0) * age;
      const pz = b.cz + pt.dz * (age * pt.sp) + (b.vz || 0) * age;
      const p = project(cam, px, py, pz);
      if (!p) continue;
      const alpha = 1.0 * (1 - age / 2.0);
      const rad = 6 + 2 * (1 - age / 2.0);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(160,250,255," + alpha.toFixed(2) + ")";
      ctx.fill();
    }
  }
}

export function drawDropZones(ctx, cam, zones, time, doneArr, hutZ) {
  if (!ctx || !cam || !Array.isArray(zones)) return;
  const useArr = Array.isArray(doneArr);

  if (prevDoneArr && prevDoneArr.length === zones.length) {
    let prevCount = 0, curCount = 0;
    for (let i = 0; i < zones.length; i++) {
      if (prevDoneArr[i]) prevCount++;
      const d = useArr ? doneArr[i] === true : (zones[i] && zones[i].done === true);
      if (d) curCount++;
    }
    if (curCount < prevCount) {
      for (let s = 0; s < dustBursts.length; s++) {
        if (dustBursts[s]) dustBursts[s].t0 = -1e9;
      }
    }
  }

  const newDone = [];
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z) { newDone.push(false); continue; }
    if (!num(z.x) || !num(z.y) || !num(z.radius)) { newDone.push(false); continue; }
    const done = useArr ? doneArr[i] === true : z.done === true;
    newDone.push(done);
    const R = z.radius;
    const gz = (hutZ && Number.isFinite(hutZ[i])) ? hutZ[i] : 2;

    if (done) {
      const p1 = project(cam, z.x, z.y, gz + 40);
      if (p1) {
        ctx.fillStyle = "#ffd27a";
        ctx.fillRect(p1.x - 5, p1.y - 5, 10, 10);
      }
      const p2 = project(cam, z.x, z.y, gz + 82);
      if (p2) {
        ctx.font = "14px monospace";
        ctx.fillStyle = "#ffd27a";
        ctx.textAlign = "center";
        ctx.fillText("SUPPLIED", p2.x, p2.y);
      }

      const wasDone = prevDoneArr && prevDoneArr.length === zones.length ? prevDoneArr[i] === true : false;
      if (!wasDone) {
        const slot = i % 2;
        const b = dustBursts[slot];
        if (b) {
          b.t0 = time;
          b.cx = z.x; b.cy = z.y; b.cz = gz + 6;
        }
      }
    } else {
      const A = 0.5 + 0.3 * Math.sin(time * 4);
      const ringPts = [];
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2;
        ringPts.push([z.x + Math.cos(a) * R, z.y, gz + 2]);
      }
      drawPoly3(ctx, cam, ringPts, { close: true, stroke: "rgba(57,255,136," + A.toFixed(3) + ")", lineWidth: 3 });

      const R2 = R * (0.82 + 0.06 * Math.sin(time * 4 + 1.5));
      const ring2Pts = [];
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2;
        ring2Pts.push([z.x + Math.cos(a) * R2, z.y, gz + 2]);
      }
      drawPoly3(ctx, cam, ring2Pts, { close: true, stroke: "rgba(57,255,136,0.6)", lineWidth: 2 });

      const topPts = [];
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2;
        topPts.push([z.x + Math.cos(a) * R, z.y, gz + 70]);
      }
      drawPoly3(ctx, cam, topPts, { close: true, stroke: "rgba(57,255,136,0.5)", lineWidth: 2 });

      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const lx = z.x + Math.cos(a) * R;
        drawPoly3(ctx, cam, [
          [lx, z.y, gz + 2],
          [lx, z.y, gz + 70]
        ], { stroke: "rgba(57,255,136,0.35)", lineWidth: 1 });
      }

      const p = project(cam, z.x, z.y, gz + 82);
      if (p) {
        ctx.font = "14px monospace";
        ctx.fillStyle = "#39ff88";
        ctx.textAlign = "center";
        ctx.fillText("DROP " + (i + 1), p.x, p.y);
      }
    }
  }

  prevDoneArr = newDone;

  for (let s = 0; s < dustBursts.length; s++) {
    const b = dustBursts[s];
    if (!b || b.t0 < -1e8) continue;
    const age = time - b.t0;
    if (age < 0 || age >= 2.5) continue;
    const parts = b.parts;
    for (let k = 0; k < parts.length; k++) {
      const pt = parts[k];
      const px = b.cx + pt.dx * (age * pt.sp);
      const py = b.cy + pt.dy * (age * pt.sp);
      const pz = b.cz + pt.dz * (age * pt.sp) + age * age * 6;
      const p = project(cam, px, py, pz);
      if (!p) continue;
      const rad = 5 + age * 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(203,184,154," + (0.6 * (1 - age / 2.5)).toFixed(2) + ")";
      ctx.fill();
    }
  }
}
