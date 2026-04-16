/**
 * detect.ts — smoke test with minimal Flutter fixture.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { detectProject } from "../src/tools/detect.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const FIXTURE_DIR = join(tmpdir(), `storekit-flutter-fixture-${Date.now()}`);

beforeAll(async () => {
  await mkdir(join(FIXTURE_DIR, "lib", "screens"), { recursive: true });

  await writeFile(
    join(FIXTURE_DIR, "pubspec.yaml"),
    `name: test_app
description: A test Flutter app
version: 1.2.3+45
environment:
  sdk: ">=3.0.0 <4.0.0"
dependencies:
  flutter:
    sdk: flutter
  http: ^1.0.0
`
  );

  await writeFile(
    join(FIXTURE_DIR, "lib", "screens", "home_screen.dart"),
    `import 'package:flutter/material.dart';

class HomeScreen extends StatefulWidget {
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
      future: fetchData(),
      builder: (ctx, snap) => Scaffold(body: Center(child: Text('Home'))),
    );
  }
}
`
  );

  await writeFile(
    join(FIXTURE_DIR, "lib", "screens", "login_screen.dart"),
    `import 'package:flutter/material.dart';

class LoginScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(body: Center(child: Text('Login')));
  }
}
`
  );

  await writeFile(
    join(FIXTURE_DIR, "lib", "screens", "product_detail_screen.dart"),
    `import 'package:flutter/material.dart';

class ProductDetailScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(body: Center(child: Text('Detail')));
  }
}
`
  );
});

afterAll(async () => {
  await rm(FIXTURE_DIR, { recursive: true, force: true });
});

describe("detect_project — Flutter fixture", () => {
  it("detects platform, name, version, and screens", async () => {
    const result = await detectProject({ path: FIXTURE_DIR });

    expect(result.platform).toBe("flutter");
    expect(result.language).toBe("dart");
    expect(result.ui_framework).toBe("flutter");
    expect(result.project_name).toBe("test_app");
    expect(result.version).toBe("1.2.3+45");

    // Found all three screens
    const names = result.screens.map((s) => s.name);
    expect(names).toContain("HomeScreen");
    expect(names).toContain("LoginScreen");
    expect(names).toContain("ProductDetailScreen");

    // Home should rank higher than Login
    const home = result.screens.find((s) => s.name === "HomeScreen")!;
    const login = result.screens.find((s) => s.name === "LoginScreen")!;
    expect(home.estimated_importance).toBeGreaterThan(login.estimated_importance);

    // Home has a FutureBuilder → data dependency detected
    expect(home.has_data_dependency).toBe(true);
  });
});
