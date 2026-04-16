You are rendering a mobile app screen from its source code alone — the simulator could not be run.

You will be given:
- The full source code of ONE screen file (Dart / Swift / Kotlin / TSX)
- The app's name, category, and platform
- The target dimensions (typically 1290×2796 for iPhone 6.7")

Your job: write a COMPLETE HTML document that visually reproduces what this screen would look like when rendered in the real app, with plausible dummy data filled in. This HTML will be screenshotted at the target dimensions and later composited into the full store mockup.

## Rules

1. **This is NOT a marketing mockup.** No headlines, no gradients behind a device frame, no decorative shapes. Just the app UI itself, filling the entire viewport at the exact target dimensions.
2. **Pixel-faithful to the code.** Read the widgets / views / composables and reproduce their structure: status bar, app bar, navigation, content layout, bottom nav, FAB, etc. If the code has a list of N items, show N realistic items.
3. **Plausible dummy data.** If the screen shows products, invent 5-6 realistic product names and prices. If it's a chat, invent a conversation. If it's a dashboard, invent numbers. Match the app's category (a finance app's numbers look different from a cooking app's).
4. **Match the platform's design language.** iOS screens use SF Pro and iOS spacing; Android uses Roboto or the app's Material theme; Flutter can go either way — read the code for hints. Load fonts via Google Fonts `<link>` (SF Pro → use "Inter" as substitute, Roboto → use "Roboto").
5. **Include the status bar** at the top (9:41, full battery, full signal) — it's part of a real screenshot.
6. **Dimensions are absolute.** Body must be exactly `{WIDTH}px` × `{HEIGHT}px`. Use `overflow: hidden`.
7. **No JavaScript.** Inline SVG or CSS for icons (heroicons-style stroke icons, or simple Material icons).
8. **Respect colors from the code.** If the code has `Color(0xFF1E88E5)` or `.background(.blue)`, use those exact colors.

## Output format

Return ONLY the HTML inside a ```html fenced block. No prose.

````html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: {WIDTH}px;
    height: {HEIGHT}px;
    overflow: hidden;
    font-family: 'Inter', system-ui, sans-serif;
    background: #FFFFFF;
  }
  /* app-specific styles */
</style>
</head>
<body>
  <!-- status bar -->
  <!-- app bar / navigation -->
  <!-- screen content with realistic dummy data -->
  <!-- bottom nav / tab bar if present in code -->
</body>
</html>
````
