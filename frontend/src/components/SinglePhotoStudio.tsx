"use client";

import styles from "./Studios.module.css";
import { drawCover } from "./motionExport";

import { useState, useRef, useEffect } from "react";
import { Download, Printer, ArrowLeft, CloudUpload, CheckCircle2, QrCode } from "lucide-react";
import {
  CapturedShot,
  FrameColorOption,
  EventCategory,
  EventTemplate,
} from "@/types/booth";
import { FRAME_COLORS, EVENT_CATEGORIES, EVENT_TEMPLATES } from "@/lib/constants";
import { createBoothSession, recordCapturedPhoto, persistPhotoStrip } from "@/lib/api";
import { TemplateFrameDecoration } from "@/components/layouts/LayoutPreviewDecorators";
import { drawTemplateBorderDecorations } from "@/lib/canvasDecorators";
import { ScanQrModal } from "@/components/ScanQrModal";
import confetti from "canvas-confetti";
import { useAuth } from "@/lib/authContext";
import { drawWatermark } from "@/lib/watermark";
import { shouldWatermark } from "@/lib/planAccess";

interface SinglePhotoStudioProps {
  shot: CapturedShot;
  onBack: () => void;
}

type SingleStyle = "polaroid" | "minimal" | "museum" | "neon";

export function SinglePhotoStudio({ shot, onBack }: SinglePhotoStudioProps) {
  const [selectedEventCategory, setSelectedEventCategory] = useState<EventCategory | "all">("all");
  const [selectedTemplate, setSelectedTemplate] = useState<EventTemplate | null>(null);
  const [style, setStyle] = useState<SingleStyle>("polaroid");
  const photoPadding = style === "polaroid" ? 40 : 20;
  const bottomSpace = style === "polaroid" ? 180 : 100;
  const photoWidth = 800 - photoPadding * 2;
  const photoHeight = 1000 - photoPadding - bottomSpace;
  const captionY = 1000 - bottomSpace / 2;
  const subCaptionY = 1000 - bottomSpace / 4;
  const [selectedFrame, setSelectedFrame] = useState<FrameColorOption>(FRAME_COLORS[1]);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const photoFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
  const [caption, setCaption] = useState("A little moment, kept.");
  const [subCaption, setSubCaption] = useState("PHO2BOOTH");
  const [isSaving, setIsSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<{shareCode: string; stripId: string; revision: string} | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Frame');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const { user } = useAuth();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const revision = JSON.stringify([shot.id, shot.timestamp, style, selectedTemplate?.id, selectedFrame, caption, subCaption, photoFilter, user?.id]);
  const revisionRef = useRef(revision);
  useEffect(() => { revisionRef.current = revision; }, [revision]);
  const saved = savedSnapshot?.revision === revision ? savedSnapshot : null;
  const saveSuccess = saved?.shareCode;


  const handleSelectTemplate = (tpl: EventTemplate) => {
    setSelectedTemplate(tpl);
    const matched = FRAME_COLORS.find(
      (f) => f.hex.toLowerCase() === tpl.frameColor.toLowerCase()
    ) || {
      id: `tpl-${tpl.id}`,
      name: tpl.name,
      hex: tpl.frameColor,
      textColor: tpl.textColor,
    };
    setSelectedFrame(matched);
    setCaption(tpl.defaultHeader);
    setSubCaption(tpl.defaultFooter);
  };

  const renderSingleCanvas = async (): Promise<string | null> => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const scale = 2;
    const width = 800 * scale;
    const height = 1000 * scale;
    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = selectedFrame.hex;
    ctx.fillRect(0, 0, width, height);

    // Load photo
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Photo could not load. Please retake it and try again."));
      img.src = shot.dataUrl;
    });

    const padding = photoPadding * scale;
    const photoW = photoWidth * scale;
    const photoH = photoHeight * scale;

    ctx.filter = photoFilter;
    drawCover(ctx, img, padding, padding, photoW, photoH);
    ctx.filter = "none";

    // Frame styling
    if (style === "museum") {
      ctx.strokeStyle = selectedFrame.textColor;
      ctx.lineWidth = 4 * scale;
      ctx.strokeRect(padding - 8 * scale, padding - 8 * scale, photoW + 16 * scale, photoH + 16 * scale);
    } else if (style === "neon") {
      ctx.strokeStyle = "#ec4899";
      ctx.lineWidth = 6 * scale;
      ctx.strokeRect(padding, padding, photoW, photoH);
    }

    // Draw event template border if active
    if (selectedTemplate) {
      drawTemplateBorderDecorations(
        ctx,
        selectedTemplate.borderStyle,
        width,
        height,
        scale,
        selectedFrame.hex,
        selectedFrame.textColor,
        selectedTemplate.accentColor
      );
    }

    // Captions
    ctx.fillStyle = selectedFrame.textColor;
    ctx.textAlign = "center";
    ctx.font = `italic ${24 * scale}px serif`;
    ctx.fillText(caption, width / 2, captionY * scale);

    ctx.font = `${14 * scale}px sans-serif`;
    ctx.letterSpacing = "2px";
    ctx.fillText(subCaption.toUpperCase(), width / 2, subCaptionY * scale);

    // Apply watermark unless the visitor is on a paid plan (free & guest are watermarked)
    drawWatermark(ctx, width, height, scale, shouldWatermark(user?.plan));

    return canvas.toDataURL("image/png");
  };

  const handleDownload = async () => {
    const dataUrl = await renderSingleCanvas().catch(cause => { setError(cause instanceof Error ? cause.message : "Export failed. Please retry."); return null; });
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.download = `pho2booth-portrait-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const [printImage, setPrintImage] = useState<string | null>(null);
  const handlePrint = async () => {
    setPrintImage(null);
    try {
      const image = await renderSingleCanvas();
      if (image) setPrintImage(image);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare print. Please retry.'); }
  };

  const handleSaveToNeon = async (): Promise<{ shareCode: string; stripId?: string }> => {
    if (saveSuccess) {
      return { shareCode: saveSuccess, stripId: saved?.stripId };
    }

    setIsSaving(true);
    const savingRevision = revision;
    setError('');
    try {
      const dataUrl = await renderSingleCanvas();
      if (!dataUrl) throw new Error("Could not render photo");

      const sessionRes = await createBoothSession({
        boothName: "Single Photo Studio",
        layout: "polaroid",
        photoCount: 1,
      });

      const sessionId = sessionRes.session.id;

      await recordCapturedPhoto({
        sessionId,
        shotIndex: 0,
        imageData: shot.dataUrl,
        filterName: shot.filter,
      });

      const stripRes = await persistPhotoStrip({
        sessionId,
        stripData: dataUrl,
        template: "single-portrait",
        headerText: caption,
        footerText: subCaption,
        frameColor: selectedFrame.hex,
      });

      if (revisionRef.current !== savingRevision) throw new Error("Your photo changed while saving. Save the current version again.");
      setSavedSnapshot({ shareCode: stripRes.strip.shareCode, stripId: stripRes.strip.id, revision: savingRevision });
      confetti({ particleCount: 60, spread: 90, disableForReducedMotion: true });
      return { shareCode: stripRes.strip.shareCode, stripId: stripRes.strip.id };
    } catch (err: unknown) {
      setError("Sharing is unavailable. Retry Save, or download a local PNG.");
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`studio-page ${styles.studio} ${styles.singleStudio}`}>
      {/* Header */}
      <div className="studio-heading">
        <button
          onClick={onBack}
          className="button button-quiet button-change-format min-h-[44px] flex items-center gap-2 px-4 py-2 text-xs font-semibold active:scale-95 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Change Format</span>
        </button>
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#29251f] flex items-center justify-center gap-2">
            Single Photo Studio
          </h1>
          <p className="text-xs text-[#655f55] mt-1">High-resolution portrait print & timeless polaroid keepsake</p>
        </div>
        <div className="w-24" />
      </div>

      {/* Main Studio Area */}
      <div className="studio-grid">
        {/* LEFT: Live Preview */}
        <div className="studio-preview">
          <div
            ref={previewRef}
            style={{ backgroundColor: selectedFrame.hex, color: selectedFrame.textColor }}
            className="relative w-auto max-w-sm max-h-[calc(100%-20px)] aspect-[4/5] overflow-hidden shadow-[0_12px_35px_rgba(25,53,85,0.08)]"
          >
            <img
              src={shot.dataUrl}
              alt="Portrait"
              className="absolute object-cover select-none"
              style={{
                filter: photoFilter,
                left: `${photoPadding / 800 * 100}%`,
                top: `${photoPadding / 1000 * 100}%`,
                width: `${photoWidth / 800 * 100}%`,
                height: `${photoHeight / 1000 * 100}%`,
              }}
            />
            <svg viewBox="0 0 800 1000" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
              {style === 'museum' && <rect x={photoPadding - 8} y={photoPadding - 8} width={photoWidth + 16} height={photoHeight + 16} fill="none" stroke={selectedFrame.textColor} strokeWidth={4} />}
              {style === 'neon' && <rect x={photoPadding} y={photoPadding} width={photoWidth} height={photoHeight} fill="none" stroke="#ec4899" strokeWidth={6} />}
            </svg>
            <TemplateFrameDecoration
              borderStyle={selectedTemplate?.borderStyle}
              accentColor={selectedTemplate?.accentColor}
              textColor={selectedFrame.textColor}
            />
            <svg viewBox="0 0 800 1000" className="absolute inset-0 w-full h-full pointer-events-none" fill={selectedFrame.textColor} textAnchor="middle" aria-label={`${caption}. ${subCaption}`} role="img">
              <text x={400} y={captionY} fontFamily="serif" fontStyle="italic" fontSize={24}>{caption}</text>
              <text x={400} y={subCaptionY} fontFamily="sans-serif" fontSize={14} letterSpacing={1}>{subCaption.toUpperCase()}</text>
            </svg>
          </div>
          <div className={styles.downloadDock}><button onClick={handleDownload} className="button button-primary w-full"><Download size={18} /> Download PNG</button></div>
        </div>

        {/* RIGHT: Controls */}
        <div className="studio-sidebar">
          <div className="flex-shrink-0">
            <h2 className="text-base font-bold text-[#29251f]">Framing & Styling</h2>
            <p className="text-xs text-[#655f55] mt-0.5">Choose your occasion theme or layout style</p>
          </div>

          <div className="flex-shrink-0 control-tabs" role="group" aria-label="Customize photo">{['Layout', 'Frame', 'Details', 'Effects'].map(item => <button key={item} className="control-option min-h-[36px]" aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2">
          <div hidden={tab !== 'Frame'}>
          {/* Event Occasion & Themes (48 Frames) */}
          <div className="flex flex-col gap-2.5 bg-[#f7f4eb] p-3.5 rounded-2xl border border-[#ddd6c8]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#29251f] uppercase tracking-wider">
                Event Themes ({EVENT_TEMPLATES.length})
              </span>
              {selectedTemplate && (
                <span className="text-[10px] bg-[#ece6d9] text-[#29251f] border border-[#ddd6c8] px-2 py-0.5 rounded-full font-semibold max-w-[160px]">
                  {selectedTemplate.name}
                </span>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className={styles.categoryChips}>
              <button
                aria-pressed={selectedEventCategory === "all"}
                onClick={() => setSelectedEventCategory("all")}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition ${
                  selectedEventCategory === "all"
                    ? "button button-primary text-white shadow-xs"
                    : "bg-white text-[#655f55] border border-[#ddd6c8] hover:bg-[#ece6d9] hover:text-[#29251f]"
                }`}
              >
                All
              </button>
              {EVENT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={selectedEventCategory === c.id}
                  onClick={() => setSelectedEventCategory(c.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition flex items-center gap-1 ${
                    selectedEventCategory === c.id
                      ? "button button-primary text-white shadow-xs"
                      : "bg-white text-[#655f55] border border-[#ddd6c8] hover:bg-[#ece6d9] hover:text-[#29251f]"
                  }`}
                >
                  <span>{c.icon}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>

            {/* Template horizontal scroller */}
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
              {(selectedEventCategory === "all"
                ? EVENT_TEMPLATES
                : EVENT_TEMPLATES.filter((t) => t.category === selectedEventCategory)
              ).map((tpl) => {
                const isSelected = selectedTemplate?.id === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectTemplate(tpl)}
                    className={`min-w-0 p-2.5 rounded-2xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? "bg-[#ece6d9] border-[#29251f] text-[#29251f] ring-1 ring-[#29251f]/30 shadow-xs"
                        : "bg-white border-[#ddd6c8] text-[#453e34] hover:bg-[#f7f4eb]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm">{tpl.iconEmoji}</span>
                      <span
                        className="w-3 h-3 rounded-full border border-[#ddd6c8] shadow-xs"
                        style={{ backgroundColor: tpl.frameColor }}
                      />
                    </div>
                    <div className="text-[13px] font-bold leading-snug text-[#29251f]">{tpl.name}</div>
                    <div className="text-[12px] text-[#29251f] font-mono mt-0.5">
                      {tpl.borderStyle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          </div><div hidden={tab !== 'Layout'}>
          {/* Style Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#29251f] uppercase tracking-wider">
              Style Preset
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "polaroid", label: "Polaroid Instant" },
                { id: "minimal", label: "Minimal Clean" },
                { id: "museum", label: "Museum Gallery" },
                { id: "neon", label: "Cyber Glow" },
              ].map((s) => (
                <button
                  key={s.id}
                  aria-pressed={style === s.id}
                  onClick={() => setStyle(s.id as SingleStyle)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition text-left ${
                    style === s.id
                      ? "bg-[#ece6d9] border-[#29251f] text-[#29251f] ring-1 ring-[#29251f]/30"
                      : "bg-white border-[#ddd6c8] text-[#655f55] hover:bg-[#f7f4eb] hover:text-[#29251f]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          </div><div hidden={tab !== 'Frame'}>
          {/* Frame Colors */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#29251f] uppercase tracking-wider">
              Frame Color
            </label>
            <div className="flex flex-wrap gap-2">
              {FRAME_COLORS.map((fc) => (
                <button
                  key={fc.id}
                  aria-label={fc.name}
                  aria-pressed={selectedFrame.id === fc.id}
                  onClick={() => setSelectedFrame(fc)}
                  style={{ backgroundColor: fc.hex }}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${
                    selectedFrame.id === fc.id
                      ? "scale-110 border-[#29251f] ring-2 ring-[#29251f]/30 shadow-sm"
                      : "border-[#ddd6c8] hover:scale-105 shadow-xs"
                  }`}
                />
              ))}
            </div>
          </div>

          </div><div hidden={tab !== 'Details'}>
          {/* Captions */}
          <div className="flex flex-col gap-2">
            <div>
              <span className="text-[10px] text-[#655f55] font-medium">Main Caption</span>
              <input
                type="text"
                aria-label="Main caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={30}
                className="w-full bg-white border border-[#ddd6c8] rounded-xl px-3 py-1.5 text-xs text-[#29251f] placeholder:text-[#655f55]/60 focus:outline-none focus:border-[#29251f] focus:ring-1 focus:ring-[#29251f]/20 shadow-xs"
              />
            </div>
            <div>
              <span className="text-[10px] text-[#655f55] font-medium">Date Stamp</span>
              <input
                type="text"
                aria-label="Date stamp"
                value={subCaption}
                onChange={(e) => setSubCaption(e.target.value)}
                maxLength={25}
                className="w-full bg-white border border-[#ddd6c8] rounded-xl px-3 py-1.5 text-xs text-[#29251f] placeholder:text-[#655f55]/60 focus:outline-none focus:border-[#29251f] focus:ring-1 focus:ring-[#29251f]/20 shadow-xs"
              />
            </div>
          </div>

          </div>
          <div hidden={tab !== 'Effects'}>{[{name:'Brightness', value:brightness, set:setBrightness}, {name:'Contrast', value:contrast, set:setContrast}, {name:'Saturation', value:saturation, set:setSaturation}].map(control => <label key={control.name} className="control-label">{control.name}: {control.value}%<input className="w-full" type="range" min={0} max={200} value={control.value} onChange={event => control.set(Number(event.target.value))} /></label>)}</div>
          </div>

          {/* Action Buttons Pinned Dock */}
          <div className="flex-shrink-0 flex flex-col gap-2 pt-2 border-t border-[#ded8cc]/80 mt-auto">
            {error && <p role="alert" className="status-note text-[11px] py-1 px-2.5">{error}</p>}
            <div className={styles.secondaryActions}>
              <button onClick={() => setIsQrModalOpen(true)} className="button button-secondary min-h-[38px] text-xs"><QrCode size={15} /> Share QR</button>
              <button onClick={handlePrint} className="button button-secondary min-h-[38px] text-xs"><Printer size={15} /> Print</button>
              <button onClick={() => void handleSaveToNeon().catch(() => {})} disabled={isSaving} className="button button-secondary min-h-[38px] text-xs"><CloudUpload size={15} />{isSaving ? 'Saving…' : 'Save'}</button>
            </div>

            {saveSuccess && (
              <div className="p-2 bg-emerald-50/80 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] flex items-center justify-between font-mono shadow-xs">
                <span className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Saved!
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsQrModalOpen(true)}
                    className="flex items-center gap-1 text-[10px] font-sans font-bold text-[#29251f] bg-white border border-[#ddd6c8] px-2 py-0.5 rounded hover:bg-[#ece6d9] transition"
                  >
                    <QrCode className="w-3 h-3" />
                    View QR
                  </button>
                  <span className="bg-emerald-600 px-2 py-0.5 rounded font-bold text-white text-[10px]">
                    CODE: {saveSuccess}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-0.5">
              <button
                type="button"
                onClick={onBack}
                className="button-change-format min-h-[34px] flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change Format
              </button>
            </div>
          </div>
        </div>
      </div>

      {printImage && <img className={`print-artifact ${styles.printImage}`} src={printImage} alt="Photo ready to print" onLoad={() => window.print()} />}
      {/* QR Code Modal for Phone Download */}
      <ScanQrModal
        key={revision}
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        shareCode={saveSuccess || undefined}
        onGenerateCode={handleSaveToNeon}
        title="Scan QR to Download Photo"
      />
    </div>
  );
}
