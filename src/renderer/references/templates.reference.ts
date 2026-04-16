import type { RenderParams, TemplateDefinition } from "./template-registry.js";

// ── Shared helpers ──

function fontImport(url?: string): string {
  if (!url) return "";
  return `<link rel="stylesheet" href="${url}" />`;
}

function grainSVG(opacity: number, size: number): string {
  return `<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:${opacity};mix-blend-mode:overlay">
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="${size}" numOctaves="4" stitchTiles="stitch"/></filter>
    <rect width="100%" height="100%" filter="url(#grain)"/>
  </svg>`;
}

function orbsHTML(orbs: { color: string; size: number; x: number; y: number; blur: number; opacity: number }[]): string {
  return orbs.map((o) =>
    `<div style="position:absolute;width:${o.size}%;aspect-ratio:1;background:${o.color};border-radius:50%;left:${o.x}%;top:${o.y}%;filter:blur(${o.blur}px);opacity:${o.opacity}"></div>`
  ).join("\n");
}

function dotsPattern(size: number, gap: number, color: string, opacity: number): string {
  return `<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:${opacity}">
    <pattern id="dots" x="0" y="0" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse">
      <circle cx="${gap / 2}" cy="${gap / 2}" r="${size}" fill="${color}"/>
    </pattern>
    <rect width="100%" height="100%" fill="url(#dots)"/>
  </svg>`;
}

function linesPattern(width: number, gap: number, color: string, opacity: number, angle: number): string {
  return `<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:${opacity};transform:rotate(${angle}deg)">
    <pattern id="lines" x="0" y="0" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="${gap}" y2="0" stroke="${color}" stroke-width="${width}"/>
    </pattern>
    <rect width="200%" height="200%" x="-50%" y="-50%" fill="url(#lines)"/>
  </svg>`;
}

function deviceFrame(p: RenderParams, customCSS?: string): string {
  const d = p.overrides?.device ?? p.template.defaults.device;
  const w = Math.round(p.width * d.scale * 0.55);
  const h = Math.round(w * 2.17); // phone aspect ratio
  const r = d.corner_radius;
  const bz = d.bezel_width;

  const shadow = d.shadow.enabled
    ? Array.from({ length: d.shadow.layers ?? 1 }, (_, i) => {
        const m = i + 1;
        return `${d.shadow.offset_x * m}px ${d.shadow.offset_y * m}px ${d.shadow.blur * m}px ${d.shadow.spread}px ${d.shadow.color}`;
      }).join(", ")
    : "none";

  const tiltTransform = d.tilt
    ? `perspective(1200px) rotateX(${d.tilt.x}deg) rotateY(${d.tilt.y}deg)`
    : "";

  const reflectionCSS = d.reflection
    ? `<div style="position:absolute;bottom:-${h + 10}px;left:0;width:100%;height:${h}px;transform:scaleY(-1);opacity:0.15;filter:blur(4px);overflow:hidden;border-radius:${r}px;mask-image:linear-gradient(to bottom,rgba(0,0,0,0.4),transparent 60%)">
         <img src="data:image/png;base64,${p.screenshot_base64}" style="width:100%;height:100%;object-fit:cover"/>
       </div>`
    : "";

  let frameHTML: string;

  switch (d.frame_style) {
    case "realistic":
      frameHTML = `
        <div class="device" style="position:relative;width:${w}px;height:${h}px;border-radius:${r}px;background:${d.frame_color};padding:${bz}px;box-shadow:${shadow};transform:${tiltTransform};${customCSS ?? ""}">
          <div style="width:100%;height:100%;border-radius:${Math.max(0, r - bz)}px;overflow:hidden;position:relative">
            <!-- Notch -->
            <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:35%;height:${Math.round(h * 0.035)}px;background:${d.frame_color};border-radius:0 0 ${Math.round(r * 0.4)}px ${Math.round(r * 0.4)}px;z-index:2"></div>
            <img src="data:image/png;base64,${p.screenshot_base64}" style="width:100%;height:100%;object-fit:cover;display:block"/>
          </div>
          <!-- Side button -->
          <div style="position:absolute;right:-3px;top:${Math.round(h * 0.22)}px;width:3px;height:${Math.round(h * 0.08)}px;background:${d.frame_color};border-radius:0 2px 2px 0"></div>
          ${reflectionCSS}
        </div>`;
      break;

    case "minimal":
      frameHTML = `
        <div class="device" style="position:relative;width:${w}px;height:${h}px;border-radius:${r}px;overflow:hidden;box-shadow:${shadow};transform:${tiltTransform};${customCSS ?? ""}">
          <img src="data:image/png;base64,${p.screenshot_base64}" style="width:100%;height:100%;object-fit:cover;display:block"/>
          ${reflectionCSS}
        </div>`;
      break;

    case "outline":
      frameHTML = `
        <div class="device" style="position:relative;width:${w}px;height:${h}px;border-radius:${r}px;overflow:hidden;border:2px solid ${d.frame_color};box-shadow:${shadow};transform:${tiltTransform};${customCSS ?? ""}">
          <img src="data:image/png;base64,${p.screenshot_base64}" style="width:100%;height:100%;object-fit:cover;display:block"/>
          ${reflectionCSS}
        </div>`;
      break;

    case "shadow-only":
      frameHTML = `
        <div class="device" style="position:relative;width:${w}px;height:${h}px;border-radius:${r}px;overflow:hidden;box-shadow:${shadow};transform:${tiltTransform};${customCSS ?? ""}">
          <img src="data:image/png;base64,${p.screenshot_base64}" style="width:100%;height:100%;object-fit:cover;display:block"/>
        </div>`;
      break;

    default: // none
      frameHTML = `
        <div class="device" style="position:relative;width:${w}px;height:${h}px;overflow:hidden;transform:${tiltTransform};${customCSS ?? ""}">
          <img src="data:image/png;base64,${p.screenshot_base64}" style="width:100%;height:100%;object-fit:cover;display:block"/>
        </div>`;
  }

  return frameHTML;
}

function textBlock(p: RenderParams): string {
  const t = p.overrides?.typography ?? p.template.defaults.typography;
  const l = p.overrides?.layout ?? p.template.defaults.layout;

  const headlineSize = Math.round(p.width * t.headline_size_ratio);
  const subSize = Math.round(p.width * t.subheadline_size_ratio);

  const headline = p.headline
    ? `<div style="font-family:'${t.headline_font}',system-ui,sans-serif;font-weight:${t.headline_weight};font-size:${headlineSize}px;color:${t.headline_color};letter-spacing:${t.headline_letter_spacing};line-height:${t.headline_line_height};text-align:${l.text_alignment};max-width:${l.text_max_width}%;${t.headline_text_transform ? `text-transform:${t.headline_text_transform}` : ""}">${esc(p.headline)}</div>`
    : "";

  const subheadline = p.subheadline
    ? `<div style="font-family:'${t.subheadline_font}',system-ui,sans-serif;font-weight:${t.subheadline_weight};font-size:${subSize}px;color:${t.subheadline_color};letter-spacing:${t.subheadline_letter_spacing};text-align:${l.text_alignment};max-width:${l.text_max_width}%;margin-top:${Math.round(p.height * 0.008)}px">${esc(p.subheadline)}</div>`
    : "";

  return `<div class="text-block">${headline}${subheadline}</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function baseHTML(p: RenderParams, bodyContent: string, extraHead = ""): string {
  const t = p.template.defaults.typography;
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
${fontImport(t.headline_font_url)}
${extraHead}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${p.width}px;height:${p.height}px;overflow:hidden;position:relative}
</style>
</head><body>
${bodyContent}
</body></html>`;
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 1: Aurora Gradient
// Animated mesh gradient with floating orbs — vibrant, modern
// ══════════════════════════════════════════════════════════════

export function auroraGradient(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;
  const l = p.overrides?.layout ?? p.template.defaults.layout;
  const eff = p.overrides?.effects ?? p.template.defaults.effects;

  return baseHTML(p, `
    <div style="position:absolute;inset:0;background:linear-gradient(${bg.angle ?? 135}deg,${bg.colors.join(",")})"></div>
    ${orbsHTML(eff.blur_orbs ?? [])}
    ${eff.grain ? grainSVG(eff.grain.opacity, eff.grain.size) : ""}
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:${l.content_alignment};padding:${l.padding.top}% ${l.padding.right}% ${l.padding.bottom}% ${l.padding.left}%">
      ${textBlock(p)}
      <div style="margin-top:${Math.round(p.height * 0.025)}px">
        ${deviceFrame(p)}
      </div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 2: Midnight Glass
// Dark glassmorphism with subtle glow — premium, fintech
// ══════════════════════════════════════════════════════════════

export function midnightGlass(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;
  const eff = p.overrides?.effects ?? p.template.defaults.effects;
  const l = p.overrides?.layout ?? p.template.defaults.layout;

  return baseHTML(p, `
    <div style="position:absolute;inset:0;background:#050508"></div>
    ${orbsHTML([
      { color: bg.colors[0] ?? "#6366F1", size: 50, x: 10, y: 20, blur: 120, opacity: 0.25 },
      { color: bg.colors[1] ?? "#8B5CF6", size: 40, x: 60, y: 60, blur: 100, opacity: 0.2 },
    ])}
    ${eff.grain ? grainSVG(eff.grain.opacity, eff.grain.size) : ""}
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${l.padding.top}% ${l.padding.right}% ${l.padding.bottom}% ${l.padding.left}%">
      ${textBlock(p)}
      <div style="margin-top:${Math.round(p.height * 0.03)}px;position:relative">
        <!-- Glass card behind device -->
        <div style="position:absolute;inset:-${Math.round(p.width * 0.03)}px;background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);border-radius:${Math.round(p.width * 0.04)}px;border:1px solid rgba(255,255,255,0.08)"></div>
        ${deviceFrame(p)}
      </div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 3: Zen Minimal
// Ultra-clean, generous whitespace — health, productivity
// ══════════════════════════════════════════════════════════════

export function zenMinimal(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;
  const l = p.overrides?.layout ?? p.template.defaults.layout;

  return baseHTML(p, `
    <div style="position:absolute;inset:0;background:${bg.colors[0] ?? "#FAFAF9"}"></div>
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${l.padding.top}% ${l.padding.right}% ${l.padding.bottom}% ${l.padding.left}%">
      ${textBlock(p)}
      <div style="margin-top:${Math.round(p.height * 0.03)}px">
        ${deviceFrame(p)}
      </div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 4: Bold Showcase
// Giant typography, device peeking from bottom — e-commerce
// ══════════════════════════════════════════════════════════════

export function boldShowcase(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;
  const eff = p.overrides?.effects ?? p.template.defaults.effects;
  const l = p.overrides?.layout ?? p.template.defaults.layout;

  return baseHTML(p, `
    <div style="position:absolute;inset:0;background:linear-gradient(${bg.angle ?? 160}deg,${bg.colors.join(",")})"></div>
    ${eff.grain ? grainSVG(eff.grain.opacity, eff.grain.size) : ""}
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;padding:${l.padding.top}% ${l.padding.right}% 0 ${l.padding.left}%">
      <div style="flex:0 0 auto">
        ${textBlock(p)}
      </div>
      <div style="flex:1;display:flex;align-items:flex-end;justify-content:center;overflow:hidden">
        ${deviceFrame(p, `transform:translateY(${Math.round(p.height * 0.06)}px)`)}
      </div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 5: Candy Pop
// Playful, rounded, colorful — social, entertainment
// ══════════════════════════════════════════════════════════════

export function candyPop(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;
  const eff = p.overrides?.effects ?? p.template.defaults.effects;
  const l = p.overrides?.layout ?? p.template.defaults.layout;

  return baseHTML(p, `
    <div style="position:absolute;inset:0;background:${bg.colors[0] ?? "#FEF3C7"}"></div>
    ${orbsHTML(eff.blur_orbs ?? [])}
    ${eff.dots_pattern ? dotsPattern(eff.dots_pattern.size, eff.dots_pattern.gap, eff.dots_pattern.color, eff.dots_pattern.opacity) : ""}
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${l.padding.top}% ${l.padding.right}% ${l.padding.bottom}% ${l.padding.left}%">
      ${p.badge_text ? `<div style="background:${bg.colors[1] ?? "#F59E0B"};color:#fff;font-family:system-ui;font-weight:700;font-size:${Math.round(p.width * 0.022)}px;padding:${Math.round(p.width * 0.012)}px ${Math.round(p.width * 0.03)}px;border-radius:999px;margin-bottom:${Math.round(p.height * 0.015)}px;letter-spacing:0.05em;text-transform:uppercase">${esc(p.badge_text)}</div>` : ""}
      ${textBlock(p)}
      <div style="margin-top:${Math.round(p.height * 0.025)}px;transform:rotate(-2deg)">
        ${deviceFrame(p)}
      </div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 6: Noir Elegance
// Pure black with gold/white accents — luxury, premium
// ══════════════════════════════════════════════════════════════

export function noirElegance(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;
  const eff = p.overrides?.effects ?? p.template.defaults.effects;
  const l = p.overrides?.layout ?? p.template.defaults.layout;

  return baseHTML(p, `
    <div style="position:absolute;inset:0;background:#0A0A0A"></div>
    ${eff.lines_pattern ? linesPattern(eff.lines_pattern.width, eff.lines_pattern.gap, eff.lines_pattern.color, eff.lines_pattern.opacity, eff.lines_pattern.angle) : ""}
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${l.padding.top}% ${l.padding.right}% ${l.padding.bottom}% ${l.padding.left}%">
      <!-- Thin accent line -->
      <div style="width:${Math.round(p.width * 0.08)}px;height:2px;background:${bg.colors[1] ?? "#D4AF37"};margin-bottom:${Math.round(p.height * 0.02)}px"></div>
      ${textBlock(p)}
      <div style="margin-top:${Math.round(p.height * 0.03)}px">
        ${deviceFrame(p)}
      </div>
      <!-- Bottom accent line -->
      <div style="width:${Math.round(p.width * 0.15)}px;height:1px;background:linear-gradient(90deg,transparent,${bg.colors[1] ?? "#D4AF37"},transparent);margin-top:${Math.round(p.height * 0.03)}px"></div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 7: Neon Glow
// Dark with vibrant neon borders — entertainment, gaming
// ══════════════════════════════════════════════════════════════

export function neonGlow(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;
  const l = p.overrides?.layout ?? p.template.defaults.layout;
  const glowColor = bg.colors[1] ?? "#22D3EE";

  return baseHTML(p, `
    <div style="position:absolute;inset:0;background:#0C0C14"></div>
    <!-- Grid background -->
    <svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.08">
      <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
        <path d="M60 0L0 0 0 60" fill="none" stroke="${glowColor}" stroke-width="0.5"/>
      </pattern>
      <rect width="100%" height="100%" fill="url(#grid)"/>
    </svg>
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${l.padding.top}% ${l.padding.right}% ${l.padding.bottom}% ${l.padding.left}%">
      ${textBlock(p)}
      <div style="margin-top:${Math.round(p.height * 0.025)}px;position:relative">
        <!-- Neon border glow -->
        <div style="position:absolute;inset:-4px;border-radius:${Math.round(p.width * 0.045)}px;border:2px solid ${glowColor};box-shadow:0 0 15px ${glowColor}66,0 0 40px ${glowColor}33,inset 0 0 15px ${glowColor}22"></div>
        ${deviceFrame(p)}
      </div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 8: Frost Blur
// Frosted glass over blurred screenshot — modern, clean
// ══════════════════════════════════════════════════════════════

export function frostBlur(p: RenderParams): string {
  const l = p.overrides?.layout ?? p.template.defaults.layout;
  const eff = p.overrides?.effects ?? p.template.defaults.effects;

  return baseHTML(p, `
    <!-- Blurred screenshot as background -->
    <div style="position:absolute;inset:-20px;background-image:url('data:image/png;base64,${p.screenshot_base64}');background-size:cover;background-position:center;filter:blur(50px) brightness(0.7) saturate(1.5);transform:scale(1.1)"></div>
    <!-- Frost overlay -->
    <div style="position:absolute;inset:0;background:rgba(255,255,255,0.15);backdrop-filter:blur(2px)"></div>
    ${eff.grain ? grainSVG(eff.grain.opacity, eff.grain.size) : ""}
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${l.padding.top}% ${l.padding.right}% ${l.padding.bottom}% ${l.padding.left}%">
      ${textBlock(p)}
      <div style="margin-top:${Math.round(p.height * 0.025)}px">
        ${deviceFrame(p)}
      </div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 9: Organic Wave
// Flowing curves and natural tones — health, travel, food
// ══════════════════════════════════════════════════════════════

export function organicWave(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;
  const l = p.overrides?.layout ?? p.template.defaults.layout;
  const c1 = bg.colors[0] ?? "#F0FDF4";
  const c2 = bg.colors[1] ?? "#22C55E";

  const waveY = Math.round(p.height * 0.55);

  return baseHTML(p, `
    <div style="position:absolute;inset:0;background:${c1}"></div>
    <!-- Organic wave shape -->
    <svg style="position:absolute;bottom:0;left:0;width:100%;height:55%" viewBox="0 0 ${p.width} ${Math.round(p.height * 0.55)}" preserveAspectRatio="none">
      <path d="M0,${Math.round(p.height * 0.08)} C${Math.round(p.width * 0.25)},0 ${Math.round(p.width * 0.5)},${Math.round(p.height * 0.15)} ${p.width},${Math.round(p.height * 0.06)} L${p.width},${Math.round(p.height * 0.55)} L0,${Math.round(p.height * 0.55)} Z" fill="${c2}" opacity="0.12"/>
      <path d="M0,${Math.round(p.height * 0.12)} C${Math.round(p.width * 0.35)},${Math.round(p.height * 0.04)} ${Math.round(p.width * 0.65)},${Math.round(p.height * 0.2)} ${p.width},${Math.round(p.height * 0.1)} L${p.width},${Math.round(p.height * 0.55)} L0,${Math.round(p.height * 0.55)} Z" fill="${c2}" opacity="0.08"/>
    </svg>
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${l.padding.top}% ${l.padding.right}% ${l.padding.bottom}% ${l.padding.left}%">
      ${textBlock(p)}
      <div style="margin-top:${Math.round(p.height * 0.025)}px">
        ${deviceFrame(p)}
      </div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 10: Editorial Stack
// Magazine-style layout, text left, device right
// ══════════════════════════════════════════════════════════════

export function editorialStack(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;
  const l = p.overrides?.layout ?? p.template.defaults.layout;

  return baseHTML(p, `
    <div style="position:absolute;inset:0;background:${bg.colors[0] ?? "#FFFFFF"}"></div>
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:row;align-items:center;padding:${l.padding.top}% ${l.padding.right}% ${l.padding.bottom}% ${l.padding.left}%">
      <div style="flex:0 0 42%;display:flex;flex-direction:column;justify-content:center;padding-right:5%">
        <!-- Accent bar -->
        <div style="width:${Math.round(p.width * 0.06)}px;height:4px;background:${bg.colors[1] ?? "#2563EB"};margin-bottom:${Math.round(p.height * 0.02)}px;border-radius:2px"></div>
        ${textBlock(p)}
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center">
        ${deviceFrame(p)}
      </div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 11: Panoramic Hero
// Full-width screenshot, text overlay at bottom — immersive
// ══════════════════════════════════════════════════════════════

export function panoramicHero(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;

  return baseHTML(p, `
    <!-- Full bleed screenshot -->
    <div style="position:absolute;inset:0">
      <img src="data:image/png;base64,${p.screenshot_base64}" style="width:100%;height:100%;object-fit:cover"/>
    </div>
    <!-- Bottom gradient overlay -->
    <div style="position:absolute;bottom:0;left:0;right:0;height:50%;background:linear-gradient(to top,${bg.colors[0] ?? "rgba(0,0,0,0.85)"},${"rgba(0,0,0,0)"})"></div>
    <!-- Text at bottom -->
    <div style="position:absolute;bottom:0;left:0;right:0;padding:0 8% 8%;z-index:1">
      ${textBlock(p)}
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE 12: Duo Showcase
// Two screenshots side by side — feature comparison
// ══════════════════════════════════════════════════════════════

export function duoShowcase(p: RenderParams): string {
  const bg = p.overrides?.background ?? p.template.defaults.background;
  const l = p.overrides?.layout ?? p.template.defaults.layout;
  const eff = p.overrides?.effects ?? p.template.defaults.effects;
  const d = p.overrides?.device ?? p.template.defaults.device;

  const deviceW = Math.round(p.width * d.scale * 0.4);
  const deviceH = Math.round(deviceW * 2.17);
  const r = d.corner_radius;
  const shadow = d.shadow.enabled
    ? `${d.shadow.offset_x}px ${d.shadow.offset_y}px ${d.shadow.blur}px ${d.shadow.color}`
    : "none";

  const secondScreenshot = p.second_screenshot_base64 ?? p.screenshot_base64;

  return baseHTML(p, `
    <div style="position:absolute;inset:0;background:linear-gradient(${bg.angle ?? 135}deg,${bg.colors.join(",")})"></div>
    ${eff.grain ? grainSVG(eff.grain.opacity, eff.grain.size) : ""}
    <div style="position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${l.padding.top}% ${l.padding.right}% ${l.padding.bottom}% ${l.padding.left}%">
      ${textBlock(p)}
      <div style="display:flex;gap:${Math.round(p.width * 0.04)}px;margin-top:${Math.round(p.height * 0.025)}px;align-items:center">
        <div style="width:${deviceW}px;height:${deviceH}px;border-radius:${r}px;overflow:hidden;box-shadow:${shadow};background:#000;border:${d.bezel_width}px solid ${d.frame_color};transform:rotate(-3deg)">
          <img src="data:image/png;base64,${p.screenshot_base64}" style="width:100%;height:100%;object-fit:cover"/>
        </div>
        <div style="width:${deviceW}px;height:${deviceH}px;border-radius:${r}px;overflow:hidden;box-shadow:${shadow};background:#000;border:${d.bezel_width}px solid ${d.frame_color};transform:rotate(3deg)">
          <img src="data:image/png;base64,${secondScreenshot}" style="width:100%;height:100%;object-fit:cover"/>
        </div>
      </div>
    </div>
  `);
}

// ══════════════════════════════════════════════════════════════
// Template map — export all renderers
// ══════════════════════════════════════════════════════════════

export const templateRenderers: Record<string, (p: RenderParams) => string> = {
  "aurora-gradient": auroraGradient,
  "midnight-glass": midnightGlass,
  "zen-minimal": zenMinimal,
  "bold-showcase": boldShowcase,
  "candy-pop": candyPop,
  "noir-elegance": noirElegance,
  "neon-glow": neonGlow,
  "frost-blur": frostBlur,
  "organic-wave": organicWave,
  "editorial-stack": editorialStack,
  "panoramic-hero": panoramicHero,
  "duo-showcase": duoShowcase,
  // Legacy aliases
  "clean-gradient": auroraGradient,
  "dark-premium": midnightGlass,
  "minimal-flat": zenMinimal,
  "bold-feature": boldShowcase,
  "side-by-side": duoShowcase,
};
