import { run, commandExists } from "../utils/shell.js";
import { join } from "node:path";
import { access, readdir } from "node:fs/promises";
import { basename, extname } from "node:path";

export async function buildProject(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const projectPath = args.path as string;
  const platform = args.platform as "ios" | "android";
  const scheme = args.scheme as string | undefined;
  const buildMode = (args.build_mode as string) ?? "debug";

  if (!projectPath) throw new Error("path is required");
  if (!platform) throw new Error("platform is required");

  // Detect project type
  const isFlutter = await fileExists(join(projectPath, "pubspec.yaml"));

  if (isFlutter) {
    return buildFlutter(projectPath, platform, buildMode);
  } else if (platform === "ios") {
    return buildIOS(projectPath, scheme, buildMode);
  } else {
    return buildAndroid(projectPath, buildMode);
  }
}

async function buildFlutter(
  path: string,
  platform: "ios" | "android",
  mode: string
): Promise<Record<string, unknown>> {
  if (!(await commandExists("flutter"))) {
    throw new Error(
      "Flutter SDK not found. Install from https://flutter.dev/docs/get-started/install"
    );
  }

  // flutter pub get first
  const pubGet = await run("flutter", ["pub", "get"], { cwd: path });
  if (pubGet.exitCode !== 0) {
    throw new Error(`flutter pub get failed:\n${pubGet.stderr}`);
  }

  const start = Date.now();

  if (platform === "ios") {
    const result = await run(
      "flutter",
      ["build", "ios", "--debug", "--simulator", "--no-codesign"],
      { cwd: path, timeout: 300_000 }
    );
    if (result.exitCode !== 0) {
      throw new Error(`Flutter iOS build failed:\n${result.stderr}`);
    }
    const artifactPath = join(
      path,
      "build",
      "ios",
      "iphonesimulator",
      "Runner.app"
    );
    return {
      success: true,
      artifact_path: artifactPath,
      build_time_seconds: (Date.now() - start) / 1000,
      platform: "ios",
      framework: "flutter",
      warnings: extractWarnings(result.stderr),
    };
  } else {
    const result = await run("flutter", ["build", "apk", "--debug"], {
      cwd: path,
      timeout: 300_000,
    });
    if (result.exitCode !== 0) {
      throw new Error(`Flutter Android build failed:\n${result.stderr}`);
    }
    const artifactPath = join(
      path,
      "build",
      "app",
      "outputs",
      "flutter-apk",
      "app-debug.apk"
    );
    return {
      success: true,
      artifact_path: artifactPath,
      build_time_seconds: (Date.now() - start) / 1000,
      platform: "android",
      framework: "flutter",
      warnings: extractWarnings(result.stderr),
    };
  }
}

async function buildIOS(
  path: string,
  scheme: string | undefined,
  mode: string
): Promise<Record<string, unknown>> {
  if (!(await commandExists("xcodebuild"))) {
    throw new Error("Xcode not found. Install from the Mac App Store.");
  }

  // Find .xcworkspace or .xcodeproj
  const entries = await readdir(path);
  const workspace = entries.find((e) => e.endsWith(".xcworkspace"));
  const xcodeproj = entries.find((e) => e.endsWith(".xcodeproj"));

  const projectFile = workspace ?? xcodeproj;
  if (!projectFile) {
    throw new Error("No .xcworkspace or .xcodeproj found");
  }

  const flag = workspace ? "-workspace" : "-project";
  const schemeName =
    scheme ?? basename(projectFile, extname(projectFile));

  const start = Date.now();
  const buildDir = join(path, "build", "Debug-iphonesimulator");

  const result = await run(
    "xcodebuild",
    [
      flag,
      join(path, projectFile),
      "-scheme",
      schemeName,
      "-destination",
      "generic/platform=iOS Simulator",
      "-configuration",
      "Debug",
      "-derivedDataPath",
      join(path, "build"),
      "build",
    ],
    { cwd: path, timeout: 600_000 }
  );

  if (result.exitCode !== 0) {
    throw new Error(`xcodebuild failed:\n${result.stderr}`);
  }

  // Find .app in build dir
  let artifactPath = "";
  try {
    const products = join(
      path,
      "build",
      "Build",
      "Products",
      "Debug-iphonesimulator"
    );
    const apps = (await readdir(products)).filter((f) => f.endsWith(".app"));
    if (apps.length > 0) {
      artifactPath = join(products, apps[0]);
    }
  } catch {
    artifactPath = buildDir;
  }

  return {
    success: true,
    artifact_path: artifactPath,
    build_time_seconds: (Date.now() - start) / 1000,
    platform: "ios",
    framework: "native",
    warnings: extractWarnings(result.stderr),
  };
}

async function buildAndroid(
  path: string,
  mode: string
): Promise<Record<string, unknown>> {
  const gradlew = join(path, "gradlew");
  const hasGradlew = await fileExists(gradlew);
  const cmd = hasGradlew ? "./gradlew" : "gradle";

  const start = Date.now();
  const result = await run(cmd, ["assembleDebug"], {
    cwd: path,
    timeout: 600_000,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Gradle build failed:\n${result.stderr}`);
  }

  const artifactPath = join(
    path,
    "app",
    "build",
    "outputs",
    "apk",
    "debug",
    "app-debug.apk"
  );

  return {
    success: true,
    artifact_path: artifactPath,
    build_time_seconds: (Date.now() - start) / 1000,
    platform: "android",
    framework: "native",
    warnings: extractWarnings(result.stderr),
  };
}

// ── Helpers ──

function extractWarnings(stderr: string): string[] {
  return stderr
    .split("\n")
    .filter((l) => /warning|deprecated/i.test(l))
    .slice(0, 10);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
