import { run, commandExists } from "../utils/shell.js";
import type { DeviceInfo } from "../types.js";

export async function simulatorControl(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const action = args.action as string;
  const platform = args.platform as "ios" | "android";

  if (platform === "ios") {
    return iosSimulator(action, args);
  } else {
    return androidEmulator(action, args);
  }
}

// ── iOS (xcrun simctl) ──

async function iosSimulator(
  action: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!(await commandExists("xcrun"))) {
    throw new Error("Xcode command-line tools not found. Run: xcode-select --install");
  }

  switch (action) {
    case "list":
      return iosListDevices();
    case "boot":
      return iosBoot(args);
    case "shutdown":
      return iosShutdown(args);
    case "install":
      return iosInstall(args);
    case "launch":
      return iosLaunch(args);
    case "reset":
      return iosReset(args);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function iosListDevices(): Promise<Record<string, unknown>> {
  const result = await run("xcrun", ["simctl", "list", "devices", "available", "--json"]);
  if (result.exitCode !== 0) {
    throw new Error(`simctl list failed: ${result.stderr}`);
  }

  const data = JSON.parse(result.stdout);
  const devices: DeviceInfo[] = [];

  for (const [runtime, deviceList] of Object.entries(data.devices) as [string, any[]][]) {
    if (!runtime.includes("iOS")) continue;
    const osVersion = runtime.replace(/.*iOS-/, "iOS ").replace(/-/g, ".");

    for (const d of deviceList) {
      devices.push({
        device_id: d.udid,
        device_name: d.name,
        os_version: osVersion,
        screen_size: getIOSScreenSize(d.name),
        status: d.state?.toLowerCase() === "booted" ? "booted" : "shutdown",
        platform: "ios",
      });
    }
  }

  // Sort: booted first, then by name
  devices.sort((a, b) => {
    if (a.status === "booted" && b.status !== "booted") return -1;
    if (b.status === "booted" && a.status !== "booted") return 1;
    return a.device_name.localeCompare(b.device_name);
  });

  return { devices, count: devices.length };
}

async function iosBoot(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deviceId = await resolveIOSDevice(args);

  const result = await run("xcrun", ["simctl", "boot", deviceId]);
  if (result.exitCode !== 0 && !result.stderr.includes("current state: Booted")) {
    throw new Error(`Failed to boot simulator: ${result.stderr}`);
  }

  // Open Simulator.app so user can see what's happening
  await run("open", ["-a", "Simulator"]);

  // Wait for boot
  await waitForBoot(deviceId);

  return {
    success: true,
    device_id: deviceId,
    status: "booted",
  };
}

async function iosShutdown(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deviceId = await resolveIOSDevice(args);
  const result = await run("xcrun", ["simctl", "shutdown", deviceId]);
  return {
    success: result.exitCode === 0 || result.stderr.includes("current state: Shutdown"),
    device_id: deviceId,
    status: "shutdown",
  };
}

async function iosInstall(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deviceId = await resolveIOSDevice(args);
  const appPath = args.app_path as string;
  if (!appPath) throw new Error("app_path is required for install action");

  const result = await run("xcrun", ["simctl", "install", deviceId, appPath]);
  if (result.exitCode !== 0) {
    throw new Error(`Install failed: ${result.stderr}`);
  }

  return { success: true, device_id: deviceId, app_path: appPath };
}

async function iosLaunch(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deviceId = await resolveIOSDevice(args);
  const bundleId = args.bundle_id as string;
  if (!bundleId) throw new Error("bundle_id is required for launch action");

  const result = await run("xcrun", ["simctl", "launch", deviceId, bundleId]);
  if (result.exitCode !== 0) {
    throw new Error(`Launch failed: ${result.stderr}`);
  }

  // Wait for app to stabilize
  await sleep(2000);

  return {
    success: true,
    device_id: deviceId,
    bundle_id: bundleId,
    pid: result.stdout.match(/(\d+)/)?.[1] ?? "unknown",
  };
}

async function iosReset(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deviceId = await resolveIOSDevice(args);
  await run("xcrun", ["simctl", "shutdown", deviceId]);
  const result = await run("xcrun", ["simctl", "erase", deviceId]);
  return { success: result.exitCode === 0, device_id: deviceId };
}

async function resolveIOSDevice(args: Record<string, unknown>): Promise<string> {
  if (args.device_id) return args.device_id as string;

  const deviceName = args.device_name as string;
  if (!deviceName) {
    throw new Error("Either device_id or device_name is required");
  }

  // Search by name
  const { devices } = (await iosListDevices()) as { devices: DeviceInfo[] };
  const match = devices.find(
    (d) => d.device_name.toLowerCase() === deviceName.toLowerCase()
  );
  if (!match) {
    const available = devices.map((d) => d.device_name).join(", ");
    throw new Error(
      `Device "${deviceName}" not found. Available: ${available}`
    );
  }
  return match.device_id;
}

async function waitForBoot(deviceId: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await run("xcrun", [
      "simctl",
      "spawn",
      deviceId,
      "launchctl",
      "print",
      "system",
    ]);
    if (result.exitCode === 0) return;
    await sleep(1000);
  }
  // Don't throw — boot might be slow but still working
}

// ── Android (adb / emulator) ──

async function androidEmulator(
  action: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (action) {
    case "list":
      return androidListDevices();
    case "boot":
      return androidBoot(args);
    case "shutdown":
      return androidShutdown(args);
    case "install":
      return androidInstall(args);
    case "launch":
      return androidLaunch(args);
    case "reset":
      return androidReset(args);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function androidListDevices(): Promise<Record<string, unknown>> {
  const devices: DeviceInfo[] = [];

  // Running emulators via adb
  if (await commandExists("adb")) {
    const result = await run("adb", ["devices", "-l"]);
    const lines = result.stdout.split("\n").filter((l) => l.includes("device "));
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const id = parts[0];
      const modelMatch = line.match(/model:(\S+)/);
      devices.push({
        device_id: id,
        device_name: modelMatch?.[1]?.replace(/_/g, " ") ?? id,
        os_version: "Android",
        screen_size: { width: 1080, height: 1920 },
        status: "booted",
        platform: "android",
      });
    }
  }

  // Available AVDs
  if (await commandExists("emulator")) {
    const result = await run("emulator", ["-list-avds"]);
    const avds = result.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const avd of avds) {
      if (!devices.some((d) => d.device_name === avd)) {
        devices.push({
          device_id: avd,
          device_name: avd,
          os_version: "Android",
          screen_size: { width: 1080, height: 1920 },
          status: "shutdown",
          platform: "android",
        });
      }
    }
  }

  return { devices, count: devices.length };
}

async function androidBoot(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deviceName = (args.device_id ?? args.device_name) as string;
  if (!deviceName) throw new Error("device_id or device_name is required");

  // Launch emulator in background
  run("emulator", ["-avd", deviceName, "-no-snapshot-load"], {
    timeout: 0, // don't wait
  }).catch(() => {}); // fire and forget

  // Wait for device to appear on adb
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    const result = await run("adb", ["wait-for-device"]);
    if (result.exitCode === 0) break;
    await sleep(2000);
  }

  await sleep(5000); // extra time for boot animation

  return { success: true, device_id: deviceName, status: "booted" };
}

async function androidShutdown(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deviceId = (args.device_id ?? "emulator-5554") as string;
  await run("adb", ["-s", deviceId, "emu", "kill"]);
  return { success: true, device_id: deviceId, status: "shutdown" };
}

async function androidInstall(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deviceId = (args.device_id ?? "emulator-5554") as string;
  const apkPath = args.app_path as string;
  if (!apkPath) throw new Error("app_path is required");

  const result = await run("adb", ["-s", deviceId, "install", "-r", apkPath]);
  if (result.exitCode !== 0) {
    throw new Error(`Install failed: ${result.stderr}`);
  }
  return { success: true, device_id: deviceId, app_path: apkPath };
}

async function androidLaunch(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deviceId = (args.device_id ?? "emulator-5554") as string;
  const bundleId = args.bundle_id as string;
  if (!bundleId) throw new Error("bundle_id is required");

  // Get launcher activity
  const result = await run("adb", [
    "-s",
    deviceId,
    "shell",
    "monkey",
    "-p",
    bundleId,
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  ]);

  await sleep(2000);

  return { success: true, device_id: deviceId, bundle_id: bundleId };
}

async function androidReset(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const deviceId = (args.device_id ?? "emulator-5554") as string;
  const bundleId = args.bundle_id as string;
  if (bundleId) {
    await run("adb", ["-s", deviceId, "shell", "pm", "clear", bundleId]);
  }
  return { success: true, device_id: deviceId };
}

// ── Helpers ──

function getIOSScreenSize(name: string): { width: number; height: number } {
  const sizes: Record<string, { width: number; height: number }> = {
    "iPhone 16 Pro Max": { width: 1290, height: 2796 },
    "iPhone 16 Pro": { width: 1179, height: 2556 },
    "iPhone 16 Plus": { width: 1290, height: 2796 },
    "iPhone 16": { width: 1179, height: 2556 },
    "iPhone 15 Pro Max": { width: 1290, height: 2796 },
    "iPhone 15 Pro": { width: 1179, height: 2556 },
    "iPhone 15": { width: 1179, height: 2556 },
    "iPhone 8 Plus": { width: 1242, height: 2208 },
    "iPad Pro (12.9-inch)": { width: 2048, height: 2732 },
    "iPad Pro 12.9-inch (6th generation)": { width: 2048, height: 2732 },
  };
  return sizes[name] ?? { width: 1179, height: 2556 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
