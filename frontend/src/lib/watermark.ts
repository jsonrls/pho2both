/**
 * Watermark and Expiry Guardrail Utility for Pho2Booth
 * Renders an unmistakable yet elegant watermark and expiry stamp for unauthenticated guest users.
 * When a user is on an active paid plan (Creator or Event Pass), no watermark is applied.
 */

export function isPaidPlan(plan?: string | null): boolean {
  return plan === "creator_monthly" || plan === "creator_yearly" || plan === "event";
}

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number = 2,
  isGuest: boolean = true
) {
  if (!isGuest) return;

  ctx.save();

  // 1. Diagonal repeating watermark pattern
  const text = "PHO2BOOTH • GUEST PREVIEW • EXPIRES IN 24H";
  const fontSize = Math.max(16 * scale, Math.round(width * 0.024));
  ctx.font = `900 ${fontSize}px sans-serif`;
  ctx.letterSpacing = `${2 * scale}px`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const angle = -28 * (Math.PI / 180);
  const stepX = 420 * scale;
  const stepY = 220 * scale;

  ctx.save();
  ctx.rotate(angle);

  // Extend bounding box coverage to account for rotation
  const diag = Math.sqrt(width * width + height * height);
  for (let y = -diag; y < diag * 1.5; y += stepY) {
    const isOdd = Math.floor(y / stepY) % 2 === 0;
    const xOffset = isOdd ? stepX / 2 : 0;
    for (let x = -diag; x < diag * 1.5; x += stepX) {
      const posX = x + xOffset;
      const posY = y;

      // Dark shadow for readability on light areas
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 4 * scale;
      ctx.shadowOffsetX = 1 * scale;
      ctx.shadowOffsetY = 1 * scale;

      // Semi-transparent crisp white fill
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.fillText(text, posX, posY);

      // Subtle stroke for contrast on pure white images
      ctx.strokeStyle = "rgba(15, 23, 42, 0.22)";
      ctx.lineWidth = 1 * scale;
      ctx.strokeText(text, posX, posY);
    }
  }
  ctx.restore();

  // 2. High-visibility Bottom Expiry Ribbon
  const ribbonH = 34 * scale;
  const ribbonY = height - ribbonH;

  // Frosted dark glass bar
  ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
  ctx.fillRect(0, ribbonY, width, ribbonH);

  // Warning text
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${12 * scale}px sans-serif`;
  ctx.letterSpacing = `${1.5 * scale}px`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "🔒 GUEST PREVIEW • EXPIRES IN 24 HOURS • SIGN IN TO REMOVE WATERMARK",
    width / 2,
    ribbonY + ribbonH / 2
  );

  ctx.restore();
}
