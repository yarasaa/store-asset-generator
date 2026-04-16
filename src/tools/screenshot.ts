import { run } from "../utils/shell.js";
import { stat, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export async function takeScreenshot(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const platform = args.platform as "ios" | "android";
  const deviceId = args.device_id as string;
  const outputPath = args.output_path as string;
  const maskStatusBar = (args.mask_status_bar as boolean) ?? true;
  const waitMs = (args.wait_ms as number) ?? 500;

  if (!deviceId) throw new Error("device_id is required");
  if (!outputPath) throw new Error("output_path is required");

  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  // Wait for animations
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  if (platform === "ios") {
    return captureIOS(deviceId, outputPath, maskStatusBar);
  } else {
    return captureAndroid(deviceId, outputPath, maskStatusBar);
  }
}

async function captureIOS(
  deviceId: string,
  outputPath: string,
  maskStatusBar: boolean
): Promise<Record<string, unknown>> {
  // Mask status bar for store-standard appearance
  if (maskStatusBar) {
    await run("xcrun", [
      "simctl",
      "status_bar",
      deviceId,
      "override",
      "--time",
      "9:41",
      "--batteryState",
      "charged",
      "--batteryLevel",
      "100",
      "--cellularMode",
      "active",
      "--cellularBars",
      "4",
      "--wifiBars",
      "3",
      "--dataNetwork",
      "wifi",
    ]);

    // Small delay for status bar to update
    await sleep(300);
  }

  // Capture
  const result = await run("xcrun", [
    "simctl",
    "io",
    deviceId,
    "screenshot",
    "--type=png",
    outputPath,
  ]);

  // Reset status bar
  if (maskStatusBar) {
    await run("xcrun", ["simctl", "status_bar", deviceId, "clear"]);
  }

  if (result.exitCode !== 0) {
    throw new Error(`Screenshot failed: ${result.stderr}`);
  }

  // Get file info
  const fileInfo = await stat(outputPath);

  // Get image dimensions (use sips on macOS)
  const sipsResult = await run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", outputPath]);
  const widthMatch = sipsResult.stdout.match(/pixelWidth:\s*(\d+)/);
  const heightMatch = sipsResult.stdout.match(/pixelHeight:\s*(\d+)/);

  return {
    success: true,
    path: outputPath,
    width: widthMatch ? parseInt(widthMatch[1]) : 0,
    height: heightMatch ? parseInt(heightMatch[1]) : 0,
    file_size_bytes: fileInfo.size,
    platform: "ios",
    status_bar_masked: maskStatusBar,
  };
}

async function captureAndroid(
  deviceId: string,
  outputPath: string,
  maskStatusBar: boolean
): Promise<Record<string, unknown>> {
  // Enable demo mode for clean status bar
  if (maskStatusBar) {
    const cmds = [
      ["settings", "put", "global", "sysui_demo_allowed", "1"],
      ["am", "broadcast", "-a", "com.android.systemui.demo",
        "-e", "command", "clock", "-e", "hhmm", "0941"],
      ["am", "broadcast", "-a", "com.android.systemui.demo",
        "-e", "command", "battery", "-e", "level", "100", "-e", "plugged", "false"],
      ["am", "broadcast", "-a", "com.android.systemui.demo",
        "-e", "command", "network", "-e", "wifi", "show", "-e", "level", "4"],
      ["am", "broadcast", "-a", "com.android.systemui.demo",
        "-e", "command", "notifications", "-e", "visible", "false"],
    ];

    for (const cmd of cmds) {
      await run("adb", ["-s", deviceId, "shell", ...cmd]);
    }
    await sleep(500);
  }

  // Capture
  const remotePath = "/sdcard/storekit_screenshot.png";
  await run("adb", ["-s", deviceId, "shell", "screencap", "-p", remotePath]);
  const pullResult = await run("adb", ["-s", deviceId, "pull", remotePath, outputPath]);

  // Disable demo mode
  if (maskStatusBar) {
    await run("adb", [
      "-s", deviceId, "shell",
      "am", "broadcast", "-a", "com.android.systemui.demo",
      "-e", "command", "exit",
    ]);
  }

  if (pullResult.exitCode !== 0) {
    throw new Error(`Screenshot pull failed: ${pullResult.stderr}`);
  }

  const fileInfo = await stat(outputPath);

  return {
    success: true,
    path: outputPath,
    width: 0, // Would need imagemagick/sharp to detect
    height: 0,
    file_size_bytes: fileInfo.size,
    platform: "android",
    status_bar_masked: maskStatusBar,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
