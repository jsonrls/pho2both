export type FilterCategory =
  | "all"
  | "classic"
  | "bw"
  | "vintage"
  | "film"
  | "cinematic"
  | "aesthetic"
  | "wedding"
  | "party"
  | "korean-japanese"
  | "social";

export type FilterType =
  // 27 Core Polished Presets
  | "none"
  | "original"
  | "auto"
  | "warm"
  | "cool"
  | "vivid"
  | "soft"
  | "matte"
  | "classic-bw"
  | "noir"
  | "vintage"
  | "sepia"
  | "polaroid"
  | "film"
  | "90s"
  | "cinematic"
  | "moody"
  | "golden-hour"
  | "dreamy"
  | "pastel"
  | "romantic"
  | "neon"
  | "y2k"
  | "korean"
  | "japanese-film"
  | "wedding"
  | "party"
  | "flash"
  // Legacy aliases
  | "grayscale"
  | "cyber-neon"
  | "warmth"
  | "invert"
  // New additions
  | "bittersweet"
  | "og-vintage"
  | "fresh"
  | "citrus"
  | "2015"
  | "focus"
  | "candy"
  | "80s"
  | "nostalgia";

export interface ManualAdjustments {
  exposure: number;    // -100 to 100
  brightness: number;  // -100 to 100
  contrast: number;    // -100 to 100
  highlights: number;  // -100 to 100
  shadows: number;     // -100 to 100
  saturation: number;  // -100 to 100
  vibrance: number;    // -100 to 100
  temperature: number; // -100 (cool) to 100 (warm)
  tint: number;        // -100 (green) to 100 (magenta)
  sharpness: number;   // 0 to 100
  clarity: number;     // -100 to 100
  fade: number;        // 0 to 100
  grain: number;       // 0 to 100
  vignette: number;    // 0 to 100
  blur: number;        // 0 to 20
  hue: number;         // -180 to 180
}

export interface FilterCategoryItem {
  id: FilterCategory;
  label: string;
  icon: string;
}

export type FlowStep = "landing" | "camera" | "preview" | "format-select" | "studio";

export type OutputFormat =
  | "strip"
  | "single"
  | "collage"
  | "gif"
  | "video"
  | "ai";

export interface FormatOption {
  id: OutputFormat;
  title: string;
  subtitle: string;
  icon: string;
  badge?: string;
  gradient: string;
}

export type EventCategory =
  | "wedding"
  | "birthday"
  | "corporate"
  | "graduation"
  | "christmas"
  | "minimal"
  | "retro"
  | "custom";

export type TemplateBorderStyle =
  | "solid"
  | "double"
  | "gold"
  | "festive"
  | "floral"
  | "neon"
  | "vhs"
  | "minimal"
  | "lace"
  | "candy-stripe"
  | "rainbow-stripe"
  | "brutalist";

export interface EventTemplate {
  id: string;
  name: string;
  category: EventCategory;
  description: string;
  frameColor: string;
  textColor: string;
  accentColor: string;
  borderStyle: TemplateBorderStyle;
  defaultHeader: string;
  defaultFooter: string;
  badge?: string;
  iconEmoji: string;
  stickers: string[];
  recommendedLayout: LayoutType;
}

export type LayoutType =
  // Classic Strips
  | "strip-4"
  | "strip-3"
  | "strip-2"
  | "strip-5"
  | "strip-6"
  | "mini-strip-duo"
  // Grids & Posters
  | "grid-2x2"
  | "grid-3x2"
  | "grid-2x3"
  | "grid-1x3"
  | "passport-4"
  // Instant & Polaroid
  | "polaroid"
  | "polaroid-duo"
  | "polaroid-trio"
  | "polaroid-quad"
  // Film & Cinema
  | "film-strip"
  | "film-35mm-horiz"
  | "cinema-widescreen"
  // Creative & Editorial
  | "split-featured"
  | "sidebar-hero"
  | "ticket-stub"
  | "arcade-retro"
  | "heart-badge";

export type LayoutCategory =
  | "all"
  | "strips"
  | "grids"
  | "polaroid"
  | "cinema"
  | "creative";

export interface LayoutItem {
  id: LayoutType;
  name: string;
  category: "strips" | "grids" | "polaroid" | "cinema" | "creative";
  count: number;
  description: string;
  badge?: string;
}

export interface FilterOption {
  id: FilterType;
  name: string;
  category: FilterCategory;
  description?: string;
  cssFilter: string;
  previewColor: string;
}

export interface FrameColorOption {
  id: string;
  name: string;
  hex: string;
  textColor: string;
}

export interface CapturedShot {
  id: string;
  index: number;
  dataUrl: string;
  timestamp: number;
  filter: FilterType;
}

export interface BoothSettings {
  layout: LayoutType;
  shotsCount: number;
  countdownSeconds: number;
  frameColor: string;
  textColor: string;
  headerText: string;
  footerText: string;
  stickers: StickerItem[];
  activeFilter: FilterType;
}

export interface StickerItem {
  id: string;
  emoji: string;
  x: number;
  y: number;
  scale: number;
}

export interface BackendHealth {
  status: "online" | "offline" | "checking";
  neonConfigured: boolean;
  neonStatus?: string;
  dbError?: string | null;
}
