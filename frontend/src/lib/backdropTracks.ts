export interface BackdropTrack {
  id: string;
  name: string;
  category: "natural" | "korean" | "cute" | "purikura" | "aesthetic";
  tagline: string;
  previewGradient: string;
  iconEmoji: string;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

/**
 * Procedural helper: Draws a smooth romantic heart shape centered at (x, y).
 */
function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fillColor: string,
  strokeColor?: string,
  lineWidth = 2
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  const top = -size * 0.4;
  ctx.moveTo(0, top + size * 0.35);
  ctx.bezierCurveTo(0, top, -size * 0.55, top, -size * 0.55, top + size * 0.35);
  ctx.bezierCurveTo(-size * 0.55, top + size * 0.65, 0, top + size * 0.85, 0, size * 0.6);
  ctx.bezierCurveTo(0, top + size * 0.85, size * 0.55, top + size * 0.65, size * 0.55, top + size * 0.35);
  ctx.bezierCurveTo(size * 0.55, top, 0, top, 0, top + size * 0.35);
  ctx.closePath();

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Procedural helper: Draws an elegant coquette ribbon bow with loops and flowing tails.
 */
function drawBow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  highlightColor = "rgba(255, 255, 255, 0.45)"
) {
  ctx.save();
  ctx.translate(x, y);

  // Left bow loop
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-size * 0.65, -size * 0.55, -size * 0.95, -size * 0.2, -size * 0.85, size * 0.15);
  ctx.bezierCurveTo(-size * 0.7, size * 0.35, -size * 0.3, size * 0.15, 0, 0);
  ctx.fill();

  // Left loop highlight
  ctx.fillStyle = highlightColor;
  ctx.beginPath();
  ctx.ellipse(-size * 0.45, -size * 0.15, size * 0.2, size * 0.08, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  // Right bow loop
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(size * 0.65, -size * 0.55, size * 0.95, -size * 0.2, size * 0.85, size * 0.15);
  ctx.bezierCurveTo(size * 0.7, size * 0.35, size * 0.3, size * 0.15, 0, 0);
  ctx.fill();

  // Right loop highlight
  ctx.fillStyle = highlightColor;
  ctx.beginPath();
  ctx.ellipse(size * 0.45, -size * 0.15, size * 0.2, size * 0.08, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  // Center knot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = highlightColor;
  ctx.beginPath();
  ctx.arc(-size * 0.04, -size * 0.04, size * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // Left curving ribbon tail
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-size * 0.1, size * 0.08);
  ctx.quadraticCurveTo(-size * 0.35, size * 0.5, -size * 0.5, size * 0.95);
  ctx.lineTo(-size * 0.3, size * 0.9);
  ctx.quadraticCurveTo(-size * 0.15, size * 0.45, 0, size * 0.12);
  ctx.closePath();
  ctx.fill();

  // Right curving ribbon tail
  ctx.beginPath();
  ctx.moveTo(size * 0.1, size * 0.08);
  ctx.quadraticCurveTo(size * 0.35, size * 0.5, size * 0.5, size * 0.95);
  ctx.lineTo(size * 0.3, size * 0.9);
  ctx.quadraticCurveTo(size * 0.15, size * 0.45, 0, size * 0.12);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Procedural helper: Draws a Japanese Purikura 4-point star sparkle with glowing core.
 */
function drawSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);

  // Soft halo glow
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.5);
  halo.addColorStop(0, "rgba(255, 255, 255, 0.8)");
  halo.addColorStop(0.4, color);
  halo.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // 4-point curved diamond star
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.quadraticCurveTo(0, 0, 0, radius);
  ctx.quadraticCurveTo(0, 0, -radius, 0);
  ctx.quadraticCurveTo(0, 0, 0, -radius);
  ctx.closePath();
  ctx.fill();

  // Core bright center
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Procedural helper: Draws sweet paired glossy red cherries with joined leaf stem.
 */
function drawCherryPair(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  const r = size * 0.34;

  // Stems meeting at top apex
  ctx.strokeStyle = "#4d7c0f";
  ctx.lineWidth = Math.max(1.8, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(-size * 0.28, size * 0.15);
  ctx.quadraticCurveTo(-size * 0.1, -size * 0.42, 0, -size * 0.52);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(size * 0.28, size * 0.15);
  ctx.quadraticCurveTo(size * 0.1, -size * 0.42, 0, -size * 0.52);
  ctx.stroke();

  // Green leaf
  ctx.fillStyle = "#65a30d";
  ctx.beginPath();
  ctx.ellipse(size * 0.16, -size * 0.56, size * 0.22, size * 0.1, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  // Left cherry
  ctx.fillStyle = "#e11d48";
  ctx.beginPath();
  ctx.arc(-size * 0.28, size * 0.28, r, 0, Math.PI * 2);
  ctx.fill();

  // Left cherry gloss
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.beginPath();
  ctx.arc(-size * 0.28 - r * 0.32, size * 0.28 - r * 0.32, r * 0.28, 0, Math.PI * 2);
  ctx.fill();

  // Right cherry
  ctx.fillStyle = "#be123c";
  ctx.beginPath();
  ctx.arc(size * 0.28, size * 0.28, r, 0, Math.PI * 2);
  ctx.fill();

  // Right cherry gloss
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.beginPath();
  ctx.arc(size * 0.28 - r * 0.32, size * 0.28 - r * 0.32, r * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export const BACKDROP_TRACKS: BackdropTrack[] = [
  {
    id: "none",
    name: "Natural Camera",
    category: "natural",
    tagline: "Your natural room and environment",
    previewGradient: "linear-gradient(135deg, #71717a 0%, #3f3f46 100%)",
    iconEmoji: "📷",
    draw: () => {},
  },
  {
    id: "haru-sky",
    name: "Haru Sky Blue",
    category: "korean",
    tagline: "Seoul's #1 viral porcelain skin-brightening powder blue",
    previewGradient: "linear-gradient(135deg, #e0f2fe 0%, #7dd3fc 50%, #38bdf8 100%)",
    iconEmoji: "🩵",
    draw: (ctx, width, height) => {
      // High-key illuminating Korean photo booth baby blue
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.38,
        Math.min(width, height) * 0.08,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85
      );
      grad.addColorStop(0, "#f0f9ff"); // Pure light center
      grad.addColorStop(0.35, "#bae6fd");
      grad.addColorStop(0.75, "#7dd3fc");
      grad.addColorStop(1, "#38bdf8");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Subtle beauty diffusion glow
      const beautyGlow = ctx.createRadialGradient(
        width * 0.5,
        height * 0.35,
        0,
        width * 0.5,
        height * 0.35,
        width * 0.45
      );
      beautyGlow.addColorStop(0, "rgba(255, 255, 255, 0.45)");
      beautyGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = beautyGlow;
      ctx.fillRect(0, 0, width, height);
    },
  },
  {
    id: "strawberry-milk",
    name: "Strawberry Milk",
    category: "korean",
    tagline: "Soft marshmallow blush pink with gentle beauty glow",
    previewGradient: "linear-gradient(135deg, #ffe4e6 0%, #f472b6 50%, #db2777 100%)",
    iconEmoji: "🍓",
    draw: (ctx, width, height) => {
      // Soft milky rose blush
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.36,
        Math.min(width, height) * 0.1,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85
      );
      grad.addColorStop(0, "#fff1f2");
      grad.addColorStop(0.35, "#fce7f3");
      grad.addColorStop(0.7, "#fbcfe8");
      grad.addColorStop(1, "#f472b6");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Delicate floating micro-stars
      const twinkles = [
        { x: 0.12, y: 0.18, r: 6 },
        { x: 0.88, y: 0.22, r: 7 },
        { x: 0.2, y: 0.78, r: 5 },
        { x: 0.82, y: 0.72, r: 6 },
        { x: 0.1, y: 0.48, r: 4 },
        { x: 0.9, y: 0.52, r: 5 },
      ];
      twinkles.forEach((t) => {
        drawSparkle(ctx, t.x * width, t.y * height, t.r, "rgba(244, 114, 182, 0.6)");
      });
    },
  },
  {
    id: "coquette-bows",
    name: "Coquette Ribbons",
    category: "cute",
    tagline: "Soft dusty rose with floating satin ribbon bows and pearls",
    previewGradient: "linear-gradient(135deg, #fdf2f8 0%, #fbcfe8 50%, #f472b6 100%)",
    iconEmoji: "🎀",
    draw: (ctx, width, height) => {
      // Ballet pink & cream base
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#fff5f8");
      grad.addColorStop(0.5, "#fce7f3");
      grad.addColorStop(1, "#fbcfe8");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Floating coquette ribbon bows around perimeter
      const bows = [
        { x: width * 0.14, y: height * 0.15, size: 28 },
        { x: width * 0.86, y: height * 0.16, size: 30 },
        { x: width * 0.12, y: height * 0.72, size: 26 },
        { x: width * 0.88, y: height * 0.74, size: 28 },
        { x: width * 0.5, y: height * 0.1, size: 24 },
      ];
      bows.forEach((b) => {
        drawBow(ctx, b.x, b.y, b.size, "rgba(244, 63, 94, 0.75)");
      });

      // Floating luminous pearl dots & mini hearts
      const pearls = [
        { x: width * 0.28, y: height * 0.12, r: 4 },
        { x: width * 0.72, y: height * 0.14, r: 4.5 },
        { x: width * 0.08, y: height * 0.42, r: 3.5 },
        { x: width * 0.92, y: height * 0.44, r: 4 },
        { x: width * 0.22, y: height * 0.84, r: 3.5 },
        { x: width * 0.78, y: height * 0.86, r: 4 },
      ];
      pearls.forEach((p) => {
        const pGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        pGrad.addColorStop(0, "#ffffff");
        pGrad.addColorStop(0.6, "rgba(255, 228, 230, 0.9)");
        pGrad.addColorStop(1, "rgba(244, 114, 182, 0.4)");
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Mini floating hearts
      drawHeart(ctx, width * 0.18, height * 0.32, 12, "rgba(251, 113, 133, 0.45)");
      drawHeart(ctx, width * 0.82, height * 0.34, 14, "rgba(251, 113, 133, 0.45)");
      drawHeart(ctx, width * 0.35, height * 0.88, 11, "rgba(251, 113, 133, 0.35)");
      drawHeart(ctx, width * 0.65, height * 0.88, 12, "rgba(251, 113, 133, 0.35)");
    },
  },
  {
    id: "kirakira-sparkles",
    name: "Kirakira Sparkles",
    category: "purikura",
    tagline: "Lavender-pink dreamscape with 4-point anime starbursts",
    previewGradient: "linear-gradient(135deg, #fae8ff 0%, #d8b4fe 50%, #c084fc 100%)",
    iconEmoji: "✨",
    draw: (ctx, width, height) => {
      // Ethereal purikura lilac gradient
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "#faf5ff");
      grad.addColorStop(0.3, "#f3e8ff");
      grad.addColorStop(0.7, "#e9d5ff");
      grad.addColorStop(1, "#d8b4fe");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Magical center glow
      const centerGlow = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        0,
        width * 0.5,
        height * 0.4,
        width * 0.5
      );
      centerGlow.addColorStop(0, "rgba(255, 255, 255, 0.55)");
      centerGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, width, height);

      // Array of anime 4-pointed kirakira sparkles
      const sparkles = [
        { x: 0.12, y: 0.15, r: 16, c: "rgba(192, 132, 252, 0.7)" },
        { x: 0.85, y: 0.18, r: 18, c: "rgba(244, 114, 182, 0.7)" },
        { x: 0.22, y: 0.32, r: 11, c: "rgba(168, 85, 247, 0.6)" },
        { x: 0.78, y: 0.35, r: 13, c: "rgba(192, 132, 252, 0.65)" },
        { x: 0.08, y: 0.62, r: 14, c: "rgba(244, 114, 182, 0.65)" },
        { x: 0.9, y: 0.65, r: 15, c: "rgba(168, 85, 247, 0.7)" },
        { x: 0.18, y: 0.82, r: 12, c: "rgba(192, 132, 252, 0.6)" },
        { x: 0.82, y: 0.84, r: 14, c: "rgba(244, 114, 182, 0.6)" },
        { x: 0.5, y: 0.08, r: 12, c: "rgba(255, 255, 255, 0.8)" },
      ];
      sparkles.forEach((s) => {
        drawSparkle(ctx, s.x * width, s.y * height, s.r, s.c);
      });
    },
  },
  {
    id: "sweet-cherry",
    name: "Sweet Cherries",
    category: "cute",
    tagline: "Warm milk-white patterned with dainty red paired cherries",
    previewGradient: "linear-gradient(135deg, #fff1f2 0%, #fecdd3 50%, #fb7185 100%)",
    iconEmoji: "🍒",
    draw: (ctx, width, height) => {
      // Warm sweet cream base
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#fffbf5");
      grad.addColorStop(0.5, "#fff1f2");
      grad.addColorStop(1, "#ffe4e6");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Staggered pattern of sweet paired cherries
      const cherrySpacingX = Math.max(90, Math.round(width / 7));
      const cherrySpacingY = Math.max(90, Math.round(height / 7));

      for (let y = cherrySpacingY * 0.6; y < height; y += cherrySpacingY) {
        const isOffsetRow = Math.round(y / cherrySpacingY) % 2 === 1;
        const startX = isOffsetRow ? cherrySpacingX * 0.5 : 0;
        for (let x = startX + cherrySpacingX * 0.5; x < width; x += cherrySpacingX) {
          drawCherryPair(ctx, x, y, 22);
        }
      }
    },
  },
  {
    id: "cotton-candy",
    name: "Cotton Candy Clouds",
    category: "aesthetic",
    tagline: "Dreamy peach-to-lilac sky with fluffy whipped cloud puffs",
    previewGradient: "linear-gradient(135deg, #fed7aa 0%, #fbcfe8 40%, #c7d2fe 80%, #bae6fd 100%)",
    iconEmoji: "☁️",
    draw: (ctx, width, height) => {
      // Dreamy multi-stop pastel sky
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "#bae6fd"); // soft sky blue top
      grad.addColorStop(0.35, "#ddd6fe"); // lilac
      grad.addColorStop(0.7, "#fbcfe8"); // baby pink
      grad.addColorStop(1, "#fed7aa"); // peach horizon
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Fluffy whipped translucent cloud puffs
      ctx.save();
      const drawCloud = (cx: number, cy: number, scale: number) => {
        ctx.fillStyle = "rgba(255, 255, 255, 0.38)";
        const r = 24 * scale;
        ctx.beginPath();
        ctx.arc(cx - r * 1.4, cy, r * 0.8, 0, Math.PI * 2);
        ctx.arc(cx - r * 0.6, cy - r * 0.5, r, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.5, cy - r * 0.4, r * 0.9, 0, Math.PI * 2);
        ctx.arc(cx + r * 1.3, cy, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
      };

      drawCloud(width * 0.16, height * 0.22, 1.3);
      drawCloud(width * 0.84, height * 0.26, 1.4);
      drawCloud(width * 0.12, height * 0.68, 1.2);
      drawCloud(width * 0.88, height * 0.72, 1.3);
      drawCloud(width * 0.5, height * 0.14, 1.1);

      // Cloud highlights
      drawSparkle(ctx, width * 0.28, height * 0.18, 9, "rgba(255, 255, 255, 0.9)");
      drawSparkle(ctx, width * 0.72, height * 0.22, 11, "rgba(255, 255, 255, 0.9)");
      ctx.restore();
    },
  },
  {
    id: "doodle-hearts",
    name: "Purikura Hearts",
    category: "purikura",
    tagline: "Strawberry cream with playful hand-drawn doodle hearts",
    previewGradient: "linear-gradient(135deg, #ffe4e6 0%, #fda4af 50%, #f43f5e 100%)",
    iconEmoji: "💖",
    draw: (ctx, width, height) => {
      // Sweet strawberry background
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#fff5f5");
      grad.addColorStop(0.5, "#ffe4e6");
      grad.addColorStop(1, "#fecdd3");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Hand-drawn style hearts (filled & outlines)
      const hearts = [
        { x: 0.14, y: 0.14, size: 28, fill: "rgba(244, 63, 94, 0.6)", stroke: "#ffffff" },
        { x: 0.86, y: 0.16, size: 32, fill: "rgba(251, 113, 133, 0.6)", stroke: "#ffffff" },
        { x: 0.1, y: 0.42, size: 22, fill: "rgba(244, 63, 94, 0.5)", stroke: undefined },
        { x: 0.9, y: 0.45, size: 24, fill: "rgba(251, 113, 133, 0.55)", stroke: undefined },
        { x: 0.15, y: 0.75, size: 30, fill: "rgba(244, 63, 94, 0.65)", stroke: "#ffffff" },
        { x: 0.85, y: 0.78, size: 28, fill: "rgba(251, 113, 133, 0.6)", stroke: "#ffffff" },
        { x: 0.5, y: 0.08, size: 20, fill: "rgba(255, 255, 255, 0.8)", stroke: "rgba(244, 63, 94, 0.4)" },
      ];
      hearts.forEach((h) => {
        drawHeart(ctx, h.x * width, h.y * height, h.size, h.fill, h.stroke, 2);
      });

      // Outline doodle hearts
      drawHeart(ctx, width * 0.26, height * 0.28, 16, "", "rgba(244, 63, 94, 0.5)", 2.5);
      drawHeart(ctx, width * 0.74, height * 0.3, 18, "", "rgba(244, 63, 94, 0.5)", 2.5);
      drawHeart(ctx, width * 0.22, height * 0.6, 14, "", "rgba(251, 113, 133, 0.5)", 2);
      drawHeart(ctx, width * 0.78, height * 0.62, 16, "", "rgba(251, 113, 133, 0.5)", 2);

      // Purikura cross sparkles
      drawSparkle(ctx, width * 0.2, height * 0.18, 8, "rgba(255, 255, 255, 0.85)");
      drawSparkle(ctx, width * 0.8, height * 0.2, 9, "rgba(255, 255, 255, 0.85)");
    },
  },
  {
    id: "lavender-haze",
    name: "Lavender Lilac Mist",
    category: "korean",
    tagline: "Cool-toned ethereal lilac mist for silver jewelry & dark hair",
    previewGradient: "linear-gradient(135deg, #ede9fe 0%, #c4b5fd 50%, #8b5cf6 100%)",
    iconEmoji: "🪻",
    draw: (ctx, width, height) => {
      // Cool lilac mist gradient
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.38,
        Math.min(width, height) * 0.08,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85
      );
      grad.addColorStop(0, "#f5f3ff");
      grad.addColorStop(0.35, "#ede9fe");
      grad.addColorStop(0.7, "#ddd6fe");
      grad.addColorStop(1, "#c4b5fd");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Soft moonlight center diffusion
      const glow = ctx.createRadialGradient(
        width * 0.5,
        height * 0.36,
        0,
        width * 0.5,
        height * 0.36,
        width * 0.4
      );
      glow.addColorStop(0, "rgba(255, 255, 255, 0.5)");
      glow.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    },
  },
  {
    id: "pastel-gingham",
    name: "Pastel Gingham",
    category: "cute",
    tagline: "Sweet 90s picnic gingham pattern in strawberry and cream",
    previewGradient: "linear-gradient(135deg, #fff1f2 0%, #fecdd3 50%, #f472b6 100%)",
    iconEmoji: "🧺",
    draw: (ctx, width, height) => {
      // Warm cream base
      ctx.fillStyle = "#fff5f7";
      ctx.fillRect(0, 0, width, height);

      const size = Math.max(34, Math.round(width / 16));

      // Horizontal pink stripes
      ctx.fillStyle = "rgba(244, 114, 182, 0.25)";
      for (let y = 0; y < height; y += size * 2) {
        ctx.fillRect(0, y, width, size);
      }

      // Vertical pink stripes
      for (let x = 0; x < width; x += size * 2) {
        ctx.fillRect(x, 0, size, height);
      }

      // Intersections are deeper pink naturally via alpha blending
      // Gentle center vignette for portrait warmth
      const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.4,
        Math.min(width, height) * 0.15,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.8
      );
      vignette.addColorStop(0, "rgba(255, 255, 255, 0.35)");
      vignette.addColorStop(1, "rgba(251, 113, 133, 0.15)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    },
  },
  {
    id: "buttercream",
    name: "Buttercream Vanilla",
    category: "korean",
    tagline: "Warm sunshine vanilla pastel for cozy cafe aesthetic",
    previewGradient: "linear-gradient(135deg, #fef9c3 0%, #fef08a 50%, #facc15 100%)",
    iconEmoji: "🧁",
    draw: (ctx, width, height) => {
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.38,
        Math.min(width, height) * 0.08,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85
      );
      grad.addColorStop(0, "#fefce8");
      grad.addColorStop(0.35, "#fef9c3");
      grad.addColorStop(0.7, "#fef08a");
      grad.addColorStop(1, "#fde047");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Warm sunshine glow
      const sun = ctx.createRadialGradient(
        width * 0.5,
        height * 0.35,
        0,
        width * 0.5,
        height * 0.35,
        width * 0.45
      );
      sun.addColorStop(0, "rgba(255, 255, 255, 0.6)");
      sun.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, width, height);
    },
  },
  {
    id: "matcha-latte",
    name: "Matcha Latte",
    category: "korean",
    tagline: "Muted pistachio and sage pastel from Seongsu-dong studios",
    previewGradient: "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 50%, #86efac 100%)",
    iconEmoji: "🍵",
    draw: (ctx, width, height) => {
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.38,
        Math.min(width, height) * 0.08,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85
      );
      grad.addColorStop(0, "#f0fdf4");
      grad.addColorStop(0.35, "#dcfce7");
      grad.addColorStop(0.7, "#bbf7d0");
      grad.addColorStop(1, "#86efac");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Soft studio spotlight
      const light = ctx.createRadialGradient(
        width * 0.5,
        height * 0.35,
        0,
        width * 0.5,
        height * 0.35,
        width * 0.42
      );
      light.addColorStop(0, "rgba(255, 255, 255, 0.5)");
      light.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, width, height);
    },
  },
  {
    id: "angelic-stars",
    name: "Midnight Angel Stars",
    category: "aesthetic",
    tagline: "Deep dreamy periwinkle night sky with glowing stars & moon",
    previewGradient: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)",
    iconEmoji: "🌙",
    draw: (ctx, width, height) => {
      // Dreamy deep indigo-periwinkle sky
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(0.4, "#1e1b4b");
      grad.addColorStop(0.8, "#2e1065");
      grad.addColorStop(1, "#172554");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Crescent moon in upper right
      ctx.save();
      const moonX = width * 0.84;
      const moonY = height * 0.16;
      const moonR = Math.min(width, height) * 0.055;

      // Moon halo glow
      const moonHalo = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 2.5);
      moonHalo.addColorStop(0, "rgba(253, 224, 71, 0.35)");
      moonHalo.addColorStop(0.5, "rgba(192, 132, 252, 0.15)");
      moonHalo.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = moonHalo;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Crescent moon shape
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1e1b4b";
      ctx.beginPath();
      ctx.arc(moonX - moonR * 0.45, moonY - moonR * 0.15, moonR * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Twinkling stars
      const stars = [
        { x: 0.12, y: 0.12, r: 8, c: "rgba(254, 240, 138, 0.85)" },
        { x: 0.22, y: 0.22, r: 12, c: "rgba(255, 255, 255, 0.9)" },
        { x: 0.1, y: 0.38, r: 7, c: "rgba(192, 132, 252, 0.75)" },
        { x: 0.88, y: 0.34, r: 10, c: "rgba(254, 240, 138, 0.8)" },
        { x: 0.15, y: 0.65, r: 9, c: "rgba(255, 255, 255, 0.85)" },
        { x: 0.86, y: 0.68, r: 11, c: "rgba(192, 132, 252, 0.8)" },
        { x: 0.2, y: 0.84, r: 8, c: "rgba(254, 240, 138, 0.8)" },
        { x: 0.82, y: 0.86, r: 9, c: "rgba(255, 255, 255, 0.85)" },
        { x: 0.45, y: 0.08, r: 10, c: "rgba(254, 240, 138, 0.85)" },
      ];
      stars.forEach((s) => {
        drawSparkle(ctx, s.x * width, s.y * height, s.r, s.c);
      });
    },
  },
];

export function getBackdropTrack(id: string): BackdropTrack {
  return BACKDROP_TRACKS.find((b) => b.id === id) || BACKDROP_TRACKS[0];
}
