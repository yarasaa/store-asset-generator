import { mkdir, readdir, copyFile, writeFile, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";

export async function exportAssets(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const sourceDir = args.source_dir as string;
  const outputDir = (args.output_dir as string) ?? join(process.cwd(), "store-assets");
  const includeFastlane = (args.include_fastlane as boolean) ?? true;
  const includeRaw = (args.include_raw as boolean) ?? false;

  if (!sourceDir) throw new Error("source_dir is required");

  // Create output structure
  const dirs = [
    join(outputDir, "screenshots", "ios", "6.7-inch"),
    join(outputDir, "screenshots", "ios", "6.1-inch"),
    join(outputDir, "screenshots", "ios", "5.5-inch"),
    join(outputDir, "screenshots", "ios", "ipad-12.9-inch"),
    join(outputDir, "screenshots", "android", "phone"),
    join(outputDir, "screenshots", "android", "7-inch-tablet"),
    join(outputDir, "screenshots", "android", "10-inch-tablet"),
    join(outputDir, "mockups", "ios"),
    join(outputDir, "mockups", "android"),
    join(outputDir, "metadata"),
    join(outputDir, "icons"),
  ];

  if (includeRaw) {
    dirs.push(join(outputDir, "raw"));
  }

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  // Copy files from source
  let filesCopied = 0;
  let totalSize = 0;

  try {
    const sourceEntries = await readdir(sourceDir, { withFileTypes: true, recursive: true });
    for (const entry of sourceEntries) {
      if (!entry.isFile()) continue;

      const ext = extname(entry.name).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".json", ".txt", ".md"].includes(ext)) continue;

      // Determine destination based on filename patterns
      const name = entry.name.toLowerCase();
      let destDir = outputDir;

      if (name.includes("mockup") || name.includes("framed")) {
        destDir = name.includes("android")
          ? join(outputDir, "mockups", "android")
          : join(outputDir, "mockups", "ios");
      } else if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
        if (includeRaw) {
          destDir = join(outputDir, "raw");
        } else {
          continue; // Skip raw screenshots if not requested
        }
      } else if (ext === ".json" || ext === ".txt" || ext === ".md") {
        destDir = join(outputDir, "metadata");
      }

      const srcPath = join(sourceDir, entry.name);
      const destPath = join(destDir, entry.name);

      try {
        await copyFile(srcPath, destPath);
        const s = await stat(destPath);
        totalSize += s.size;
        filesCopied++;
      } catch {
        // skip files that can't be copied
      }
    }
  } catch {
    // source dir might not have the expected structure yet
  }

  // Generate config.json template
  const config = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    screenshots: {
      style: {
        template: "clean-gradient",
        background: {
          type: "gradient",
          colors: ["#6366F1", "#8B5CF6"],
          angle: 135,
        },
        device_frame: {
          color: "black",
          shadow: true,
        },
        text: {
          font_family: "SF Pro Display",
          headline_size: 48,
          headline_color: "#FFFFFF",
          headline_weight: "bold",
          position: "top",
          alignment: "center",
        },
      },
      screens: [],
    },
    metadata: {
      locales: ["en"],
      tone: "professional",
    },
    export: {
      sizes: {
        ios: ["6.7-inch", "6.1-inch", "5.5-inch", "ipad-12.9-inch"],
        android: ["phone", "7-inch-tablet", "10-inch-tablet"],
      },
      format: "png",
      quality: 95,
      fastlane: includeFastlane,
    },
  };

  await writeFile(
    join(outputDir, "config.json"),
    JSON.stringify(config, null, 2),
    "utf-8"
  );

  // Generate Fastlane structure
  if (includeFastlane) {
    await generateFastlaneStructure(outputDir);
  }

  // Build tree view
  const tree = await buildTreeView(outputDir, "", 0);

  return {
    success: true,
    output_dir: outputDir,
    total_files: filesCopied + 1, // +1 for config.json
    total_size_mb: Math.round((totalSize / 1024 / 1024) * 100) / 100,
    structure: tree,
    fastlane_ready: includeFastlane,
    next_steps: [
      "Edit config.json to customize templates, colors, and text",
      'Run: claude "config.json\'a göre mockupları yeniden oluştur"',
      includeFastlane
        ? "Upload: fastlane deliver (iOS) or fastlane supply (Android)"
        : "Upload manually to App Store Connect / Google Play Console",
    ],
  };
}

async function generateFastlaneStructure(outputDir: string): Promise<void> {
  const fastlaneDir = join(outputDir, "fastlane");

  // Default locale structure
  const locales = ["en-US", "tr"];

  for (const locale of locales) {
    const metadataDir = join(fastlaneDir, "metadata", locale);
    const screenshotsDir = join(fastlaneDir, "screenshots", locale);

    await mkdir(metadataDir, { recursive: true });
    await mkdir(screenshotsDir, { recursive: true });

    // Create placeholder metadata files
    const files: Record<string, string> = {
      "name.txt": "",
      "subtitle.txt": "",
      "description.txt": "",
      "keywords.txt": "",
      "promotional_text.txt": "",
      "release_notes.txt": "",
      "privacy_url.txt": "",
      "support_url.txt": "",
    };

    for (const [filename, content] of Object.entries(files)) {
      await writeFile(join(metadataDir, filename), content, "utf-8");
    }
  }

  // Deliverfile
  await writeFile(
    join(fastlaneDir, "Deliverfile"),
    [
      '# Fastlane Deliver configuration',
      '# Generated by store-asset-generator',
      '',
      '# app_identifier "com.example.app"',
      '# username "your@email.com"',
      '',
      'screenshots_path "./fastlane/screenshots"',
      'metadata_path "./fastlane/metadata"',
      '',
      'force true',
      'skip_binary_upload true',
      'overwrite_screenshots true',
    ].join("\n"),
    "utf-8"
  );
}

async function buildTreeView(
  dir: string,
  prefix: string,
  depth: number
): Promise<string> {
  if (depth > 3) return prefix + "...\n";

  let output = "";
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const isLast = i === sorted.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      output += prefix + connector + entry.name + "\n";

      if (entry.isDirectory()) {
        output += await buildTreeView(
          join(dir, entry.name),
          prefix + childPrefix,
          depth + 1
        );
      }
    }
  } catch {
    output += prefix + "(empty)\n";
  }
  return output;
}
