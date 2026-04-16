import { run } from "../utils/shell.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFile } from "node:fs/promises";

export async function navigateAndInteract(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const platform = args.platform as "ios" | "android";
  const deviceId = args.device_id as string;
  const action = args.action as string;

  if (!deviceId) throw new Error("device_id is required");
  if (!action) throw new Error("action is required");

  // Execute the interaction
  if (platform === "ios") {
    await iosInteract(deviceId, action, args);
  } else {
    await androidInteract(deviceId, action, args);
  }

  // After interaction, capture current state
  const screenshotPath = join(tmpdir(), `storekit-nav-${Date.now()}.png`);
  if (platform === "ios") {
    await run("xcrun", ["simctl", "io", deviceId, "screenshot", "--type=png", screenshotPath]);
  } else {
    await run("adb", ["-s", deviceId, "shell", "screencap", "-p", "/sdcard/nav_screenshot.png"]);
    await run("adb", ["-s", deviceId, "pull", "/sdcard/nav_screenshot.png", screenshotPath]);
  }

  // Get UI hierarchy
  const uiHierarchy = platform === "ios"
    ? await getIOSAccessibilityTree(deviceId)
    : await getAndroidUIHierarchy(deviceId);

  // Return screenshot as base64 for AI analysis
  let screenshotBase64 = "";
  try {
    const buf = await readFile(screenshotPath);
    screenshotBase64 = buf.toString("base64");
  } catch {
    // screenshot might not exist in test environments
  }

  return {
    success: true,
    action_performed: action,
    screenshot_path: screenshotPath,
    screenshot_base64: screenshotBase64.length > 0
      ? `data:image/png;base64,${screenshotBase64.substring(0, 100)}...`
      : "unavailable",
    ui_elements: uiHierarchy,
    hint: "Send the screenshot_path to take_screenshot for a clean capture, or continue navigating.",
  };
}

// ── iOS interactions ──

async function iosInteract(
  deviceId: string,
  action: string,
  args: Record<string, unknown>
): Promise<void> {
  switch (action) {
    case "tap": {
      const element = args.element as Record<string, unknown> | undefined;
      if (element?.coordinates) {
        const coords = element.coordinates as { x: number; y: number };
        // Use simctl's io command for touch simulation
        // Note: simctl doesn't directly support tap, so we use AppleScript or other tools
        // Fallback to idb if available, or coordinate-based interaction
        await iosSimulateTap(deviceId, coords.x, coords.y);
      } else if (element?.accessibility_id) {
        // Use accessibility ID to find and tap
        await iosSimulateTapByAccessibility(deviceId, element.accessibility_id as string);
      }
      await sleep(500);
      break;
    }
    case "type": {
      const text = args.input_text as string;
      if (text) {
        // simctl supports keyboard input
        await run("xcrun", ["simctl", "io", deviceId, "type", text]);
      }
      break;
    }
    case "scroll": {
      const direction = args.direction as string ?? "down";
      await iosSimulateScroll(deviceId, direction);
      await sleep(300);
      break;
    }
    case "swipe": {
      const direction = args.direction as string ?? "left";
      await iosSimulateSwipe(deviceId, direction);
      await sleep(300);
      break;
    }
    case "back": {
      // Swipe from left edge
      await iosSimulateSwipe(deviceId, "right");
      await sleep(300);
      break;
    }
    case "wait": {
      const duration = (args.duration_ms as number) ?? 1000;
      await sleep(duration);
      break;
    }
    case "deep_link": {
      const url = args.url as string;
      if (url) {
        await run("xcrun", ["simctl", "openurl", deviceId, url]);
        await sleep(1000);
      }
      break;
    }
  }
}

async function iosSimulateTap(deviceId: string, x: number, y: number): Promise<void> {
  // Try using idb first (Facebook's iOS Development Bridge)
  const idbResult = await run("idb", ["ui", "tap", String(x), String(y), "--udid", deviceId]);
  if (idbResult.exitCode === 0) return;

  // Fallback: use AppleScript to click in Simulator window
  const script = `
    tell application "Simulator"
      activate
    end tell
    delay 0.3
    tell application "System Events"
      tell process "Simulator"
        click at {${Math.round(x / 3)}, ${Math.round(y / 3 + 50)}}
      end tell
    end tell
  `;
  await run("osascript", ["-e", script]);
}

async function iosSimulateTapByAccessibility(
  deviceId: string,
  accessibilityId: string
): Promise<void> {
  // Use idb if available
  const result = await run("idb", [
    "ui",
    "tap",
    "--by-label",
    accessibilityId,
    "--udid",
    deviceId,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(
      `Could not tap element "${accessibilityId}". ` +
        `Install Facebook IDB for better interaction: brew install idb-companion`
    );
  }
}

async function iosSimulateScroll(deviceId: string, direction: string): Promise<void> {
  const idbDir = direction === "down" ? "up" : direction === "up" ? "down" : direction;
  await run("idb", ["ui", "swipe", "200", "400", "200", direction === "down" ? "200" : "600", "--udid", deviceId]);
}

async function iosSimulateSwipe(deviceId: string, direction: string): Promise<void> {
  const coords: Record<string, [string, string, string, string]> = {
    left: ["350", "400", "50", "400"],
    right: ["50", "400", "350", "400"],
    up: ["200", "600", "200", "200"],
    down: ["200", "200", "200", "600"],
  };
  const [x1, y1, x2, y2] = coords[direction] ?? coords.left;
  await run("idb", ["ui", "swipe", x1, y1, x2, y2, "--udid", deviceId]);
}

async function getIOSAccessibilityTree(deviceId: string): Promise<Record<string, unknown>[]> {
  // Try idb first
  const result = await run("idb", ["ui", "describe-all", "--udid", deviceId, "--json"]);
  if (result.exitCode === 0 && result.stdout) {
    try {
      return JSON.parse(result.stdout);
    } catch {
      // parse failed, return raw
    }
  }

  // Fallback: return empty — Claude will analyze the screenshot visually
  return [{ note: "Install Facebook IDB for UI hierarchy: brew install idb-companion" }];
}

// ── Android interactions ──

async function androidInteract(
  deviceId: string,
  action: string,
  args: Record<string, unknown>
): Promise<void> {
  switch (action) {
    case "tap": {
      const element = args.element as Record<string, unknown> | undefined;
      if (element?.coordinates) {
        const coords = element.coordinates as { x: number; y: number };
        await run("adb", ["-s", deviceId, "shell", "input", "tap", String(coords.x), String(coords.y)]);
      } else if (element?.text) {
        // Use UI Automator to find by text
        await androidTapByText(deviceId, element.text as string);
      }
      await sleep(500);
      break;
    }
    case "type": {
      const text = args.input_text as string;
      if (text) {
        // Escape special characters for adb shell input
        const escaped = text.replace(/ /g, "%s").replace(/'/g, "\\'");
        await run("adb", ["-s", deviceId, "shell", "input", "text", escaped]);
      }
      break;
    }
    case "scroll": {
      const direction = args.direction as string ?? "down";
      const [x1, y1, x2, y2] =
        direction === "down" ? [540, 1500, 540, 500] : [540, 500, 540, 1500];
      await run("adb", [
        "-s", deviceId, "shell", "input", "swipe",
        String(x1), String(y1), String(x2), String(y2), "300",
      ]);
      await sleep(300);
      break;
    }
    case "swipe": {
      const direction = args.direction as string ?? "left";
      const swipes: Record<string, [number, number, number, number]> = {
        left: [900, 960, 100, 960],
        right: [100, 960, 900, 960],
        up: [540, 1500, 540, 500],
        down: [540, 500, 540, 1500],
      };
      const [x1, y1, x2, y2] = swipes[direction] ?? swipes.left;
      await run("adb", [
        "-s", deviceId, "shell", "input", "swipe",
        String(x1), String(y1), String(x2), String(y2), "200",
      ]);
      await sleep(300);
      break;
    }
    case "back": {
      await run("adb", ["-s", deviceId, "shell", "input", "keyevent", "4"]);
      await sleep(300);
      break;
    }
    case "wait": {
      const duration = (args.duration_ms as number) ?? 1000;
      await sleep(duration);
      break;
    }
    case "deep_link": {
      const url = args.url as string;
      if (url) {
        await run("adb", [
          "-s", deviceId, "shell", "am", "start",
          "-a", "android.intent.action.VIEW",
          "-d", url,
        ]);
        await sleep(1000);
      }
      break;
    }
  }
}

async function androidTapByText(deviceId: string, text: string): Promise<void> {
  // Dump UI hierarchy and find element by text
  await run("adb", ["-s", deviceId, "shell", "uiautomator", "dump", "/sdcard/ui.xml"]);
  const pullResult = await run("adb", ["-s", deviceId, "pull", "/sdcard/ui.xml", "/tmp/ui.xml"]);
  if (pullResult.exitCode !== 0) return;

  try {
    const xml = await readFile("/tmp/ui.xml", "utf-8");
    // Simple regex to find bounds of element with matching text
    const regex = new RegExp(
      `text="${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
      "i"
    );
    const match = xml.match(regex);
    if (match) {
      const cx = (parseInt(match[1]) + parseInt(match[3])) / 2;
      const cy = (parseInt(match[2]) + parseInt(match[4])) / 2;
      await run("adb", ["-s", deviceId, "shell", "input", "tap", String(cx), String(cy)]);
      return;
    }
  } catch {
    // fallback
  }

  throw new Error(`Could not find element with text "${text}"`);
}

async function getAndroidUIHierarchy(deviceId: string): Promise<Record<string, unknown>[]> {
  await run("adb", ["-s", deviceId, "shell", "uiautomator", "dump", "/sdcard/ui.xml"]);
  const result = await run("adb", ["-s", deviceId, "shell", "cat", "/sdcard/ui.xml"]);
  if (result.exitCode === 0 && result.stdout) {
    // Parse basic elements from XML
    const elements: Record<string, unknown>[] = [];
    const regex = /class="([^"]*)"[^>]*text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(result.stdout)) !== null) {
      elements.push({
        type: match[1].split(".").pop(),
        text: match[2],
        bounds: {
          x: parseInt(match[3]),
          y: parseInt(match[4]),
          width: parseInt(match[5]) - parseInt(match[3]),
          height: parseInt(match[6]) - parseInt(match[4]),
        },
      });
    }
    return elements;
  }
  return [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
