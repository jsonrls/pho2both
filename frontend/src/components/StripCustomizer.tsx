"use client";

import styles from "./Studios.module.css";
import { drawCover } from "./motionExport";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Download,
  Printer,
  RotateCcw,
  LayoutGrid,
  CloudUpload,
  CheckCircle2,
  Scissors,
  Search,
  ArrowLeft,
  QrCode,
  Lock,
  Images,
} from "lucide-react";
import Link from "next/link";
import { Dialog } from "./Dialog";
import { AccountForm } from "./AccountForm";
import { useAuth } from "@/lib/authContext";
import { drawWatermark } from "@/lib/watermark";
import {
  canCustomizeCaptions,
  canDownloadRawOriginals,
  isLayoutUnlocked,
  shouldWatermark,
} from "@/lib/planAccess";
import { ScanQrModal } from "@/components/ScanQrModal";
import confetti from "canvas-confetti";
import {
  CapturedShot,
  EventCategory,
  EventTemplate,
  LayoutCategory,
  FrameColorOption,
  LayoutType,
  StickerItem,
} from "@/types/booth";
import {
  EVENT_CATEGORIES,
  EVENT_TEMPLATES,
  FRAME_COLORS,
  LAYOUTS,
  STICKER_PALETTE,
} from "@/lib/constants";
import {
  createBoothSession,
  recordCapturedPhoto,
  persistPhotoStrip,
} from "@/lib/api";
import {
  LayoutHeaderBadge,
  LayoutFooterBadge,
  TemplateFrameDecoration,
} from "@/components/layouts/LayoutPreviewDecorators";
import {
  drawLayoutDecorations,
  drawTemplateBorderDecorations,
} from "@/lib/canvasDecorators";

function LayoutWireframe({ id, category, count }: { id: string; category?: string; count: number }) {
  if (category === "grids" || id.startsWith("grid-") || id === "passport-4") {
    const cols = id === "grid-3x2" ? 2 : id === "grid-2x3" ? 3 : 2;
    return (
      <div
        className="w-7 h-9 border border-[#c4bbab] rounded-sm p-0.5 bg-[#fffdf7] grid gap-0.5 shrink-0"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        aria-hidden="true"
      >
        {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
          <div key={i} className="bg-[#ddd6c8] rounded-[1px]" />
        ))}
      </div>
    );
  }
  if (category === "polaroid" || id.startsWith("polaroid")) {
    return (
      <div
        className="w-7 h-9 border border-[#c4bbab] rounded-sm p-0.5 pb-2 bg-[#fffdf7] flex flex-col shrink-0"
        aria-hidden="true"
      >
        <div className="flex-1 bg-[#ddd6c8] rounded-[1px]" />
      </div>
    );
  }
  if (category === "cinema" || id.includes("film")) {
    return (
      <div
        className="w-6 h-10 border border-[#29251f] rounded-sm p-0.5 bg-[#29251f] flex flex-col gap-0.5 justify-between shrink-0"
        aria-hidden="true"
      >
        {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
          <div key={i} className="h-1.5 bg-[#eeeade] rounded-[1px]" />
        ))}
      </div>
    );
  }
  if (id === "ticket-stub") {
    return (
      <div
        className="w-7 h-9 border border-dashed border-[#c4bbab] rounded-sm p-0.5 bg-[#fffdf7] flex flex-col gap-0.5 shrink-0"
        aria-hidden="true"
      >
        <div className="flex-1 bg-[#ddd6c8] rounded-[1px]" />
        <div className="h-1.5 bg-[#eeeade] rounded-[1px]" />
      </div>
    );
  }
  return (
    <div
      className="w-6 h-10 border border-[#c4bbab] rounded-sm p-0.5 bg-[#fffdf7] flex flex-col gap-0.5 shrink-0"
      aria-hidden="true"
    >
      {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
        <div key={i} className="flex-1 bg-[#ddd6c8] rounded-[1px]" />
      ))}
    </div>
  );
}

interface StripCustomizerProps {
  shots: CapturedShot[];
  onRetake: () => void;
  onBack?: () => void;
  defaultLayout?: LayoutType;
  defaultFrame?: FrameColorOption;
  defaultHeader?: string;
}

export function StripCustomizer({
  shots,
  onRetake,
  onBack,
  defaultLayout = "strip-4",
  defaultFrame = FRAME_COLORS[1],
  defaultHeader,
}: StripCustomizerProps) {
  const { user, status, notice, generation, isCurrent, refresh, logout } = useAuth();
  const isGuest = !Boolean(user);
  const plan = user?.plan ?? null;
  const isPaid = canCustomizeCaptions(plan);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [authAnnouncement, setAuthAnnouncement] = useState('');
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeModalFeature, setUpgradeModalFeature] = useState<{ title: string; description: string }>({
    title: "Unlock Creator Features",
    description: "Get clean unbranded prints, all 23+ vintage layouts, and permanent keepsakes."
  });

  const [layout, setLayout] = useState<LayoutType>(defaultLayout);
  const [selectedEventCategory, setSelectedEventCategory] = useState<EventCategory | "all">("all");
  const [selectedTemplate, setSelectedTemplate] = useState<EventTemplate | null>(null);
  const [selectedFrame, setSelectedFrame] = useState(defaultFrame);
  const [headerText, setHeaderText] = useState(defaultHeader ?? "The good times club");
  const [footerText, setFooterText] = useState(!isPaid ? "PHO2BOOTH • 2026" : "little moments, kept forever ♡");
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<LayoutCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSavingToBackend, setIsSavingToBackend] = useState(false);
  const [savedSnapshot, setSavedResult] = useState<{
    shareCode: string;
    sessionId: string;
    stripId?: string;
    revision: string;
    storage: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const savePromiseRef = useRef<Promise<{ shareCode: string; stripId?: string }> | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const authInvokerRef = useRef<HTMLElement | null>(null);
  const downloadButtonRef = useRef<HTMLButtonElement | null>(null);
  const [tab, setTab] = useState('Layout');
  const revision = JSON.stringify([shots.map(({ id, timestamp }) => [id, timestamp]), layout, selectedTemplate?.id, selectedFrame, headerText, footerText, stickers, generation]);
  const revisionRef = useRef(revision);
  useEffect(() => { revisionRef.current = revision; }, [revision]);
  const savedResult = savedSnapshot?.revision === revision ? savedSnapshot : null;


  const openAuthDialog = () => {
    authInvokerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsQrModalOpen(false);
    setAuthAnnouncement('');
    setIsAuthDialogOpen(true);
  };

  const closeAuthDialog = () => setIsAuthDialogOpen(false);

  const handleAuthSuccess = () => {
    closeAuthDialog();
    setAuthAnnouncement('You’re signed in. Your edits are ready.');
    requestAnimationFrame(() => {
      const invoker = authInvokerRef.current;
      const target = invoker?.isConnected ? invoker : downloadButtonRef.current;
      if (target?.isConnected) target.focus();
    });
  };

  const handleDownloadAllPhotos = () => {
    // Raw originals are a paid feature; guests sign in, free members upgrade.
    if (!canDownloadRawOriginals(user?.plan)) {
      if (isGuest) {
        openAuthDialog();
      } else {
        setUpgradeModalFeature({
          title: "Raw Photo Originals",
          description: "Upgrade to Creator or grab an Event Pass to download all of your original, full-resolution shots.",
        });
        setUpgradeModalOpen(true);
      }
      return;
    }

    // Paid member: download all original shots
    shots.forEach((shot, i) => {
      setTimeout(() => {
        if (!isCurrent(generation)) return;
        const link = document.createElement("a");
        link.download = `pho2booth-raw-shot-${i + 1}-${Date.now()}.png`;
        link.href = shot.dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, i * 300);
    });


  };

  // Apply chosen Event Template
  const handleSelectTemplate = (template: EventTemplate) => {
    setSelectedTemplate(template);
    const matched = FRAME_COLORS.find(
      (f) => f.hex.toLowerCase() === template.frameColor.toLowerCase()
    ) || {
      id: `tpl-${template.id}`,
      name: template.name,
      hex: template.frameColor,
      textColor: template.textColor,
    };
    setSelectedFrame(matched);
    setHeaderText(template.defaultHeader);
    setFooterText(template.defaultFooter);

  };

  const filteredEventTemplates = useMemo(() => {
    if (selectedEventCategory === "all") return EVENT_TEMPLATES;
    return EVENT_TEMPLATES.filter((t) => t.category === selectedEventCategory);
  }, [selectedEventCategory]);

  // Filter layouts by category and search
  const filteredLayouts = useMemo(() => {
    return LAYOUTS.filter((l) => {
      const matchesCategory =
        selectedCategory === "all" || l.category === selectedCategory;
      const matchesSearch =
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const activeLayoutObj = useMemo(
    () => LAYOUTS.find((l) => l.id === layout) || LAYOUTS[0],
    [layout]
  );

  // Ensure enough shots for any layout by cycling shots if needed
  const displayShots = useMemo(() => {
    if (!shots || shots.length === 0) return [];
    const count = activeLayoutObj.count;
    const result: CapturedShot[] = [];
    for (let i = 0; i < count; i++) {
      result.push(shots[i % shots.length]);
    }
    return result;
  }, [shots, activeLayoutObj]);

  const stickerCounter = useRef(0);
  const addSticker = (emoji: string) => {
    const index = stickerCounter.current++;
    const newSticker: StickerItem = {
      id: `sticker-${index}`,
      emoji,
      x: 20 + (index * 17) % 60,
      y: 20 + (index * 23) % 60,
      scale: 1,
    };
    setStickers((prev) => [...prev, newSticker]);
  };

  const removeSticker = (id: string) => {
    setStickers((prev) => prev.filter((s) => s.id !== id));
  };

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      const container = previewContainerRef.current;
      const strip = stripRef.current;
      if (!container || !strip) return;
      const ch = container.clientHeight;
      const cw = container.clientWidth;
      const sh = strip.offsetHeight;
      const sw = strip.offsetWidth;
      if (ch > 0 && sh > 0 && cw > 0 && sw > 0) {
        const scaleH = ch / sh;
        const scaleW = cw / sw;
        const scale = Math.min(1, scaleH, scaleW);
        setPreviewScale(Number(scale.toFixed(3)));
      }
    };
    updateScale();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateScale) : null;
    if (ro && previewContainerRef.current) ro.observe(previewContainerRef.current);
    if (ro && stripRef.current) ro.observe(stripRef.current);
    window.addEventListener("resize", updateScale);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [layout, selectedFrame, displayShots.length, headerText, footerText, selectedTemplate]);

  // Helper to draw film sprocket perforations on canvas
  const drawFilmSprockets = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    spacing: number,
    horizontal = false
  ) => {
    ctx.fillStyle = "#ffffff";
    if (horizontal) {
      for (let curX = x; curX < x + w - spacing; curX += spacing * 1.5) {
        ctx.beginPath();
        ctx.roundRect(curX, y, spacing * 0.9, h, 6);
        ctx.fill();
      }
    } else {
      for (let curY = y; curY < y + h - spacing; curY += spacing * 1.5) {
        ctx.beginPath();
        ctx.roundRect(x, curY, w, spacing * 0.9, 6);
        ctx.fill();
      }
    }
  };

  // Render high resolution canvas for download/upload for all 23 layouts
  const renderCanvas = async (): Promise<string | null> => {
    const activeShots = displayShots;
    if (activeShots.length === 0) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const scale = 2; // High DPI 2x
    let width = 600 * scale;
    let height = 1800 * scale;

    // Dimensions based on layout
    switch (layout) {
      case "strip-2":
        width = 600 * scale;
        height = 1100 * scale;
        break;
      case "strip-3":
        width = 600 * scale;
        height = 1450 * scale;
        break;
      case "strip-4":
        width = 600 * scale;
        height = 1800 * scale;
        break;
      case "strip-5":
        width = 600 * scale;
        height = 2100 * scale;
        break;
      case "strip-6":
        width = 600 * scale;
        height = 2400 * scale;
        break;
      case "mini-strip-duo":
        width = 1100 * scale;
        height = 1450 * scale;
        break;
      case "grid-2x2":
      case "passport-4":
      case "polaroid-quad":
      case "heart-badge":
        width = 1200 * scale;
        height = 1400 * scale;
        break;
      case "grid-3x2":
        width = 1200 * scale;
        height = 1900 * scale;
        break;
      case "grid-2x3":
      case "film-35mm-horiz":
        width = 1600 * scale;
        height = 1100 * scale;
        break;
      case "grid-1x3":
      case "cinema-widescreen":
        width = 1000 * scale;
        height = 1700 * scale;
        break;
      case "polaroid":
        width = 800 * scale;
        height = 1000 * scale;
        break;
      case "polaroid-duo":
        width = 1300 * scale;
        height = 950 * scale;
        break;
      case "polaroid-trio":
        width = 800 * scale;
        height = 2000 * scale;
        break;
      case "film-strip":
      case "arcade-retro":
        width = 700 * scale;
        height = 1900 * scale;
        break;
      case "split-featured":
        width = 900 * scale;
        height = 1500 * scale;
        break;
      case "sidebar-hero":
        width = 1200 * scale;
        height = 1300 * scale;
        break;
      case "ticket-stub":
        width = 750 * scale;
        height = 1400 * scale;
        break;
      default:
        width = 600 * scale;
        height = 1800 * scale;
    }

    canvas.width = width;
    canvas.height = height;

    // Fill Background
    ctx.fillStyle = selectedFrame.hex;
    ctx.fillRect(0, 0, width, height);

    // Decorative Film Sprockets for film strip layouts
    if (layout === "film-strip") {
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);
      drawFilmSprockets(ctx, 16 * scale, 30 * scale, 22 * scale, height - 60 * scale, 35 * scale);
      drawFilmSprockets(
        ctx,
        width - 38 * scale,
        30 * scale,
        22 * scale,
        height - 60 * scale,
        35 * scale
      );
    } else if (layout === "film-35mm-horiz") {
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);
      drawFilmSprockets(
        ctx,
        30 * scale,
        16 * scale,
        width - 60 * scale,
        22 * scale,
        35 * scale,
        true
      );
      drawFilmSprockets(
        ctx,
        30 * scale,
        height - 38 * scale,
        width - 60 * scale,
        22 * scale,
        35 * scale,
        true
      );
    }

    // Draw Header Text
    ctx.fillStyle = selectedFrame.textColor;
    ctx.textAlign = "center";
    ctx.font = `bold ${30 * scale}px sans-serif`;
    ctx.letterSpacing = "4px";
    if (headerText) {
      ctx.fillText(headerText.toUpperCase(), width / 2, 65 * scale);
    }

    // Load images
    const loadedImages = await Promise.all(
      activeShots.map(
        (shot) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("A photo could not load. Retake it and try again."));
            img.src = shot.dataUrl;
          })
      )
    );

    const padding = 36 * scale;
    const topMargin = headerText ? 95 * scale : 40 * scale;
    const bottomMargin = footerText ? 90 * scale : 40 * scale;
    const availableHeight = height - topMargin - bottomMargin;
    const availableWidth = width - padding * 2;

    // --- Specialized Drawing by Layout Category ---
    if (layout === "mini-strip-duo") {
      // Twin bookmark strips side by side
      const halfWidth = width / 2;
      const stripPad = 28 * scale;
      const count = 3;
      const spacing = 18 * scale;
      const photoH = (availableHeight - spacing * (count - 1)) / count;
      const photoW = halfWidth - stripPad * 2;

      // Left Strip
      for (let i = 0; i < count; i++) {
        if (loadedImages[i]) {
          const y = topMargin + i * (photoH + spacing);
          drawCover(ctx, loadedImages[i], stripPad, y, photoW, photoH);
        }
      }

      // Right Strip
      for (let i = 0; i < count; i++) {
        if (loadedImages[i]) {
          const y = topMargin + i * (photoH + spacing);
          drawCover(ctx, loadedImages[i], halfWidth + stripPad, y, photoW, photoH);
        }
      }

      // Note: Center cut line & labels are rendered via drawLayoutDecorations below
    } else if (layout === "grid-2x2" || layout === "passport-4") {
      const spacing = 20 * scale;
      const cellW = (availableWidth - spacing) / 2;
      const cellH = (availableHeight - spacing) / 2;
      loadedImages.slice(0, 4).forEach((img, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = padding + col * (cellW + spacing);
        const y = topMargin + row * (cellH + spacing);
        drawCover(ctx, img, x, y, cellW, cellH);

        if (layout === "passport-4") {
          ctx.strokeStyle = "#ffffff40";
          ctx.lineWidth = 3 * scale;
          ctx.strokeRect(x + 4 * scale, y + 4 * scale, cellW - 8 * scale, cellH - 8 * scale);
        }
      });
    } else if (layout === "grid-3x2") {
      const spacing = 20 * scale;
      const cellW = (availableWidth - spacing) / 2;
      const cellH = (availableHeight - spacing * 2) / 3;
      loadedImages.slice(0, 6).forEach((img, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = padding + col * (cellW + spacing);
        const y = topMargin + row * (cellH + spacing);
        drawCover(ctx, img, x, y, cellW, cellH);
      });
    } else if (layout === "film-35mm-horiz") {
      const spacing = 20 * scale;
      const cellW = (availableWidth - spacing * 2) / 3;
      loadedImages.slice(0, 3).forEach((img, i) => {
        drawCover(ctx, img, padding + i * (cellW + spacing), topMargin, cellW, availableHeight);
      });
    } else if (layout === "grid-2x3") {
      const spacing = 20 * scale;
      const cellW = (availableWidth - spacing * 2) / 3;
      const cellH = (availableHeight - spacing) / 2;
      loadedImages.slice(0, 6).forEach((img, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = padding + col * (cellW + spacing);
        const y = topMargin + row * (cellH + spacing);
        drawCover(ctx, img, x, y, cellW, cellH);
      });
    } else if (layout === "grid-1x3" || layout === "cinema-widescreen") {
      const count = 3;
      const spacing = 22 * scale;
      const photoH = (availableHeight - spacing * (count - 1)) / count;
      loadedImages.slice(0, 3).forEach((img, i) => {
        const y = topMargin + i * (photoH + spacing);
        drawCover(ctx, img, padding, y, availableWidth, photoH);
      });
    } else if (layout === "polaroid") {
      if (loadedImages[0]) {
        const pSize = Math.min(availableWidth, availableHeight - 60 * scale);
        const x = (width - pSize) / 2;
        drawCover(ctx, loadedImages[0], x, topMargin, pSize, pSize);
      }
    } else if (layout === "polaroid-duo") {
      const spacing = 30 * scale;
      const cardW = (availableWidth - spacing) / 2;
      const cardH = availableHeight;
      const pPhotoSize = cardW - 30 * scale;

      [0, 1].forEach((idx) => {
        const img = loadedImages[idx];
        if (img) {
          const cardX = padding + idx * (cardW + spacing);
          // White polaroid back
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(cardX, topMargin, cardW, cardH);
          drawCover(ctx, img, cardX + 15 * scale, topMargin + 15 * scale, pPhotoSize, pPhotoSize);
        }
      });
    } else if (layout === "polaroid-trio") {
      const count = 3;
      const spacing = 24 * scale;
      const cardH = (availableHeight - spacing * (count - 1)) / count;
      const photoH = cardH - 50 * scale;
      const photoW = availableWidth - 30 * scale;

      loadedImages.slice(0, 3).forEach((img, i) => {
        const y = topMargin + i * (cardH + spacing);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(padding, y, availableWidth, cardH);
        drawCover(ctx, img, padding + 15 * scale, y + 15 * scale, photoW, photoH);
      });
    } else if (layout === "polaroid-quad") {
      const spacing = 20 * scale;
      const cellW = (availableWidth - spacing) / 2;
      const cellH = (availableHeight - spacing) / 2;
      loadedImages.slice(0, 4).forEach((img, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = padding + col * (cellW + spacing);
        const y = topMargin + row * (cellH + spacing);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, cellW, cellH);
        drawCover(ctx, 
          img,
          x + 12 * scale,
          y + 12 * scale,
          cellW - 24 * scale,
          cellH - 45 * scale
        );
      });
    } else if (layout === "split-featured") {
      // 1 large hero top + 3 thumbnails bottom
      const heroH = availableHeight * 0.58;
      const thumbH = availableHeight * 0.38;
      const spacing = 16 * scale;
      const thumbW = (availableWidth - spacing * 2) / 3;

      if (loadedImages[0]) {
        drawCover(ctx, loadedImages[0], padding, topMargin, availableWidth, heroH);
      }
      [1, 2, 3].forEach((idx, i) => {
        if (loadedImages[idx]) {
          const x = padding + i * (thumbW + spacing);
          const y = topMargin + heroH + spacing;
          drawCover(ctx, loadedImages[idx], x, y, thumbW, thumbH);
        }
      });
    } else if (layout === "sidebar-hero") {
      // 1 hero left + 2 stacked right
      const spacing = 20 * scale;
      const leftW = availableWidth * 0.58;
      const rightW = availableWidth - leftW - spacing;
      const rightH = (availableHeight - spacing) / 2;

      if (loadedImages[0]) {
        drawCover(ctx, loadedImages[0], padding, topMargin, leftW, availableHeight);
      }
      if (loadedImages[1]) {
        drawCover(ctx, loadedImages[1], padding + leftW + spacing, topMargin, rightW, rightH);
      }
      if (loadedImages[2]) {
        drawCover(ctx, 
          loadedImages[2],
          padding + leftW + spacing,
          topMargin + rightH + spacing,
          rightW,
          rightH
        );
      }
    } else if (layout === "ticket-stub") {
      // 2 photos + barcode at bottom
      const barcodeH = 90 * scale;
      const photoAvailH = availableHeight - barcodeH - 20 * scale;
      const photoH = (photoAvailH - 18 * scale) / 2;

      loadedImages.slice(0, 2).forEach((img, i) => {
        const y = topMargin + i * (photoH + 18 * scale);
        drawCover(ctx, img, padding, y, availableWidth, photoH);
      });

      // Simulated barcode lines
      const bY = topMargin + photoAvailH + 15 * scale;
      ctx.fillStyle = selectedFrame.textColor;
      ctx.fillRect(padding, bY, availableWidth, 3 * scale);
      for (let bx = padding + 15 * scale; bx < width - padding - 20 * scale; bx += 8 * scale) {
        const barW = (bx % 3 === 0 ? 4 : 2) * scale;
        ctx.fillRect(bx, bY + 12 * scale, barW, 45 * scale);
      }
    } else if (layout === "arcade-retro") {
      // Arcade style neon double borders
      const count = 4;
      const spacing = 18 * scale;
      const photoH = (availableHeight - spacing * (count - 1)) / count;

      ctx.strokeStyle = "#ec4899";
      ctx.lineWidth = 4 * scale;
      ctx.strokeRect(padding - 8 * scale, topMargin - 8 * scale, availableWidth + 16 * scale, availableHeight + 16 * scale);

      loadedImages.slice(0, 4).forEach((img, i) => {
        const y = topMargin + i * (photoH + spacing);
        drawCover(ctx, img, padding, y, availableWidth, photoH);
      });
    } else if (layout === "heart-badge") {
      const spacing = 20 * scale;
      const cellW = (availableWidth - spacing) / 2;
      const cellH = (availableHeight - spacing) / 2;
      loadedImages.slice(0, 4).forEach((img, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = padding + col * (cellW + spacing);
        const y = topMargin + row * (cellH + spacing);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, cellH, 20 * scale);
        ctx.clip();
        drawCover(ctx, img, x, y, cellW, cellH);
        ctx.restore();
      });
    } else {
      // Standard Vertical Strips: strip-2, strip-3, strip-4, strip-5, strip-6, film-strip
      const count = activeLayoutObj.count;
      const spacing = 20 * scale;
      const photoH = (availableHeight - spacing * (count - 1)) / count;
      const photoW =
        layout === "film-strip" ? availableWidth - 40 * scale : availableWidth;
      const photoX = layout === "film-strip" ? padding + 20 * scale : padding;

      loadedImages.slice(0, count).forEach((img, i) => {
        const y = topMargin + i * (photoH + spacing);
        drawCover(ctx, img, photoX, y, photoW, photoH);
      });
    }

    // Draw Tailored Layout Design Motifs & Badges
    drawLayoutDecorations(
      ctx,
      layout,
      width,
      height,
      scale,
      selectedFrame.textColor,
      headerText,
      footerText
    );

    // Draw Event Frame Border Decorations if template is active
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

    // Draw Stickers
    stickers.forEach((sticker) => {
      ctx.font = `${48 * scale}px sans-serif`;
      const sx = (sticker.x / 100) * width;
      const sy = (sticker.y / 100) * height;
      ctx.fillText(sticker.emoji, sx, sy);
    });

    // Draw Footer Text
    ctx.fillStyle = selectedFrame.textColor;
    ctx.font = `${20 * scale}px sans-serif`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "center";
    if (footerText) {
      ctx.fillText(footerText.toUpperCase(), width / 2, height - 36 * scale);
    }

    // Guardrail: watermark unless the visitor is on a paid plan (free & guest are watermarked)
    drawWatermark(ctx, width, height, scale, shouldWatermark(user?.plan));

    return canvas.toDataURL("image/png");
  };

  const handleDownload = async () => {
    const dataUrl = await renderCanvas().catch(error => { setSaveError(error instanceof Error ? error.message : "Export failed. Please retry."); return null; });
    if (!dataUrl) return;

    const link = document.createElement("a");
    link.download = `pho2booth-${layout}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const [printImage, setPrintImage] = useState<string | null>(null);
  const handlePrint = async () => {
    setPrintImage(null);
    try {
      const image = await renderCanvas();
      if (image) setPrintImage(image);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Could not prepare print. Please retry.'); }
  };

  // Save to Neon Postgres
  const saveStrip = async (): Promise<{ shareCode: string; stripId?: string }> => {
    if (savedResult?.shareCode) {
      return { shareCode: savedResult.shareCode, stripId: savedResult.stripId };
    }

    const savingRevision = revision;
    const savingGeneration = generation;
    const checkAccount = () => {
      if (!isCurrent(savingGeneration)) throw new Error("Your account status changed. Save again to create a sharing link for this version.");
    };
    checkAccount();
    if (status !== "guest" && status !== "authenticated") throw new Error("Please check your account status before saving online. You can still download a guest PNG.");
    setIsSavingToBackend(true);
    setSaveError(null);

    try {
      const stripData = await renderCanvas();
      if (!stripData) throw new Error("Could not render photo strip");

      checkAccount();
      const sessionRes = await createBoothSession({
        boothName: "Pho2Booth Web",
        layout,
        photoCount: shots.length,
        theme: selectedFrame.id,
      });

      const sessionId = sessionRes.session.id;

      for (const shot of shots) {
        checkAccount();
        await recordCapturedPhoto({
          sessionId,
          shotIndex: shot.index,
          imageData: shot.dataUrl,
          filterName: shot.filter,
        });
      }

      checkAccount();
      const stripRes = await persistPhotoStrip({
        sessionId,
        stripData,
        template: layout,
        headerText,
        footerText,
        frameColor: selectedFrame.hex,
        textColor: selectedFrame.textColor,
      });

      checkAccount();
      if (revisionRef.current !== savingRevision) throw new Error("Your strip changed while saving. Save the current version again.");
      const result = {
        revision: savingRevision,
        stripId: undefined,
        sessionId,
        shareCode: stripRes.strip.shareCode,
        storage: stripRes.storage,
      };

      setSavedResult(result);

      confetti({
      disableForReducedMotion: true,
        particleCount: 80,
        spread: 100,
        origin: { y: 0.5 },
      });

      return { shareCode: stripRes.strip.shareCode, stripId: undefined };
    } catch (err: unknown) {
      console.warn("Save strip failed", {
        operation: "save-strip",
        ...(err instanceof Error && "status" in err && typeof err.status === "number" ? { status: err.status } : {}),
        ...(err instanceof Error && "code" in err && typeof err.code === "string" ? { code: err.code } : {}),
      });
      setSaveError((err instanceof Error ? err.message : "") || "Could not save your strip. Please try again.");
      throw err;
    }
  };

  const handleSaveToNeon = (): Promise<{ shareCode: string; stripId?: string }> => {
    // Save and QR share one request, including its rejection, until it settles.
    if (savePromiseRef.current) return savePromiseRef.current;
    const pendingSave = saveStrip().finally(() => {
      savePromiseRef.current = null;
      setIsSavingToBackend(false);
    });
    savePromiseRef.current = pendingSave;
    return pendingSave;
  };

  return (
    <div className={`studio-page ${styles.studio} ${styles.stripStudio}`}>
      <header className="studio-heading"><button className="button button-quiet button-change-format" onClick={onBack ?? onRetake}><ArrowLeft size={18} /> Change format</button><div><h1>Photo strip studio</h1></div></header>
      <div className="studio-grid">
      {/* LEFT COLUMN: Customizer Controls */}
      <div className="studio-sidebar">
        <div className="flex-shrink-0 pb-1">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-[#29251f]" />
            <h2 className="text-xl font-bold text-[#29251f]">Customize Keepsake</h2>
          </div>
          <p className="text-xs text-[#655f55] mt-0.5">
            Choose a photobooth geometry, framing tone, and personalized captions.
          </p>
        </div>

        {/* Tactile Segmented Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Customize strip"
          className="flex-shrink-0 flex p-1 bg-[#ece6d9] rounded-lg border border-[#ddd6c8] gap-1"
        >
          {[
            { id: "Layout", label: "Layout" },
            { id: "Frame", label: "Frame" },
            { id: "Captions", label: "Captions" },
            { id: "Stickers", label: "Stickers" },
          ].map((item) => {
            const isSelected = tab === item.id || (item.id === "Captions" && tab === "Details");
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setTab(item.id)}
                className={`flex-1 min-h-[36px] py-1.5 px-2 text-xs font-bold rounded-md transition-all text-center ${
                  isSelected
                    ? "bg-[#29251f] text-[#fffdf7] shadow-xs"
                    : "text-[#655f55] hover:text-[#29251f] hover:bg-white/60"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable middle body for options & tools */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2">
        {/* TAB 1: Layout Selection */}
        <div hidden={tab !== "Layout"}>
          <div className="flex flex-col gap-2.5">
            {/* Search layouts */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#655f55]" />
              <input
                type="text"
                aria-label="Search layouts"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter layouts (e.g. film, polaroid, 4-strip)..."
                className="w-full bg-white border border-[#ddd6c8] rounded-lg pl-8 pr-8 py-2 text-xs text-[#29251f] placeholder:text-[#655f55] focus:outline-none focus:border-[#29251f] focus:ring-1 focus:ring-[#29251f]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#655f55] hover:text-[#29251f] px-1"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* Category Filter Chips */}
            <div
              className="flex items-center gap-1 overflow-x-auto flex-nowrap pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Layout categories"
            >
              {[
                { id: "all", label: "All" },
                { id: "strips", label: "Strips" },
                { id: "grids", label: "Grids" },
                { id: "polaroid", label: "Polaroid" },
                { id: "cinema", label: "Cinema" },
                { id: "creative", label: "Creative" },
              ].map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedCategory(cat.id as LayoutCategory)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold transition border whitespace-nowrap shrink-0 ${
                      isSelected
                        ? "bg-[#29251f] text-[#fffdf7] border-[#29251f]"
                        : "bg-white text-[#655f55] border-[#ddd6c8] hover:border-[#b8b09e] hover:text-[#29251f] hover:bg-[#f7f4eb]"
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Layout Cards Grid */}
            {filteredLayouts.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-[#ddd6c8] rounded-xl text-xs text-[#655f55]">
                <p>No layouts match &ldquo;{searchQuery}&rdquo;</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                  }}
                  className="mt-2 text-xs font-semibold text-[#29251f] underline"
                >
                  Reset layout filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {filteredLayouts.map((l) => {
                  const isSelected = layout === l.id;
                  const isLocked = !isLayoutUnlocked(plan, l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (isLocked) {
                          setUpgradeModalFeature({
                            title: `${l.name} is a Creator Layout`,
                            description: "Upgrade to the Creator Plan or grab an Event Pass to unlock all 23+ vintage, film roll, and editorial layouts."
                          });
                          setUpgradeModalOpen(true);
                          return;
                        }
                        setLayout(l.id);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition relative flex items-start gap-2.5 ${
                        isSelected
                          ? "bg-[#ece6d9] border-[#29251f] text-[#29251f] ring-1 ring-[#29251f] shadow-xs"
                          : "bg-white border-[#ddd6c8] text-[#453e34] hover:bg-[#f7f4eb] hover:border-[#b8b09e]"
                      }`}
                    >
                      <LayoutWireframe id={l.id} category={l.category} count={l.count} />
                      <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch">
                        <div>
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-bold leading-tight truncate">
                              {l.name}
                            </span>
                            {isSelected && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#d94c35] shrink-0 mt-0.5" aria-hidden="true" />
                            )}
                            {isLocked && (
                              <Lock size={12} className="text-[#94a3b8] shrink-0 mt-0.5" aria-label="Locked creator layout" />
                            )}
                          </div>
                          <p className="text-[10px] text-[#655f55] line-clamp-2 mt-0.5 leading-snug">
                            {l.description}
                          </p>
                        </div>
                        <span className="text-[10px] text-[#29251f] font-mono font-medium mt-1">
                          {l.count} {l.count === 1 ? "photo" : "photos"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* TAB 2: Frame Tone & Event Themes */}
        <div hidden={tab !== "Frame"}>
          <div className="flex flex-col gap-3">
            {/* Frame Color Swatches */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-[#29251f] uppercase tracking-wider">
                Frame Color
              </label>
              <div className="flex flex-wrap gap-2">
                {FRAME_COLORS.map((frame) => {
                  const isSelected = selectedFrame.id === frame.id;
                  return (
                    <button
                      key={frame.id}
                      type="button"
                      aria-label={frame.name}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedFrame(frame)}
                      title={frame.name}
                      style={{ backgroundColor: frame.hex }}
                      className={`w-8 h-8 rounded-lg border transition-transform ${
                        isSelected
                          ? "border-[#29251f] ring-2 ring-[#29251f]/40 scale-105 shadow-xs"
                          : "border-[#ddd6c8] hover:border-[#999] hover:scale-105"
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Event Themes & Motifs */}
            <div className="flex flex-col gap-2 pt-2 border-t border-[#ddd6c8]/70">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#29251f] uppercase tracking-wider">
                  Event Themes
                </label>
                {selectedTemplate && (
                  <span className="text-[10px] text-[#29251f] font-semibold truncate max-w-[150px]">
                    Active: {selectedTemplate.name}
                  </span>
                )}
              </div>

              {/* Event Category Filter */}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Event categories">
                <button
                  type="button"
                  aria-pressed={selectedEventCategory === "all"}
                  onClick={() => setSelectedEventCategory("all")}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md text-[11px] font-semibold transition border ${
                    selectedEventCategory === "all"
                      ? "bg-[#29251f] text-[#fffdf7] border-[#29251f]"
                      : "bg-white text-[#655f55] border-[#ddd6c8] hover:border-[#b8b09e] hover:text-[#29251f]"
                  }`}
                >
                  All
                </button>
                {EVENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={selectedEventCategory === cat.id}
                    onClick={() => setSelectedEventCategory(cat.id)}
                    className={`min-h-[30px] px-2.5 py-1 rounded-md text-[11px] font-semibold transition border flex items-center gap-1 ${
                      selectedEventCategory === cat.id
                        ? "bg-[#29251f] text-[#fffdf7] border-[#29251f]"
                        : "bg-white text-[#655f55] border-[#ddd6c8] hover:border-[#b8b09e] hover:text-[#29251f]"
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>

              {/* Theme Cards Grid */}
              <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                {filteredEventTemplates.map((t) => {
                  const isSelected = selectedTemplate?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelectTemplate(t)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        isSelected
                          ? "bg-[#ece6d9] border-[#29251f] text-[#29251f] ring-1 ring-[#29251f] shadow-xs"
                          : "bg-white border-[#ddd6c8] text-[#453e34] hover:bg-[#f7f4eb] hover:border-[#b8b09e]"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-sm">{t.iconEmoji}</span>
                          <span className="text-[9px] bg-white text-[#29251f] px-1.5 py-0.5 rounded font-mono uppercase font-bold border border-[#ddd6c8]">
                            {t.borderStyle}
                          </span>
                        </div>
                        <div className="text-xs font-bold truncate leading-tight">{t.name}</div>
                        <div className="text-[10px] text-[#655f55] line-clamp-1 mt-0.5">
                          {t.description}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-[#ddd6c8]/60">
                        <span
                          className="w-3.5 h-3.5 rounded border border-neutral-300 shadow-2xs"
                          style={{ backgroundColor: t.frameColor }}
                          title={`Frame: ${t.frameColor}`}
                        />
                        <span className="text-[9px] text-[#655f55] font-mono">
                          {t.recommendedLayout}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* TAB 3: Captions */}
        <div hidden={tab !== "Captions" && tab !== "Details"}>
          <div className="flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-[#29251f] uppercase tracking-wider">
                  Header Caption
                </label>
                <span className="text-[10px] text-[#655f55] font-mono">{headerText.length}/30</span>
              </div>
              <input
                type="text"
                aria-label="Header Caption"
                value={headerText}
                onChange={(e) => {
                  if (!isPaid) {
                    setUpgradeModalFeature({
                      title: "Custom Header Caption",
                      description: "Upgrade to Creator or get an Event Pass to write your own custom header captions.",
                    });
                    setUpgradeModalOpen(true);
                    return;
                  }
                  setHeaderText(e.target.value);
                }}
                readOnly={!isPaid}
                maxLength={30}
                className={`w-full bg-white border border-[#ddd6c8] rounded-lg px-3 py-2 text-xs text-[#29251f] placeholder:text-[#655f55] focus:outline-none focus:border-[#29251f] focus:ring-1 focus:ring-[#29251f] ${!isPaid ? "cursor-pointer bg-[#faf8f5]" : ""}`}
                placeholder={!isPaid ? "Creator to customize" : "e.g. The Good Times Club"}
                onClick={() => {
                  if (!isPaid) {
                    setUpgradeModalFeature({
                      title: "Custom Header Caption",
                      description: "Upgrade to Creator or get an Event Pass to write your own custom header captions.",
                    });
                    setUpgradeModalOpen(true);
                  }
                }}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-bold text-[#29251f] uppercase tracking-wider">
                    Footer Watermark
                  </label>
                  {isGuest ? (
                    <span className="text-[10px] bg-[#f5e6d3] text-[#8c501e] px-1.5 py-0.5 rounded font-medium">
                      Guest Locked
                    </span>
                  ) : (
                    <span className="text-[10px] bg-[#e6f4ea] text-[#137333] px-1.5 py-0.5 rounded font-medium">
                      ⭐ Pro Unlocked
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[#655f55] font-mono">{footerText.length}/40</span>
              </div>
              <input
                type="text"
                aria-label="Footer Caption"
                value={footerText}
                onChange={(e) => {
                  if (!isPaid) {
                    setUpgradeModalFeature({
                      title: "Custom Branding & Watermark Removal",
                      description: "Upgrade to Creator or get an Event Pass to remove default watermarks and write your own custom captions."
                    });
                    setUpgradeModalOpen(true);
                    return;
                  }
                  setFooterText(e.target.value);
                }}
                readOnly={!isPaid}
                maxLength={40}
                className={`w-full bg-white border border-[#ddd6c8] rounded-lg px-3 py-2 text-xs text-[#29251f] placeholder:text-[#655f55] focus:outline-none focus:border-[#29251f] focus:ring-1 focus:ring-[#29251f] ${!isPaid ? "cursor-pointer bg-[#faf8f5]" : ""}`}
                placeholder={!isPaid ? "PHO2BOOTH • 2026 (Creator to customize)" : "Leave blank for clean export, or type custom text"}
                onClick={() => {
                  if (!isPaid) {
                    setUpgradeModalFeature({
                      title: "Custom Branding & Watermark Removal",
                      description: "Upgrade to Creator or get an Event Pass to remove default watermarks and write your own custom captions."
                    });
                    setUpgradeModalOpen(true);
                  }
                }}
              />
              {!isPaid ? (
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-[11px] text-[#655f55]">
                    Standard <span className="font-semibold text-[#29251f]">PHO2BOOTH</span> watermark on free strips.
                  </p>
                  <Link
                    href="/pricing"
                    className="text-[11px] text-[#d94c35] font-semibold hover:underline"
                  >
                    Remove with Creator →
                  </Link>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-[11px] text-[#137333]">
                    Clean export ready. Clear text to remove watermark completely.
                  </p>
                  {footerText && (
                    <button
                      type="button"
                      onClick={() => setFooterText("")}
                      className="text-[11px] text-[#655f55] hover:text-[#29251f] hover:underline"
                    >
                      Clear (Clean strip)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TAB 4: Stickers Palette */}
        <div hidden={tab !== "Stickers"}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#29251f] uppercase tracking-wider">
                Stickers {stickers.length > 0 && `(${stickers.length})`}
              </label>
              {stickers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStickers([])}
                  className="text-xs text-[#d94c35] hover:underline font-semibold"
                >
                  Clear all
                </button>
              )}
            </div>

            {selectedTemplate?.stickers && selectedTemplate.stickers.length > 0 && (
              <div className="flex items-center gap-2 p-2 bg-[#ece6d9] border border-[#ddd6c8] rounded-lg">
                <span className="text-[11px] text-[#29251f] font-bold">Theme:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {selectedTemplate.stickers.map((stk) => (
                    <button
                      key={stk}
                      type="button"
                      onClick={() => addSticker(stk)}
                      className="w-8 h-8 flex items-center justify-center text-lg hover:scale-125 transition-transform"
                      title={`Add ${stk}`}
                    >
                      {stk}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 p-2 bg-[#f7f4eb] border border-[#ddd6c8] rounded-xl max-h-28 overflow-y-auto">
              {STICKER_PALETTE.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => addSticker(emoji)}
                  className="w-8 h-8 flex items-center justify-center text-lg hover:scale-125 transition-transform active:scale-95"
                  title={`Add ${emoji} sticker`}
                  aria-label={`Add ${emoji} sticker`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>

        {/* Pinned Bottom Action Dock */}
        <div className="flex-shrink-0 flex flex-col gap-2 pt-2 border-t border-[#ded8cc]/80 mt-auto">
          {status === "unavailable" && (
            <div className="status-note text-[11px] py-1 px-2.5">
              We couldn’t check your session. You can keep creating and download a guest PNG.{" "}
              <button type="button" className="text-link" onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          )}
          {status === "logout-failed" && (
            <button type="button" className="button button-secondary text-xs min-h-[34px]" onClick={() => void logout()}>
              Retry sign-out
            </button>
          )}

          <div className={styles.secondaryActions}>
            <button type="button" onClick={() => setIsQrModalOpen(true)} className="button button-secondary min-h-[38px] text-xs">
              <QrCode size={15} /> Share QR
            </button>
            <button type="button" onClick={handlePrint} className="button button-secondary min-h-[38px] text-xs">
              <Printer size={15} /> Print
            </button>
            <button
              type="button"
              onClick={() => void handleSaveToNeon().catch(() => {})}
              disabled={isSavingToBackend}
              className="button button-secondary min-h-[38px] text-xs"
            >
              <CloudUpload size={15} />
              {isSavingToBackend ? "Saving…" : "Save"}
            </button>
          </div>

          {/* Download All Individual Captured Photos */}
          <button
            type="button"
            onClick={handleDownloadAllPhotos}
            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-[#ece6d9] text-[#29251f] font-semibold py-1.5 px-3 rounded-lg border border-[#ddd6c8] shadow-2xs transition active:scale-95 text-xs min-h-[36px]"
          >
            <Images className="w-3.5 h-3.5 text-[#29251f]" />
            <span>Download Raw Photos ({shots.length})</span>
            {isPaid ? (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                ⭐ Unlocked
              </span>
            ) : (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#8b3d2f] font-semibold bg-[#f5ede4] px-1.5 py-0.5 rounded border border-[#e4d5c3]">
                <Lock className="w-3 h-3 text-[#d94c35]" />
                Pro Only
              </span>
            )}
          </button>

          {/* Saved Notification */}
          {savedResult && (
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-col gap-1 text-emerald-800 text-[11px] shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Saved!
                </div>
                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(true)}
                  className="flex items-center gap-1 text-[10px] font-bold text-[#29251f] bg-white border border-[#ddd6c8] px-2 py-0.5 rounded hover:bg-[#ece6d9] transition"
                >
                  <QrCode className="w-3 h-3" />
                  View QR
                </button>
              </div>
              <div className="flex items-center justify-between text-[#29251f]">
                <span>Share Code:</span>
                <span className="share-code-value font-mono bg-emerald-600 px-1.5 py-0.5 rounded font-bold text-white tracking-widest text-[11px]">
                  {savedResult.shareCode}
                </span>
              </div>
            </div>
          )}

          {saveError && (
            <div role="alert" className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[11px]">
              {saveError} Local PNG export remains available. Retry Save when the connection returns.
            </div>
          )}

          <div className="flex items-center justify-between pt-0.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="button-change-format min-h-[34px] flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change Format
              </button>
            )}
            <button
              type="button"
              onClick={onRetake}
              className="button-change-format min-h-[34px] flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retake session
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Live Photo Strip Preview */}
      <div className="studio-preview">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-[#655f55] uppercase tracking-wider">
            Live Preview:
          </span>
          <span className="text-xs font-bold text-neutral-900">
            {activeLayoutObj.name}
          </span>
          <span className="text-[10px] text-[#655f55]">
            ({activeLayoutObj.count} photos)
          </span>
        </div>

        <div className={styles.downloadDock}>
          <button ref={downloadButtonRef} onClick={handleDownload} className="button button-primary w-full"><Download size={18} /> Download PNG</button>
        </div>

        {/* Stage wrapper that dynamically bounds and centers the visual strip */}
        <div ref={previewContainerRef} className={styles.stripPreviewStage}>
          {/* Visual Strip Container */}
          <div
            ref={stripRef}
            data-layout={layout}
            style={{
              backgroundColor: selectedFrame.hex,
              color: selectedFrame.textColor,
              transform: `scale(${previewScale})`,
              transformOrigin: "center center",
            }}
            className={`${styles.stripArtifact} relative rounded-2xl shadow-2xl p-5 transition-transform duration-150 border border-white/10 overflow-hidden ${
            layout === "mini-strip-duo"
              ? "w-full max-w-[500px]"
              : layout === "grid-2x2" ||
                layout === "passport-4" ||
                layout === "polaroid-quad" ||
                layout === "heart-badge"
              ? "w-full max-w-[420px]"
              : layout === "grid-3x2"
              ? "w-full max-w-[420px]"
              : layout === "grid-2x3" || layout === "film-35mm-horiz"
              ? "w-full max-w-[540px]"
              : layout === "polaroid"
              ? "w-full max-w-[340px]"
              : layout === "polaroid-duo"
              ? "w-full max-w-[480px]"
              : layout === "split-featured"
              ? "w-full max-w-[400px]"
              : layout === "sidebar-hero"
              ? "w-full max-w-[440px]"
              : "w-full max-w-[320px]"
          }`}
        >
          {/* Active Template Border Motif */}
          <TemplateFrameDecoration
            borderStyle={selectedTemplate?.borderStyle}
            accentColor={selectedTemplate?.accentColor}
            textColor={selectedFrame.textColor}
          />

          {/* Layout-Specific Custom Design Header */}
          <LayoutHeaderBadge
            layout={layout}
            headerText={headerText}
            footerText={footerText}
            textColor={selectedFrame.textColor}
          />

          {/* Dynamic Content Based on Layout */}
          {layout === "mini-strip-duo" ? (
            <div className="grid grid-cols-2 gap-5 relative mb-3">
              {/* Left Strip */}
              <div className="flex flex-col gap-2">
                {displayShots.slice(0, 3).map((shot, idx) => (
                  <div
                    key={`left-${shot.id}-${idx}`}
                    className="aspect-[4/3] rounded overflow-hidden bg-black/40 shadow-inner"
                  >
                    <img src={shot.dataUrl} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>

              {/* Exact Center Divider Cut Line & Scissors Badge */}
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center justify-center">
                {/* Dotted / Dashed Line on 50% Center Axis */}
                <div
                  className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0 border-l-2 border-dashed"
                  style={{
                    borderColor: selectedFrame.textColor,
                    opacity: 0.45,
                  }}
                />
                {/* Centered Scissors Badge */}
                <div
                  className="relative z-10 p-1.5 rounded-full shadow-xs flex items-center justify-center -rotate-90"
                  style={{
                    backgroundColor: selectedFrame.hex,
                    color: selectedFrame.textColor,
                    border: `1.5px solid ${selectedFrame.textColor}40`,
                  }}
                >
                  <Scissors className="w-3 h-3" />
                </div>
              </div>

              {/* Right Strip */}
              <div className="flex flex-col gap-2">
                {displayShots.slice(0, 3).map((shot, idx) => (
                  <div
                    key={`right-${shot.id}-${idx}`}
                    className="aspect-[4/3] rounded overflow-hidden bg-black/40 shadow-inner"
                  >
                    <img src={shot.dataUrl} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          ) : layout === "grid-2x2" || layout === "passport-4" ? (
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              {displayShots.slice(0, 4).map((shot, idx) => (
                <div
                  key={`${shot.id}-${idx}`}
                  className={`aspect-[4/3] rounded-lg overflow-hidden bg-black/40 shadow-inner ${
                    layout === "passport-4" ? "border-2 border-white/30" : ""
                  }`}
                >
                  <img src={shot.dataUrl} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : layout === "grid-3x2" ? (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {displayShots.slice(0, 6).map((shot, idx) => (
                <div
                  key={`${shot.id}-${idx}`}
                  className="aspect-[4/3] rounded-lg overflow-hidden bg-black/40 shadow-inner"
                >
                  <img src={shot.dataUrl} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : layout === "grid-2x3" ? (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {displayShots.slice(0, 6).map((shot, idx) => (
                <div
                  key={`${shot.id}-${idx}`}
                  className="aspect-[4/3] rounded-lg overflow-hidden bg-black/40 shadow-inner"
                >
                  <img src={shot.dataUrl} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : layout === "polaroid" ? (
            <div className="mb-4">
              {displayShots[0] && (
                <div className="aspect-square rounded-lg overflow-hidden bg-black/40 shadow-inner mb-4">
                  <img src={displayShots[0].dataUrl} alt="Polaroid" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          ) : layout === "polaroid-duo" ? (
            <div className="grid grid-cols-2 gap-3 mb-3">
              {displayShots.slice(0, 2).map((shot, idx) => (
                <div key={`${shot.id}-${idx}`} className="bg-white p-2 pb-6 rounded shadow-md">
                  <div className="aspect-square overflow-hidden bg-black/40">
                    <img src={shot.dataUrl} alt={`Polaroid ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                </div>
              ))}
            </div>
          ) : layout === "polaroid-trio" ? (
            <div className="flex flex-col gap-2.5 mb-3">
              {displayShots.slice(0, 3).map((shot, idx) => (
                <div key={`${shot.id}-${idx}`} className="bg-white p-2 pb-5 rounded shadow">
                  <div className="aspect-[4/3] overflow-hidden bg-black/40">
                    <img src={shot.dataUrl} alt={`Trio ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                </div>
              ))}
            </div>
          ) : layout === "polaroid-quad" ? (
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              {displayShots.slice(0, 4).map((shot, idx) => (
                <div key={`${shot.id}-${idx}`} className="bg-white p-1.5 pb-4 rounded shadow">
                  <div className="aspect-square overflow-hidden bg-black/40">
                    <img src={shot.dataUrl} alt={`Quad ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                </div>
              ))}
            </div>
          ) : layout === "split-featured" ? (
            <div className="flex flex-col gap-2 mb-3">
              {displayShots[0] && (
                <div className="aspect-[16/10] rounded-lg overflow-hidden bg-black/40 shadow-inner">
                  <img src={displayShots[0].dataUrl} alt="Hero" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                {displayShots.slice(1, 4).map((shot, idx) => (
                  <div key={`thumb-${idx}`} className="aspect-square rounded overflow-hidden bg-black/40">
                    <img src={shot.dataUrl} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          ) : layout === "sidebar-hero" ? (
            <div className="grid grid-cols-12 gap-2 mb-3">
              <div className="col-span-7 aspect-[3/4] rounded-lg overflow-hidden bg-black/40">
                {displayShots[0] && (
                  <img src={displayShots[0].dataUrl} alt="Hero Left" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="col-span-5 flex flex-col gap-2">
                {displayShots.slice(1, 3).map((shot, idx) => (
                  <div key={`side-${idx}`} className="aspect-[4/3] rounded-lg overflow-hidden bg-black/40">
                    <img src={shot.dataUrl} alt={`Side ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          ) : layout === "ticket-stub" ? (
            <div className="flex flex-col gap-2 mb-3">
              {displayShots.slice(0, 2).map((shot, idx) => (
                <div key={`ticket-${idx}`} className="aspect-[16/10] rounded overflow-hidden bg-black/40">
                  <img src={shot.dataUrl} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
              {/* Barcode line */}
              <div className="border-t border-dashed border-white/40 pt-2 flex items-center justify-between text-[9px] font-mono">
                <span>ADMIT ONE • VIP</span>
                <span className="tracking-widest">||| | |||| | |||</span>
              </div>
            </div>
          ) : layout === "arcade-retro" ? (
            <div className="border-2 border-pink-500 p-1.5 rounded-xl flex flex-col gap-2 mb-3 bg-black/60 shadow-[0_0_15px_rgba(236,72,153,0.3)]">
              <div className="text-[9px] text-pink-400 font-mono text-center">1UP • HIGH SCORE 99990</div>
              {displayShots.slice(0, 4).map((shot, idx) => (
                <div key={`arcade-${idx}`} className="aspect-[4/3] rounded overflow-hidden">
                  <img src={shot.dataUrl} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : layout === "heart-badge" ? (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {displayShots.slice(0, 4).map((shot, idx) => (
                <div key={`badge-${idx}`} className="aspect-[4/3] rounded-2xl overflow-hidden bg-black/40 shadow">
                  <img src={shot.dataUrl} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : layout === "film-strip" ? (
            <div className="bg-black py-2 px-6 relative rounded mb-3">
              {/* Left sprocket */}
              <div className="absolute left-1.5 top-0 bottom-0 flex flex-col justify-around">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="w-2.5 h-3.5 bg-white/90 rounded-xs" />
                ))}
              </div>
              {/* Right sprocket */}
              <div className="absolute right-1.5 top-0 bottom-0 flex flex-col justify-around">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="w-2.5 h-3.5 bg-white/90 rounded-xs" />
                ))}
              </div>
              <div className="flex flex-col gap-2">
                {displayShots.slice(0, 4).map((shot, idx) => (
                  <div key={`film-${idx}`} className="aspect-[4/3] overflow-hidden bg-black">
                    <img src={shot.dataUrl} alt={`Film ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          ) : layout === "film-35mm-horiz" ? (
            <div className="bg-black px-2 py-5 relative rounded mb-3">
              {/* Top sprockets */}
              <div className="absolute top-1.5 left-0 right-0 flex justify-around">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="w-3.5 h-2 bg-white/90 rounded-xs" />
                ))}
              </div>
              {/* Bottom sprockets */}
              <div className="absolute bottom-1.5 left-0 right-0 flex justify-around">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="w-3.5 h-2 bg-white/90 rounded-xs" />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {displayShots.slice(0, 3).map((shot, idx) => (
                  <div key={`film-h-${idx}`} className="aspect-[4/3] overflow-hidden bg-black">
                    <img src={shot.dataUrl} alt={`Film ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Standard Vertical Strips: strip-2, strip-3, strip-4, strip-5, strip-6, cinema-widescreen */
            <div className="flex flex-col gap-2.5 mb-3">
              {displayShots.map((shot, idx) => (
                <div
                  key={`${shot.id}-${idx}`}
                  className={`rounded-lg overflow-hidden bg-black/40 shadow-inner ${
                    layout === "cinema-widescreen" ? "aspect-[16/9]" : "aspect-[4/3]"
                  }`}
                >
                  <img
                    src={shot.dataUrl}
                    alt={`Photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Stickers overlay */}
          {stickers.map((s) => (
            <button
              type="button"
              aria-label={`Remove ${s.emoji} sticker`}
              key={s.id}
              onClick={() => removeSticker(s.id)}
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
              }}
              title="Click to remove sticker"
              className="absolute text-3xl cursor-pointer hover:scale-125 transition-transform select-none drop-shadow"
            >
              {s.emoji}
            </button>
          ))}

          {/* Layout-Specific Custom Design Footer */}
          <LayoutFooterBadge
            layout={layout}
            headerText={headerText}
            footerText={footerText}
            textColor={selectedFrame.textColor}
          />

        </div>
        </div>
      </div>

      </div>
      <div role="status" aria-live="polite">{authAnnouncement}</div>
      {/* Auth form unmounts on dismissal; editor state stays in this component. */}
      {isAuthDialogOpen && (
        <Dialog title="Sign in to keep creating" onClose={closeAuthDialog}>
          <AccountForm
            variant="dialog"
            onSuccess={handleAuthSuccess}
            onContinueAsGuest={closeAuthDialog}
          />
        </Dialog>
      )}

      {upgradeModalOpen && (
        <Dialog title={upgradeModalFeature.title} onClose={() => setUpgradeModalOpen(false)}>
          <div className="p-4 text-center">
            <p className="text-sm text-[#475569] mb-5 leading-relaxed">
              {upgradeModalFeature.description}
            </p>
            <div className="flex gap-2.5 justify-center">
              <Link
                href="/pricing"
                className="button button-primary"
                onClick={() => setUpgradeModalOpen(false)}
              >
                View Plans & Pricing
              </Link>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setUpgradeModalOpen(false)}
              >
                Stay on Free
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {printImage && <img className={`print-artifact ${styles.printImage}`} src={printImage} alt="Photo ready to print" onLoad={() => window.print()} />}
      {/* QR Code Modal for Phone Download */}
      <ScanQrModal
        key={revision}
        isOpen={isQrModalOpen && !isAuthDialogOpen}
        onClose={() => setIsQrModalOpen(false)}
        shareCode={savedResult?.shareCode}
        onGenerateCode={handleSaveToNeon}
      />
    </div>
  );
}
