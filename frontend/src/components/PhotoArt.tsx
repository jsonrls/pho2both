import type { CSSProperties } from "react";

interface PhotoArtProps {
  index?: number;
  filter?: string;
  className?: string;
  alt?: string;
}

export function PhotoArt({ index = 0, filter = "none", className = "", alt = "" }: PhotoArtProps) {
  const pose = ((index % 4) + 4) % 4;
  return <div className={`photo-art ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={!alt} style={{ backgroundPosition: `${pose % 2 ? 100 : 0}% ${pose > 1 ? 100 : 0}%`, filter }} />;
}

interface SampleStripProps {
  theme?: "cream" | "tomato" | "lilac" | "sage" | "ink";
  label?: string;
  variant?: "strip" | "polaroid" | "grid";
  className?: string;
  filter?: string;
}

const COLORS = {
  cream: ["#fffdf5", "#29251f"],
  tomato: ["#d94c35", "#fffdf5"],
  lilac: ["#dbcfeb", "#29251f"],
  sage: ["#ccd8b9", "#29251f"],
  ink: ["#29251f", "#fffdf5"],
};

export function SampleStrip({ theme = "cream", label = "the good old days", variant = "strip", className = "", filter = "none" }: SampleStripProps) {
  const [background, color] = COLORS[theme];
  return <div className={`sample-strip sample-strip-${variant} ${className}`} aria-hidden="true" style={{ background, color, "--strip-color": color } as CSSProperties}>
    <div className="sample-strip-top"><span>PHO2BOOTH</span><span>✳</span></div>
    <div className="sample-strip-photos">{Array.from({ length: variant === "polaroid" ? 1 : 4 }, (_, index) => <PhotoArt key={index} index={index} filter={filter} />)}</div>
    <div className="sample-strip-caption">{label}<span>little moments, kept forever ♡</span></div>
  </div>;
}
