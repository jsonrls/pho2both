"use client";

import Image from "next/image";
import { useState } from "react";
import { RotateCcw, ArrowRight } from "lucide-react";
import { CapturedShot } from "@/types/booth";
import styles from "./CameraView.module.css";

interface PhotoPreviewScreenProps {
  shots: CapturedShot[];
  onRetake: () => void;
  onUsePhoto: (selectedIndex: number) => void;
}

export function PhotoPreviewScreen({ shots, onRetake, onUsePhoto }: PhotoPreviewScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const index = Math.min(selectedIndex, Math.max(0, shots.length - 1));

  if (!shots.length) {
    return (
      <section className={styles.reviewLayout}>
        <div className={styles.reviewEmptyState}>
          <h1>No photos just yet.</h1>
          <p>Let’s head back to the booth and make some.</p>
          <button className="button button-primary" onClick={onRetake}>
            Back to camera
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.reviewLayout}>
      {/* Left Column: Hero Lead Photo */}
      <div className={styles.reviewHeroColumn}>
        <figure className={styles.reviewPhoto}>
          <Image
            unoptimized
            width={800}
            height={600}
            src={shots[index].dataUrl}
            alt={`Your selected photo, pose ${index + 1}`}
            priority
          />
          <figcaption>
            <span>YOUR LEAD PHOTO</span>
            <span aria-live="polite">POSE {index + 1} / {shots.length}</span>
          </figcaption>
        </figure>
      </div>

      {/* Right Column: Title, Poses Selection & Action Buttons */}
      <div className={styles.reviewPanelColumn}>
        <header className={styles.reviewPanelHeader}>
          <h1>Oh, these are keepers.</h1>
          <p>Pick your favorite for the lead photo. All {shots.length} photos come with you to the studio.</p>
        </header>

        <div className={styles.reviewPoseSection}>
          <span className={styles.reviewSectionLabel}>Choose lead photo</span>
          <div className={styles.thumbnails} role="group" aria-label="Choose your lead photo">
            {shots.map((shot, shotIndex) => (
              <button
                key={shot.id}
                type="button"
                className={styles.thumbnailBtn}
                aria-pressed={index === shotIndex}
                aria-label={`Choose pose ${shotIndex + 1} as lead photo`}
                onClick={() => setSelectedIndex(shotIndex)}
              >
                <div className={styles.thumbnailImgWrap}>
                  <Image unoptimized width={140} height={105} src={shot.dataUrl} alt="" />
                </div>
                <div className={styles.thumbnailMeta}>
                  <span className={styles.thumbnailTitle}>Pose {shotIndex + 1}</span>
                  {index === shotIndex ? (
                    <span className={styles.leadBadge}>✓ Lead photo</span>
                  ) : (
                    <span className={styles.pickBadge}>Select</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.reviewActions}>
          <button
            type="button"
            className="button button-primary"
            onClick={() => onUsePhoto(index)}
          >
            Keep all {shots.length} &amp; continue <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={onRetake}
          >
            <RotateCcw size={16} /> Retake session
          </button>
        </div>
      </div>
    </section>
  );
}
