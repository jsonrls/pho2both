"use client";

import { useState } from "react";
import Link from "next/link";
import { Camera } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Brand } from "@/components/Brand";
import { PhotoArt, SampleStrip } from "@/components/PhotoArt";
import { FILTERS, LAYOUTS } from "@/lib/constants";
import { FilterType, FrameColorOption, LayoutType, OutputFormat } from "@/types/booth";
import styles from "./LandingPage.module.css";

export interface StartBoothOptions {
  layout?: LayoutType;
  frame?: FrameColorOption;
  eventName?: string;
  format?: OutputFormat;
  filter?: FilterType;
}

interface LandingPageProps {
  onStartBooth: (options?: StartBoothOptions) => void;
}

const colors: FrameColorOption[] = [
  { id: "studio-cream", name: "Cream", hex: "#f7f4eb", textColor: "#29251f" },
  { id: "studio-tomato", name: "Tomato", hex: "#d94c35", textColor: "#11100e" },
  { id: "studio-lilac", name: "Lilac", hex: "#dbcfeb", textColor: "#29251f" },
  { id: "studio-sage", name: "Sage", hex: "#ccd8b9", textColor: "#29251f" },
  { id: "studio-ink", name: "Ink", hex: "#29251f", textColor: "#f7f4eb" },
];

const templates = [
  { name: "The little classic", note: "Four poses. One very good strip.", layout: "strip-4" as const, theme: "cream" as const, variant: "strip" as const, filter: "original" as const, color: 0 },
  { name: "A lilac kind of day", note: "A soft frame for your favorite face.", layout: "polaroid" as const, theme: "lilac" as const, variant: "polaroid" as const, filter: "soft" as const, color: 2 },
  { name: "Better together", note: "Room for every side of your story.", layout: "grid-2x2" as const, theme: "sage" as const, variant: "grid" as const, filter: "warm" as const, color: 3 },
];

const previewLayoutGroups = [
  {
    category: "Vertical Photo Strips",
    items: LAYOUTS.filter(item => ["strip-4", "strip-3", "strip-2", "strip-5"].includes(item.id)),
  },
  {
    category: "Grids & Collages",
    items: LAYOUTS.filter(item => ["grid-2x2", "grid-3x2", "grid-1x3"].includes(item.id)),
  },
  {
    category: "Instant & Polaroid",
    items: LAYOUTS.filter(item => ["polaroid", "polaroid-duo"].includes(item.id)),
  },
];

const previewFilterGroups = [
  {
    category: "Natural & Warm Tones",
    items: FILTERS.filter(item => ["original", "auto", "warm", "cool", "soft", "matte", "fresh"].includes(item.id)),
  },
  {
    category: "Black & White",
    items: FILTERS.filter(item => ["classic-bw", "noir"].includes(item.id)),
  },
  {
    category: "Vintage & Analog",
    items: FILTERS.filter(item => ["vintage", "sepia", "golden-hour"].includes(item.id)),
  },
  {
    category: "Stylized & Creative",
    items: FILTERS.filter(item => ["pastel", "dreamy"].includes(item.id)),
  },
];
const formats: { id: OutputFormat; name: string }[] = [
  { id: "strip", name: "Photo strips" },
  { id: "single", name: "Single photos" },
  { id: "collage", name: "Collages" },
  { id: "gif", name: "Motion loops" },
  { id: "video", name: "Video reels" },
  { id: "ai", name: "Darkroom filters" },
];

export function LandingPage({ onStartBooth }: LandingPageProps) {
  const [layout, setLayout] = useState<LayoutType>("strip-4");
  const [frame, setFrame] = useState(colors[0]);
  const [filter, setFilter] = useState<FilterType>("original");
  const selected = LAYOUTS.find(item => item.id === layout) || LAYOUTS[0];
  const cssFilter = FILTERS.find(item => item.id === filter)?.cssFilter || "none";
  const launch = () => onStartBooth({ layout, frame, filter, format: selected.category === "grids" ? "collage" : selected.category === "polaroid" ? "single" : "strip" });

  return (
    <div className={styles.page}>
      <SiteHeader onStartBooth={() => onStartBooth()} />
      <main id="main-content">
        <section className={`page-container ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <p className={styles.leadPill}>Cozy browser photo booth</p>
            <h1>Good times.<br />Great little<br /><span>keepsakes.</span></h1>
            <p>Pull up a chair. Bring your favorite people. Turn a few silly poses into photo strips worth keeping.</p>
            <div className={styles.actions}>
              <button className="button button-primary" onClick={() => onStartBooth()}>
                <Camera size={19} /> Step into the booth
              </button>
              <a className="button button-quiet" href="#mini-studio">
                Preview your look
              </a>
            </div>
            <p className={styles.small}>Made right in your browser. Camera shy? Upload photos instead.</p>
          </div>
          <div className={styles.heroArt} aria-hidden="true">
            <span className={styles.handwritten}>a little proof we were here</span>
            <SampleStrip theme="tomato" label="THE GOOD STUFF" className={styles.heroStripBack} />
            <SampleStrip theme="cream" label="US, BEING US. ♡" className={styles.heroStripFront} />
            <span className={styles.sticker}>LESS POSING.<br />MORE YOU.</span>
          </div>
        </section>

        <div className={styles.ribbon}>
          <span>A few seconds to pose</span>
          <span aria-hidden="true">·</span>
          <span>A little memory to keep</span>
          <span aria-hidden="true">·</span>
          <span>Make it yours</span>
        </div>

        <section id="mini-studio" className={`page-container ${styles.section}`}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Find your good side.<br />Then your favorite frame.</h2>
            </div>
            <p>Play with a look before the camera comes on. We’ll bring your choices into the booth.</p>
          </div>
          <div className={styles.miniStudio}>
            <div className={styles.sampleStage}>
              <div className={`${styles.liveSample} ${selected.category === "grids" ? styles.gridSample : selected.category === "polaroid" ? styles.polaroidSample : ""}`} style={{ background: frame.hex, color: frame.textColor }}>
                <span className={styles.sampleLabel}>A VERY GOOD DAY</span>
                <div className={styles.samplePhotos} style={{ gridTemplateColumns: selected.category === "grids" || layout === "mini-strip-duo" ? "1fr 1fr" : "1fr" }}>
                  {Array.from({ length: selected.count }, (_, index) => (
                    <PhotoArt key={index} index={index % 4} filter={cssFilter} alt="" />
                  ))}
                </div>
                <span className={styles.sampleLabel}>PHO2BOOTH / MADE OF MOMENTS</span>
              </div>
              <span className={styles.sampleNote}>Sample preview · your shots go here</span>
            </div>
            <div className={styles.controls}>
              <div>
                <label className="control-label" htmlFor="sample-layout">1. Pick a layout</label>
                <select id="sample-layout" className="control-input" value={layout} onChange={e => setLayout(e.target.value as LayoutType)}>
                  {previewLayoutGroups.map(group => (
                    <optgroup key={group.category} label={group.category}>
                      {group.items.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.count} {item.count === 1 ? "photo" : "photos"})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <fieldset>
                <legend className="control-label">2. Add frame color</legend>
                <div className={styles.swatches}>
                  {colors.map(color => (
                    <button key={color.id} aria-pressed={frame.id === color.id} onClick={() => setFrame(color)} style={{ background: color.hex, color: color.textColor }}>
                      {color.name}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div>
                <label className="control-label" htmlFor="sample-filter">3. Set the mood</label>
                <select id="sample-filter" className="control-input" value={filter} onChange={e => setFilter(e.target.value as FilterType)}>
                  {previewFilterGroups.map(group => (
                    <optgroup key={group.category} label={group.category}>
                      {group.items.map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button className="button button-primary" onClick={launch}>
                Use this style
              </button>
              <p className={styles.small}>More layouts and backdrops are waiting inside the booth.</p>
            </div>
          </div>
        </section>

        <section id="templates" className={`page-container ${styles.section}`}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>A frame for your mood.</h2>
            </div>
            <p>A few favorites from the studio. Make them your own.</p>
          </div>
          <div className={styles.templates}>
            {templates.map(item => (
              <button
                className={styles.template}
                key={item.name}
                onClick={() => onStartBooth({ layout: item.layout, frame: colors[item.color], filter: item.filter, format: item.variant === "grid" ? "collage" : "strip" })}
              >
                <div className={styles.templateArt}>
                  <SampleStrip theme={item.theme} variant={item.variant} label="KEEP THIS ONE" filter={FILTERS.find(f => f.id === item.filter)?.cssFilter} />
                </div>
                <div className={styles.templateCopy}>
                  <h3>{item.name}</h3>
                  <p>{item.note}</p>
                </div>
              </button>
            ))}
          </div>
          <div className={styles.formatLinks}>
            <span>More ways to keep a moment:</span>
            {formats.map(item => (
              <button key={item.id} onClick={() => onStartBooth({ format: item.id })}>
                {item.name}
              </button>
            ))}
          </div>
        </section>

        <section id="keepsakes-overview" className={styles.how}>
          <div className={`page-container ${styles.section}`}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>Keepsakes built for printing, sharing, or looping.</h2>
              </div>
              <p>Everything renders as authentic print-ready keepsakes right in your browser.</p>
            </div>
            <div className={styles.keepsakeGrid}>
              <div className={styles.keepsakeCard}>
                <h3>Classic Photo Strips</h3>
                <p>Vertical strips of 2 to 6 shots with authentic photobooth paper framing and personalized date stamps.</p>
              </div>
              <div className={styles.keepsakeCard}>
                <h3>Single Portraits & Polaroids</h3>
                <p>A dedicated spotlight on your best photo, framed in timeless polaroid margins with custom caption room.</p>
              </div>
              <div className={styles.keepsakeCard}>
                <h3>Grid Collages</h3>
                <p>2x2 and group grids that collect your session poses into a balanced, ready-to-frame card.</p>
              </div>
              <div className={styles.keepsakeCard}>
                <h3>Motion Loops & Video Reels</h3>
                <p>Looping animated GIFs and smooth MP4 video reels capturing every expression in motion.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="details" className={`page-container ${styles.faq} ${styles.section}`}>
          <div>
            <h2>How it works.</h2>
            <p className={styles.detailsSub}>Simple, private, and browser-native photo booth experience.</p>
          </div>
          <div className={styles.detailsList}>
            <div className={styles.detailItem}>
              <h3>Private by default</h3>
              <p>Your camera and photos stay strictly in your browser session. Nothing is uploaded to public servers unless you choose to create a share link.</p>
            </div>
            <div className={styles.detailItem}>
              <h3>Upload whenever you like</h3>
              <p>No webcam? Or want to make keepsakes from existing camera roll photos? Simply select existing photos to jump straight into styling.</p>
            </div>
            <div className={styles.detailItem}>
              <h3>Instant downloads</h3>
              <p>Download your finished keepsakes immediately as crisp high-resolution PNGs or animated GIFs ready to print or message.</p>
            </div>
          </div>
        </section>

        <section className={`page-container ${styles.finalSection}`}>
          <div className={styles.finalCta}>
            <h2>Go on.<br />Make a memory.</h2>
            <button className="button button-primary" onClick={() => onStartBooth()}>
              <Camera size={19} /> Step into the booth
            </button>
          </div>
        </section>
      </main>

      <footer className={`page-container ${styles.footer}`}>
        <Brand href="/" />
        <span>Little photos. Big feelings.</span>
        <Link href="/download">Find by share code</Link>
        <Link href="/auth">Your account</Link>
      </footer>
    </div>
  );
}
