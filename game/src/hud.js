// game/src/hud.js
// Canvas 2D HUD for Atoll Run. All drawing is done on a single 1280x720 canvas.

const ACCENT = "#7df9ff";
const AMBER = "#ffb347";
const GREEN = "#39ff88";
const RED = "#ff5a5a";

// ---------------------------------------------------------------------------
// Gradient cache: keyed by "w,h" so we never rebuild the same gradient twice.
// ---------------------------------------------------------------------------
const glassGradCache = new Map();

function getGlassGradient(ctx, w, h) {
  const key = w + "," + h;
  let g = glassGradCache.get(key);
  if (g) return g;
  g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(10,26,40,0.72)");
  g.addColorStop(1, "rgba(4,12,20,0.58)");
  glassGradCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------
// Rounded rect path helper (also used by main.js for the title-card backing).
// ---------------------------------------------------------------------------
export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Glass panel: rounded rect, vertical gradient fill, accent border, inner
// top highlight. Gradient is cached per (w,h).
// ---------------------------------------------------------------------------
export function glassBox(ctx, x, y, w, h, r) {
  const rr = (r === undefined) ? 8 : r;
  ctx.save();
  // Translate first, then build the path in local (0,0,w,h) space: the
  // cached gradient is defined over (0,0)-(0,h) in that same local space,
  // so fill, border and highlight all land exactly on the box.
  ctx.translate(x, y);
  roundRectPath(ctx, 0, 0, w, h, rr);
  ctx.fillStyle = getGlassGradient(ctx, w, h);
  ctx.fill();
  // Border
  roundRectPath(ctx, 0.5, 0.5, w - 1, h - 1, rr);
  ctx.strokeStyle = "rgba(125,249,255,0.42)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Inner top highlight
  ctx.beginPath();
  ctx.moveTo(rr, 1.5);
  ctx.lineTo(w - rr, 1.5);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Key chips: precomputed widths (strings are constant).
// ---------------------------------------------------------------------------
const KEY_CHIP_ITEMS_DEFAULT = [
  ["W/S", "THROTTLE"],
  ["ARROWS", "FLY"],
  ["A/D", "RUDDER"],
  ["SPACE", "DROP"],
  ["R", "RESTART"],
  ["P", "PAUSE"]
];

const chipWidthCache = new Map();

function measureChip(ctx, key, label) {
  const cacheKey = key + "\u0000" + label;
  let w = chipWidthCache.get(cacheKey);
  if (w !== undefined) return w;
  ctx.save();
  ctx.font = "bold 11px monospace";
  const kw = ctx.measureText(key).width;
  ctx.font = "11px monospace";
  const lw = ctx.measureText(label).width;
  ctx.restore();
  // padding: 8 left + 6 gap + 8 right
  w = Math.ceil(kw + lw + 8 + 6 + 8);
  chipWidthCache.set(cacheKey, w);
  return w;
}

export function drawKeyChips(ctx, items, cx, baselineY) {
  const list = Array.isArray(items) && items.length ? items : KEY_CHIP_ITEMS_DEFAULT;
  const gap = 8;
  const chipH = 22;
  const widths = [];
  let total = 0;
  for (let i = 0; i < list.length; i += 1) {
    const it = list[i] || [];
    const w = measureChip(ctx, String(it[0] || ""), String(it[1] || ""));
    widths.push(w);
    total += w;
  }
  total += gap * (list.length - 1);

  let x = cx - total / 2;
  const y = baselineY - chipH; // baselineY is the bottom of the chip row
  ctx.save();
  ctx.textBaseline = "middle";
  for (let i = 0; i < list.length; i += 1) {
    const it = list[i] || [];
    const key = String(it[0] || "");
    const label = String(it[1] || "");
    const w = widths[i];

    // chip background
    roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, chipH - 1, 5);
    ctx.fillStyle = "rgba(6,18,28,0.72)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // key text
    ctx.textAlign = "left";
    ctx.font = "bold 11px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(key, x + 8, y + chipH / 2 + 0.5);

    // label text
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    const kw = ctx.measureText(key).width;
    ctx.fillText(label, x + 8 + kw + 6, y + chipH / 2 + 0.5);

    x += w + gap;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Replay pill geometry (used by end screens and by main.js for click hit-test).
// ---------------------------------------------------------------------------
export function replayPillRect(ph) {
  const W = 1280, H = 720;
  const pw = 560;
  const cardH = (ph === undefined) ? 380 : ph;
  const px = (W - pw) / 2;
  const py = (H - cardH) / 2;
  const w = 320, h = 40;
  const x = px + (pw - w) / 2;
  const y = py + cardH - 24 - h;
  return { x: x, y: y, w: w, h: h };
}

// ---------------------------------------------------------------------------
// Main HUD entry point.
// ---------------------------------------------------------------------------
export function drawHud(ctx, world, screen) {
  try {
    const W = 1280, H = 720;
    const num = (v, d) => Number.isFinite(v) ? v : (d === undefined ? 0 : d);
    const jet = (world && world.jet) || {};
    const stats = (world && world.stats) || {};
    const drop = (world && world.drop) || {};
    const nextTarget = world && world.nextTarget;
    const glide = world && world.glide;
    const breakdown = world && world.breakdown;
    const stage = num(world && world.stage, 1);
    const score = num(world && world.score, 0);
    const fuel = num(jet.fuel, 1);
    const speedMs = num(jet.speedMs, 0);
    const headingDeg = num(jet.headingDeg, 0);
    const bankDeg = num(jet.bankDeg, 0);
    const pitchDeg = num(jet.pitchDeg, 0);
    const throttle = num(jet.throttle, 0);
    const z = num(jet.z, 0);

    const label = (t, x, y, align) => {
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "11px monospace";
      ctx.textAlign = align || "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(t, x, y);
    };
    const value = (t, x, y, align, size, color) => {
      ctx.fillStyle = color || "#ffffff";
      ctx.font = "bold " + (size || 26) + "px monospace";
      ctx.textAlign = align || "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(t, x, y);
    };

    // -----------------------------------------------------------------
    // Top-left telemetry cards (170x62 at x=16/196/376, y=14)
    // -----------------------------------------------------------------
    const bx = 16, by = 14, bw = 170, bh = 62, gap = 10;
    const knots = speedMs * 1.94384;
    // Pre-flight (title) screen: never show the amber over-speed state —
    // the jet's initial speed (120 m/s = 233 knots) already exceeds the
    // 150-knot mission limit, so it would read as an active violation
    // before flying starts. The warning stays fully live during play and
    // on end screens (gated only on the title screen state).
    const overSpeed = screen !== "title" && knots > 150;

    // ALTITUDE
    glassBox(ctx, bx, by, bw, bh, 8);
    label("ALTITUDE", bx + 10, by + 20);
    value(Math.round(z * 3.28084) + " FEET", bx + 10, by + 50);

    // AIRSPEED
    const asX = bx + bw + gap;
    glassBox(ctx, asX, by, bw, bh, 8);
    label("AIRSPEED", asX + 10, by + 20);
    value(Math.round(knots) + " KNOTS", asX + 10, by + 50, "left", 26, overSpeed ? AMBER : "#ffffff");
    if (overSpeed) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(asX + 8, by + bh - 1.5);
      ctx.lineTo(asX + bw - 8, by + bh - 1.5);
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // HEADING
    const hdX = bx + 2 * (bw + gap);
    glassBox(ctx, hdX, by, bw, bh, 8);
    label("HEADING", hdX + 10, by + 20);
    value(String(Math.round(headingDeg)).padStart(3, "0") + " DEGREES", hdX + 10, by + 50);

    // -----------------------------------------------------------------
    // Mission panel (top-right 330x100 at x=934, y=14)
    // -----------------------------------------------------------------
    const mw = 330, mx = W - 16 - mw, my = 14, mh = 100;
    glassBox(ctx, mx, my, mw, mh, 8);

    const stageName = stage === 1 ? "RING COURSE" : stage === 2 ? "ISLAND SUPPLY" : "RUNWAY 36";
    ctx.fillStyle = ACCENT;
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("MISSION " + stage + "/3 \u2014 " + stageName, mx + 12, my + 24);

    // Stage dots at right end of header row
    const dotR = 4;
    const dotGap = 12;
    const dotY = my + 19;
    const dotRight = mx + mw - 12;
    for (let i = 0; i < 3; i += 1) {
      const cxDot = dotRight - (2 - i) * dotGap;
      const stageNum = i + 1;
      const filled = stageNum <= stage;
      ctx.beginPath();
      ctx.arc(cxDot, dotY, dotR, 0, Math.PI * 2);
      if (filled) {
        ctx.fillStyle = ACCENT;
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(125,249,255,0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Divider under header
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(mx + 12, my + 34.5);
    ctx.lineTo(mx + mw - 12, my + 34.5);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Body lines
    let lineA = "", lineB = "";
    if (stage === 1) {
      lineA = "Fly through the glowing rings.";
      lineB = "RINGS " + num(stats.ringsHit, 0) + " / 5 \u00b7 NEXT RING " + Math.round(nextTarget ? num(nextTarget.distM, 0) : 0) + " m";
    } else if (stage === 2) {
      const doneArr = Array.isArray(drop.done) ? drop.done : [];
      let doneCount = 0;
      for (let i = 0; i < doneArr.length; i += 1) if (doneArr[i]) doneCount += 1;
      lineA = "Drop crates on both huts.";
      lineB = "DROPS " + doneCount + " / 2 \u00b7 NEXT " + Math.round(nextTarget ? num(nextTarget.distM, 0) : 0) + " m";
    } else {
      lineA = "Land on runway 36, flare soft.";
      lineB = "RUNWAY AHEAD " + Math.max(0, Math.round(glide ? num(glide.distM, 0) : 0)) + " m";
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "13px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(lineA, mx + 12, my + 52);

    ctx.fillStyle = ACCENT;
    ctx.font = "13px monospace";
    ctx.fillText(lineB, mx + 12, my + 72);

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "13px monospace";
    ctx.fillText("Keep speed under 150 knots.", mx + 12, my + 92);

    // Throttle bar below mission panel
    label("THROTTLE", mx + 12, my + mh + 16);
    const tbY = my + mh + 22, tbW = 330, tbH = 10;
    glassBox(ctx, mx, tbY, tbW, tbH, 5);
    const thr = Math.max(0, Math.min(1, throttle));
    if (thr > 0) {
      ctx.save();
      roundRectPath(ctx, mx + 1, tbY + 1, Math.max(0, thr * (tbW - 2)), tbH - 2, 4);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      ctx.restore();
    }

    if (screen !== "title") {
      // -------------------------------------------------------------
      // Attitude indicator
      // -------------------------------------------------------------
      const cx = 64, cy = H - 64, r = 46;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(6,18,28,0.72)";
      ctx.fill();
      ctx.clip();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-bankDeg * Math.PI / 180);
      const shift = pitchDeg * 1.2;
      ctx.fillStyle = "#3f8fd2";
      ctx.fillRect(-r * 2, -r * 2 + shift, r * 4, r * 2);
      ctx.fillStyle = "#7a5a34";
      ctx.fillRect(-r * 2, shift, r * 4, r * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 2, shift);
      ctx.lineTo(r * 2, shift);
      ctx.stroke();
      ctx.restore();

      // Fixed plane symbol
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy);
      ctx.lineTo(cx + 14, cy);
      ctx.moveTo(cx - 8, cy);
      ctx.lineTo(cx - 8, cy + 6);
      ctx.moveTo(cx + 8, cy);
      ctx.lineTo(cx + 8, cy + 6);
      ctx.stroke();
      ctx.restore();

      // Glass outer ring + faint second ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(125,249,255,0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Rim tick marks (top, left, right, bottom)
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      const tickIn = r - 5, tickOut = r - 1;
      // top
      ctx.beginPath();
      ctx.moveTo(cx, cy - tickOut);
      ctx.lineTo(cx, cy - tickIn);
      ctx.stroke();
      // bottom
      ctx.beginPath();
      ctx.moveTo(cx, cy + tickOut);
      ctx.lineTo(cx, cy + tickIn);
      ctx.stroke();
      // left
      ctx.beginPath();
      ctx.moveTo(cx - tickOut, cy);
      ctx.lineTo(cx - tickIn, cy);
      ctx.stroke();
      // right
      ctx.beginPath();
      ctx.moveTo(cx + tickOut, cy);
      ctx.lineTo(cx + tickIn, cy);
      ctx.stroke();
      ctx.restore();

      // -------------------------------------------------------------
      // Fuel and damage bars
      // -------------------------------------------------------------
      const barX = 128, barW = 190, barH = 12;
      const fuelY = H - 92;

      label("FUEL", barX, fuelY - 4);
      glassBox(ctx, barX, fuelY, barW, barH, 6);
      const fuelClamped = Math.max(0, Math.min(1, fuel));
      let fuelColor = GREEN;
      if (fuel < 0.15) fuelColor = RED;
      else if (fuel < 0.30) fuelColor = AMBER;
      if (fuelClamped > 0) {
        ctx.save();
        roundRectPath(ctx, barX + 1, fuelY + 1, Math.max(0, fuelClamped * (barW - 2)), barH - 2, 5);
        ctx.fillStyle = fuelColor;
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("FUEL " + Math.round(fuel * 100) + "%", barX + barW + 8, fuelY + 11);

      const dmgY = fuelY + 22;
      label("DAMAGE", barX, dmgY - 4);
      glassBox(ctx, barX, dmgY, barW, barH, 6);
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px monospace";
      ctx.fillText("DAMAGE 0%", barX + barW + 8, dmgY + 11);

      // -------------------------------------------------------------
      // Bottom-right score + gear pill
      // -------------------------------------------------------------
      label("SCORE", W - 16, H - 92, "right");
      value(String(Math.round(score)), W - 16, H - 62, "right", 28);

      const gearDown = speedMs < 110;
      const pillW = 110, pillH = 22;
      const pillX = W - 16 - pillW;
      const pillY = H - 40 - pillH / 2;
      ctx.save();
      roundRectPath(ctx, pillX + 0.5, pillY + 0.5, pillW - 1, pillH - 1, 11);
      ctx.fillStyle = "rgba(6,18,28,0.72)";
      ctx.fill();
      ctx.strokeStyle = "rgba(125,249,255,0.42)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = gearDown ? GREEN : AMBER;
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(gearDown ? "GEAR DOWN" : "GEAR UP", pillX + pillW / 2, pillY + pillH / 2 + 0.5);

      // -------------------------------------------------------------
      // Bottom-centre key chips
      // -------------------------------------------------------------
      drawKeyChips(ctx, KEY_CHIP_ITEMS_DEFAULT, W / 2, H - 14);

      // -------------------------------------------------------------
      // Centre banner
      // -------------------------------------------------------------
      const msg = world && world.message;
      const msgT = num(world && world.messageT, 0);
      if (typeof msg === "string" && msg.length > 0 && msgT > 0 && screen !== "won" && screen !== "lost" && screen !== "crashed") {
        ctx.save();
        ctx.shadowColor = ACCENT;
        ctx.shadowBlur = 12;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(msg, 640, 150);
        ctx.restore();
      }

      // Low fuel warning
      if (fuel < 0.15 && screen === "play") {
        ctx.fillStyle = "#ffcc33";
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText("LOW FUEL", 640, 190);
      }
    }

    // -----------------------------------------------------------------
    // End screens
    // -----------------------------------------------------------------
    if (screen === "won" || screen === "lost" || screen === "crashed") {
      ctx.fillStyle = "rgba(4,10,16,0.55)";
      ctx.fillRect(0, 0, W, H);

      const hasBreakdown = screen === "won" && breakdown;
      const pw = 560, ph = hasBreakdown ? 380 : 240;
      const px = (W - pw) / 2, py = (H - ph) / 2;
      glassBox(ctx, px, py, pw, ph, 14);

      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      let title = "", titleColor = ACCENT;
      if (screen === "won") { title = "MISSION COMPLETE"; titleColor = ACCENT; }
      else if (screen === "lost") { title = "MISSION FAILED"; titleColor = "#ff8866"; }
      else { title = "CRASHED"; titleColor = "#ff8866"; }
      ctx.fillStyle = titleColor;
      ctx.font = "bold 34px monospace";
      ctx.fillText(title, W / 2, py + 56);

      // Accent rule under title
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(W / 2 - 45, py + 68.5);
      ctx.lineTo(W / 2 + 45, py + 68.5);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "#ffffff";
      ctx.font = "16px monospace";
      let sub = "";
      if (screen === "won") sub = breakdown ? "All three stages complete." : "Sortie complete.";
      else sub = (world && typeof world.message === "string" && world.message) ? world.message : "Sortie over.";
      ctx.fillText(sub, W / 2, py + 96);

      if (hasBreakdown) {
        const rowLeft = px + 40;
        const rowRight = px + pw - 40;
        const rs = Array.isArray(breakdown.ringScores) ? breakdown.ringScores : [];
        const ds = Array.isArray(breakdown.dropScores) ? breakdown.dropScores : [];

        const rows = [
          ["Rings", rs.join(" + ") + " = " + num(breakdown.ringTotal, 0)],
          ["Drops", ds.join(" + ") + " = " + num(breakdown.dropTotal, 0)],
          ["Landing", "+" + num(breakdown.landing, 0)],
          ["Fuel bonus", "+" + num(breakdown.fuelBonus, 0)],
          ["Time bonus", "+" + num(breakdown.timeBonus, 0)]
        ];

        let rowY = py + 130;
        const rowH = 26;
        ctx.font = "16px monospace";
        for (let i = 0; i < rows.length; i += 1) {
          ctx.textAlign = "left";
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillText(rows[i][0], rowLeft, rowY);
          ctx.textAlign = "right";
          ctx.fillStyle = "#ffffff";
          ctx.fillText(rows[i][1], rowRight, rowY);

          if (i < rows.length - 1) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(rowLeft, rowY + 8.5);
            ctx.lineTo(rowRight, rowY + 8.5);
            ctx.strokeStyle = "rgba(255,255,255,0.09)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
          }
          rowY += rowH;
        }

        // Thicker divider before SCORE
        const divY = rowY + 4;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(rowLeft, divY);
        ctx.lineTo(rowRight, divY);
        ctx.strokeStyle = "rgba(125,249,255,0.35)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // SCORE row
        const scoreY = divY + 34;
        ctx.textAlign = "left";
        ctx.fillStyle = ACCENT;
        ctx.font = "bold 24px monospace";
        ctx.fillText("SCORE", rowLeft, scoreY);
        ctx.textAlign = "right";
        ctx.font = "bold 28px monospace";
        ctx.fillText(String(num(breakdown.total, 0)), rowRight, scoreY);
      } else {
        ctx.textAlign = "center";
        ctx.font = "20px monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("SCORE " + Math.round(score), W / 2, py + 140);
      }

      // Replay pill
      const pill = replayPillRect(ph);
      ctx.save();
      roundRectPath(ctx, pill.x + 0.5, pill.y + 0.5, pill.w - 1, pill.h - 1, 20);
      ctx.fillStyle = "rgba(6,18,28,0.72)";
      ctx.fill();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = ACCENT;
      ctx.font = "bold 15px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PRESS R TO FLY AGAIN", pill.x + pill.w / 2, pill.y + pill.h / 2 + 0.5);
    }
  } catch (e) {}
}
