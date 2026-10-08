"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { Camera, Check, Edit3, Upload, RotateCcw } from "lucide-react";
import { CapturedShot, FilterType, FrameColorOption, LayoutType } from "@/types/booth";
import { FILTERS, FRAME_COLORS, LAYOUTS, EVENT_TEMPLATES } from "@/lib/constants";
import { BACKDROP_TRACKS } from "@/lib/backdropTracks";
import {
  getSelfieSegmenter,
  renderCompositedVideo,
  EdgeRefinementPreset,
  setEdgeRefinementPreset,
} from "@/lib/selfieSegmentation";
import { PhotoArt } from "@/components/PhotoArt";
import styles from "./CameraView.module.css";

interface CameraViewProps {
  onCaptureComplete: (shots: CapturedShot[]) => void;
  targetCount: number;
  onTargetCountChange: (count: number) => void;
  countdownSeconds: number;
  onCountdownChange: (sec: number) => void;
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  selectedFrame: FrameColorOption;
  onFrameChange: (frame: FrameColorOption) => void;
  selectedLayout: LayoutType;
  onLayoutChange: (layout: LayoutType) => void;
  eventName?: string;
  onEventNameChange?: (name: string) => void;
}
const filterAliases: Partial<Record<FilterType, FilterType>> = { none: "original", grayscale: "classic-bw", "cyber-neon": "neon", warmth: "golden-hour" };
const cameraFilters = FILTERS.filter(item => !filterAliases[item.id]);

const cameraLayoutGroups = [
  {
    category: "Vertical Photo Strips",
    items: LAYOUTS.filter(item => item.category === "strips"),
  },
  {
    category: "Grids & Posters",
    items: LAYOUTS.filter(item => item.category === "grids"),
  },
  {
    category: "Instant & Polaroid",
    items: LAYOUTS.filter(item => item.category === "polaroid"),
  },
  {
    category: "Film & Cinema",
    items: LAYOUTS.filter(item => item.category === "cinema"),
  },
  {
    category: "Creative Keepsakes",
    items: LAYOUTS.filter(item => item.category === "creative"),
  },
].filter(group => group.items.length > 0);

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
    const cancel = () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); };
    const timer = window.setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
function loadImage(src: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { clearTimeout(timer); image.onload = null; image.onerror = null; signal.removeEventListener("abort", cancel); };
    const fail = () => { cleanup(); reject(new Error("This image could not be opened. Try a JPEG, PNG, or WebP image.")); };
    const cancel = () => { cleanup(); image.src = ""; reject(new DOMException("Cancelled", "AbortError")); };
    const timer = window.setTimeout(fail, 15000);
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = fail;
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    image.src = src;
  });
}

function renderPhoto(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  filter: FilterType,
  mirror: boolean,
  crop?: number[],
  maxWidth = 1280,
  activeBackdrop = "none"
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not create a photo canvas.");
  const scale = Math.min(1, maxWidth / width);
  const w = Math.round(width * scale), h = Math.round(height * scale);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  context.clearRect(0, 0, w, h);
  context.fillStyle = "#29251f";
  context.fillRect(0, 0, w, h);
  const matched = cameraFilters.find(f => f.id === filter);
  const filterCss = (matched && matched.cssFilter !== "none") ? matched.cssFilter : "none";

  let composited = false;
  if (activeBackdrop !== "none" && typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    context.save();
    context.filter = "none";
    composited = renderCompositedVideo(context, source, w, h, activeBackdrop, mirror, crop, filterCss);
    context.restore();
  }

  if (!composited) {
    context.save();
    context.filter = filterCss;
    if (mirror) { context.translate(w, 0); context.scale(-1, 1); }
    if (crop) context.drawImage(source, crop[0], crop[1], crop[2], crop[3], 0, 0, w, h);
    else context.drawImage(source, 0, 0, w, h);
    context.restore();
  }
}

export function CameraView({
  onCaptureComplete,
  targetCount,
  onTargetCountChange,
  countdownSeconds,
  onCountdownChange,
  activeFilter,
  onFilterChange,
  selectedFrame,
  onFrameChange,
  selectedLayout,
  onLayoutChange,
  eventName = "The good times club",
  onEventNameChange,
}: CameraViewProps) {
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [tempEventName, setTempEventName] = useState(eventName);

  useEffect(() => {
    setTempEventName(eventName);
  }, [eventName]);

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = tempEventName.trim() || "The good times club";
    setTempEventName(finalName);
    onEventNameChange?.(finalName);
    setIsEditingEvent(false);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [shotNumber, setShotNumber] = useState(0);
  const [shots, setShots] = useState<CapturedShot[]>([]);
  const [mirror, setMirror] = useState(true);
  const [flash, setFlash] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [panel, setPanel] = useState("filters");
  const [search, setSearch] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [activeBackdrop, setActiveBackdrop] = useState<string>("none");
  const [edgePreset, setEdgePreset] = useState<EdgeRefinementPreset>("studio");
  const settings = useRef({ activeFilter, mirror, activeBackdrop });
  useEffect(() => { settings.current = { activeFilter, mirror, activeBackdrop }; }, [activeFilter, mirror, activeBackdrop]);

  const handleSelectEdgePreset = (preset: EdgeRefinementPreset) => {
    setEdgePreset(preset);
    setEdgeRefinementPreset(preset);
  };

  const handleSelectBackdrop = async (backdropId: string) => {
    setActiveBackdrop(backdropId);
    if (backdropId !== "none") {
      try {
        await getSelfieSegmenter();
      } catch (err) {
        console.warn("Could not pre-load selfie segmenter:", err);
      }
    }
  };

  const startCamera = useCallback(async () => {
    const request = ++cameraRequest.current;
    operation.current?.abort();
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setReady(false); setCameraError(null); setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is unavailable in this browser. Try uploading photos instead.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (!mounted.current || request !== cameraRequest.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    } catch (cause) {
      if (!mounted.current || request !== cameraRequest.current) return;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setReady(false);
      setCameraError(cause instanceof Error && cause.name === "NotAllowedError" ? "Camera permission was declined. Allow it in your browser settings, then retry." : "We couldn’t start your camera. Check that it’s connected and not in use by another app.");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => { if (mounted.current) void startCamera(); });
    return () => {
      mounted.current = false;
      operation.current?.abort();
      streamRef.current?.getTracks().forEach(track => track.stop());
      audioRef.current?.pause();
    };
  }, [startCamera]);

  useEffect(() => {
    if (!ready) return;
    let animation = 0, previous = 0;
    const draw = (time: number) => {
      const video = videoRef.current, canvas = previewRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0 && time - previous > 65) {
        try {
          const current = settings.current;
          renderPhoto(canvas, video, video.videoWidth, video.videoHeight, current.activeFilter, current.mirror, undefined, 1280, current.activeBackdrop);
          previous = time;
        } catch { setCameraError("The camera preview could not be rendered. Retry or upload photos."); setReady(false); return; }
      }
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  }, [ready]);

  const cancel = () => { operation.current?.abort(); audioRef.current?.pause(); };
  const capture = useCallback(async () => {
    if (operation.current || !ready) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(null); setShots([]);
    const result: CapturedShot[] = [];
    try {
      for (let index = 0; index < targetCount; index++) {
        setShotNumber(index + 1);
        for (let second = countdownSeconds; second > 0; second--) { setCountdown(second); await delay(1000, controller.signal); }
        setCountdown(null);
        const video = videoRef.current, canvas = previewRef.current;
        if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !streamRef.current?.getVideoTracks().some(track => track.readyState === "live")) throw new Error("Your camera paused. Retry the camera and take your shots again.");
        const current = settings.current;
        const exportCanvas = document.createElement("canvas");
        renderPhoto(exportCanvas, video, video.videoWidth, video.videoHeight, current.activeFilter, current.mirror, undefined, video.videoWidth, current.activeBackdrop);
        result.push({ id: crypto.randomUUID(), index, dataUrl: exportCanvas.toDataURL("image/jpeg", .94), timestamp: Date.now(), filter: current.activeFilter });
        setShots([...result]);
        if (soundEnabled) { audioRef.current?.pause(); const audio = new Audio("/sounds/shutter.wav"); audioRef.current = audio; void audio.play().catch(() => {}); }
        if (flashEnabled) setFlash(true);
        await delay(180, controller.signal); setFlash(false);
        if (index < targetCount - 1) await delay(500, controller.signal);
      }
      if (!controller.signal.aborted) onCaptureComplete(result);
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) setError(cause instanceof Error ? cause.message : "Capture failed. Please try again.");
    } finally {
      if (operation.current === controller) operation.current = null;
      if (mounted.current) { setBusy(false); setCountdown(null); setShotNumber(0); setFlash(false); }
    }
  }, [ready, targetCount, countdownSeconds, soundEnabled, flashEnabled, onCaptureComplete]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || target instanceof HTMLElement && target.closest("input,textarea,select,button,a,summary,[contenteditable],[role=button]")) return;
      if (["Space", "Enter", "KeyC"].includes(event.code)) { event.preventDefault(); void capture(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [capture]);

  const importPhotos = async (files?: File[]) => {
    if (operation.current) return;
    if (files?.some(file => !file.type.startsWith("image/"))) { setError("Choose image files only (JPEG, PNG, or WebP)."); return; }
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(null);
    const urls: string[] = [];
    try {
      const canvas = document.createElement("canvas");
      const result: CapturedShot[] = [];
      const sample = files ? null : await loadImage("/images/booth-friends.png", controller.signal);
      const count = files ? Math.min(files.length, targetCount) : targetCount;
      for (let index = 0; index < count; index++) {
        if (controller.signal.aborted) break;
        let image = sample;
        if (files) { const url = URL.createObjectURL(files[index]); urls.push(url); image = await loadImage(url, controller.signal); }
        if (!image) throw new Error("No image was available. Please try again.");
        const crop = sample ? [(index % 2) * image.naturalWidth / 2, (Math.floor(index / 2) % 2) * image.naturalHeight / 2, image.naturalWidth / 2, image.naturalHeight / 2] : undefined;
        renderPhoto(canvas, image, crop ? crop[2] : image.naturalWidth, crop ? crop[3] : image.naturalHeight, activeFilter, false, crop);
        result.push({ id: crypto.randomUUID(), index, dataUrl: canvas.toDataURL("image/jpeg", .94), timestamp: Date.now(), filter: activeFilter });
      }
      if (!controller.signal.aborted && result.length) onCaptureComplete(result);
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) setError(cause instanceof Error ? cause.message : "We couldn’t open these photos. Try again.");
    } finally {
      urls.forEach(url => URL.revokeObjectURL(url));
      if (operation.current === controller) operation.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const cameraState = cameraError ? "error" : ready ? "ready" : "standby";
  const cameraStatus = cameraError ? cameraError.startsWith("Camera permission") ? "Camera permission needed" : "Camera unavailable" : ready ? "Camera ready" : "Camera standby";
  const match = (value: string) => value.toLowerCase().includes(search.toLowerCase());

  return <section className={styles.booth} aria-label="Photo booth">
    <div className={styles.heading}>
      <div><h1>Okay, your moment.</h1></div>
      {cameraError ? (
        <span className={styles.liveState} data-state={cameraState} role="status">○ {cameraStatus}</span>
      ) : isEditingEvent ? (
        <form className="event-input" onSubmit={handleSaveEvent}>
          <input
            className="control-input"
            aria-label="Session name"
            value={tempEventName}
            onChange={(e) => setTempEventName(e.target.value)}
            maxLength={40}
            autoFocus
          />
          <button className="icon-button" aria-label="Save session name"><Check size={16} /></button>
        </form>
      ) : (
        <button
          type="button"
          className="event-name"
          onClick={() => {
            setTempEventName(eventName);
            setIsEditingEvent(true);
          }}
          aria-label={`Edit session name: ${eventName}`}
        >
          <span>{eventName}</span>
          <Edit3 size={12} aria-hidden="true" />
        </button>
      )}
    </div>
    <div className={styles.workspace}>
      <div className={styles.cameraColumn}>
        <div className={styles.paperFrame} style={{ borderColor: selectedFrame.hex }}>
          <div className={styles.viewfinder}>
            <video ref={videoRef} autoPlay playsInline muted className={styles.sourceVideo} onLoadedData={() => { setCameraError(null); setReady(true); }} onEmptied={() => setReady(false)} onError={() => { setReady(false); setCameraError("The camera connection was interrupted. Please retry."); }} />
            <canvas ref={previewRef} className={styles.previewCanvas} aria-label="Live camera preview" />
            {!ready && <div className={styles.fallback}><h2>{cameraError ? "A little camera hiccup." : "Let’s get you in the frame."}</h2><p>{cameraError || "Allow camera access when your browser asks. You can also upload your photos or try a sample session below."}</p><div className={styles.fallbackActions}><button className="button button-primary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} /> Upload photos</button><button className="button button-secondary" disabled={busy} onClick={() => void importPhotos()}>Try sample shots</button><button className="button button-quiet" disabled={busy} onClick={() => void startCamera()}><RotateCcw size={16} /> Retry camera</button></div>{error && <p role="alert">{error}</p>}</div>}
            {countdown !== null && <div className={styles.countdown} aria-live="assertive"><span>{countdown}</span><p>Pose {shotNumber} of {targetCount}</p></div>}
            {flash && <div className={styles.flash} />}
          </div>
          <div className={styles.frameFooter}><span>PHO2BOOTH</span><span>{busy && shotNumber ? `POSE ${shotNumber} / ${targetCount}` : "YOU LOOK GOOD FROM HERE."}</span></div>
        </div>
        <div className={styles.quickControls}><fieldset disabled={busy}><legend>Photos in your session</legend><div>{[1, 2, 3, 4, 5, 6].map(count => <button key={count} aria-pressed={targetCount === count} onClick={() => onTargetCountChange(count)}>{count}</button>)}</div></fieldset><fieldset disabled={busy}><legend>Seconds to strike a pose</legend><div>{[3, 5, 10].map(seconds => <button key={seconds} aria-pressed={countdownSeconds === seconds} onClick={() => onCountdownChange(seconds)}>{seconds}s</button>)}</div></fieldset></div>
        <div className={styles.shutterRow}><button className={styles.shutter} disabled={busy || !ready} onClick={() => void capture()}><Camera size={22} />{busy ? shotNumber ? `Taking photo ${shotNumber} of ${targetCount}` : "Opening your photos…" : `Take ${targetCount} ${targetCount === 1 ? "photo" : "photos"}`}</button>{busy && <button className={`button ${styles.cancelBtn}`} onClick={cancel}>Cancel</button>}</div>
        <p className={styles.shortcut} aria-live="polite">{busy ? "A fresh countdown before every pose. Make it a good one." : "Space, Enter, or C to capture · Every pose gets its own countdown"}</p>
        {shots.length > 0 && <div className={styles.trail} aria-label="Captured photos">{shots.map((shot, index) => <NextImage unoptimized width={100} height={75} key={shot.id} src={shot.dataUrl} alt={`Captured pose ${index + 1}`} />)}</div>}
        {error && ready && <p className="status-note" role="alert">{error}</p>}
        <div className={styles.alternatives}><input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; if (files.length) void importPhotos(files); }} /><button className="button button-quiet button-change-format" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} /> Upload photos</button><button className="button button-quiet button-change-format" disabled={busy} onClick={() => void importPhotos()}>Try sample shots</button><span>Up to {targetCount} images, in the order you select them.</span></div>
      </div>
      <aside className={styles.settings}><div className={styles.settingsHeading}><h2>Make it yours.</h2><p>A little mood. A little personality.</p></div>
        <div className={styles.tabs} role="group" aria-label="Camera settings">{["filters", "backdrop", "style"].map(tab => <button key={tab} aria-pressed={panel === tab} onClick={() => { setPanel(tab); setSearch(""); }}>{tab === "backdrop" ? "Backdrop" : tab === "style" ? "Frame & layout" : "Filters"}</button>)}</div>
        <label className={styles.search}><span className="control-label">{panel === "filters" ? "Find a filter" : panel === "backdrop" ? "Find a backdrop track" : "Find a layout or theme"}</span><input className="control-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search…" /></label>
        <fieldset disabled={busy} className={styles.panel}>
          {panel === "filters" && <div className={styles.filterGrid}>{cameraFilters.filter(item => match(`${item.name} ${item.category}`)).map(item => <button key={item.id} aria-pressed={(filterAliases[activeFilter] || activeFilter) === item.id} onClick={() => onFilterChange(item.id)}><PhotoArt index={0} alt="" filter={item.cssFilter} /><span>{item.name}</span></button>)}</div>}
          {panel === "backdrop" && (
            <div>
              <p className={styles.hint}>
                Automatically removes your room background and places you into the chosen backdrop track in real time.
              </p>
              {activeBackdrop !== "none" && (
                <div className={styles.edgeControlGroup}>
                  <div className={styles.edgeControlHeader}>
                    <span className={styles.edgeControlLabel}>Edge refinement</span>
                    <span className={styles.edgeControlHelp}>
                      {edgePreset === "studio"
                        ? "Clean studio cutout"
                        : edgePreset === "natural"
                        ? "Soft feathered boundary"
                        : "Crisp sharp edge"}
                    </span>
                  </div>
                  <div className={styles.edgeButtons}>
                    {(
                      [
                        { id: "studio", label: "Studio", desc: "Clean" },
                        { id: "natural", label: "Natural", desc: "Soft" },
                        { id: "crisp", label: "Crisp", desc: "Sharp" },
                      ] as const
                    ).map(item => (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={edgePreset === item.id}
                        className={styles.edgeButton}
                        onClick={() => handleSelectEdgePreset(item.id)}
                      >
                        <span>{item.label}</span>
                        <span>{item.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className={styles.backdropGrid}>
                {BACKDROP_TRACKS.filter(item =>
                  match(`${item.name} ${item.tagline} ${item.category}`)
                ).map(track => {
                  const isSelected = activeBackdrop === track.id;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => void handleSelectBackdrop(track.id)}
                      className={styles.backdropCard}
                    >
                      <div
                        style={{ background: track.previewGradient }}
                        className={styles.backdropSwatch}
                      >
                        <span>{track.iconEmoji}</span>
                      </div>
                      <div className={styles.backdropMeta}>
                        <span className={styles.backdropTitle}>{track.name}</span>
                        <span className={styles.backdropDesc}>{track.tagline}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {panel === "style" && (
            <div className={styles.styleControls}>
              <label className="control-label" htmlFor="camera-layout">Layout</label>
              <select
                id="camera-layout"
                className="control-input"
                value={selectedLayout}
                onChange={event => {
                  setTemplateId(null);
                  onLayoutChange(event.target.value as LayoutType);
                }}
              >
                {cameraLayoutGroups.map(group => (
                  <optgroup key={group.category} label={group.category}>
                    {group.items.map(item => (
                      <option value={item.id} key={item.id}>
                        {item.name} · {item.count} {item.count === 1 ? "photo" : "photos"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="control-label">Frame color</p>
              <div className={styles.colors}>{FRAME_COLORS.map(frame => <button key={frame.id} aria-label={frame.name} title={frame.name} aria-pressed={selectedFrame.id === frame.id} style={{ background: frame.hex, color: frame.textColor }} onClick={() => { setTemplateId(null); onFrameChange(frame); }}>{selectedFrame.id === frame.id ? "✓" : ""}</button>)}</div>
              <p className="control-label">Event themes</p>
              <p className={styles.hint}>Applies the theme’s frame color and recommended layout.</p>
              <div className={styles.themes}>{EVENT_TEMPLATES.filter(item => match(`${item.name} ${item.category}`)).map(item => <button key={item.id} aria-pressed={templateId === item.id} onClick={() => { setTemplateId(item.id); onFrameChange({ id: `tpl-${item.id}`, name: item.name, hex: item.frameColor, textColor: item.textColor }); onLayoutChange(item.recommendedLayout); }}><span style={{ background: item.frameColor }} />{item.name}</button>)}</div>
            </div>
          )}
        </fieldset>
        <details className={styles.sessionOptions}><summary>Camera options</summary><fieldset disabled={busy}>{[{ label: "Mirror camera", value: mirror, set: setMirror }, { label: "Screen flash", value: flashEnabled, set: setFlashEnabled }, { label: "Shutter sound", value: soundEnabled, set: setSoundEnabled }].map(option => <label key={option.label}><span>{option.label}</span><input type="checkbox" checked={option.value} onChange={event => option.set(event.target.checked)} /></label>)}</fieldset></details>
      </aside>
    </div>
  </section>;
}
