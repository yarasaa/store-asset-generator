import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  IOS_SCREENSHOT_SIZES,
  ANDROID_SCREENSHOT_SIZES,
  type DesignBrief,
} from "../types.js";

/**
 * generate_mockup — AI-driven mockup generation
 * 
 * TWO MODES:
 * 
 * Mode 1: "analyze" — Extracts colors, dimensions, and context from screenshot.
 *   Returns design brief for Claude to generate custom HTML.
 * 
 * Mode 2: "render" — Takes custom HTML and renders it to store-ready PNG.
 *   Claude writes the HTML itself — no fixed templates, every app gets unique design.
 * 
 * FLOW:
 *   1. Claude calls generate_mockup(mode: "analyze", screenshot_path: "...")
 *   2. Tool returns: dominant colors, dimensions, design guidelines, size specs
 *   3. Claude writes custom HTML mockup based on app analysis + design brief
 *   4. Claude calls generate_mockup(mode: "render", html: "...", output_path: "...")
 *   5. Tool renders HTML → PNG via Puppeteer at exact store dimensions
 */
export async function generateMockup(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const mode = (args.mode as string) ?? "render";

  if (mode === "analyze") {
    return analyzeScreenshot(args);
  } else if (mode === "render") {
    return renderHTML(args);
  } else if (mode === "batch_render") {
    return batchRender(args);
  } else {
    throw new Error('mode must be "analyze", "render", or "batch_render"');
  }
}

// ══════════════════════════════════════════════════════════════
// MODE 1: ANALYZE — Extract context for AI mockup generation
// ══════════════════════════════════════════════════════════════

async function analyzeScreenshot(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const screenshotPath = resolve(args.screenshot_path as string);
  const platform = (args.platform as string) ?? "ios";
  const appCategory = (args.app_category as string) ?? "general";
  const appName = (args.app_name as string) ?? "";
  const screenName = (args.screen_name as string) ?? "";

  // Read screenshot
  const buffer = await readFile(screenshotPath);
  const base64 = buffer.toString("base64");

  // Extract dominant colors + content density using Sharp (if available)
  let dominantColors: string[] = [];
  let dimensions = { width: 0, height: 0 };
  let isDarkUI = false;
  let contentDensity: "sparse" | "balanced" | "dense" = "balanced";

  try {
    const sharp = await import("sharp");
    const metadata = await sharp.default(buffer).metadata();
    dimensions = { width: metadata.width ?? 0, height: metadata.height ?? 0 };

    // Sample colors from screenshot
    const { data, info } = await sharp.default(buffer)
      .resize(8, 8, { fit: "cover" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colors: string[] = [];
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      colors.push(`#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`);
    }

    dominantColors = deduplicateColors(colors).slice(0, 5);

    // Detect if UI is dark
    const avgBrightness = colors.reduce((sum, hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return sum + (r * 0.299 + g * 0.587 + b * 0.114);
    }, 0) / colors.length;
    isDarkUI = avgBrightness < 128;

    // Estimate content density via Sobel edge detection on a 64x64 downsample.
    // More edges → more UI elements → denser screen.
    try {
      const edgeStats = await sharp
        .default(buffer)
        .resize(64, 64, { fit: "cover" })
        .greyscale()
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
        })
        .stats();
      const edgeMean = edgeStats.channels[0]?.mean ?? 30;
      if (edgeMean < 20) contentDensity = "sparse";
      else if (edgeMean > 50) contentDensity = "dense";
      else contentDensity = "balanced";
    } catch {
      contentDensity = "balanced";
    }
  } catch {
    dominantColors = ["#6366F1", "#8B5CF6", "#EC4899"];
  }

  const storeSizes = platform === "android" ? ANDROID_SCREENSHOT_SIZES : IOS_SCREENSHOT_SIZES;

  // Complementary accent via HSL rotation
  const accent = complementaryAccent(dominantColors[0] ?? "#6366F1");
  const backgroundSuggestion = suggestBackground(dominantColors, isDarkUI);
  const typography = suggestTypography(appCategory);
  const headlineInspo = headlineInspiration(appCategory);
  const deviceFrameSnippet = deviceFrameCssSnippet(isDarkUI);

  const designBrief: DesignBrief = {
    instructions: buildInstructions({
      appCategory,
      screenName,
      dominantColors,
      isDarkUI,
      contentDensity,
      accent,
      typography,
    }),
    html_template_skeleton: HTML_SKELETON,
    size_to_render: Object.entries(storeSizes).map(([name, size]) => ({
      name,
      width: size.width,
      height: size.height,
      device: size.device,
    })),
    palette: {
      dominant: dominantColors,
      complementary_accent: accent,
      suggested_background: backgroundSuggestion,
      is_dark_ui: isDarkUI,
    },
    typography,
    content_density: contentDensity,
    headline_inspiration: headlineInspo,
    device_frame_snippet: deviceFrameSnippet,
  };

  return {
    mode: "analyze",
    screenshot_base64_preview: `data:image/png;base64,${base64.substring(0, 200)}...`,
    screenshot_full_base64_length: base64.length,
    dimensions,
    dominant_colors: dominantColors,
    is_dark_ui: isDarkUI,
    content_density: contentDensity,
    app_context: {
      category: appCategory,
      name: appName,
      screen_name: screenName,
    },
    store_sizes: storeSizes,
    design_brief: designBrief,
  };
}

// ── Brief helpers ──

const HTML_SKELETON = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=YOUR_FONT:wght@400;700;900&display=swap"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: {WIDTH}px;
    height: {HEIGHT}px;
    overflow: hidden;
    font-family: 'YOUR_FONT', system-ui, sans-serif;
    /* background */
  }
</style>
</head>
<body>
  <!-- background layers -->
  <!-- headline -->
  <!-- device frame with <img src="data:image/png;base64,{SCREENSHOT_BASE64}"> -->
</body>
</html>`;

interface InstructionsInput {
  appCategory: string;
  screenName: string;
  dominantColors: string[];
  isDarkUI: boolean;
  contentDensity: "sparse" | "balanced" | "dense";
  accent: string;
  typography: DesignBrief["typography"];
}

function buildInstructions(i: InstructionsInput): string {
  return `Design a store mockup for screen "${i.screenName}" in a ${i.appCategory} app.

Palette: dominant ${i.dominantColors.join(", ")}, complementary accent ${i.accent}.
The screenshot UI is ${i.isDarkUI ? "DARK" : "LIGHT"} — if dark, keep the mockup background lighter to create contrast; if light, go rich/colorful/dark behind to make the app pop.
Content density is ${i.contentDensity} — ${
    i.contentDensity === "dense"
      ? "give the device breathing room with generous padding, headline short."
      : i.contentDensity === "sparse"
      ? "fill the negative space with bold headline and background storytelling."
      : "balance the device and text equally."
  }

Typography: ${i.typography.rationale}. Load ${i.typography.headline_font} via ${i.typography.headline_font_url}.

The device frame is the hero. Wrap the screenshot with rounded corners (48-60px), a subtle bezel in #1C1C1E, a notch/dynamic island, and a layered shadow. Consider a very slight tilt (±3deg) for dynamism. DO NOT tilt if the screen has heavy text/forms.

Headline: ≤6 words, in the app's language, strong action verb, sized ~6% of height. Position above or below the device — never overlap unless the top is empty.

CRITICAL:
- Return a complete HTML document. Body dimensions must use the {WIDTH}/{HEIGHT} placeholders verbatim.
- Reference the screenshot as data:image/png;base64,{SCREENSHOT_BASE64}
- All fonts loaded via Google Fonts / Fontshare <link>
- No JavaScript, no external images besides the screenshot placeholder`;
}

function complementaryAccent(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newHue = (h + 180) % 360;
  // Boost saturation a bit for mockup accent punch
  const [nr, ng, nb] = hslToRgb(newHue, Math.min(1, s * 1.2 + 0.1), l);
  return `#${[nr, ng, nb].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  if (max !== min) {
    if (max === rn) h = ((gn - bn) / (max - min) + (gn < bn ? 6 : 0));
    else if (max === gn) h = (bn - rn) / (max - min) + 2;
    else h = (rn - gn) / (max - min) + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

function suggestBackground(dominant: string[], isDark: boolean): string[] {
  const primary = dominant[0] ?? "#6366F1";
  const secondary = dominant[1] ?? dominant[0] ?? "#8B5CF6";
  if (isDark) {
    // Light gradient palette with subtle tints to contrast the dark app UI
    return ["#F8FAFC", "#E0E7FF", primary + "22"];
  }
  return [primary, secondary, "#0F172A"];
}

function suggestTypography(category: string): DesignBrief["typography"] {
  const map: Record<string, DesignBrief["typography"]> = {
    finance: {
      headline_font: "Playfair Display",
      headline_font_url:
        "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inter:wght@400;500&display=swap",
      body_font: "Inter",
      rationale: "Elegant serif conveys trust and premium feel for finance apps",
    },
    social: {
      headline_font: "Plus Jakarta Sans",
      headline_font_url:
        "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap",
      body_font: "Plus Jakarta Sans",
      rationale: "Modern rounded sans feels approachable and friendly for social apps",
    },
    health: {
      headline_font: "DM Sans",
      headline_font_url:
        "https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700&display=swap",
      body_font: "DM Sans",
      rationale: "Calm, readable geometric sans suits health and wellness",
    },
    education: {
      headline_font: "Fraunces",
      headline_font_url:
        "https://fonts.googleapis.com/css2?family=Fraunces:wght@600;900&family=Inter:wght@400&display=swap",
      body_font: "Inter",
      rationale: "Editorial serif signals depth and credibility for learning apps",
    },
    ecommerce: {
      headline_font: "Archivo",
      headline_font_url:
        "https://fonts.googleapis.com/css2?family=Archivo:wght@600;900&display=swap",
      body_font: "Archivo",
      rationale: "Bold condensed sans delivers retail punch",
    },
    productivity: {
      headline_font: "Space Grotesk",
      headline_font_url:
        "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap",
      body_font: "Space Grotesk",
      rationale: "Tech-forward grotesque matches productivity tools",
    },
    entertainment: {
      headline_font: "Bricolage Grotesque",
      headline_font_url:
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;900&display=swap",
      body_font: "Bricolage Grotesque",
      rationale: "Expressive display typeface for entertainment and media",
    },
    travel: {
      headline_font: "Caprasimo",
      headline_font_url:
        "https://fonts.googleapis.com/css2?family=Caprasimo&family=Inter:wght@400;500&display=swap",
      body_font: "Inter",
      rationale: "Warm display serif evokes wanderlust and storytelling",
    },
    food: {
      headline_font: "Fraunces",
      headline_font_url:
        "https://fonts.googleapis.com/css2?family=Fraunces:wght@700;900;900&display=swap",
      body_font: "Fraunces",
      rationale: "Juicy serif with optical size makes food copy mouth-watering",
    },
  };
  return (
    map[category] ?? {
      headline_font: "Inter",
      headline_font_url:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap",
      body_font: "Inter",
      rationale: "Neutral modern sans works across categories",
    }
  );
}

function headlineInspiration(category: string): string[] {
  const map: Record<string, string[]> = {
    finance: [
      "Your money, at your command",
      "Bank smarter in seconds",
      "Investing made human",
      "Save more. Stress less.",
    ],
    social: [
      "Your people, your moments",
      "Say more with less",
      "Find your people",
      "Be present together",
    ],
    health: [
      "Feel better every day",
      "Small steps. Big change.",
      "Stronger starts here",
      "Your body, your pace",
    ],
    education: [
      "Learn anything, anywhere",
      "Smart goals. Real progress.",
      "Your curiosity, unleashed",
      "5 minutes to smarter",
    ],
    ecommerce: [
      "Shop what you love",
      "Delivered to your door",
      "Endless aisles, one tap",
      "Style that gets you",
    ],
    productivity: [
      "Get it done, faster",
      "Your day, organized",
      "Focus is a feature",
      "Clarity, not chaos",
    ],
    entertainment: [
      "Your next favorite awaits",
      "Infinite entertainment, zero effort",
      "Stream without limits",
      "Your nightly escape",
    ],
    travel: [
      "The world, in your pocket",
      "Plan less. Wander more.",
      "Every trip, simpler",
      "Discover on your terms",
    ],
    food: [
      "Dinner, decided",
      "Cook what you crave",
      "Deliciously simple",
      "Your kitchen, upgraded",
    ],
  };
  return map[category] ?? [
    "Built for you",
    "Simple. Powerful. Yours.",
    "The better way",
    "Try it now",
  ];
}

function deviceFrameCssSnippet(isDarkUI: boolean): string {
  const bezel = isDarkUI ? "#000000" : "#1C1C1E";
  return `/* Drop this inside the body, size as needed */
<div class="device-frame" style="
  width: 62%;
  aspect-ratio: 1290 / 2796;
  border-radius: 56px;
  background: ${bezel};
  padding: 12px;
  box-shadow: 0 40px 120px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.25);
  position: relative;
">
  <div style="width:100%;height:100%;border-radius:44px;overflow:hidden;position:relative;background:#000;">
    <div style="position:absolute;top:12px;left:50%;transform:translateX(-50%);width:32%;height:2.8%;background:${bezel};border-radius:20px;z-index:2;"></div>
    <img src="data:image/png;base64,{SCREENSHOT_BASE64}" style="width:100%;height:100%;object-fit:cover;display:block;"/>
  </div>
</div>`;
}

// ══════════════════════════════════════════════════════════════
// MODE 2: RENDER — Convert HTML to store-ready PNG
// ══════════════════════════════════════════════════════════════

async function renderHTML(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let html = args.html as string;
  const outputPath = resolve(args.output_path as string);
  const width = (args.width as number) ?? 1290;
  const height = (args.height as number) ?? 2796;
  const screenshotPath = args.screenshot_path as string | undefined;
  const format = (args.format as string) ?? "png";

  if (!html) throw new Error("html is required");
  if (!outputPath) throw new Error("output_path is required");

  // If screenshot path provided, inject base64 into HTML
  if (screenshotPath) {
    const buffer = await readFile(resolve(screenshotPath));
    const base64 = buffer.toString("base64");
    html = html.replace(/\{SCREENSHOT_BASE64\}/g, base64);
  }

  // Replace size placeholders
  html = html.replace(/\{WIDTH\}/g, String(width));
  html = html.replace(/\{HEIGHT\}/g, String(height));

  await mkdir(dirname(outputPath), { recursive: true });

  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=none",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: ["networkidle0", "domcontentloaded"], timeout: 30_000 });

    // Wait for fonts
    await page.evaluate(() => (globalThis as any).document.fonts.ready);
    await new Promise((r) => setTimeout(r, 500));

    const screenshotOptions: any = {
      path: outputPath,
      type: format === "jpeg" ? "jpeg" : "png",
      fullPage: false,
    };
    if (format === "jpeg") screenshotOptions.quality = 95;

    await page.screenshot(screenshotOptions);
    await browser.close();

    return {
      success: true,
      path: outputPath,
      width,
      height,
      format,
    };
  } catch (error) {
    // Fallback: save HTML
    const htmlPath = outputPath.replace(/\.(png|jpg|jpeg)$/, ".html");
    await writeFile(htmlPath, html, "utf-8");

    return {
      success: false,
      path: htmlPath,
      error: `Puppeteer render failed: ${error}. HTML saved.`,
      hint: "Run: npx puppeteer browsers install chrome",
    };
  }
}

// ══════════════════════════════════════════════════════════════
// MODE 3: BATCH RENDER — Render same HTML at all store sizes
// ══════════════════════════════════════════════════════════════

async function batchRender(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let html = args.html as string;
  const outputDir = resolve(args.output_dir as string);
  const platform = (args.platform as string) ?? "ios";
  const screenshotPath = args.screenshot_path as string | undefined;
  const screenName = (args.screen_name as string) ?? "screen";

  if (!html) throw new Error("html is required");

  // Inject screenshot if provided
  if (screenshotPath) {
    const buffer = await readFile(resolve(screenshotPath));
    const base64 = buffer.toString("base64");
    html = html.replace(/\{SCREENSHOT_BASE64\}/g, base64);
  }

  const sizes = platform === "android" ? ANDROID_SCREENSHOT_SIZES : IOS_SCREENSHOT_SIZES;

  await mkdir(outputDir, { recursive: true });

  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    for (const [sizeName, sizeSpec] of Object.entries(sizes)) {
      const { width, height } = sizeSpec;
      const sizeHTML = html
        .replace(/\{WIDTH\}/g, String(width))
        .replace(/\{HEIGHT\}/g, String(height));

      const outputPath = `${outputDir}/${screenName}-${sizeName}.png`;

      try {
        const page = await browser.newPage();
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.setContent(sizeHTML, { waitUntil: ["networkidle0", "domcontentloaded"], timeout: 30_000 });
        await page.evaluate(() => (globalThis as any).document.fonts.ready);
        await new Promise((r) => setTimeout(r, 300));
        await page.screenshot({ path: outputPath, type: "png", fullPage: false });
        await page.close();

        results[sizeName] = { success: true, path: outputPath, width, height };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${sizeName}: ${msg}`);
        results[sizeName] = { success: false, error: msg };
      }
    }

    await browser.close();
  } catch (error) {
    // Save HTML files as fallback
    for (const [sizeName, { width, height }] of Object.entries(sizes)) {
      const sizeHTML = html
        .replace(/\{WIDTH\}/g, String(width))
        .replace(/\{HEIGHT\}/g, String(height));
      const htmlPath = `${outputDir}/${screenName}-${sizeName}.html`;
      await writeFile(htmlPath, sizeHTML, "utf-8");
      results[sizeName] = { success: false, path: htmlPath, fallback: "html" };
    }
    errors.push(`Puppeteer unavailable: ${error}`);
  }

  return {
    success: errors.length === 0,
    output_dir: outputDir,
    platform,
    sizes_rendered: Object.keys(results).length,
    results,
    errors,
  };
}

// ── Helpers ──

function deduplicateColors(colors: string[]): string[] {
  const unique: string[] = [];
  for (const color of colors) {
    const isDuplicate = unique.some((existing) => colorDistance(existing, color) < 30);
    if (!isDuplicate) unique.push(color);
  }
  return unique;
}

function colorDistance(hex1: string, hex2: string): number {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
