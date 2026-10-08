"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Play, Palette, Video } from "lucide-react";
import { OutputFormat } from "@/types/booth";
import { SampleStrip } from "@/components/PhotoArt";
import styles from "./CameraView.module.css";

interface FormatSelectionScreenProps {
  onSelectFormat: (format: OutputFormat) => void;
  onBack: () => void;
}
const formats = [
  { id: "strip", title: "Photo strip", label: "The booth classic", description: "A little line-up of your favorite poses. Add a frame, a caption, and your own finishing touches.", theme: "cream", variant: "strip", background: "#e9e4d9" },
  { id: "single", title: "Single photo", label: "One very good moment", description: "Let your lead photo have the spotlight with a portrait frame and a personal caption.", theme: "lilac", variant: "polaroid", background: "#ece5f2" },
  { id: "collage", title: "Collage", label: "Better together", description: "Bring your session into one picture with grids, layouts, and room for every expression.", theme: "sage", variant: "grid", background: "#e3e8d9" },
  { id: "gif", title: "Motion loop", label: "Looping GIF", description: "Your poses, forwards and backwards in a looping GIF.", theme: "tomato", variant: "strip", background: "#f0d5ca" },
  { id: "video", title: "Video reel", label: "MP4 video", description: "A short, silent video of your photos, with motion and transitions.", theme: "ink", variant: "strip", background: "#e9e4d9" },
  { id: "ai", title: "Stylized filters", label: "Darkroom tones", description: "Explore stylized color and contrast with photo filters. Give your lead photo a fresh look.", theme: "lilac", variant: "strip", background: "#ece5f2" },
] as const;

export function FormatSelectionScreen({ onSelectFormat, onBack }: FormatSelectionScreenProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = useCallback(() => {
    const el = gridRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = gridRef.current;
    if (!el) return;

    const handleResize = () => updateScrollState();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateScrollState]);

  const handleScroll = (direction: "left" | "right") => {
    const el = gridRef.current;
    if (!el) return;
    const scrollAmount = Math.max(280, Math.floor(el.clientWidth * 0.72));
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <section className={styles.review}>
      <div className={styles.formatTopBar}>
        <button className="button button-quiet" onClick={onBack}>
          <ArrowLeft size={17} /> Back to photos
        </button>
        <div className={styles.formatScrollControls} role="group" aria-label="Format scroll controls">
          <button
            type="button"
            className="icon-button"
            onClick={() => handleScroll("left")}
            disabled={!canScrollLeft}
            aria-label="Previous format options"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => handleScroll("right")}
            disabled={!canScrollRight}
            aria-label="Next format options"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <header className={styles.reviewHeading}>
        <h1>What’s your kind of memory?</h1>
        <p>Choose a format. Your photos are ready for their finishing touches.</p>
      </header>
      <div
        className={styles.formatGrid}
        ref={gridRef}
        onScroll={updateScrollState}
        role="region"
        aria-label="Format options carousel"
      >
        {formats.map((item) => (
          <button
            className={styles.formatCard}
            key={item.id}
            onClick={() => onSelectFormat(item.id)}
          >
            <div className={styles.formatArt} style={{ background: item.background }} aria-hidden="true">
              <SampleStrip
                theme={item.theme}
                variant={item.variant}
                label="A MOMENT TO KEEP"
                filter={item.id === "ai" ? "sepia(.3) saturate(1.4)" : undefined}
              />
              {item.id === "gif" ? <Play /> : item.id === "video" ? <Video /> : item.id === "ai" ? <Palette /> : null}
            </div>
            <div className={styles.formatCopy}>
              <span>{item.label}</span>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <div>Select this format</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
