// ── Project Detection ──

export type Platform = "ios" | "android" | "flutter" | "react-native" | "kotlin-multiplatform";
export type Language = "swift" | "kotlin" | "dart" | "typescript";
export type UIFramework = "swiftui" | "uikit" | "jetpack-compose" | "flutter" | "react-native";
export type ScreenType =
  | "onboarding"
  | "auth"
  | "main"
  | "detail"
  | "settings"
  | "list"
  | "form"
  | "profile"
  | "search"
  | "dashboard"
  | "unknown";

export interface ScreenInfo {
  name: string;
  file_path: string;
  type: ScreenType;
  navigation_path: string;
  has_data_dependency: boolean;
  estimated_importance: number; // 1-10
}

export interface BuildConfig {
  build_tool: string;
  build_command: string;
  schemes: string[];
  min_sdk: string;
}

export interface ProjectInfo {
  platform: Platform;
  language: Language;
  ui_framework: UIFramework;
  project_name: string;
  bundle_id: string;
  version: string;
  min_os_version: string;
  screens: ScreenInfo[];
  app_icon_path: string | null;
  locales: string[];
  build_config: BuildConfig;
}

// ── Simulator ──

export type SimulatorAction = "list" | "boot" | "shutdown" | "install" | "launch" | "reset";

export interface DeviceInfo {
  device_id: string;
  device_name: string;
  os_version: string;
  screen_size: { width: number; height: number };
  status: "booted" | "shutdown" | "booting";
  platform: "ios" | "android";
}

// ── Screenshot ──

export interface ScreenshotResult {
  path: string;
  width: number;
  height: number;
  file_size_bytes: number;
  screen_name: string;
  screen_category: ScreenType;
  store_worthiness: number;
}

// ── Mockup ──

export interface MockupConfig {
  template: string;
  device: string;
  headline?: string;
  subheadline?: string;
  background_colors: string[];
  text_color: string;
  font_family: string;
  device_position: "center" | "left" | "right";
  text_position: "top" | "bottom";
}

export interface DesignBrief {
  /** Free-form instructions for Claude on how to design this mockup */
  instructions: string;
  /** HTML skeleton with {WIDTH}/{HEIGHT}/{SCREENSHOT_BASE64} placeholders */
  html_template_skeleton: string;
  /** Target store sizes to render at */
  size_to_render: Array<{ name: string; width: number; height: number; device: string }>;
  /** Palette analysis */
  palette: {
    dominant: string[];
    complementary_accent: string;
    suggested_background: string[];
    is_dark_ui: boolean;
  };
  /** Typography suggestion based on app category */
  typography: {
    headline_font: string;
    headline_font_url: string;
    body_font: string;
    rationale: string;
  };
  /** Rough content-density hint from Sharp edge analysis */
  content_density: "sparse" | "balanced" | "dense";
  /** Category-specific headline examples for inspiration */
  headline_inspiration: string[];
  /** Device frame CSS snippet ready to paste */
  device_frame_snippet: string;
}

// ── Store sizes ──

export const IOS_SCREENSHOT_SIZES = {
  "6.7-inch": { width: 1290, height: 2796, device: "iPhone 16 Pro Max" },
  "6.1-inch": { width: 1179, height: 2556, device: "iPhone 16" },
  "5.5-inch": { width: 1242, height: 2208, device: "iPhone 8 Plus" },
  "ipad-12.9-inch": { width: 2048, height: 2732, device: "iPad Pro 12.9" },
} as const;

export const ANDROID_SCREENSHOT_SIZES = {
  phone: { width: 1080, height: 1920, device: "Pixel 9" },
  "7-inch-tablet": { width: 1200, height: 1920, device: "Nexus 7" },
  "10-inch-tablet": { width: 1600, height: 2560, device: "Pixel Tablet" },
} as const;
