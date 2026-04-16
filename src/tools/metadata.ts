import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function generateMetadata(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const projectPath = args.project_path as string;
  const screenshotsDir = args.screenshots_dir as string | undefined;
  const targetStore = (args.target_store as string) ?? "both";
  const locales = (args.locales as string[]) ?? ["en"];
  const tone = (args.tone as string) ?? "professional";

  if (!projectPath) throw new Error("project_path is required");

  // Read project files for context
  const projectContext = await gatherProjectContext(projectPath);

  // Build metadata structure
  // Note: In production, this would call Claude API for intelligent text generation.
  // As an MCP tool, the AI reasoning happens in Claude Code itself — we just structure
  // the data and provide the project context for Claude to generate copy.

  const metadata: Record<string, unknown> = {
    project_context: projectContext,
    target_store: targetStore,
    locales,
    tone,

    // Template structure for Claude to fill
    app_store: targetStore !== "play-store" ? {
      name: { max_chars: 30, value: "", hint: "App name for App Store (max 30 chars)" },
      subtitle: { max_chars: 30, value: "", hint: "Short tagline (max 30 chars)" },
      description: { max_chars: 4000, value: "", hint: "Full description, ASO optimized" },
      promotional_text: { max_chars: 170, value: "", hint: "Promotional text, can be updated without review" },
      keywords: { max_chars: 100, value: "", hint: "Comma-separated keywords (max 100 chars total)" },
      whats_new: { max_chars: 4000, value: "", hint: "Release notes for current version" },
      category: { value: "", hint: "Primary category" },
      secondary_category: { value: "", hint: "Optional secondary category" },
    } : undefined,

    play_store: targetStore !== "app-store" ? {
      title: { max_chars: 30, value: "", hint: "App title (max 30 chars)" },
      short_description: { max_chars: 80, value: "", hint: "Short description (max 80 chars)" },
      full_description: { max_chars: 4000, value: "", hint: "Full description with emoji formatting" },
      tags: { max: 5, value: [], hint: "Up to 5 category tags" },
    } : undefined,

    shared: {
      feature_list: [],
      target_audience: "",
      unique_selling_points: [],
      privacy_policy_sections: [
        "Data Collection",
        "Data Usage",
        "Third-Party Services",
        "Data Storage",
        "User Rights",
        "Contact Information",
      ],
    },

    aso_guidelines: {
      keyword_tips: [
        "Use all 100 characters for App Store keywords",
        "Don't repeat words from the app name in keywords",
        "Use singular instead of plural (covers both)",
        "Avoid competitor brand names",
        "Focus first 3 lines of description on value prop (visible without 'Read More')",
      ],
      description_tips: [
        "Lead with the strongest benefit",
        "Use short paragraphs (2-3 sentences)",
        "Include social proof if available (# users, ratings)",
        "End with a clear CTA",
        "Play Store: Use emoji for feature lists",
        "App Store: No emoji in description (not indexed)",
      ],
    },

    instructions_for_claude:
      "You are generating store metadata for this app. Use the project_context " +
      "to understand what the app does. Fill in all value fields. Follow the " +
      "aso_guidelines. Generate for each requested locale. The tone should be: " +
      tone +
      ". Return the filled metadata as a JSON object.",
  };

  return metadata;
}

async function gatherProjectContext(projectPath: string): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {};

  // Try to read pubspec.yaml (Flutter)
  try {
    const pubspec = await readFile(join(projectPath, "pubspec.yaml"), "utf-8");
    context.pubspec = extractYamlInfo(pubspec);
  } catch {}

  // Try to read package.json
  try {
    const pkg = await readFile(join(projectPath, "package.json"), "utf-8");
    const parsed = JSON.parse(pkg);
    context.package = {
      name: parsed.name,
      description: parsed.description,
      version: parsed.version,
    };
  } catch {}

  // Try to read README
  try {
    const readme = await readFile(join(projectPath, "README.md"), "utf-8");
    context.readme_excerpt = readme.substring(0, 2000);
  } catch {}

  // Try to read iOS Info.plist for existing metadata
  const plistPaths = [
    join(projectPath, "ios", "Runner", "Info.plist"),
    join(projectPath, "Info.plist"),
  ];
  for (const p of plistPaths) {
    try {
      const plist = await readFile(p, "utf-8");
      context.info_plist_excerpt = plist.substring(0, 1000);
      break;
    } catch {}
  }

  return context;
}

function extractYamlInfo(yaml: string): Record<string, string> {
  const info: Record<string, string> = {};
  const fields = ["name", "description", "version", "homepage"];
  for (const field of fields) {
    const match = yaml.match(new RegExp(`^${field}:\\s*(.+)`, "m"));
    if (match) info[field] = match[1].trim();
  }

  // Extract dependencies for feature inference
  const deps: string[] = [];
  const depSection = yaml.match(/dependencies:\n((?:\s+.+\n)+)/);
  if (depSection) {
    const lines = depSection[1].split("\n");
    for (const line of lines) {
      const dep = line.trim().split(":")[0];
      if (dep && !dep.startsWith("#") && !dep.startsWith("flutter")) {
        deps.push(dep);
      }
    }
  }
  if (deps.length > 0) {
    info.key_dependencies = deps.join(", ");
  }

  return info;
}
