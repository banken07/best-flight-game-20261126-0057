export function drawHud(ctx, world, screen) {
  try {
    const W = 1280, H = 720;
    const ACCENT = "#7df9ff";
    const num = (v, d = 0) => Number.isFinite(v) ? v : d;
    const jet = (world && world.jet) || {};
    const stats = (world && world.stats) || {};
    const course = (world && world.course) || {};
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

    const box = (x, y, w, h) => {
      ctx.fillStyle = "rgba(6,18,28,0.72)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(125,249,255,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };
    const label = (t, x, y, align = "left") => {
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "11px monospace";
      ctx.textAlign = align;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(t, x, y);
    };
    const value = (t, x, y, align = "left", size = 26, color = "#ffffff") => {
      ctx.fillStyle = color;
      ctx.font = "bold " + size + "px monospace";
      ctx.textAlign = align;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(t, x, y);
    };

    // Top-left three boxes
    const bx = 16, by = 14, bw = 170, bh = 62, gap = 10;
    box(bx, by, bw, bh);
    label("ALTITUDE", bx + 10, by + 20);
    value(Math.round(z * 3.28084) + " FEET", bx + 10, by + 50);
    box(bx + bw + gap, by, bw, bh);
    label("AIRSPEED", bx + bw + gap + 10, by + 20);
    value(Math.round(speedMs * 1.94384) + " KNOTS", bx + bw + gap + 10, by + 50);
    box(bx + 2 * (bw + gap), by, bw, bh);
    label("HEADING", bx + 2 * (bw + gap) + 10, by + 20);
    value(String(Math.round(headingDeg)).padStart(3, "0") + " DEGREES", bx + 2 * (bw + gap) + 10, by + 50);

    // Mission box top-right (two text lines so nothing overflows the box)
    const mw = 330, mx = W - 16 - mw, my = 14, mh = 100;
    box(mx, my, mw, mh);
    const stageName = stage === 1 ? "RING COURSE" : stage === 2 ? "ISLAND SUPPLY" : "LAND ON RUNWAY 36";
    ctx.fillStyle = ACCENT;
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("MISSION " + stage + "/3 — " + stageName, mx + 12, my + 24);
    ctx.fillStyle = "#ffffff";
    ctx.font = "13px monospace";
    let lineA = "", lineB = "";
    if (stage === 1) {
      lineA = "Fly through the glowing rings.";
      lineB = "RINGS " + num(stats.ringsHit, 0) + " / 5 · NEXT RING " + Math.round(nextTarget ? num(nextTarget.distM, 0) : 0) + " m";
    } else if (stage === 2) {
      const zones = Array.isArray(course.dropZones) ? course.dropZones : [];
      const doneCount = zones.filter(d => d && d.done).length;
      lineA = "Drop crates on both huts.";
      lineB = "DROPS " + doneCount + " / 2 · NEXT " + Math.round(nextTarget ? num(nextTarget.distM, 0) : 0) + " m";
    } else {
      lineA = "Land on runway 36, flare soft.";
      lineB = "RUNWAY AHEAD " + Math.max(0, Math.round(glide ? num(glide.distM, 0) : 0)) + " m";
    }
    ctx.fillText(lineA, mx + 12, my + 48);
    ctx.fillStyle = ACCENT;
    ctx.fillText(lineB, mx + 12, my + 70);
    ctx.fillStyle = "#ffffff";
    ctx.font = "13px monospace";
    ctx.fillText("Keep speed under 150 knots.", mx + 12, my + 92);

    // Throttle bar
    label("THROTTLE", mx + 12, my + mh + 16);
    const tbY = my + mh + 22, tbW = 330, tbH = 10;
    ctx.fillStyle = "rgba(6,18,28,0.72)";
    ctx.fillRect(mx, tbY, tbW, tbH);
    ctx.strokeStyle = "rgba(125,249,255,0.35)";
    ctx.strokeRect(mx + 0.5, tbY + 0.5, tbW - 1, tbH - 1);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(mx, tbY, Math.max(0, Math.min(1, throttle)) * tbW, tbH);

    if (screen !== "title") {
      // Attitude indicator
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
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Fuel and damage bars
      const barX = 128, barW = 190, barH = 12;
      const fuelY = H - 92;
      label("FUEL", barX, fuelY - 4);
      ctx.fillStyle = "rgba(6,18,28,0.72)";
      ctx.fillRect(barX, fuelY, barW, barH);
      ctx.strokeStyle = "rgba(125,249,255,0.35)";
      ctx.strokeRect(barX + 0.5, fuelY + 0.5, barW - 1, barH - 1);
      ctx.fillStyle = "#39ff88";
      ctx.fillRect(barX, fuelY, Math.max(0, Math.min(1, fuel)) * barW, barH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("FUEL " + Math.round(fuel * 100) + "%", barX + barW + 8, fuelY + 11);

      const dmgY = fuelY + 22;
      label("DAMAGE", barX, dmgY - 4);
      ctx.fillStyle = "rgba(6,18,28,0.72)";
      ctx.fillRect(barX, dmgY, barW, barH);
      ctx.strokeStyle = "rgba(125,249,255,0.35)";
      ctx.strokeRect(barX + 0.5, dmgY + 0.5, barW - 1, barH - 1);
      ctx.fillStyle = "#888888";
      ctx.fillRect(barX, dmgY, 0, barH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px monospace";
      ctx.fillText("DAMAGE 0%", barX + barW + 8, dmgY + 11);

      // Bottom-right score
      label("SCORE", W - 16, H - 92, "right");
      value(String(Math.round(score)), W - 16, H - 62, "right", 28);
      ctx.fillStyle = "#ffffff";
      ctx.font = "13px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("GEAR " + (speedMs < 110 ? "DOWN" : "UP"), W - 16, H - 40);

      // Bottom-center legend
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("W/S throttle · arrows fly · A/D rudder · Space drop · R restart · P pause", W / 2, H - 14);

      // Center banner (not on the end screens — the end panel covers it
      // and the text would peek out from behind the panel).
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

    // End screens
    if (screen === "won" || screen === "lost" || screen === "crashed") {
      ctx.fillStyle = "rgba(4,10,16,0.55)";
      ctx.fillRect(0, 0, W, H);
      const hasBreakdown = screen === "won" && breakdown;
      const pw = 560, ph = hasBreakdown ? 380 : 240;
      const px = (W - pw) / 2, py = (H - ph) / 2;
      box(px, py, pw, ph);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      let title = "", titleColor = ACCENT;
      if (screen === "won") { title = "MISSION COMPLETE"; titleColor = ACCENT; }
      else if (screen === "lost") { title = "MISSION FAILED"; titleColor = "#ff8866"; }
      else { title = "CRASHED"; titleColor = "#ff8866"; }
      ctx.fillStyle = titleColor;
      ctx.font = "bold 34px monospace";
      ctx.fillText(title, W / 2, py + 56);
      ctx.fillStyle = "#ffffff";
      ctx.font = "16px monospace";
      let sub = "";
      if (screen === "won") sub = breakdown ? "All three stages complete." : "Sortie complete.";
      else sub = (world && typeof world.message === "string" && world.message) ? world.message : "Sortie over.";
      ctx.fillText(sub, W / 2, py + 90);
      if (hasBreakdown) {
        const lx = 640 - 220;
        ctx.textAlign = "left";
        ctx.font = "16px monospace";
        const rs = Array.isArray(breakdown.ringScores) ? breakdown.ringScores : [];
        const ds = Array.isArray(breakdown.dropScores) ? breakdown.dropScores : [];
        ctx.fillText("Rings: " + rs.join(" + ") + " = " + num(breakdown.ringTotal, 0), lx, py + 130);
        ctx.fillText("Drops: " + ds.join(" + ") + " = " + num(breakdown.dropTotal, 0), lx, py + 156);
        ctx.fillText("Landing: +" + num(breakdown.landing, 0), lx, py + 182);
        ctx.fillText("Fuel bonus: +" + num(breakdown.fuelBonus, 0), lx, py + 208);
        ctx.fillText("Time bonus: +" + num(breakdown.timeBonus, 0), lx, py + 234);
        ctx.fillStyle = ACCENT;
        ctx.font = "bold 24px monospace";
        ctx.fillText("SCORE " + num(breakdown.total, 0), lx, py + 274);
      } else {
        ctx.textAlign = "center";
        ctx.font = "20px monospace";
        ctx.fillText("SCORE " + Math.round(score), W / 2, py + 140);
      }
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "15px monospace";
      ctx.textAlign = "center";
      ctx.fillText("PRESS R TO FLY AGAIN", W / 2, py + ph - 24);
    }
  } catch (e) {}
}
