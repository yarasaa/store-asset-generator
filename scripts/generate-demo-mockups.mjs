#!/usr/bin/env node
import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs", "images");
await mkdir(outDir, { recursive: true });

// iPhone 16 Pro Max ratio — real phone proportions
const W = 430;
const H = 932;

const mockups = [
  {
    name: "demo-finance-dark",
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;background:linear-gradient(160deg,#0A0E27,#1a1040 50%,#0d1b3e);font-family:system-ui,-apple-system,sans-serif;position:relative}
.orb{position:absolute;border-radius:50%;filter:blur(50px)}
.o1{width:200px;height:200px;background:rgba(99,102,241,0.3);top:20px;left:-40px}
.o2{width:160px;height:160px;background:rgba(139,92,246,0.2);top:400px;right:-30px}
.o3{width:120px;height:120px;background:rgba(236,72,153,0.15);bottom:100px;left:40px}
.top-bar{display:flex;justify-content:space-between;padding:16px 24px 0;color:rgba(255,255,255,0.5);font-size:13px;font-weight:600;position:relative;z-index:2}
.headline{text-align:center;padding:24px 32px 0;position:relative;z-index:2}
.headline h1{font-family:Georgia,serif;font-size:28px;font-weight:900;color:#fff;line-height:1.15;letter-spacing:-0.5px}
.headline p{font-size:13px;color:rgba(255,255,255,0.45);margin-top:6px}
.content{padding:20px 20px 0;position:relative;z-index:2}
.card{background:linear-gradient(135deg,#6366F1,#8B5CF6);border-radius:20px;padding:20px}
.cl{color:rgba(255,255,255,0.7);font-size:12px}
.ca{color:#fff;font-size:36px;font-weight:800;margin-top:4px;letter-spacing:-1px}
.cc{color:#10B981;font-size:13px;margin-top:4px}
.acts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}
.act{background:rgba(255,255,255,0.06);border-radius:16px;padding:16px 4px;text-align:center}
.ai{width:36px;height:36px;border-radius:12px;background:rgba(99,102,241,0.2);margin:0 auto 6px;display:flex;align-items:center;justify-content:center;color:#818CF8;font-size:16px}
.al{color:rgba(255,255,255,0.55);font-size:11px}
.txs{margin-top:18px}
.txh{display:flex;justify-content:space-between;margin-bottom:12px}
.txt{color:#fff;font-size:16px;font-weight:700}
.txa{color:#818CF8;font-size:12px}
.txi{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.06)}
.tic{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.tn{color:#fff;font-size:14px;font-weight:600}
.td{color:rgba(255,255,255,0.35);font-size:11px;margin-top:2px}
.ta{margin-left:auto;font-size:14px;font-weight:700}
.tp{color:#10B981}.tm{color:#EF4444}
.nav{position:absolute;bottom:0;left:0;right:0;height:80px;background:rgba(10,14,39,0.9);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-around;align-items:center;padding-bottom:16px;z-index:3}
.nav-item{text-align:center;color:rgba(255,255,255,0.35);font-size:10px}
.nav-item.active{color:#818CF8}
.nav-icon{font-size:20px;margin-bottom:2px}
</style></head>
<body>
<div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
<div class="top-bar"><span>9:41</span><span>&#128267; 100%</span></div>
<div class="headline"><h1>Your Money,<br/>At Your Command</h1><p>Smart banking for the modern world</p></div>
<div class="content">
<div class="card"><div class="cl">Total Balance</div><div class="ca">$24,562.80</div><div class="cc">&#9650; +2.4% this month</div></div>
<div class="acts">
<div class="act"><div class="ai">&#8593;</div><div class="al">Send</div></div>
<div class="act"><div class="ai">&#8595;</div><div class="al">Receive</div></div>
<div class="act"><div class="ai">&#9733;</div><div class="al">Invest</div></div>
<div class="act"><div class="ai">&#8801;</div><div class="al">More</div></div>
</div>
<div class="txs"><div class="txh"><span class="txt">Recent</span><span class="txa">See All &#8250;</span></div>
<div class="txi"><div class="tic" style="background:rgba(16,185,129,0.15)">&#9733;</div><div><div class="tn">Salary Deposit</div><div class="td">Today, 09:00</div></div><div class="ta tp">+$4,200</div></div>
<div class="txi"><div class="tic" style="background:rgba(239,68,68,0.12)">&#9829;</div><div><div class="tn">Spotify Premium</div><div class="td">Yesterday</div></div><div class="ta tm">-$9.99</div></div>
<div class="txi"><div class="tic" style="background:rgba(239,68,68,0.12)">&#9670;</div><div><div class="tn">Amazon</div><div class="td">Mar 28</div></div><div class="ta tm">-$156.40</div></div>
<div class="txi"><div class="tic" style="background:rgba(16,185,129,0.15)">&#8635;</div><div><div class="tn">Refund - Nike</div><div class="td">Mar 26</div></div><div class="ta tp">+$89.00</div></div>
</div></div>
<div class="nav">
<div class="nav-item active"><div class="nav-icon">&#9750;</div>Home</div>
<div class="nav-item"><div class="nav-icon">&#9776;</div>Cards</div>
<div class="nav-item"><div class="nav-icon">&#8635;</div>Transfer</div>
<div class="nav-item"><div class="nav-icon">&#9881;</div>Settings</div>
</div>
</body></html>`,
  },
  {
    name: "demo-health-light",
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;background:#F0FDF4;font-family:system-ui,-apple-system,sans-serif;position:relative}
.bg-shape{position:absolute;border-radius:50%;opacity:0.5}
.s1{width:300px;height:300px;background:radial-gradient(circle,#D1FAE5,transparent 70%);top:-80px;right:-80px}
.s2{width:200px;height:200px;background:radial-gradient(circle,#A7F3D0,transparent 70%);bottom:120px;left:-60px}
.top-bar{display:flex;justify-content:space-between;padding:16px 24px 0;color:#374151;font-size:13px;font-weight:600;position:relative;z-index:2}
.header{padding:20px 24px 0;position:relative;z-index:2}
.header h1{font-size:26px;font-weight:800;color:#064E3B}
.header p{font-size:13px;color:#6B7280;margin-top:2px}
.content{padding:16px 20px 0;position:relative;z-index:2}
.stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.stat{background:#fff;border-radius:16px;padding:16px 12px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.sv{font-size:22px;font-weight:800;color:#111}
.su{font-size:11px;color:#10B981;font-weight:700}
.sl{font-size:10px;color:#9CA3AF;margin-top:2px}
.goal{display:flex;align-items:center;gap:16px;margin-top:14px;background:#fff;border-radius:18px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.ring{width:72px;height:72px;border-radius:50%;border:8px solid #D1FAE5;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ring::after{content:'';position:absolute;inset:-3px;border-radius:50%;border:8px solid transparent;border-top-color:#10B981;border-right-color:#10B981;border-bottom-color:#10B981;transform:rotate(20deg)}
.rp{font-size:20px;font-weight:900;color:#064E3B}
.gi h3{font-size:16px;font-weight:700;color:#064E3B}
.gi p{font-size:12px;color:#6B7280;margin-top:2px}
.section-h{display:flex;justify-content:space-between;margin-top:18px;margin-bottom:10px}
.sh-t{font-size:16px;font-weight:700;color:#111}
.sh-l{font-size:12px;color:#10B981;font-weight:600}
.workout{display:flex;align-items:center;gap:12px;background:#fff;border-radius:14px;padding:14px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.03)}
.wic{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.wn{font-size:14px;font-weight:600;color:#111}
.wm{font-size:11px;color:#9CA3AF;margin-top:1px}
.wcal{margin-left:auto;font-size:13px;font-weight:700;color:#10B981}
.chart-card{background:#fff;border-radius:16px;padding:16px;margin-top:10px;box-shadow:0 1px 3px rgba(0,0,0,0.03)}
.chart-title{font-size:14px;font-weight:700;color:#111;margin-bottom:12px}
.bars{display:flex;align-items:end;gap:8px;height:80px}
.bar{flex:1;border-radius:6px 6px 0 0;background:#D1FAE5;position:relative}
.bar.active{background:#10B981}
.bar-label{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:9px;color:#9CA3AF}
.nav{position:absolute;bottom:0;left:0;right:0;height:76px;background:rgba(255,255,255,0.95);backdrop-filter:blur(20px);border-top:1px solid #E5E7EB;display:flex;justify-content:space-around;align-items:center;padding-bottom:16px;z-index:3}
.nav-item{text-align:center;color:#9CA3AF;font-size:10px}
.nav-item.active{color:#10B981}
.nav-icon{font-size:20px;margin-bottom:2px}
</style></head>
<body>
<div class="bg-shape s1"></div><div class="bg-shape s2"></div>
<div class="top-bar"><span>9:41</span><span>&#128267; 100%</span></div>
<div class="header"><h1>Good morning, Alex &#128075;</h1><p>Let's crush your goals today</p></div>
<div class="content">
<div class="stats">
<div class="stat"><div class="sv">8,432</div><div class="su">steps</div><div class="sl">Steps</div></div>
<div class="stat"><div class="sv">6.2</div><div class="su">km</div><div class="sl">Distance</div></div>
<div class="stat"><div class="sv">486</div><div class="su">cal</div><div class="sl">Burned</div></div>
</div>
<div class="goal"><div class="ring"><span class="rp">78%</span></div><div class="gi"><h3>Daily Goal</h3><p>2,568 steps to go. You got this!</p></div></div>
<div class="section-h"><span class="sh-t">Today's Workouts</span><span class="sh-l">See All &#8250;</span></div>
<div class="workout"><div class="wic" style="background:#ECFDF5">&#127939;</div><div><div class="wn">Morning Run</div><div class="wm">30 min &middot; 5.2 km</div></div><div class="wcal">320 cal</div></div>
<div class="workout"><div class="wic" style="background:#EFF6FF">&#129495;</div><div><div class="wn">Yoga Flow</div><div class="wm">20 min &middot; Flexibility</div></div><div class="wcal">166 cal</div></div>
<div class="chart-card">
<div class="chart-title">Weekly Activity</div>
<div class="bars">
<div class="bar" style="height:45%"><span class="bar-label">M</span></div>
<div class="bar" style="height:70%"><span class="bar-label">T</span></div>
<div class="bar" style="height:55%"><span class="bar-label">W</span></div>
<div class="bar" style="height:85%"><span class="bar-label">T</span></div>
<div class="bar" style="height:60%"><span class="bar-label">F</span></div>
<div class="bar active" style="height:90%"><span class="bar-label">S</span></div>
<div class="bar" style="height:30%"><span class="bar-label">S</span></div>
</div>
</div>
</div>
<div class="nav">
<div class="nav-item active"><div class="nav-icon">&#9750;</div>Home</div>
<div class="nav-item"><div class="nav-icon">&#128200;</div>Stats</div>
<div class="nav-item"><div class="nav-icon">&#128170;</div>Workout</div>
<div class="nav-item"><div class="nav-icon">&#128100;</div>Profile</div>
</div>
</body></html>`,
  },
  {
    name: "demo-ecommerce-bold",
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;background:#FAFAFA;font-family:system-ui,-apple-system,sans-serif;position:relative}
.top-bg{position:absolute;top:0;left:0;right:0;height:280px;background:linear-gradient(155deg,#FF6B35,#F7931E 40%,#FF4E50 80%,#C62368);z-index:0}
.top-bg .c1{position:absolute;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.08);top:-40px;right:-40px}
.top-bar{display:flex;justify-content:space-between;padding:16px 24px 0;color:#fff;font-size:13px;font-weight:600;position:relative;z-index:2}
.header{padding:16px 24px 0;position:relative;z-index:2}
.header h1{font-size:24px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:-0.5px}
.header p{font-size:13px;color:rgba(255,255,255,0.7);margin-top:2px}
.content{padding:14px 16px 0;position:relative;z-index:2}
.search{background:#fff;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:8px;font-size:13px;color:#9CA3AF;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
.cats{display:flex;gap:8px;margin-top:12px;overflow:hidden}
.cat{background:#fff;border:1.5px solid #E5E7EB;border-radius:12px;padding:8px 16px;font-size:12px;font-weight:600;color:#374151;white-space:nowrap}
.cat.active{background:#FF6B35;border-color:#FF6B35;color:#fff}
.prods{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.prod{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.05)}
.pi{height:120px;display:flex;align-items:center;justify-content:center;font-size:44px}
.pinfo{padding:12px}
.pn{font-size:13px;font-weight:700;color:#111}
.pp{font-size:16px;font-weight:800;color:#FF6B35;margin-top:4px}
.pr{font-size:10px;color:#F59E0B;margin-top:2px}
.banner{margin-top:12px;background:linear-gradient(135deg,#FF6B35,#FF4E50);border-radius:16px;padding:18px;display:flex;justify-content:space-between;align-items:center}
.bt{color:#fff;font-size:16px;font-weight:800}
.bs{color:rgba(255,255,255,0.8);font-size:11px;margin-top:2px}
.bb{background:#fff;color:#FF6B35;font-size:12px;font-weight:800;padding:10px 20px;border-radius:10px}
.trending{margin-top:14px}
.tr-h{font-size:16px;font-weight:700;color:#111;margin-bottom:10px}
.tr-item{display:flex;align-items:center;gap:12px;background:#fff;border-radius:14px;padding:12px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.03)}
.tr-img{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0}
.tr-name{font-size:13px;font-weight:600;color:#111}
.tr-meta{font-size:11px;color:#9CA3AF;margin-top:1px}
.tr-price{margin-left:auto;font-size:14px;font-weight:800;color:#FF6B35}
.nav{position:absolute;bottom:0;left:0;right:0;height:76px;background:rgba(255,255,255,0.95);backdrop-filter:blur(20px);border-top:1px solid #E5E7EB;display:flex;justify-content:space-around;align-items:center;padding-bottom:16px;z-index:3}
.nav-item{text-align:center;color:#9CA3AF;font-size:10px}
.nav-item.active{color:#FF6B35}
.nav-icon{font-size:20px;margin-bottom:2px}
</style></head>
<body>
<div class="top-bg"><div class="c1"></div></div>
<div class="top-bar"><span>9:41</span><span>&#128267; 100%</span></div>
<div class="header"><h1>Shop What You Love</h1><p>Endless aisles, one tap away</p></div>
<div class="content">
<div class="search">&#128269; Search products...</div>
<div class="cats"><div class="cat active">All</div><div class="cat">Shoes</div><div class="cat">Bags</div><div class="cat">Watches</div><div class="cat">Jewelry</div></div>
<div class="prods">
<div class="prod"><div class="pi" style="background:#FFF7ED">&#128094;</div><div class="pinfo"><div class="pn">Classic Sneakers</div><div class="pp">$129.99</div><div class="pr">&#9733;&#9733;&#9733;&#9733;&#9733; 4.8</div></div></div>
<div class="prod"><div class="pi" style="background:#EFF6FF">&#128092;</div><div class="pinfo"><div class="pn">Leather Bag</div><div class="pp">$249.00</div><div class="pr">&#9733;&#9733;&#9733;&#9733;&#9734; 4.5</div></div></div>
<div class="prod"><div class="pi" style="background:#F0FDF4">&#9201;</div><div class="pinfo"><div class="pn">Smart Watch</div><div class="pp">$399.99</div><div class="pr">&#9733;&#9733;&#9733;&#9733;&#9733; 4.9</div></div></div>
<div class="prod"><div class="pi" style="background:#FDF2F8">&#128142;</div><div class="pinfo"><div class="pn">Gold Ring</div><div class="pp">$189.50</div><div class="pr">&#9733;&#9733;&#9733;&#9733;&#9734; 4.6</div></div></div>
</div>
<div class="banner"><div><div class="bt">Summer Sale &#127774;</div><div class="bs">Up to 50% off everything</div></div><div class="bb">Shop Now</div></div>
</div>
<div class="nav">
<div class="nav-item active"><div class="nav-icon">&#9750;</div>Home</div>
<div class="nav-item"><div class="nav-icon">&#128269;</div>Search</div>
<div class="nav-item"><div class="nav-icon">&#128722;</div>Cart</div>
<div class="nav-item"><div class="nav-icon">&#128100;</div>Profile</div>
</div>
</body></html>`,
  },
];

console.log("Launching Puppeteer...");
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

for (const m of mockups) {
  console.log(`Rendering ${m.name}...`);
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  await page.setContent(m.html, { waitUntil: "domcontentloaded", timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: join(outDir, `${m.name}.png`), type: "png" });
  await page.close();
  console.log(`  ✓ ${m.name}.png`);
}

await browser.close();
console.log("Done!");
