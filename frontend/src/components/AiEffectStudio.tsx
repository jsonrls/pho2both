"use client";

import styles from "./Studios.module.css";
import { drawCover } from "./motionExport";

import { useState, useRef, useEffect } from "react";
import {
  SlidersHorizontal,
  ArrowLeft,
  Download,
  CloudUpload,
  CheckCircle2,
  Eye,
  QrCode,
} from "lucide-react";
import { CapturedShot } from "@/types/booth";
import { createBoothSession, recordCapturedPhoto, persistPhotoStrip } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { drawWatermark } from "@/lib/watermark";
import { ScanQrModal } from "@/components/ScanQrModal";
import confetti from "canvas-confetti";

interface AiEffectStudioProps {
  shot: CapturedShot;
  onBack: () => void;
}

type AiStyle = "cyberpunk" | "anime" | "popart" | "synthwave" | "golden";

interface AiPreset {
  id: AiStyle;
  name: string;
  tagline: string;
  badge: string;
  css: string;
}

const AI_PRESETS: AiPreset[] = [
  {
    id: "cyberpunk",
    name: "Neon contrast",
    tagline: "High-voltage neon contrast & electric cyan glow",
    badge: "Matrix",
    css: "contrast(160%) saturate(220%) hue-rotate(330deg) brightness(105%)",
  },
  {
    id: "anime",
    name: "Ink monochrome",
    tagline: "Grayscale with crisp contrast and brighter highlights",
    badge: "Manga",
    css: "grayscale(100%) contrast(200%) brightness(110%)",
  },
  {
    id: "popart",
    name: "Pop colour",
    tagline: "Extra saturation with warm shifted colour",
    badge: "Pop Art",
    css: "saturate(300%) contrast(140%) brightness(100%) hue-rotate(15deg)",
  },
  {
    id: "synthwave",
    name: "Retro violet",
    tagline: "Outrun magenta & sunset purple nostalgia",
    badge: "Retro",
    css: "sepia(50%) hue-rotate(260deg) saturate(240%) contrast(130%)",
  },
  {
    id: "golden",
    name: "Warm glow",
    tagline: "Brighter highlights with a warm sepia tint",
    badge: "Glamour",
    css: "brightness(110%) contrast(115%) saturate(135%) sepia(20%)",
  },
];

export function AiEffectStudio({ shot, onBack }: AiEffectStudioProps) {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<AiStyle>("cyberpunk");
  const [showOriginal, setShowOriginal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<{code: string; revision: string} | null>(null);
  const revision = JSON.stringify([shot.id, shot.timestamp, selectedStyle, user?.id]);
  const revisionRef = useRef(revision);
  useEffect(() => { revisionRef.current = revision; }, [revision]);
  const saveSuccess = savedSnapshot?.revision === revision ? savedSnapshot.code : null;

  const activePreset = AI_PRESETS.find((p) => p.id === selectedStyle) || AI_PRESETS[0];

  const renderAiCanvas = async (): Promise<string | null> => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const scale = 2;
    const width = 800 * scale;
    const height = 1000 * scale;
    canvas.width = width;
    canvas.height = height;

    // Dark sleek background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, width, height);

    // Apply AI filter to context
    ctx.filter = activePreset.css;

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Photo could not load. Please retake it and try again."));
      img.src = shot.dataUrl;
    });

    const padding = 36 * scale;
    const photoH = height - 180 * scale;
    const photoW = width - padding * 2;
    drawCover(ctx, img, padding, padding, photoW, photoH);

    // Reset filter for UI stamps
    ctx.filter = "none";

    // Neon frame border
    ctx.strokeStyle = selectedStyle === "cyberpunk" ? "#06b6d4" : "#f43f5e";
    ctx.lineWidth = 3 * scale;
    ctx.strokeRect(padding, padding, photoW, photoH);

    // Header badge
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${16 * scale}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`✨ ${activePreset.name.toUpperCase()} ✨`, width / 2, height - 90 * scale);

    ctx.fillStyle = "#94a3b8";
    ctx.font = `${12 * scale}px monospace`;
    ctx.letterSpacing = "2px";
    ctx.fillText("PHO2BOOTH • CREATIVE EFFECTS", width / 2, height - 50 * scale);

    drawWatermark(ctx, width, height, scale, !user);
    return canvas.toDataURL("image/png");
  };

  const handleDownload = async () => {
    const dataUrl = await renderAiCanvas().catch(cause => { setError(cause instanceof Error ? cause.message : "Export failed. Please retry."); return null; });
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.download = `pho2booth-ai-${selectedStyle}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleSaveToNeon = async (): Promise<{ shareCode: string; stripId?: string }> => {
    if (saveSuccess) {
      return { shareCode: saveSuccess };
    }
    setIsSaving(true);
    const savingRevision = revision;
    setError('');
    try {
      const dataUrl = await renderAiCanvas();
      if (!dataUrl) throw new Error("Could not render photo");

      const sessionRes = await createBoothSession({
        boothName: "Creative effects",
        layout: "ai-effect",
        photoCount: 1,
      });

      const sessionId = sessionRes.session.id;

      await recordCapturedPhoto({
        sessionId,
        shotIndex: 0,
        imageData: shot.dataUrl,
        filterName: selectedStyle,
      });

      const stripRes = await persistPhotoStrip({
        sessionId,
        stripData: dataUrl,
        template: `ai-${selectedStyle}`,
        headerText: activePreset.name,
      });

      if (savingRevision !== revisionRef.current) throw new Error("Your effect changed. Save the current version again.");
      setSavedSnapshot({ code: stripRes.strip.shareCode, revision: savingRevision });
      confetti({ particleCount: 60, spread: 90, disableForReducedMotion: true });
      return { shareCode: stripRes.strip.shareCode };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sharing is unavailable. Retry Save, or download a local PNG.";
      setError(msg);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`studio-page ${styles.studio}`}>
      {/* Top Header */}
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
            Darkroom & Stylized Filters
          </h1>
          <p className="text-xs text-[#655f55] mt-1">Colour and contrast grading, made in your browser</p>
        </div>
        <div className="w-24" />
      </div>

      {/* Main Studio Area */}
      <div className="studio-grid">
        {/* LEFT: Live Preview with AI Shader */}
        <div className="studio-preview">
          <div className="relative rounded-3xl p-4 bg-neutral-900 shadow-[0_12px_35px_rgba(25,53,85,0.08)] border border-[#ddd6c8] w-auto max-w-sm max-h-[calc(100%-20px)] aspect-[4/5] flex flex-col justify-between overflow-hidden">
            <div className="relative flex-1 rounded-2xl overflow-hidden bg-black flex items-center justify-center">
              <img
                src={shot.dataUrl}
                alt="Creative effect preview"
                style={{
                  filter: showOriginal ? "none" : activePreset.css,
                }}
                className="w-full h-full object-cover transition-all duration-300 select-none"
              />

              {/* Compare Button */}
              <button
                onClick={() => setShowOriginal(!showOriginal)}
                aria-pressed={showOriginal}
                className="absolute top-3 right-3 bg-black/70 hover:bg-black/90 backdrop-blur px-3 py-1.5 rounded-full border border-white/20 text-xs font-semibold text-white flex items-center gap-1.5 shadow active:scale-95 transition"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showOriginal ? "Original" : "Compare original"}</span>
              </button>

              {/* Style Badge */}
              <div className="absolute bottom-3 left-3 bg-[#29251f] text-white px-3 py-0.5 rounded-full text-xs font-semibold shadow">
                {activePreset.name}
              </div>
            </div>

            <div className="text-center mt-3">
              <div className="text-xs font-bold tracking-wider uppercase text-white">
                {activePreset.name}
              </div>
              <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">
                PHO2BOOTH • STYLIZED FILTER
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: AI Preset Chooser & Actions */}
        <div className="studio-sidebar">
          <div className="flex-shrink-0">
            <h2 className="text-base font-bold text-[#29251f] flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#29251f]" />
              Choose your filter
            </h2>
            <p className="text-xs text-[#655f55] mt-0.5">In-browser colour and contrast grading.</p>
          </div>

          {/* Preset Buttons */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2">
            {AI_PRESETS.map((preset) => {
              const isSelected = selectedStyle === preset.id;
              return (
                <button
                  key={preset.id}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedStyle(preset.id)}
                  className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between ${
                    isSelected
                      ? "bg-[#ece6d9] border-[#29251f] text-[#29251f] shadow-xs ring-1 ring-[#29251f]/40"
                      : "bg-white border-[#ddd6c8] text-[#453e34] hover:bg-[#f7f4eb]"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold flex items-center gap-2 text-[#29251f]">
                      <span>{preset.name}</span>
                      <span className="text-[9px] bg-[#f7f4eb] text-[#29251f] border border-[#ddd6c8] px-2 py-0.2 rounded-full font-mono font-semibold">
                        {preset.badge}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#655f55] mt-0.5">
                      {preset.tagline}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Action Buttons Pinned Dock */}
          <div className="flex-shrink-0 flex flex-col gap-2 pt-2 border-t border-[#ded8cc]/80 mt-auto">
            {error && <p role="alert" className="status-note text-[11px] py-1 px-2.5">{error} Local PNG export remains available.</p>}
            <div className="flex gap-2">
              <button
                onClick={handleDownload}
                className="button button-primary flex-1 flex items-center justify-center gap-2 min-h-[38px] px-3 text-xs font-semibold active:scale-95 transition"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>

              <button
                onClick={() => setIsQrModalOpen(true)}
                className="button button-secondary flex items-center justify-center gap-1.5 min-h-[38px] px-3 text-xs font-semibold active:scale-95 transition"
              >
                <QrCode className="w-4 h-4 text-[#29251f]" />
                <span>Share QR</span>
              </button>
            </div>

            <button
              onClick={() => void handleSaveToNeon().catch(() => {})}
              disabled={isSaving}
              className="button button-secondary flex items-center justify-center gap-2 min-h-[34px] px-4 text-xs font-semibold active:scale-95 transition hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/50"
            >
              <CloudUpload className="w-4 h-4 text-emerald-600" />
              <span>{isSaving ? "Saving..." : "Save"}</span>
            </button>

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
          </div>
        </div>
      </div>

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
