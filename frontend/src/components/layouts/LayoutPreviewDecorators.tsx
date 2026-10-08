import React from "react";
import { Scissors } from "lucide-react";
import { LayoutType, TemplateBorderStyle } from "@/types/booth";

interface DecoratorProps {
  layout: LayoutType;
  headerText: string;
  footerText: string;
  textColor: string;
}

export function LayoutHeaderBadge({ layout, headerText, textColor }: DecoratorProps) {
  switch (layout) {
    case "film-strip":
      return (
        <div className="flex items-center justify-between text-[10px] font-mono tracking-widest text-amber-500 uppercase px-4 mb-2">
          <span>▶ KODAK TX 400</span>
          <span>SAFETY FILM</span>
          <span>35MM</span>
        </div>
      );

    case "film-35mm-horiz":
      return (
        <div className="flex items-center justify-between text-[10px] font-mono tracking-widest text-amber-500 uppercase px-4 mb-2">
          <span>PANAVISION 35MM</span>
          <span>REEL #02</span>
          <span>24 FPS</span>
        </div>
      );

    case "arcade-retro":
      return (
        <div className="flex items-center justify-between text-[10px] font-mono tracking-wider text-pink-400 bg-black/60 px-3 py-1 rounded-md mb-2 border border-pink-500/40">
          <span>1UP: 99990</span>
          <span className="animate-pulse">★ INSERT COIN ★</span>
          <span>STAGE 1-1</span>
        </div>
      );

    case "ticket-stub":
      return (
        <div className="flex items-center justify-between border-b-2 border-dashed border-white/30 pb-2 mb-2.5">
          <div>
            <div className="text-[12px] font-black tracking-widest uppercase">ADMIT ONE • VIP</div>
            <div className="text-[9px] opacity-75 font-mono">№ 0849204 • SECTION A</div>
          </div>
          <div className="text-right">
            <span className="bg-amber-400 text-black text-[9px] font-extrabold px-2 py-0.5 rounded">
              LIVE EVENT
            </span>
          </div>
        </div>
      );

    case "passport-4":
      return (
        <div className="flex items-center justify-between border-b border-white/20 pb-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">🌐</span>
            <span className="text-[11px] font-bold tracking-widest uppercase">
              OFFICIAL PASSPORT CONTROL
            </span>
          </div>
          <span className="text-[9px] font-mono border border-cyan-400/50 text-cyan-300 px-1.5 py-0.5 rounded">
            VISA VALID
          </span>
        </div>
      );

    case "heart-badge":
      return (
        <div className="flex flex-col items-center mb-2">
          <div className="text-sm font-bold tracking-widest flex items-center gap-1.5 text-pink-300">
            <span>♡</span>
            <span>인생네컷 • LIFE 4 CUTS</span>
            <span>♡</span>
          </div>
          <div className="text-[9px] tracking-wider opacity-75 mt-0.5">
            {headerText || "SWEET MEMORIES WITH YOU"}
          </div>
        </div>
      );

    case "cinema-widescreen":
      return (
        <div className="flex items-center justify-between text-[10px] font-mono tracking-widest text-slate-300 uppercase px-1 mb-2 border-b border-white/10 pb-1">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            REC [●] 01:23:45:12
          </span>
          <span>ANAMORPHIC 2.39:1</span>
        </div>
      );

    case "split-featured":
      return (
        <div className="flex items-end justify-between border-b-2 border-current pb-2 mb-3">
          <div>
            <div className="text-xl font-black tracking-tighter uppercase font-serif">PHO2 VOGUE</div>
            <div className="text-[9px] tracking-widest uppercase opacity-80">
              SPECIAL ISSUE // VOL. 26
            </div>
          </div>
          <div className="text-right text-[9px] font-mono opacity-80">
            AUTUMN 2026
          </div>
        </div>
      );

    case "sidebar-hero":
      return (
        <div className="flex items-center justify-between border-b border-current pb-1.5 mb-2.5">
          <span className="text-[11px] font-extrabold tracking-widest uppercase font-serif">
            LOOKBOOK SERIES 01
          </span>
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
          </div>
        </div>
      );

    case "strip-3":
      return (
        <div className="flex flex-col items-center mb-2.5">
          <div className="text-[10px] tracking-[0.25em] font-medium opacity-80">
            フォトブース • TOKYO
          </div>
          {headerText && (
            <div className="text-xs font-black tracking-widest uppercase mt-0.5">
              {headerText}
            </div>
          )}
        </div>
      );

    case "strip-2":
      return (
        <div className="text-center mb-2.5 border-b border-current pb-2">
          <div className="text-[9px] tracking-[0.3em] font-serif uppercase opacity-75">
            HAUTE EDITION • MMXXVI
          </div>
          <div className="text-sm font-serif font-bold tracking-wider mt-0.5">
            {headerText || "PORTRAIT DUO"}
          </div>
        </div>
      );

    case "strip-5":
      return (
        <div className="flex items-center justify-between text-[9px] font-mono tracking-widest opacity-80 px-1 mb-2">
          <span>STORYBOARD 1.85:1</span>
          <span>{headerText || "SCENE DIRECTORS CUT"}</span>
        </div>
      );

    case "grid-2x2":
      return (
        <div className="flex items-center justify-between border-b border-current pb-1.5 mb-2.5">
          <span className="text-[10px] tracking-widest uppercase font-mono">✦ CYBER//2026 ✦</span>
          <span className="text-xs font-black tracking-widest uppercase">
            {headerText || "PHO2BOOTH"}
          </span>
          <span className="text-[10px] tracking-widest uppercase font-mono">✦ QUAD ✦</span>
        </div>
      );

    case "grid-3x2":
      return (
        <div className="flex items-center justify-between text-[9px] font-mono tracking-widest text-amber-500 uppercase px-1 mb-2 border-b border-amber-500/30 pb-1">
          <span>ILFORD HP5 PLUS</span>
          <span>DARKROOM PROOF SHEET</span>
          <span>400 ISO</span>
        </div>
      );

    case "grid-2x3":
      return (
        <div className="flex items-center justify-between border-b-2 border-red-500 pb-1.5 mb-2.5 px-1">
          <span className="text-[10px] font-bold text-red-500 tracking-widest">
            PAR AVION • AIR MAIL
          </span>
          <span className="text-xs font-black tracking-widest uppercase">
            {headerText || "POSTCARD MEMORIES"}
          </span>
          <span className="text-[9px] font-mono text-blue-500 font-bold">
            POSTAGE PAID
          </span>
        </div>
      );

    case "grid-1x3":
      return (
        <div className="text-center mb-2.5">
          <div className="text-[9px] tracking-[0.3em] uppercase opacity-70">
            NORDIC GALLERY EXHIBITION
          </div>
          <div className="text-xs font-bold tracking-widest uppercase mt-0.5">
            {headerText || "TRIPTYCH SERIES"}
          </div>
        </div>
      );

    case "mini-strip-duo":
      return (
        <div className="grid grid-cols-2 gap-5 text-center text-[10px] font-bold uppercase tracking-widest mb-2 px-1">
          <div className="text-pink-400">FOR YOU ♡</div>
          <div className="text-cyan-400">FOR ME ♡</div>
        </div>
      );

    case "polaroid":
      return (
        // Washi tape visual motif at top of Polaroid
        <div className="flex justify-center -mt-2 mb-3">
          <div className="w-24 h-5 bg-amber-200/90 shadow-sm transform -rotate-1 rounded-xs flex items-center justify-center text-[8px] font-mono text-amber-900 uppercase tracking-widest opacity-95">
            ★ ORIGINAL ★
          </div>
        </div>
      );

    default:
      return headerText ? (
        <div className="text-center font-black tracking-widest text-xs mb-3 uppercase drop-shadow-xs">
          {headerText}
        </div>
      ) : null;
  }
}

export function LayoutFooterBadge({ layout, footerText, textColor }: DecoratorProps) {
  switch (layout) {
    case "ticket-stub":
      return (
        <div className="border-t-2 border-dashed border-white/30 pt-2.5 mt-2 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[8px] opacity-75 font-mono uppercase">BARCODE TICKET ID</span>
            <span className="text-[12px] font-mono tracking-widest">||| |||| || ||| ||||</span>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold uppercase">NO REFUNDS</span>
          </div>
        </div>
      );

    case "arcade-retro":
      return (
        <div className="text-center text-[9px] font-mono text-cyan-400 mt-2 tracking-widest">
          {footerText || "GAME OVER • PHO2BOOTH 2026"}
        </div>
      );

    case "passport-4":
      return (
        <div className="border-t border-white/20 pt-2 mt-2 flex items-center justify-between text-[9px] font-mono opacity-80">
          <span>DOC №: PH2-2026-99</span>
          <span className="text-emerald-400 font-bold">● ENTRY APPROVED</span>
        </div>
      );

    case "cinema-widescreen":
      return (
        <div className="text-center mt-2.5 text-amber-300 font-serif italic text-xs tracking-wide">
          &quot;{footerText || "A moment captured in cinematic motion."}&quot;
        </div>
      );

    case "film-strip":
      return (
        <div className="flex items-center justify-between text-[9px] font-mono text-amber-500 uppercase px-2 mt-2">
          <span>• 24 •</span>
          <span>{footerText || "PHO2BOOTH FILM LAB"}</span>
          <span>• 24A •</span>
        </div>
      );

    case "film-35mm-horiz":
      return (
        <div className="flex items-center justify-between text-[9px] font-mono text-amber-500 uppercase px-2 mt-2">
          <span>[SCENE 04]</span>
          <span>{footerText || "CINEMA ARCHIVE"}</span>
          <span>[TAKE 01]</span>
        </div>
      );

    case "mini-strip-duo":
      return (
        <div className="text-center text-[9px] tracking-widest font-mono uppercase opacity-85 mt-2 flex items-center justify-center gap-2">
          <Scissors className="w-3 h-3" />
          <span>CUT ALONG DOTTED LINE TO SHARE</span>
        </div>
      );

    case "polaroid":
      return (
        <div className="text-center font-serif italic text-sm tracking-wide text-slate-800 mt-3 pt-2">
          {footerText || "Best memories forever ♡"}
        </div>
      );

    default:
      return footerText ? (
        <div className="text-center text-[9px] tracking-widest font-semibold uppercase opacity-90 mt-2">
          {footerText}
        </div>
      ) : null;
  }
}

export interface TemplateDecorationProps {
  borderStyle?: TemplateBorderStyle;
  accentColor?: string;
  textColor?: string;
}

export function TemplateFrameDecoration({
  borderStyle,
  accentColor,
  textColor,
}: TemplateDecorationProps) {
  if (!borderStyle || borderStyle === "solid") return null;

  switch (borderStyle) {
    case "gold":
      return (
        <div className="absolute inset-2 pointer-events-none rounded-xl border border-amber-400/50 p-1">
          <div className="w-full h-full rounded-lg border border-amber-400/30 relative">
            <span className="absolute -top-1.5 -left-1 text-amber-400 text-[10px] leading-none">✦</span>
            <span className="absolute -top-1.5 -right-1 text-amber-400 text-[10px] leading-none">✦</span>
            <span className="absolute -bottom-1.5 -left-1 text-amber-400 text-[10px] leading-none">✦</span>
            <span className="absolute -bottom-1.5 -right-1 text-amber-400 text-[10px] leading-none">✦</span>
          </div>
        </div>
      );

    case "floral":
      return (
        <div className="absolute inset-2.5 pointer-events-none rounded-xl border border-emerald-500/30">
          <span className="absolute -top-2 -left-2 text-xs">🌿</span>
          <span className="absolute -top-2 -right-2 text-xs scale-x-[-1]">🌿</span>
          <span className="absolute -bottom-2 -left-2 text-xs">🌿</span>
          <span className="absolute -bottom-2 -right-2 text-xs scale-x-[-1]">🌿</span>
        </div>
      );

    case "festive":
      return (
        <div className="absolute inset-2 pointer-events-none rounded-xl border border-pink-500/30">
          <span className="absolute -top-1.5 -left-1.5 text-xs">✨</span>
          <span className="absolute -top-1.5 -right-1.5 text-xs">🎉</span>
          <span className="absolute -bottom-1.5 -left-1.5 text-xs">🎈</span>
          <span className="absolute -bottom-1.5 -right-1.5 text-xs">✨</span>
        </div>
      );

    case "neon":
      return (
        <div className="absolute inset-2 pointer-events-none rounded-xl border-2 border-cyan-400/60 shadow-[0_0_10px_rgba(6,182,212,0.35)]">
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-pink-500" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-pink-500" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-pink-500" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-pink-500" />
        </div>
      );

    case "vhs":
      return (
        <div className="absolute inset-2 pointer-events-none rounded-xl border border-emerald-500/40 p-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[8px] font-mono text-emerald-400">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              REC
            </span>
            <span>CH 03</span>
          </div>
          <div className="flex items-center justify-between text-[8px] font-mono text-emerald-400/70">
            <span>SP AUTO</span>
            <span>00:00:00</span>
          </div>
        </div>
      );

    case "lace":
      return (
        <div className="absolute inset-2 pointer-events-none rounded-xl border-2 border-dotted border-rose-400/50" />
      );

    case "candy-stripe":
      return (
        <div className="absolute inset-0 pointer-events-none border-4 border-dashed border-red-500/50 rounded-2xl" />
      );

    case "rainbow-stripe":
      return (
        <div className="absolute inset-x-3 top-1.5 h-1 rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-amber-700 pointer-events-none opacity-85" />
      );

    case "brutalist":
      return (
        <div className="absolute inset-2 pointer-events-none border-2 border-current/80 shadow-[2px_2px_0px_#ea580c]" />
      );

    case "double":
      return (
        <div className="absolute inset-2 pointer-events-none rounded-xl border border-current/30 p-1">
          <div className="w-full h-full rounded-lg border border-current/20" />
        </div>
      );

    case "minimal":
      return (
        <div className="absolute inset-3 pointer-events-none rounded border border-current/15" />
      );

    default:
      return null;
  }
}
