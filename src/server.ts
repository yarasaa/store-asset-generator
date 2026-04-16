import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { detectProject } from "./tools/detect.js";
import { buildProject } from "./tools/build.js";
import { simulatorControl } from "./tools/simulator.js";
import { navigateAndInteract } from "./tools/navigate.js";
import { takeScreenshot } from "./tools/screenshot.js";
import { generateMockup } from "./tools/mockup.js";
import { generateMetadata } from "./tools/metadata.js";
import { exportAssets } from "./tools/export.js";
import { generateAll } from "./tools/orchestrate.js";

export const toolDefinitions: Tool[] = [
  // ── End-to-end orchestrator ──
  {
    name: "generate_all",
    description:
      "END-TO-END: Run the entire store asset pipeline in one call. " +
      "Auto-detects the host's MCP sampling support and runs in one of two modes:\n\n" +
      "ATOMIC mode (Claude Desktop, Cursor, …): one call does everything — detect, build, " +
      "screenshot, design unique mockup HTML via sampling, render at every store size, " +
      "write ASO metadata copy, export Fastlane directory.\n\n" +
      "BOOTSTRAP mode (Claude Code CLI — sampling not supported): the tool runs all " +
      "DETERMINISTIC stages (detect, build, screenshot, analyze) and returns a 'work order' — " +
      "a structured packet with design briefs and instructions. The agent then uses the " +
      "individual tools (generate_mockup render, export_assets) guided by the included " +
      "`instructions_for_agent` field to finish the job.\n\n" +
      "Use this as the DEFAULT entry point. Other tools are for fine-grained control.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the project root directory",
        },
        platforms: {
          type: "array",
          items: { type: "string", enum: ["ios", "android"] },
          description: "Target platforms (default: [\"ios\"])",
        },
        locales: {
          type: "array",
          items: { type: "string" },
          description: "Locale codes for metadata, e.g. [\"en\", \"tr\"] (default: [\"en\"])",
        },
        tone: {
          type: "string",
          enum: ["professional", "casual", "playful", "premium"],
          description: "Copy tone for metadata (default: professional)",
        },
        top_n: {
          type: "number",
          description: "Number of screens to pick for store screenshots (default: 6)",
        },
        skip_build: {
          type: "boolean",
          description: "Skip build step if artifact already exists (default: false)",
        },
        skip_simulator: {
          type: "boolean",
          description:
            "Skip simulator entirely. In atomic mode, generates mockups from source code via sampling. " +
            "In bootstrap mode, collects source files for the agent to design from. " +
            "Use when build is broken or you don't want to wait for simulator (default: false).",
        },
        mode: {
          type: "string",
          enum: ["atomic", "bootstrap"],
          description:
            "Force a specific mode. Default: auto-detect by probing sampling. " +
            "Pass 'bootstrap' to force agent-driven completion even on hosts that support sampling.",
        },
        output_dir: {
          type: "string",
          description: "Output directory (default: {path}/store-assets)",
        },
      },
      required: ["path"],
    },
  },

  // ── Phase 1: Detect ──
  {
    name: "detect_project",
    description:
      "Scan a project directory to detect platform (Flutter/Swift/Kotlin), " +
      "framework, screens, navigation routes, and build configuration. " +
      "Returns a ranked list of screens with store-worthiness scores.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the project root directory",
        },
      },
      required: ["path"],
    },
  },

  // ── Phase 2: Build ──
  {
    name: "build_project",
    description:
      "Build the project for simulator/emulator using the local toolchain " +
      "(flutter build, xcodebuild, gradle). Returns the artifact path.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the project root directory",
        },
        platform: {
          type: "string",
          enum: ["ios", "android"],
          description: "Target platform",
        },
        scheme: {
          type: "string",
          description: "Build scheme/flavor (optional, auto-detected)",
        },
        build_mode: {
          type: "string",
          enum: ["debug", "release"],
          description: "Build mode (default: debug)",
        },
      },
      required: ["path", "platform"],
    },
  },

  // ── Phase 2: Simulator ──
  {
    name: "simulator_control",
    description:
      "Control iOS Simulator or Android Emulator: list available devices, " +
      "boot, shutdown, install app, launch app, or reset state.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["list", "boot", "shutdown", "install", "launch", "reset"],
          description: "Action to perform",
        },
        platform: {
          type: "string",
          enum: ["ios", "android"],
          description: "Target platform",
        },
        device_id: {
          type: "string",
          description: "Device UUID (from list action)",
        },
        device_name: {
          type: "string",
          description:
            'Human-readable device name, e.g. "iPhone 16 Pro Max"',
        },
        app_path: {
          type: "string",
          description: "Path to .app or .apk (for install action)",
        },
        bundle_id: {
          type: "string",
          description: "Bundle/package ID (for launch action)",
        },
      },
      required: ["action", "platform"],
    },
  },

  // ── Phase 3: Navigate ──
  {
    name: "navigate_and_interact",
    description:
      "Interact with the running app in the simulator: tap elements, " +
      "type text, scroll, swipe, go back, or open deep links. " +
      "Returns a screenshot and the UI accessibility tree after the action.",
    inputSchema: {
      type: "object" as const,
      properties: {
        platform: {
          type: "string",
          enum: ["ios", "android"],
        },
        device_id: {
          type: "string",
          description: "Device UUID",
        },
        action: {
          type: "string",
          enum: ["tap", "type", "scroll", "swipe", "back", "wait", "deep_link"],
        },
        element: {
          type: "object",
          properties: {
            accessibility_id: { type: "string" },
            text: { type: "string" },
            coordinates: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" },
              },
            },
          },
          description: "Target element (for tap/type actions)",
        },
        input_text: {
          type: "string",
          description: "Text to type (for type action)",
        },
        direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
          description: "Scroll/swipe direction",
        },
        url: {
          type: "string",
          description: "Deep link URL (for deep_link action)",
        },
        duration_ms: {
          type: "number",
          description: "Wait duration in milliseconds (for wait action)",
        },
      },
      required: ["platform", "device_id", "action"],
    },
  },

  // ── Phase 3: Screenshot ──
  {
    name: "take_screenshot",
    description:
      "Capture a high-resolution screenshot from the simulator with " +
      "optional status bar masking (9:41 time, full battery, full signal).",
    inputSchema: {
      type: "object" as const,
      properties: {
        platform: {
          type: "string",
          enum: ["ios", "android"],
        },
        device_id: {
          type: "string",
          description: "Device UUID",
        },
        output_path: {
          type: "string",
          description: "Where to save the screenshot PNG",
        },
        mask_status_bar: {
          type: "boolean",
          description: "Override status bar to show 9:41, full battery (default: true)",
        },
        wait_ms: {
          type: "number",
          description: "Wait before capture for animations to settle (ms)",
        },
      },
      required: ["platform", "device_id", "output_path"],
    },
  },

  // ── Phase 4: Mockup (AI-driven) ──
  {
    name: "generate_mockup",
    description:
      'AI-driven mockup generation with 3 modes:\n' +
      '- "analyze": Extract dominant colors, dimensions, and design brief from a screenshot. ' +
      'Returns context for you to write a custom HTML mockup tailored to this specific app.\n' +
      '- "render": Take your custom HTML and render it to a store-ready PNG via Puppeteer. ' +
      'Use {SCREENSHOT_BASE64} as placeholder for the screenshot, {WIDTH}/{HEIGHT} for dimensions.\n' +
      '- "batch_render": Render the same HTML at all required store sizes (6.7", 6.1", iPad, etc).\n\n' +
      'WORKFLOW: Call analyze first, then design a unique HTML mockup for this app, then call render.',
    inputSchema: {
      type: "object" as const,
      properties: {
        mode: {
          type: "string",
          enum: ["analyze", "render", "batch_render"],
          description: "Operation mode",
        },
        // analyze mode
        screenshot_path: {
          type: "string",
          description: "Path to raw screenshot (for analyze & render)",
        },
        app_category: {
          type: "string",
          description: "App category: finance, social, health, education, ecommerce, etc.",
        },
        app_name: {
          type: "string",
          description: "App name for context",
        },
        screen_name: {
          type: "string",
          description: "Screen name (e.g. home, profile, detail)",
        },
        platform: {
          type: "string",
          enum: ["ios", "android"],
          description: "Target platform for store sizes",
        },
        // render mode
        html: {
          type: "string",
          description: "Complete HTML document to render (for render & batch_render mode)",
        },
        output_path: {
          type: "string",
          description: "Where to save the PNG (for render mode)",
        },
        width: {
          type: "number",
          description: "Render width in pixels (for render mode)",
        },
        height: {
          type: "number",
          description: "Render height in pixels (for render mode)",
        },
        // batch_render mode
        output_dir: {
          type: "string",
          description: "Directory for batch output (for batch_render mode)",
        },
      },
      required: ["mode"],
    },
  },

  // ── Phase 4: Metadata ──
  {
    name: "generate_metadata",
    description:
      "Generate App Store and Play Store metadata from project analysis: " +
      "app name, subtitle, description (ASO-optimized), keywords, " +
      "what's new text, category suggestion, and privacy policy draft.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_path: {
          type: "string",
          description: "Path to the project (for code analysis)",
        },
        screenshots_dir: {
          type: "string",
          description: "Path to captured screenshots",
        },
        target_store: {
          type: "string",
          enum: ["app-store", "play-store", "both"],
          description: "Which store(s) to generate metadata for",
        },
        locales: {
          type: "array",
          items: { type: "string" },
          description: 'Locale codes, e.g. ["tr", "en"]',
        },
        tone: {
          type: "string",
          enum: ["professional", "casual", "playful", "premium"],
          description: "Tone for generated text (default: professional)",
        },
      },
      required: ["project_path", "target_store"],
    },
  },

  // ── Phase 5: Export ──
  {
    name: "export_assets",
    description:
      "Package all generated assets (mockups, metadata, icons) into " +
      "a store-ready directory structure. Optionally outputs Fastlane-compatible " +
      "format for automated upload via `fastlane deliver` or `fastlane supply`.",
    inputSchema: {
      type: "object" as const,
      properties: {
        source_dir: {
          type: "string",
          description: "Directory containing raw screenshots and mockups",
        },
        output_dir: {
          type: "string",
          description: "Where to create the export package (default: ./store-assets)",
        },
        include_fastlane: {
          type: "boolean",
          description: "Also generate Fastlane metadata structure (default: true)",
        },
        include_raw: {
          type: "boolean",
          description: "Include raw screenshots alongside mockups (default: false)",
        },
      },
      required: ["source_dir"],
    },
  },
];

// ── Tool router ──

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<string, ToolHandler> = {
  generate_all: generateAll,
  detect_project: detectProject,
  build_project: buildProject,
  simulator_control: simulatorControl,
  navigate_and_interact: navigateAndInteract,
  take_screenshot: takeScreenshot,
  generate_mockup: generateMockup,
  generate_metadata: generateMetadata,
  export_assets: exportAssets,
};

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return handler(args);
}
