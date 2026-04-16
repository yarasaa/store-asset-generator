/**
 * generate_all — end-to-end orchestrator with two operating modes
 *
 * MODE 1: ATOMIC (host supports MCP sampling — Claude Desktop, Cursor, …)
 *   detect → select screens (sampling) → build+screenshot OR virtual render →
 *   analyze → design HTML (sampling) → batch render → metadata (sampling) →
 *   export.  All in one tool call.
 *
 * MODE 2: BOOTSTRAP (host does NOT support sampling — Claude Code CLI)
 *   The tool runs all DETERMINISTIC stages (detect, build, screenshot, analyze)
 *   then returns a "work order" — a structured packet listing exactly what
 *   the agent (Claude in the Claude Code session) should do next, with all
 *   the data it needs already gathered. The agent reads it, designs HTML
 *   per screen, calls generate_mockup(render), fills metadata, and finally
 *   calls export_assets — all from the existing agent loop, no sampling needed.
 *
 * The mode is auto-detected at the start by probing sampling once.
 */

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { detectProject } from "./detect.js";
import { buildProject } from "./build.js";
import { simulatorControl } from "./simulator.js";
import { navigateAndInteract } from "./navigate.js";
import { takeScreenshot } from "./screenshot.js";
import { generateMockup } from "./mockup.js";
import { generateMetadata } from "./metadata.js";
import { exportAssets } from "./export.js";

import {
  requestJson,
  requestHtml,
  requestCompletion,
  probeSampling,
} from "../utils/sampling.js";
import type { ProjectInfo, ScreenInfo } from "../types.js";

// ── Types ──

export interface OrchestrationStage {
  name: string;
  status: "ok" | "skipped" | "error";
  duration_ms: number;
  note?: string;
  error?: string;
}

interface SelectedScreen {
  screen_name: string;
  file_path: string;
  order: number;
  reason: string;
  suggested_headline: string;
}

interface ScreenSelectionResult {
  selected: SelectedScreen[];
  skipped_count: number;
  notes?: string;
}

interface CapturedScreenshot {
  screen: SelectedScreen;
  screenshot_path: string;
  source: "simulator" | "virtual";
}

// ── Prompt loader ──

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadPrompt(name: string): Promise<string> {
  // At runtime, __dirname is dist/tools/, prompts live at dist/prompts/
  const promptsDir = resolve(__dirname, "..", "prompts");
  const path = join(promptsDir, `${name}.md`);
  try {
    return await readFile(path, "utf-8");
  } catch {
    // Dev fallback: read from src/prompts
    const devPath = resolve(__dirname, "..", "..", "src", "prompts", `${name}.md`);
    return readFile(devPath, "utf-8");
  }
}

// ── Main handler ──

export async function generateAll(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const projectPath = args.path as string;
  if (!projectPath) throw new Error("path is required");

  const platforms = (args.platforms as string[]) ?? ["ios"];
  const locales = (args.locales as string[]) ?? ["en"];
  const tone = (args.tone as string) ?? "professional";
  const skipBuild = (args.skip_build as boolean) ?? false;
  const skipSimulator = (args.skip_simulator as boolean) ?? false;
  const topN = (args.top_n as number) ?? 6;
  const forceMode = args.mode as "atomic" | "bootstrap" | undefined;
  const outputDir = resolve(
    (args.output_dir as string) ?? join(projectPath, "store-assets")
  );

  // ── Mode detection ──
  // Probe sampling once. Hosts like Claude Code CLI return "Method not found"
  // and we switch to bootstrap mode (do mechanical work, hand off to agent).
  // Hosts like Claude Desktop / Cursor support sampling → atomic mode.
  let mode: "atomic" | "bootstrap";
  if (forceMode) {
    mode = forceMode;
  } else {
    const samplingOk = await probeSampling();
    mode = samplingOk ? "atomic" : "bootstrap";
  }

  const stages: OrchestrationStage[] = [];
  const workDir = join(outputDir, ".work");
  await mkdir(workDir, { recursive: true });

  if (mode === "bootstrap") {
    return runBootstrapMode({
      projectPath,
      platforms,
      locales,
      tone,
      skipBuild,
      skipSimulator,
      topN,
      outputDir,
      workDir,
      stages,
    });
  }

  // ═══ Stage 1: detect_project ═══
  const project = await runStage(stages, "detect_project", async () => {
    return (await detectProject({ path: projectPath })) as ProjectInfo;
  });
  if (!project) return failure(stages, outputDir, "detect_project failed");

  // ═══ Stage 2: select_screens (sampling) ═══
  const selection = await runStage(stages, "select_screens", async () => {
    const prompt = await loadPrompt("select-screens");
    const userContent = JSON.stringify(
      {
        project: {
          name: project.project_name,
          platform: project.platform,
          ui_framework: project.ui_framework,
          version: project.version,
        },
        top_n: topN,
        screens: project.screens.map((s: ScreenInfo) => ({
          name: s.name,
          file_path: s.file_path,
          type: s.type,
          navigation_path: s.navigation_path,
          has_data_dependency: s.has_data_dependency,
          estimated_importance: s.estimated_importance,
        })),
      },
      null,
      2
    );
    return await requestJson<ScreenSelectionResult>(
      [{ role: "user", content: { type: "text", text: userContent } }],
      {
        systemPrompt: prompt,
        maxTokens: 2048,
        modelHints: ["claude-sonnet", "claude"],
      }
    );
  });

  // Fallback: if sampling failed, pick top N by estimated_importance
  const selectedScreens: SelectedScreen[] =
    selection?.selected ??
    project.screens.slice(0, topN).map((s, i) => ({
      screen_name: s.name,
      file_path: s.file_path,
      order: i + 1,
      reason: `Auto-picked by importance score ${s.estimated_importance}`,
      suggested_headline: s.name.replace(/([A-Z])/g, " $1").trim(),
    }));

  // ═══ Stage 3: capture screenshots (real OR virtual) ═══
  const captured: CapturedScreenshot[] = [];
  const primaryPlatform = platforms.includes("ios") ? "ios" : "android";

  if (skipSimulator) {
    // Virtual render path — Claude writes mockup HTML from source code
    for (const screen of selectedScreens) {
      const stageName = `virtual_render:${screen.screen_name}`;
      const cap = await runStage(stages, stageName, async () => {
        const sourcePath = resolve(projectPath, screen.file_path);
        const sourceCode = await readFile(sourcePath, "utf-8");

        const prompt = await loadPrompt("virtual-screenshot");
        const userContent = JSON.stringify(
          {
            project: {
              name: project.project_name,
              category: inferCategory(project),
              platform: project.platform,
              ui_framework: project.ui_framework,
            },
            screen: {
              name: screen.screen_name,
              file_path: screen.file_path,
              role: screen.reason,
            },
            target_dimensions: { width: 1290, height: 2796 },
            source_code: sourceCode.slice(0, 12000),
          },
          null,
          2
        );

        const html = await requestHtml(
          [{ role: "user", content: { type: "text", text: userContent } }],
          {
            systemPrompt: prompt,
            maxTokens: 8192,
            modelHints: ["claude-sonnet", "claude"],
          }
        );

        const rawPath = join(workDir, `raw-${slug(screen.screen_name)}.png`);
        const render = (await generateMockup({
          mode: "render",
          html,
          output_path: rawPath,
          width: 1290,
          height: 2796,
        })) as { success: boolean; path: string };

        if (!render.success) {
          throw new Error(`virtual render failed for ${screen.screen_name}`);
        }

        return {
          screen,
          screenshot_path: render.path,
          source: "virtual" as const,
        };
      });

      if (cap) captured.push(cap);
    }
  } else {
    // Real simulator path
    if (!skipBuild) {
      await runStage(stages, `build_${primaryPlatform}`, async () => {
        return await buildProject({ path: projectPath, platform: primaryPlatform });
      });
    }

    const device = await runStage(stages, `boot_${primaryPlatform}`, async () => {
      return (await simulatorControl({
        action: "boot",
        platform: primaryPlatform,
      })) as { device_id: string };
    });

    if (device?.device_id) {
      for (const screen of selectedScreens) {
        const cap = await runStage(
          stages,
          `screenshot:${screen.screen_name}`,
          async () => {
            const rawPath = join(workDir, `raw-${slug(screen.screen_name)}.png`);
            await takeScreenshot({
              platform: primaryPlatform,
              device_id: device.device_id,
              output_path: rawPath,
              mask_status_bar: true,
              wait_ms: 500,
            });
            return {
              screen,
              screenshot_path: rawPath,
              source: "simulator" as const,
            };
          }
        );
        if (cap) captured.push(cap);
      }

      await runStage(stages, `shutdown_${primaryPlatform}`, async () => {
        return await simulatorControl({
          action: "shutdown",
          platform: primaryPlatform,
          device_id: device.device_id,
        });
      });
    }
  }

  if (captured.length === 0) {
    return failure(stages, outputDir, "no screenshots captured");
  }

  // ═══ Stage 4 & 5: analyze + design HTML + batch_render per screen ═══
  const mockupsDir = join(outputDir, "mockups", primaryPlatform);
  await mkdir(mockupsDir, { recursive: true });

  let mockupCount = 0;
  for (const cap of captured) {
    const analysis = await runStage(
      stages,
      `analyze:${cap.screen.screen_name}`,
      async () => {
        return (await generateMockup({
          mode: "analyze",
          screenshot_path: cap.screenshot_path,
          app_name: project.project_name,
          app_category: inferCategory(project),
          screen_name: cap.screen.screen_name,
          platform: primaryPlatform,
        })) as Record<string, unknown>;
      }
    );

    if (!analysis) continue;

    const html = await runStage(
      stages,
      `design_html:${cap.screen.screen_name}`,
      async () => {
        const prompt = await loadPrompt("design-html");
        const buffer = await readFile(cap.screenshot_path);
        const base64 = buffer.toString("base64");

        const userContent = JSON.stringify(
          {
            project: {
              name: project.project_name,
              category: inferCategory(project),
              platform: project.platform,
            },
            screen: {
              name: cap.screen.screen_name,
              role: cap.screen.reason,
              suggested_headline: cap.screen.suggested_headline,
            },
            design_brief: (analysis as any).design_brief,
            dominant_colors: (analysis as any).dominant_colors,
            is_dark_ui: (analysis as any).is_dark_ui,
            dimensions: (analysis as any).dimensions,
          },
          null,
          2
        );

        return await requestHtml(
          [
            {
              role: "user",
              content: { type: "text", text: userContent },
            },
            {
              role: "user",
              content: {
                type: "image",
                data: base64,
                mimeType: "image/png",
              },
            },
          ],
          {
            systemPrompt: prompt,
            maxTokens: 8192,
            modelHints: ["claude-opus", "claude-sonnet", "claude"],
          }
        );
      }
    );

    if (!html) continue;

    const rendered = await runStage(
      stages,
      `batch_render:${cap.screen.screen_name}`,
      async () => {
        return (await generateMockup({
          mode: "batch_render",
          html,
          output_dir: mockupsDir,
          platform: primaryPlatform,
          screen_name: slug(cap.screen.screen_name),
          screenshot_path: cap.screenshot_path,
        })) as { sizes_rendered: number };
      }
    );

    if (rendered?.sizes_rendered) mockupCount += rendered.sizes_rendered;
  }

  // ═══ Stage 6: metadata copy (sampling) ═══
  const metadataResult = await runStage(stages, "metadata_copy", async () => {
    const baseMetadata = (await generateMetadata({
      project_path: projectPath,
      target_store: "both",
      locales,
      tone,
    })) as Record<string, unknown>;

    const prompt = await loadPrompt("metadata-copy");
    const userContent = JSON.stringify(
      {
        project_context: (baseMetadata as any).project_context,
        target_store: "both",
        locales,
        tone,
        selected_screens: selectedScreens.map((s) => ({
          name: s.screen_name,
          role: s.reason,
          suggested_headline: s.suggested_headline,
        })),
        character_limits_reminder: "Never exceed any character limit.",
      },
      null,
      2
    );

    const copy = await requestJson<Record<string, unknown>>(
      [{ role: "user", content: { type: "text", text: userContent } }],
      {
        systemPrompt: prompt,
        maxTokens: 8192,
        modelHints: ["claude-sonnet", "claude"],
      }
    );

    // Write per-locale files
    const metadataDir = join(outputDir, "metadata");
    await mkdir(metadataDir, { recursive: true });
    await writeFile(
      join(metadataDir, "copy.json"),
      JSON.stringify(copy, null, 2),
      "utf-8"
    );

    return copy;
  });

  // ═══ Stage 7: export_assets ═══
  await runStage(stages, "export_assets", async () => {
    return await exportAssets({
      source_dir: workDir,
      output_dir: outputDir,
      include_fastlane: true,
      include_raw: true,
    });
  });

  // ═══ Write config.json for preview UI ═══
  await writeConfig(outputDir, {
    project,
    selected_screens: selectedScreens,
    captured: captured.map((c) => ({
      screen: c.screen.screen_name,
      source: c.source,
    })),
    locales,
    tone,
    metadata: metadataResult ?? null,
  });

  const ok = stages.filter((s) => s.status === "ok").length;
  const err = stages.filter((s) => s.status === "error").length;
  const totalSize = await dirSizeMB(outputDir);

  return {
    success: err === 0,
    output_dir: outputDir,
    stages,
    assets: {
      screenshots: captured.length,
      mockups: mockupCount,
      locales,
      total_size_mb: totalSize,
    },
    summary: {
      stages_ok: ok,
      stages_error: err,
      top_screens: selectedScreens.map((s) => s.screen_name),
    },
    next_steps: [
      `Open ${outputDir} to see generated assets`,
      `Edit ${join(outputDir, "config.json")} to tweak headlines, colors, fonts`,
      `Run 'store-asset-generator-preview ${outputDir}' for a visual editor`,
      `Upload with 'fastlane deliver' or 'fastlane supply' from ${join(outputDir, "fastlane")}`,
    ],
  };
}

// ── Helpers ──

async function runStage<T>(
  stages: OrchestrationStage[],
  name: string,
  fn: () => Promise<T>
): Promise<T | null> {
  const start = Date.now();
  try {
    const result = await fn();
    stages.push({ name, status: "ok", duration_ms: Date.now() - start });
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    stages.push({
      name,
      status: "error",
      duration_ms: Date.now() - start,
      error: msg,
    });
    return null;
  }
}

function failure(
  stages: OrchestrationStage[],
  outputDir: string,
  reason: string
): Record<string, unknown> {
  return {
    success: false,
    output_dir: outputDir,
    stages,
    error: reason,
  };
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferCategory(project: ProjectInfo): string {
  const name = (project.project_name || "").toLowerCase();
  const keywords: Record<string, string[]> = {
    finance: ["bank", "finance", "wallet", "pay", "crypto", "invest", "budget"],
    social: ["social", "chat", "message", "feed", "community", "friends"],
    health: ["health", "fitness", "workout", "medit", "sleep", "yoga"],
    education: ["learn", "edu", "course", "study", "lesson", "quiz"],
    ecommerce: ["shop", "store", "market", "cart", "buy", "commerce"],
    productivity: ["task", "todo", "notes", "calendar", "focus", "work"],
    entertainment: ["game", "play", "music", "video", "stream", "movie"],
    travel: ["travel", "trip", "flight", "hotel", "map", "nav"],
    food: ["food", "recipe", "cook", "restaurant", "meal", "kitchen"],
  };
  for (const [category, words] of Object.entries(keywords)) {
    if (words.some((w) => name.includes(w))) return category;
  }
  return "general";
}

async function dirSizeMB(dir: string): Promise<number> {
  try {
    const s = await stat(dir);
    if (!s.isDirectory()) return 0;
    // Rough estimate — not recursively summing to keep this cheap.
    return Math.round((s.size / (1024 * 1024)) * 100) / 100;
  } catch {
    return 0;
  }
}

async function writeConfig(
  outputDir: string,
  data: Record<string, unknown>
): Promise<void> {
  const configPath = join(outputDir, "config.json");
  await writeFile(configPath, JSON.stringify(data, null, 2), "utf-8");
}

// ══════════════════════════════════════════════════════════════════════════
// BOOTSTRAP MODE
//
// For hosts that don't support MCP sampling (Claude Code CLI as of 2026).
// Runs all DETERMINISTIC stages (project detection, build, screenshot,
// analyze) and returns a "work order" — a structured packet listing exactly
// what the agent (Claude in the Claude Code session) should do next, with
// every piece of data already gathered.
//
// The agent reads the work order, designs HTML for each screen, calls
// generate_mockup(render), fills the metadata template, and finally calls
// export_assets — all from the existing agent loop. No sampling needed.
// ══════════════════════════════════════════════════════════════════════════

interface BootstrapInput {
  projectPath: string;
  platforms: string[];
  locales: string[];
  tone: string;
  skipBuild: boolean;
  skipSimulator: boolean;
  topN: number;
  outputDir: string;
  workDir: string;
  stages: OrchestrationStage[];
}

interface DesignTask {
  action: "design_html_and_render";
  order: number;
  screen_name: string;
  source_file_path: string;
  source_code_excerpt?: string;
  screenshot_path?: string;
  has_screenshot: boolean;
  design_brief?: Record<string, unknown>;
  suggested_headline: string;
  reason: string;
  output_dir: string;
  target_platform: "ios" | "android";
}

interface MetadataTask {
  action: "fill_metadata_copy";
  template_path: string;
  project_context: Record<string, unknown>;
  locales: string[];
  tone: string;
  selected_screens: Array<{ name: string; role: string; suggested_headline: string }>;
  character_limits: {
    app_store: { name: number; subtitle: number; description: number; promotional_text: number; keywords: number; whats_new: number };
    play_store: { title: number; short_description: number; full_description: number };
  };
}

async function runBootstrapMode(
  input: BootstrapInput
): Promise<Record<string, unknown>> {
  const {
    projectPath,
    platforms,
    locales,
    tone,
    skipBuild,
    skipSimulator,
    topN,
    outputDir,
    workDir,
    stages,
  } = input;

  const primaryPlatform = (platforms.includes("ios") ? "ios" : "android") as
    | "ios"
    | "android";

  // ── Stage 1: detect project ──
  const project = await runStage(stages, "detect_project", async () => {
    return (await detectProject({ path: projectPath })) as ProjectInfo;
  });
  if (!project) {
    return failure(stages, outputDir, "detect_project failed");
  }

  // ── Stage 2: deterministic screen selection (no sampling) ──
  // Filter out auth/splash/loading, take top N by importance score.
  const filteredScreens = project.screens.filter((s) => {
    const name = s.name.toLowerCase();
    if (s.type === "auth") return false;
    if (/(splash|loading|launch|error)/.test(name)) return false;
    return true;
  });
  const selectedScreens: SelectedScreen[] = filteredScreens
    .slice(0, topN)
    .map((s, i) => ({
      screen_name: s.name,
      file_path: s.file_path,
      order: i + 1,
      reason: `Auto-selected by importance score ${s.estimated_importance} (${s.type})`,
      suggested_headline: humanizeName(s.name),
    }));

  stages.push({
    name: "select_screens_deterministic",
    status: "ok",
    duration_ms: 0,
    note: `Picked ${selectedScreens.length} of ${project.screens.length} screens by importance score (no sampling)`,
  });

  // ── Stage 3: capture screenshots OR collect source code ──
  const captured: CapturedScreenshot[] = [];
  const collectedSources: Map<string, string> = new Map();

  if (skipSimulator) {
    // No build, no screenshots — just read source files for the agent.
    for (const screen of selectedScreens) {
      try {
        const sourcePath = resolve(projectPath, screen.file_path);
        const source = await readFile(sourcePath, "utf-8");
        collectedSources.set(screen.screen_name, source.slice(0, 12000));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        stages.push({
          name: `read_source:${screen.screen_name}`,
          status: "error",
          duration_ms: 0,
          error: msg,
        });
      }
    }
    stages.push({
      name: "collect_source_code",
      status: "ok",
      duration_ms: 0,
      note: `Read ${collectedSources.size}/${selectedScreens.length} screen source files`,
    });
  } else {
    // Real simulator path
    if (!skipBuild) {
      const buildResult = await runStage(stages, `build_${primaryPlatform}`, async () => {
        return (await buildProject({
          path: projectPath,
          platform: primaryPlatform,
        })) as Record<string, unknown>;
      });
      if (!buildResult) {
        // Build failed → switch to source-only fallback automatically
        for (const screen of selectedScreens) {
          try {
            const sourcePath = resolve(projectPath, screen.file_path);
            const source = await readFile(sourcePath, "utf-8");
            collectedSources.set(screen.screen_name, source.slice(0, 12000));
          } catch {}
        }
        stages.push({
          name: "build_fallback_to_source",
          status: "ok",
          duration_ms: 0,
          note: "Build failed — collected source code instead so the agent can still design mockups",
        });
      }
    }

    if (collectedSources.size === 0) {
      // Build succeeded → boot, screenshot
      const device = await runStage(
        stages,
        `boot_${primaryPlatform}`,
        async () => {
          return (await simulatorControl({
            action: "boot",
            platform: primaryPlatform,
          })) as { device_id: string };
        }
      );

      if (device?.device_id) {
        for (const screen of selectedScreens) {
          const cap = await runStage(
            stages,
            `screenshot:${screen.screen_name}`,
            async () => {
              const rawPath = join(workDir, `raw-${slug(screen.screen_name)}.png`);
              await takeScreenshot({
                platform: primaryPlatform,
                device_id: device.device_id,
                output_path: rawPath,
                mask_status_bar: true,
                wait_ms: 500,
              });
              return {
                screen,
                screenshot_path: rawPath,
                source: "simulator" as const,
              };
            }
          );
          if (cap) captured.push(cap);
        }

        await runStage(stages, `shutdown_${primaryPlatform}`, async () => {
          return await simulatorControl({
            action: "shutdown",
            platform: primaryPlatform,
            device_id: device.device_id,
          });
        });
      }
    }
  }

  // ── Stage 4: analyze every captured screenshot (deterministic) ──
  const designTasks: DesignTask[] = [];
  const mockupsDir = join(outputDir, "mockups", primaryPlatform);
  await mkdir(mockupsDir, { recursive: true });

  for (const screen of selectedScreens) {
    const cap = captured.find((c) => c.screen.screen_name === screen.screen_name);
    const sourceCode = collectedSources.get(screen.screen_name);

    if (cap) {
      // We have a real screenshot → run analyze for the design brief
      const analysis = await runStage(
        stages,
        `analyze:${screen.screen_name}`,
        async () => {
          return (await generateMockup({
            mode: "analyze",
            screenshot_path: cap.screenshot_path,
            app_name: project.project_name,
            app_category: inferCategory(project),
            screen_name: screen.screen_name,
            platform: primaryPlatform,
          })) as Record<string, unknown>;
        }
      );

      designTasks.push({
        action: "design_html_and_render",
        order: screen.order,
        screen_name: screen.screen_name,
        source_file_path: screen.file_path,
        screenshot_path: cap.screenshot_path,
        has_screenshot: true,
        design_brief: (analysis as any)?.design_brief,
        suggested_headline: screen.suggested_headline,
        reason: screen.reason,
        output_dir: mockupsDir,
        target_platform: primaryPlatform,
      });
    } else if (sourceCode) {
      // No screenshot — agent will design from source code alone
      designTasks.push({
        action: "design_html_and_render",
        order: screen.order,
        screen_name: screen.screen_name,
        source_file_path: screen.file_path,
        source_code_excerpt: sourceCode,
        has_screenshot: false,
        suggested_headline: screen.suggested_headline,
        reason: screen.reason,
        output_dir: mockupsDir,
        target_platform: primaryPlatform,
      });
    }
  }

  // ── Stage 5: prepare metadata template (no sampling) ──
  const baseMetadata = (await generateMetadata({
    project_path: projectPath,
    target_store: "both",
    locales,
    tone,
  })) as Record<string, unknown>;

  const metadataDir = join(outputDir, "metadata");
  await mkdir(metadataDir, { recursive: true });
  const metadataTemplatePath = join(metadataDir, "copy.template.json");
  await writeFile(
    metadataTemplatePath,
    JSON.stringify(baseMetadata, null, 2),
    "utf-8"
  );

  const metadataTask: MetadataTask = {
    action: "fill_metadata_copy",
    template_path: metadataTemplatePath,
    project_context: (baseMetadata as any).project_context ?? {},
    locales,
    tone,
    selected_screens: selectedScreens.map((s) => ({
      name: s.screen_name,
      role: s.reason,
      suggested_headline: s.suggested_headline,
    })),
    character_limits: {
      app_store: {
        name: 30,
        subtitle: 30,
        description: 4000,
        promotional_text: 170,
        keywords: 100,
        whats_new: 4000,
      },
      play_store: {
        title: 30,
        short_description: 80,
        full_description: 4000,
      },
    },
  };

  // ── Save partial config + work order ──
  await writeConfig(outputDir, {
    project,
    selected_screens: selectedScreens,
    captured: captured.map((c) => ({
      screen: c.screen.screen_name,
      source: c.source,
      screenshot_path: c.screenshot_path,
    })),
    locales,
    tone,
    mode: "bootstrap",
  });

  // ── Build agent instructions ──
  const hasScreenshots = captured.length > 0;
  const instructions = buildAgentInstructions({
    projectName: project.project_name,
    designTasks,
    metadataTask,
    outputDir,
    hasScreenshots,
    skipSimulator,
  });

  return {
    success: true,
    mode: "bootstrap",
    output_dir: outputDir,
    stages,
    project: {
      name: project.project_name,
      platform: project.platform,
      ui_framework: project.ui_framework,
      total_screens_found: project.screens.length,
    },
    selected_screens: selectedScreens.length,
    screenshots_captured: captured.length,
    source_files_collected: collectedSources.size,

    // ── WORK ORDER FOR THE AGENT ──
    next_actions: {
      total: designTasks.length + 1,
      design_tasks: designTasks,
      metadata_task: metadataTask,
      final_step: {
        action: "export_assets",
        tool: "export_assets",
        args: {
          source_dir: workDir,
          output_dir: outputDir,
          include_fastlane: true,
          include_raw: true,
        },
      },
    },

    instructions_for_agent: instructions,

    summary: {
      message:
        "Bootstrap mode complete. The mechanical work is done. Now follow `instructions_for_agent` " +
        "to design mockup HTML for each screen, fill metadata copy, and run export_assets.",
    },
  };
}

function buildAgentInstructions(args: {
  projectName: string;
  designTasks: DesignTask[];
  metadataTask: MetadataTask;
  outputDir: string;
  hasScreenshots: boolean;
  skipSimulator: boolean;
}): string {
  const { projectName, designTasks, metadataTask, outputDir, hasScreenshots, skipSimulator } = args;

  return `# Work order for ${projectName}

Bootstrap mode finished the mechanical pipeline (detect, build, ${
    hasScreenshots ? "screenshots, analyze" : "source collection"
  }). MCP sampling is unavailable in this host, so the AI design steps are handed back to you (the Claude Code agent).

Please complete the following ${designTasks.length + 2} steps in order:

## Steps 1-${designTasks.length}: Design and render each mockup

For each task in \`next_actions.design_tasks\`:

${
  hasScreenshots
    ? `1. Read the \`design_brief\` field — it has dominant colors, typography suggestion, content density, headline ideas, and a device frame snippet
2. Design a unique, store-quality HTML mockup for this screen. Use the dominant colors. Pick a font from the typography suggestion. Wrap the screenshot in a device frame.
3. Reference the screenshot inside the HTML as \`<img src="data:image/png;base64,{SCREENSHOT_BASE64}">\` — leave the placeholder literal, the render tool will substitute it
4. Body must be \`{WIDTH}px × {HEIGHT}px\` exactly`
    : `1. Read the \`source_code_excerpt\` field — it's the actual Dart/Swift/Kotlin code for this screen
2. Imagine what this screen looks like when rendered in the real app, with realistic dummy data
3. Write a complete HTML document at 1290×2796 that visually reproduces it (status bar at top, content, navigation) — this is a "virtual screenshot"
4. Then write a SECOND mockup HTML that wraps the virtual screenshot in a marketing-style frame with a headline (since there's no real screenshot, you'll need to inline the design directly)`
}

5. Call the \`generate_mockup\` tool with:
   \`\`\`
   {
     "mode": "batch_render",
     "html": "<your complete HTML>",
     "output_dir": "<task.output_dir>",
     "screen_name": "<task.screen_name (lowercased, dashed)>",
     "platform": "<task.target_platform>"${hasScreenshots ? ',\n     "screenshot_path": "<task.screenshot_path>"' : ""}
   }
   \`\`\`
   This renders the mockup at all required store sizes (4 iOS sizes or 3 Android sizes).

## Step ${designTasks.length + 1}: Fill metadata copy

Read \`next_actions.metadata_task\`:
- It contains the project context, locales, tone, and character limits for every store field
- Read the template at \`metadata_task.template_path\`
- Write the actual ASO copy: app name (≤30), subtitle (≤30), description (≤4000), keywords (≤100, comma-separated), promotional text (≤170), what's new (≤4000); for Play Store: title (≤30), short description (≤80), full description (≤4000)
- Generate one set per locale in \`metadata_task.locales\`
- Save the result back to the template path as a JSON file with structure: \`{ locales: { en: { app_store: {...}, play_store: {...} }, tr: { ... } } }\`
- Use the Write tool to save it

## Step ${designTasks.length + 2}: Export everything

Call the \`export_assets\` tool with the args from \`next_actions.final_step.args\`. This packages everything into a Fastlane-ready directory.

## Output

Final assets land in: \`${outputDir}\`
- Mockups: \`${outputDir}/mockups/\`
- Metadata: \`${outputDir}/metadata/copy.json\`
- Fastlane: \`${outputDir}/fastlane/\`

After step ${designTasks.length + 2}, run \`store-asset-generator-preview ${outputDir}\` to visually edit anything you want to tweak.
`;
}

function humanizeName(name: string): string {
  // "ProductDetailScreen" → "Product Detail"
  return name
    .replace(/(Screen|Page|View|Widget)$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}
