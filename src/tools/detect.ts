import { readdir, readFile, access, stat } from "node:fs/promises";
import { join, basename, extname, relative } from "node:path";
import type {
  ProjectInfo,
  Platform,
  Language,
  UIFramework,
  ScreenInfo,
  ScreenType,
  BuildConfig,
} from "../types.js";

export async function detectProject(
  args: Record<string, unknown>
): Promise<ProjectInfo> {
  const projectPath = args.path as string;
  if (!projectPath) throw new Error("path is required");

  await access(projectPath);

  // Detect platform by marker files
  const markers = await detectMarkerFiles(projectPath);
  const platform = identifyPlatform(markers);
  const language = platformLanguage(platform);
  const uiFramework = platformFramework(platform, markers);

  // Extract project metadata
  const projectName = await extractProjectName(projectPath, platform, markers);
  const bundleId = await extractBundleId(projectPath, platform, markers);
  const version = await extractVersion(projectPath, platform, markers);
  const minOsVersion = await extractMinOsVersion(projectPath, platform, markers);

  // Scan for screens
  const screens = await scanScreens(projectPath, platform, uiFramework);

  // Find app icon
  const appIconPath = await findAppIcon(projectPath, platform);

  // Detect locales
  const locales = await detectLocales(projectPath, platform);

  // Build config
  const buildConfig = deriveBuildConfig(projectPath, platform, markers);

  return {
    platform,
    language,
    ui_framework: uiFramework,
    project_name: projectName,
    bundle_id: bundleId,
    version,
    min_os_version: minOsVersion,
    screens: screens.sort((a, b) => b.estimated_importance - a.estimated_importance),
    app_icon_path: appIconPath,
    locales,
    build_config: buildConfig,
  };
}

// ── Marker file detection ──

interface MarkerFiles {
  pubspecYaml: boolean;
  xcodeproj: string | null; // dirname
  xcworkspace: string | null;
  buildGradle: boolean;
  buildGradleKts: boolean;
  packageJson: boolean;
  podfile: boolean;
  infoPlist: string | null;
  androidManifest: string | null;
}

async function detectMarkerFiles(root: string): Promise<MarkerFiles> {
  const result: MarkerFiles = {
    pubspecYaml: false,
    xcodeproj: null,
    xcworkspace: null,
    buildGradle: false,
    buildGradleKts: false,
    packageJson: false,
    podfile: false,
    infoPlist: null,
    androidManifest: null,
  };

  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === "pubspec.yaml") result.pubspecYaml = true;
      if (e.name.endsWith(".xcodeproj") && e.isDirectory()) result.xcodeproj = e.name;
      if (e.name.endsWith(".xcworkspace") && e.isDirectory()) result.xcworkspace = e.name;
      if (e.name === "build.gradle") result.buildGradle = true;
      if (e.name === "build.gradle.kts") result.buildGradleKts = true;
      if (e.name === "package.json") result.packageJson = true;
      if (e.name === "Podfile") result.podfile = true;
    }
  } catch {
    // ignore
  }

  // Deep scan for Info.plist and AndroidManifest
  result.infoPlist = await findFile(root, "Info.plist", 4);
  result.androidManifest = await findFile(root, "AndroidManifest.xml", 5);

  return result;
}

function identifyPlatform(m: MarkerFiles): Platform {
  if (m.pubspecYaml) return "flutter";
  if (m.packageJson) return "react-native"; // simplified; could also check for react-native dep
  if (m.xcodeproj && !m.buildGradle && !m.buildGradleKts) return "ios";
  if ((m.buildGradle || m.buildGradleKts) && !m.xcodeproj) return "android";
  if (m.xcodeproj && (m.buildGradle || m.buildGradleKts)) return "kotlin-multiplatform";
  if (m.xcodeproj) return "ios";
  if (m.buildGradle || m.buildGradleKts) return "android";
  throw new Error(
    "Could not detect project platform. Expected pubspec.yaml (Flutter), " +
      ".xcodeproj (iOS), build.gradle (Android), or package.json (React Native)."
  );
}

function platformLanguage(p: Platform): Language {
  const map: Record<Platform, Language> = {
    flutter: "dart",
    ios: "swift",
    android: "kotlin",
    "react-native": "typescript",
    "kotlin-multiplatform": "kotlin",
  };
  return map[p];
}

function platformFramework(p: Platform, m: MarkerFiles): UIFramework {
  if (p === "flutter") return "flutter";
  if (p === "react-native") return "react-native";
  if (p === "android" || p === "kotlin-multiplatform") return "jetpack-compose";
  // iOS: try to detect SwiftUI vs UIKit (simplified heuristic)
  return "swiftui";
}

// ── Metadata extraction ──

async function extractProjectName(
  root: string,
  platform: Platform,
  markers: MarkerFiles
): Promise<string> {
  if (platform === "flutter") {
    const content = await safeReadFile(join(root, "pubspec.yaml"));
    const match = content.match(/^name:\s*(.+)/m);
    if (match) return match[1].trim();
  }
  if (markers.xcodeproj) {
    return basename(markers.xcodeproj, ".xcodeproj");
  }
  if (platform === "android") {
    const content = await safeReadFile(join(root, "settings.gradle.kts"))
      || await safeReadFile(join(root, "settings.gradle"));
    const match = content.match(/rootProject\.name\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  }
  return basename(root);
}

async function extractBundleId(
  root: string,
  platform: Platform,
  markers: MarkerFiles
): Promise<string> {
  if (platform === "flutter") {
    // Try android/app/build.gradle
    const gradle = await safeReadFile(
      join(root, "android", "app", "build.gradle")
    ) || await safeReadFile(
      join(root, "android", "app", "build.gradle.kts")
    );
    const match = gradle.match(/applicationId\s*[=:]\s*"([^"]+)"/);
    if (match) return match[1];
  }
  if (markers.infoPlist) {
    const content = await safeReadFile(join(root, markers.infoPlist));
    const match = content.match(
      /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/
    );
    if (match) return match[1];
  }
  return "com.example.app";
}

async function extractVersion(
  root: string,
  platform: Platform,
  _markers: MarkerFiles
): Promise<string> {
  if (platform === "flutter") {
    const content = await safeReadFile(join(root, "pubspec.yaml"));
    const match = content.match(/^version:\s*(.+)/m);
    if (match) return match[1].trim();
  }
  return "1.0.0";
}

async function extractMinOsVersion(
  root: string,
  platform: Platform,
  _markers: MarkerFiles
): Promise<string> {
  if (platform === "flutter" || platform === "ios") {
    const podfile = await safeReadFile(join(root, "ios", "Podfile"))
      || await safeReadFile(join(root, "Podfile"));
    const match = podfile.match(/platform\s*:ios\s*,\s*'([^']+)'/);
    if (match) return `iOS ${match[1]}`;
  }
  if (platform === "android") {
    const gradle = await safeReadFile(join(root, "app", "build.gradle.kts"))
      || await safeReadFile(join(root, "app", "build.gradle"));
    const match = gradle.match(/minSdk\s*[=:]\s*(\d+)/);
    if (match) return `API ${match[1]}`;
  }
  return "unknown";
}

// ── Screen scanning ──

async function scanScreens(
  root: string,
  platform: Platform,
  framework: UIFramework
): Promise<ScreenInfo[]> {
  const screens: ScreenInfo[] = [];
  const scanDir = getScanDirectory(root, platform);

  const files = await collectSourceFiles(scanDir, getExtension(platform));
  for (const filePath of files) {
    const content = await safeReadFile(filePath);
    if (!content) continue;

    const detected = detectScreensInFile(
      content,
      filePath,
      root,
      platform,
      framework
    );
    screens.push(...detected);
  }

  return screens;
}

function getScanDirectory(root: string, platform: Platform): string {
  if (platform === "flutter") return join(root, "lib");
  if (platform === "ios") return root;
  if (platform === "android") return join(root, "app", "src", "main");
  if (platform === "react-native") return join(root, "src");
  return root;
}

function getExtension(platform: Platform): string {
  const map: Record<Platform, string> = {
    flutter: ".dart",
    ios: ".swift",
    android: ".kt",
    "react-native": ".tsx",
    "kotlin-multiplatform": ".kt",
  };
  return map[platform];
}

function detectScreensInFile(
  content: string,
  filePath: string,
  root: string,
  platform: Platform,
  framework: UIFramework
): ScreenInfo[] {
  const results: ScreenInfo[] = [];
  const relPath = relative(root, filePath);

  if (framework === "flutter") {
    // Match StatefulWidget and StatelessWidget with Screen/Page/View suffix
    const regex =
      /class\s+(\w+(?:Screen|Page|View|Widget))\s+extends\s+(?:Stateful|Stateless)Widget/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      results.push({
        name,
        file_path: relPath,
        type: classifyScreen(name, content),
        navigation_path: extractRoute(content, name, "flutter"),
        has_data_dependency: hasDataDependency(content, platform),
        estimated_importance: estimateImportance(name, content),
      });
    }

    // Also match GetView / GetWidget (GetX)
    const getxRegex =
      /class\s+(\w+(?:Screen|Page|View))\s+extends\s+(?:GetView|GetWidget)/g;
    while ((match = getxRegex.exec(content)) !== null) {
      results.push({
        name: match[1],
        file_path: relPath,
        type: classifyScreen(match[1], content),
        navigation_path: extractRoute(content, match[1], "flutter"),
        has_data_dependency: hasDataDependency(content, platform),
        estimated_importance: estimateImportance(match[1], content),
      });
    }
  }

  if (framework === "swiftui") {
    // Match structs conforming to View
    const regex = /struct\s+(\w+)\s*:\s*(?:\w+,\s*)*View\b/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      if (isLikelyScreen(name)) {
        results.push({
          name,
          file_path: relPath,
          type: classifyScreen(name, content),
          navigation_path: extractRoute(content, name, "swift"),
          has_data_dependency: hasDataDependency(content, platform),
          estimated_importance: estimateImportance(name, content),
        });
      }
    }
  }

  if (framework === "jetpack-compose") {
    // Match @Composable functions with Screen/Page suffix
    const regex = /@Composable\s+(?:fun|internal\s+fun|private\s+fun)\s+(\w+Screen|\w+Page)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      results.push({
        name: match[1],
        file_path: relPath,
        type: classifyScreen(match[1], content),
        navigation_path: extractRoute(content, match[1], "kotlin"),
        has_data_dependency: hasDataDependency(content, platform),
        estimated_importance: estimateImportance(match[1], content),
      });
    }
  }

  return results;
}

function isLikelyScreen(name: string): boolean {
  const screenSuffixes = ["View", "Screen", "Page", "Scene"];
  return screenSuffixes.some((s) => name.endsWith(s)) || name.includes("Content");
}

function classifyScreen(name: string, content: string): ScreenType {
  const lower = name.toLowerCase() + " " + content.substring(0, 500).toLowerCase();

  if (/login|signin|sign_in|auth|register|signup|sign_up/.test(lower)) return "auth";
  if (/onboarding|welcome|intro|walkthrough|tutorial/.test(lower)) return "onboarding";
  if (/home|main|dashboard|feed|timeline/.test(lower)) return "main";
  if (/detail|info|product|item|article/.test(lower)) return "detail";
  if (/settings|preference|config|account/.test(lower)) return "settings";
  if (/list|catalog|browse|explore|discover/.test(lower)) return "list";
  if (/profile|user|me|avatar/.test(lower)) return "profile";
  if (/search|find|query|filter/.test(lower)) return "search";
  if (/form|edit|create|new|add|compose/.test(lower)) return "form";
  return "unknown";
}

function extractRoute(content: string, _name: string, lang: string): string {
  if (lang === "flutter") {
    // GoRouter: path: '/home'
    const match = content.match(/path:\s*['"]([^'"]+)['"]/);
    if (match) return match[1];
    // Named route: routeName = 'home'
    const namedMatch = content.match(/routeName\s*=\s*['"]([^'"]+)['"]/);
    if (namedMatch) return namedMatch[1];
  }
  return "";
}

function hasDataDependency(content: string, platform: Platform): boolean {
  if (platform === "flutter") {
    return /FutureBuilder|StreamBuilder|BlocBuilder|Obx|Consumer|ref\.watch|http\.|dio\.|api/i.test(
      content
    );
  }
  return /URLSession|Alamofire|Retrofit|Ktor|fetch|axios|@Query|@GET|@POST/i.test(content);
}

function estimateImportance(name: string, content: string): number {
  const lower = name.toLowerCase();

  // High importance: main screens users see first
  if (/home|main|dashboard|feed|timeline/.test(lower)) return 9;
  if (/onboarding|welcome/.test(lower)) return 8;
  if (/detail|product|article/.test(lower)) return 8;
  if (/search|explore|discover|browse/.test(lower)) return 7;
  if (/profile|user/.test(lower)) return 7;
  if (/list|catalog/.test(lower)) return 6;
  if (/form|create|compose/.test(lower)) return 5;
  if (/settings|preference/.test(lower)) return 3;
  if (/login|signin|auth|register/.test(lower)) return 2;
  if (/splash|loading|error/.test(lower)) return 1;

  // Content-based heuristics
  const contentLen = content.length;
  if (contentLen > 3000) return 6; // Complex screens are usually important
  if (contentLen > 1000) return 5;
  return 4;
}

// ── Other helpers ──

function deriveBuildConfig(
  root: string,
  platform: Platform,
  markers: MarkerFiles
): BuildConfig {
  if (platform === "flutter") {
    return {
      build_tool: "flutter",
      build_command: "flutter build ios --debug --simulator",
      schemes: ["Runner"],
      min_sdk: "iOS 13.0",
    };
  }
  if (platform === "ios") {
    const proj = markers.xcworkspace ?? markers.xcodeproj ?? "";
    const flag = markers.xcworkspace ? "-workspace" : "-project";
    return {
      build_tool: "xcodebuild",
      build_command: `xcodebuild ${flag} ${proj} -scheme ${basename(proj, extname(proj))} -sdk iphonesimulator build`,
      schemes: [basename(proj, extname(proj))],
      min_sdk: "iOS 16.0",
    };
  }
  if (platform === "android") {
    return {
      build_tool: "gradle",
      build_command: "./gradlew assembleDebug",
      schemes: ["debug"],
      min_sdk: "API 24",
    };
  }
  return {
    build_tool: "unknown",
    build_command: "",
    schemes: [],
    min_sdk: "unknown",
  };
}

async function findAppIcon(
  root: string,
  platform: Platform
): Promise<string | null> {
  const candidates: string[] = [];

  if (platform === "flutter") {
    candidates.push(
      join(root, "assets", "icon", "icon.png"),
      join(root, "assets", "images", "icon.png"),
      join(root, "assets", "app_icon.png"),
      join(root, "ios", "Runner", "Assets.xcassets", "AppIcon.appiconset", "Icon-App-1024x1024@1x.png"),
      join(root, "android", "app", "src", "main", "res", "mipmap-xxxhdpi", "ic_launcher.png"),
    );
  } else if (platform === "ios") {
    candidates.push(
      join(root, "Assets.xcassets", "AppIcon.appiconset", "Icon-App-1024x1024@1x.png"),
    );
  }

  for (const c of candidates) {
    try {
      await access(c);
      return relative(root, c);
    } catch {
      continue;
    }
  }
  return null;
}

async function detectLocales(
  root: string,
  platform: Platform
): Promise<string[]> {
  const locales: string[] = [];

  if (platform === "flutter") {
    // Check l10n directory
    try {
      const l10nDir = join(root, "lib", "l10n");
      const entries = await readdir(l10nDir);
      for (const e of entries) {
        const match = e.match(/app_(\w+)\.arb$/);
        if (match) locales.push(match[1]);
      }
    } catch {
      // no l10n
    }
  }

  if (platform === "ios") {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.endsWith(".lproj") && e.isDirectory()) {
          locales.push(basename(e.name, ".lproj"));
        }
      }
    } catch {
      // ignore
    }
  }

  return locales.length > 0 ? locales : ["en"];
}

// ── File utilities ──

async function safeReadFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

async function findFile(
  root: string,
  name: string,
  maxDepth: number,
  depth = 0
): Promise<string | null> {
  if (depth > maxDepth) return null;
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === name && e.isFile()) {
        return join(relative(root.split("/").slice(0, -depth || undefined).join("/") || root, root), e.name);
      }
    }
    for (const e of entries) {
      if (
        e.isDirectory() &&
        !e.name.startsWith(".") &&
        e.name !== "node_modules" &&
        e.name !== "build" &&
        e.name !== ".dart_tool"
      ) {
        const found = await findFile(join(root, e.name), name, maxDepth, depth + 1);
        if (found) return join(e.name, found);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function collectSourceFiles(
  dir: string,
  ext: string,
  maxDepth = 10,
  depth = 0
): Promise<string[]> {
  if (depth > maxDepth) return [];
  const files: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isFile() && e.name.endsWith(ext)) {
        files.push(full);
      } else if (
        e.isDirectory() &&
        !e.name.startsWith(".") &&
        e.name !== "node_modules" &&
        e.name !== "build" &&
        e.name !== ".dart_tool" &&
        e.name !== "Pods" &&
        e.name !== "Generated"
      ) {
        const sub = await collectSourceFiles(full, ext, maxDepth, depth + 1);
        files.push(...sub);
      }
    }
  } catch {
    // ignore
  }
  return files;
}
