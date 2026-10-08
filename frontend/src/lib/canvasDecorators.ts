import { LayoutType, TemplateBorderStyle } from "@/types/booth";

export function drawLayoutDecorations(
  ctx: CanvasRenderingContext2D,
  layout: LayoutType,
  width: number,
  height: number,
  scale: number,
  textColor: string,
  headerText: string,
  footerText: string
) {
  ctx.save();

  switch (layout) {
    case "film-strip": {
      // Draw 35mm film negative sprockets
      ctx.fillStyle = "#ffffff";
      const sprocketW = 20 * scale;
      const sprocketH = 28 * scale;
      const spacing = 45 * scale;

      // Left sprockets
      for (let y = 30 * scale; y < height - 30 * scale; y += spacing) {
        ctx.beginPath();
        ctx.roundRect(14 * scale, y, sprocketW, sprocketH, 4 * scale);
        ctx.fill();
      }
      // Right sprockets
      for (let y = 30 * scale; y < height - 30 * scale; y += spacing) {
        ctx.beginPath();
        ctx.roundRect(width - 34 * scale, y, sprocketW, sprocketH, 4 * scale);
        ctx.fill();
      }

      // Edge film notations in amber
      ctx.fillStyle = "#f59e0b";
      ctx.font = `bold ${12 * scale}px monospace`;
      ctx.fillText("▶ KODAK TX 400", 50 * scale, 35 * scale);
      ctx.fillText("SAFETY FILM", width - 150 * scale, 35 * scale);
      ctx.fillText("• 24 •", 50 * scale, height - 20 * scale);
      ctx.fillText("• 24A •", width - 90 * scale, height - 20 * scale);
      break;
    }

    case "film-35mm-horiz": {
      // Top and bottom sprockets
      ctx.fillStyle = "#ffffff";
      const sprocketW = 28 * scale;
      const sprocketH = 20 * scale;
      const spacing = 45 * scale;

      for (let x = 30 * scale; x < width - 30 * scale; x += spacing) {
        ctx.beginPath();
        ctx.roundRect(x, 14 * scale, sprocketW, sprocketH, 4 * scale);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x, height - 34 * scale, sprocketW, sprocketH, 4 * scale);
        ctx.fill();
      }

      ctx.fillStyle = "#f59e0b";
      ctx.font = `bold ${12 * scale}px monospace`;
      ctx.fillText("PANAVISION 35MM", 50 * scale, 55 * scale);
      ctx.fillText("REEL #02 • 24 FPS", width - 200 * scale, 55 * scale);
      break;
    }

    case "ticket-stub": {
      // Dotted tear line at top
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 3 * scale;
      ctx.setLineDash([12 * scale, 8 * scale]);
      ctx.beginPath();
      ctx.moveTo(30 * scale, 90 * scale);
      ctx.lineTo(width - 30 * scale, 90 * scale);
      ctx.stroke();

      // Dotted tear line at bottom
      ctx.beginPath();
      ctx.moveTo(30 * scale, height - 120 * scale);
      ctx.lineTo(width - 30 * scale, height - 120 * scale);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ticket header details
      ctx.fillStyle = textColor;
      ctx.font = `bold ${14 * scale}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText("ADMIT ONE • VIP ACCESS", 35 * scale, 55 * scale);
      ctx.font = `${10 * scale}px monospace`;
      ctx.fillText("№ 0849204 • SECTION A • ROW 1", 35 * scale, 75 * scale);

      // Barcode at bottom
      ctx.textAlign = "center";
      const bY = height - 100 * scale;
      ctx.fillText("BARCODE TICKET ID", width / 2, bY + 12 * scale);
      for (let bx = 60 * scale; bx < width - 60 * scale; bx += 8 * scale) {
        const barW = (bx % 3 === 0 ? 5 : 2) * scale;
        ctx.fillRect(bx, bY + 22 * scale, barW, 40 * scale);
      }
      ctx.fillText("NO REFUNDS OR EXCHANGES", width / 2, height - 20 * scale);
      break;
    }

    case "arcade-retro": {
      // Neon arcade double border
      ctx.strokeStyle = "#ec4899";
      ctx.lineWidth = 6 * scale;
      ctx.strokeRect(18 * scale, 18 * scale, width - 36 * scale, height - 36 * scale);

      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(26 * scale, 26 * scale, width - 52 * scale, height - 52 * scale);

      // Arcade text
      ctx.fillStyle = "#ec4899";
      ctx.font = `bold ${14 * scale}px monospace`;
      ctx.textAlign = "left";
      ctx.fillText("1UP: 99990", 40 * scale, 55 * scale);

      ctx.fillStyle = "#06b6d4";
      ctx.textAlign = "right";
      ctx.fillText("STAGE 1-1", width - 40 * scale, 55 * scale);

      ctx.textAlign = "center";
      ctx.fillStyle = "#facc15";
      ctx.fillText("★ INSERT COIN TO PLAY ★", width / 2, height - 25 * scale);
      break;
    }

    case "passport-4": {
      // Official passport border and stamp
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(25 * scale, 25 * scale, width - 50 * scale, height - 50 * scale);

      // Circular Red Stamp: "IMMIGRATION CONTROL / APPROVED"
      ctx.save();
      ctx.translate(width - 150 * scale, 90 * scale);
      ctx.rotate(-0.15);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.arc(0, 0, 48 * scale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#ef4444";
      ctx.font = `bold ${10 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("IMMIGRATION", 0, -18 * scale);
      ctx.font = `bold ${12 * scale}px sans-serif`;
      ctx.fillText("APPROVED", 0, 0);
      ctx.font = `${8 * scale}px sans-serif`;
      ctx.fillText("ENTRY VISA", 0, 18 * scale);
      ctx.restore();

      ctx.fillStyle = textColor;
      ctx.font = `bold ${12 * scale}px monospace`;
      ctx.textAlign = "left";
      ctx.fillText("OFFICIAL PASSPORT CONTROL", 40 * scale, 55 * scale);
      ctx.fillText("DOC №: PH2-2026-99", 40 * scale, height - 25 * scale);
      break;
    }

    case "heart-badge": {
      // Korean K-Booth heart aesthetic
      ctx.fillStyle = "#f472b6";
      ctx.font = `bold ${16 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("♡ 인생네컷 • LIFE 4 CUTS ♡", width / 2, 50 * scale);
      break;
    }

    case "cinema-widescreen": {
      // Widescreen letterbox
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(45 * scale, 48 * scale, 6 * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = `bold ${12 * scale}px monospace`;
      ctx.textAlign = "left";
      ctx.fillText("REC [●] 01:23:45:12", 60 * scale, 52 * scale);

      ctx.textAlign = "right";
      ctx.fillText("ANAMORPHIC 2.39:1", width - 40 * scale, 52 * scale);

      // Golden movie dialogue subtitle
      ctx.fillStyle = "#fde047";
      ctx.font = `italic ${14 * scale}px serif`;
      ctx.textAlign = "center";
      if (footerText) {
        ctx.fillText(`"${footerText}"`, width / 2, height - 25 * scale);
      }
      break;
    }

    case "split-featured": {
      // Vogue Magazine masthead
      ctx.fillStyle = textColor;
      ctx.font = `900 ${32 * scale}px serif`;
      ctx.textAlign = "left";
      ctx.fillText("PHO2 VOGUE", 40 * scale, 60 * scale);

      ctx.font = `${10 * scale}px sans-serif`;
      ctx.letterSpacing = "2px";
      ctx.fillText("ISSUE NO. 26 // AUTUMN SPECIAL", 40 * scale, 80 * scale);

      ctx.textAlign = "right";
      ctx.font = `${10 * scale}px monospace`;
      ctx.fillText("CIRCULATION 2026", width - 40 * scale, 60 * scale);
      break;
    }

    case "grid-2x3": {
      // Airmail diagonal stripes border
      const stripeW = 20 * scale;
      for (let x = 0; x < width; x += stripeW * 2) {
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(x, 0, stripeW, 8 * scale);
        ctx.fillRect(x, height - 8 * scale, stripeW, 8 * scale);
        ctx.fillStyle = "#3b82f6";
        ctx.fillRect(x + stripeW, 0, stripeW, 8 * scale);
        ctx.fillRect(x + stripeW, height - 8 * scale, stripeW, 8 * scale);
      }
      break;
    }

    case "mini-strip-duo": {
      // Middle scissor cut divider
      const halfW = width / 2;
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 2 * scale;
      ctx.setLineDash([12 * scale, 8 * scale]);
      ctx.beginPath();
      // Top dashed line segment
      ctx.moveTo(halfW, 20 * scale);
      ctx.lineTo(halfW, height / 2 - 20 * scale);
      // Bottom dashed line segment
      ctx.moveTo(halfW, height / 2 + 20 * scale);
      ctx.lineTo(halfW, height - 20 * scale);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = textColor;
      ctx.font = `bold ${11 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✂ CUT HERE ✂", halfW, height / 2);
      ctx.textBaseline = "alphabetic";
      ctx.fillText("FOR YOU ♡", halfW / 2, 45 * scale);
      ctx.fillText("FOR ME ♡", halfW + halfW / 2, 45 * scale);
      break;
    }

    case "polaroid": {
      // Washi tape at top of polaroid
      ctx.fillStyle = "#fef08a";
      ctx.save();
      ctx.translate(width / 2, 20 * scale);
      ctx.rotate(-0.03);
      ctx.fillRect(-70 * scale, 0, 140 * scale, 24 * scale);
      ctx.fillStyle = "#713f12";
      ctx.font = `bold ${9 * scale}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText("★ ORIGINAL SNAP ★", 0, 16 * scale);
      ctx.restore();
      break;
    }

    default:
      break;
  }

  ctx.restore();
}

export function drawTemplateBorderDecorations(
  ctx: CanvasRenderingContext2D,
  borderStyle: TemplateBorderStyle,
  width: number,
  height: number,
  scale: number,
  frameColor: string,
  textColor: string,
  accentColor: string
) {
  ctx.save();

  switch (borderStyle) {
    case "gold": {
      // Elegant gold foil double border with corner ornamental brackets
      const inset1 = 12 * scale;
      const inset2 = 18 * scale;
      ctx.strokeStyle = accentColor || "#d4af37";
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(inset1, inset1, width - inset1 * 2, height - inset1 * 2);

      ctx.lineWidth = 1 * scale;
      ctx.strokeRect(inset2, inset2, width - inset2 * 2, height - inset2 * 2);

      // Corner gold diamond accents
      const corners = [
        [inset1, inset1],
        [width - inset1, inset1],
        [inset1, height - inset1],
        [width - inset1, height - inset1],
      ];
      ctx.fillStyle = accentColor || "#d4af37";
      corners.forEach(([cx, cy]) => {
        ctx.beginPath();
        const dSize = 5 * scale;
        ctx.moveTo(cx, cy - dSize);
        ctx.lineTo(cx + dSize, cy);
        ctx.lineTo(cx, cy + dSize);
        ctx.lineTo(cx - dSize, cy);
        ctx.closePath();
        ctx.fill();
      });
      break;
    }

    case "floral": {
      // Botanical border with corner leaf wreath flourishes
      const inset = 14 * scale;
      ctx.strokeStyle = accentColor || "#10b981";
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);

      // Draw corner floral sprigs
      ctx.fillStyle = accentColor || "#10b981";
      const sprigRadius = 4 * scale;
      const cornerOffsets = [
        [inset + 8 * scale, inset + 8 * scale],
        [width - inset - 8 * scale, inset + 8 * scale],
        [inset + 8 * scale, height - inset - 8 * scale],
        [width - inset - 8 * scale, height - inset - 8 * scale],
      ];
      cornerOffsets.forEach(([cx, cy]) => {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * 6 * scale, cy + Math.sin(a) * 6 * scale, sprigRadius, sprigRadius * 0.5, a, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      break;
    }

    case "festive": {
      // Festive party starbursts & confetti dots
      const inset = 12 * scale;
      ctx.strokeStyle = accentColor || "#f43f5e";
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);

      // Draw confetti sparkle stars in corners and margins
      const starColors = [accentColor, "#facc15", "#38bdf8", "#ec4899"];
      const spots = [
        [24 * scale, 24 * scale],
        [width - 24 * scale, 24 * scale],
        [24 * scale, height - 24 * scale],
        [width - 24 * scale, height - 24 * scale],
        [width / 2, 14 * scale],
        [width / 2, height - 14 * scale],
      ];
      spots.forEach(([sx, sy], i) => {
        ctx.fillStyle = starColors[i % starColors.length];
        const sSize = 6 * scale;
        ctx.beginPath();
        ctx.moveTo(sx, sy - sSize);
        ctx.lineTo(sx + sSize * 0.3, sy - sSize * 0.3);
        ctx.lineTo(sx + sSize, sy);
        ctx.lineTo(sx + sSize * 0.3, sy + sSize * 0.3);
        ctx.lineTo(sx, sy + sSize);
        ctx.lineTo(sx - sSize * 0.3, sy + sSize * 0.3);
        ctx.lineTo(sx - sSize, sy);
        ctx.lineTo(sx - sSize * 0.3, sy - sSize * 0.3);
        ctx.closePath();
        ctx.fill();
      });
      break;
    }

    case "neon": {
      // Cyber neon glowing dual stroke
      const inset = 14 * scale;
      ctx.strokeStyle = accentColor || "#06b6d4";
      ctx.lineWidth = 3 * scale;
      ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);

      // Corner tech bracket ticks
      const tLen = 18 * scale;
      ctx.lineWidth = 4 * scale;
      ctx.strokeStyle = "#f43f5e";
      // Top-Left
      ctx.beginPath();
      ctx.moveTo(inset, inset + tLen);
      ctx.lineTo(inset, inset);
      ctx.lineTo(inset + tLen, inset);
      ctx.stroke();
      // Top-Right
      ctx.beginPath();
      ctx.moveTo(width - inset - tLen, inset);
      ctx.lineTo(width - inset, inset);
      ctx.lineTo(width - inset, inset + tLen);
      ctx.stroke();
      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(inset, height - inset - tLen);
      ctx.lineTo(inset, height - inset);
      ctx.lineTo(inset + tLen, height - inset);
      ctx.stroke();
      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(width - inset - tLen, height - inset);
      ctx.lineTo(width - inset, height - inset);
      ctx.lineTo(width - inset, height - inset - tLen);
      ctx.stroke();
      break;
    }

    case "vhs": {
      // VHS CRT camcorder border
      ctx.strokeStyle = accentColor || "#22c55e";
      ctx.lineWidth = 1.5 * scale;
      const inset = 12 * scale;
      ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);

      // Blinking red dot
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(inset + 14 * scale, inset + 14 * scale, 5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // "REC" text
      ctx.fillStyle = textColor;
      ctx.font = `bold ${10 * scale}px monospace`;
      ctx.textAlign = "left";
      ctx.fillText("REC ●", inset + 24 * scale, inset + 18 * scale);
      break;
    }

    case "minimal": {
      // Crisp 1px museum mat hairline
      const inset = 16 * scale;
      ctx.strokeStyle = accentColor || "#71717a";
      ctx.lineWidth = 1 * scale;
      ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
      break;
    }

    case "lace": {
      // Scalloped lace dot border
      const inset = 14 * scale;
      ctx.strokeStyle = accentColor || "#fb7185";
      ctx.lineWidth = 1 * scale;
      ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);

      // Pearl lace dots along border
      ctx.fillStyle = accentColor || "#fb7185";
      const dotSpacing = 16 * scale;
      const dotR = 2.5 * scale;
      for (let x = inset; x <= width - inset; x += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, inset, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, height - inset, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let y = inset; y <= height - inset; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(inset, y, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(width - inset, y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "candy-stripe": {
      // Peppermint / airmail barber stripe border
      const bW = 10 * scale;
      const step = 20 * scale;
      for (let x = 0; x < width; x += step * 2) {
        ctx.fillStyle = accentColor || "#ef4444";
        ctx.fillRect(x, 0, step, bW);
        ctx.fillRect(x, height - bW, step, bW);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x + step, 0, step, bW);
        ctx.fillRect(x + step, height - bW, step, bW);
      }
      for (let y = 0; y < height; y += step * 2) {
        ctx.fillStyle = accentColor || "#ef4444";
        ctx.fillRect(0, y, bW, step);
        ctx.fillRect(width - bW, y, bW, step);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, y + step, bW, step);
        ctx.fillRect(width - bW, y + step, bW, step);
      }
      break;
    }

    case "rainbow-stripe": {
      // 70s retro 3-stripe band
      const stripeH = 4 * scale;
      const yTop = 18 * scale;
      const yBottom = height - 26 * scale;
      const colors = ["#ea580c", "#f59e0b", "#78350f"];
      colors.forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.fillRect(16 * scale, yTop + i * stripeH, width - 32 * scale, stripeH);
        ctx.fillRect(16 * scale, yBottom + i * stripeH, width - 32 * scale, stripeH);
      });
      break;
    }

    case "brutalist": {
      // Heavy high-contrast border with bold corners
      const inset = 12 * scale;
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 4 * scale;
      ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);

      // Industrial corner markers
      ctx.fillStyle = accentColor || "#ea580c";
      const bSize = 12 * scale;
      ctx.fillRect(inset - 2 * scale, inset - 2 * scale, bSize, bSize);
      ctx.fillRect(width - inset - bSize + 2 * scale, inset - 2 * scale, bSize, bSize);
      ctx.fillRect(inset - 2 * scale, height - inset - bSize + 2 * scale, bSize, bSize);
      ctx.fillRect(width - inset - bSize + 2 * scale, height - inset - bSize + 2 * scale, bSize, bSize);
      break;
    }

    case "double": {
      const inset1 = 12 * scale;
      const inset2 = 18 * scale;
      ctx.strokeStyle = accentColor || textColor;
      ctx.lineWidth = 2.5 * scale;
      ctx.strokeRect(inset1, inset1, width - inset1 * 2, height - inset1 * 2);
      ctx.lineWidth = 1 * scale;
      ctx.strokeRect(inset2, inset2, width - inset2 * 2, height - inset2 * 2);
      break;
    }

    case "solid":
    default: {
      const inset = 14 * scale;
      ctx.strokeStyle = accentColor || textColor;
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
      break;
    }
  }

  ctx.restore();
}
