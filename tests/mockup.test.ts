/**
 * mockup.ts — analyze mode smoke test.
 *
 * Creates a tiny in-memory PNG via Sharp, runs analyzeScreenshot on it,
 * and asserts the design_brief shape.
 */

import { describe, it, expect } from "vitest";
import { generateMockup } from "../src/tools/mockup.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

async function makeFixturePng(): Promise<string> {
  const dir = join(tmpdir(), `storekit-test-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "fixture.png");

  // Generate a simple indigo gradient via Sharp
  const sharp = (await import("sharp")).default;
  await sharp({
    create: {
      width: 1290,
      height: 2796,
      channels: 3,
      background: { r: 99, g: 102, b: 241 },
    },
  })
    .png()
    .toFile(path);

  return path;
}

describe("generate_mockup analyze mode", () => {
  it("returns a complete design brief", async () => {
    const path = await makeFixturePng();
    try {
      const result = (await generateMockup({
        mode: "analyze",
        screenshot_path: path,
        app_name: "TestFinance",
        app_category: "finance",
        screen_name: "Dashboard",
        platform: "ios",
      })) as any;

      expect(result.mode).toBe("analyze");
      expect(result.dominant_colors.length).toBeGreaterThan(0);
      expect(result.dimensions.width).toBe(1290);
      expect(result.dimensions.height).toBe(2796);
      expect(typeof result.is_dark_ui).toBe("boolean");
      expect(["sparse", "balanced", "dense"]).toContain(result.content_density);

      const brief = result.design_brief;
      expect(brief.instructions).toContain("finance");
      expect(brief.instructions).toContain("Dashboard");
      expect(brief.html_template_skeleton).toContain("{WIDTH}");
      expect(brief.html_template_skeleton).toContain("{HEIGHT}");
      expect(brief.size_to_render.length).toBe(4); // 4 iOS sizes
      expect(brief.palette.dominant).toEqual(result.dominant_colors);
      expect(brief.palette.complementary_accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(brief.typography.headline_font).toBe("Playfair Display");
      expect(brief.typography.headline_font_url).toContain("fonts.googleapis.com");
      expect(brief.headline_inspiration.length).toBeGreaterThan(0);
      expect(brief.device_frame_snippet).toContain("{SCREENSHOT_BASE64}");
    } finally {
      await rm(path, { force: true });
    }
  });

  it("switches typography for different categories", async () => {
    const path = await makeFixturePng();
    try {
      const social = (await generateMockup({
        mode: "analyze",
        screenshot_path: path,
        app_category: "social",
        platform: "ios",
      })) as any;
      expect(social.design_brief.typography.headline_font).toBe("Plus Jakarta Sans");

      const food = (await generateMockup({
        mode: "analyze",
        screenshot_path: path,
        app_category: "food",
        platform: "android",
      })) as any;
      expect(food.design_brief.typography.headline_font).toBe("Fraunces");
      expect(food.design_brief.size_to_render.length).toBe(3); // 3 Android sizes
    } finally {
      await rm(path, { force: true });
    }
  });
});
