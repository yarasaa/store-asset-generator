// ── Template Registry ──
// Each template defines a complete visual language for store mockups.
// Templates are categorized by app type and visual tone.

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory[];
  tone: TemplateTone;
  defaults: TemplateDefaults;
  render: (params: RenderParams) => string;
}

export type TemplateCategory =
  | "finance"
  | "social"
  | "health"
  | "education"
  | "ecommerce"
  | "productivity"
  | "entertainment"
  | "travel"
  | "food"
  | "utility"
  | "general";

export type TemplateTone =
  | "premium"
  | "playful"
  | "minimal"
  | "bold"
  | "editorial"
  | "organic"
  | "tech"
  | "luxury";

export interface TemplateDefaults {
  background: BackgroundConfig;
  typography: TypographyConfig;
  device: DeviceConfig;
  layout: LayoutConfig;
  effects: EffectsConfig;
}

export interface BackgroundConfig {
  type: "gradient" | "solid" | "mesh" | "radial" | "angular" | "noise" | "pattern" | "image" | "blur";
  colors: string[];
  angle?: number;
  noise_opacity?: number;
  pattern?: string;
  blur_radius?: number;
}

export interface TypographyConfig {
  headline_font: string;
  headline_font_url?: string;
  headline_weight: number;
  headline_size_ratio: number; // relative to width
  headline_color: string;
  headline_letter_spacing: string;
  headline_line_height: number;
  headline_text_transform?: string;
  subheadline_font: string;
  subheadline_weight: number;
  subheadline_size_ratio: number;
  subheadline_color: string;
  subheadline_letter_spacing: string;
}

export interface DeviceConfig {
  frame_style: "realistic" | "minimal" | "none" | "outline" | "shadow-only";
  frame_color: string;
  bezel_width: number;
  corner_radius: number;
  shadow: ShadowConfig;
  scale: number; // 0.4-1.0
  position: "center" | "bottom" | "bottom-right" | "bottom-left" | "offset-right" | "offset-left" | "tilted";
  tilt?: { x: number; y: number };
  reflection?: boolean;
}

export interface ShadowConfig {
  enabled: boolean;
  color: string;
  blur: number;
  spread: number;
  offset_x: number;
  offset_y: number;
  layers?: number; // multiple shadow layers for depth
}

export interface LayoutConfig {
  text_position: "top" | "bottom" | "left" | "right" | "overlay";
  text_alignment: "left" | "center" | "right";
  text_max_width: number; // percentage
  padding: { top: number; right: number; bottom: number; left: number }; // percentage
  device_vertical_offset: number; // percentage, positive = down
  content_alignment: "start" | "center" | "end" | "space-between";
}

export interface EffectsConfig {
  grain?: { opacity: number; size: number };
  blur_orbs?: OrbConfig[];
  glass?: { opacity: number; blur: number };
  border?: { width: number; color: string; radius: number };
  badge?: BadgeConfig;
  dots_pattern?: { size: number; gap: number; color: string; opacity: number };
  lines_pattern?: { width: number; gap: number; color: string; opacity: number; angle: number };
  glow?: { color: string; size: number; opacity: number };
}

export interface OrbConfig {
  color: string;
  size: number; // percentage of width
  x: number; // percentage
  y: number; // percentage
  blur: number;
  opacity: number;
}

export interface BadgeConfig {
  text: string;
  background: string;
  color: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  font_size_ratio: number;
}

export interface RenderParams {
  template: TemplateDefinition;
  screenshot_base64: string;
  width: number;
  height: number;
  headline?: string;
  subheadline?: string;
  overrides?: Partial<TemplateDefaults>;
  locale?: string;
  badge_text?: string;
  second_screenshot_base64?: string; // for side-by-side
}

// ── Template recommendation engine ──

export function recommendTemplate(
  appCategory: string,
  appTone: string,
  screenshotDominantColor?: string
): string[] {
  const recommendations: Record<string, string[]> = {
    finance: ["midnight-glass", "noir-elegance", "frost-blur"],
    social: ["aurora-gradient", "candy-pop", "story-flow"],
    health: ["zen-minimal", "organic-wave", "frost-blur"],
    education: ["editorial-stack", "zen-minimal", "clean-gradient"],
    ecommerce: ["bold-showcase", "candy-pop", "aurora-gradient"],
    productivity: ["midnight-glass", "zen-minimal", "editorial-stack"],
    entertainment: ["neon-glow", "aurora-gradient", "candy-pop"],
    travel: ["organic-wave", "aurora-gradient", "panoramic-hero"],
    food: ["organic-wave", "candy-pop", "bold-showcase"],
    utility: ["zen-minimal", "frost-blur", "clean-gradient"],
  };

  return recommendations[appCategory] ?? ["clean-gradient", "aurora-gradient", "midnight-glass"];
}
