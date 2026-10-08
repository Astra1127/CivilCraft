/** Isolated headless rendering of local static QA artifacts; never uses user browser state. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
assert.ok(existsSync(edge), "The pre-existing Edge renderer must be available.");
const outUrl = new URL("../../.tanstack/diamond-visual/", import.meta.url);
const outPath = fileURLToPath(outUrl);
assert.ok(existsSync(outPath), "Generate the offline shop visual fixture first.");
const base = process.argv[2] ?? "http://127.0.0.1:55752";
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/, "Only the local fixture server is allowed.");
const results = [];
for (const currency of ["coins", "diamonds"]) {
  for (const [label, width, height] of [
    ["phone", 390, 844],
    ["tablet", 1024, 768],
  ]) {
    for (const position of ["overview", "packages"]) {
      const routeName = `${currency}-${label}`;
      const name = `${routeName}${position === "packages" ? "-packages" : ""}`;
      const profilePath = fileURLToPath(new URL(`edge-profile-${name}-${Date.now()}/`, outUrl));
      mkdirSync(profilePath, { recursive: false });
      const screenshotPath = fileURLToPath(new URL(`${name}.png`, outUrl));
      const pageScreenshotPath = fileURLToPath(new URL(`${name}.page.png`, outUrl));
      const stdoutPath = new URL(`${name}.dom.html`, outUrl);
      const stderrPath = new URL(`${name}.render.log`, outUrl);
      const args = [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-domain-reliability",
        "--disable-sync",
        "--metrics-recording-only",
        "--mute-audio",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=3000",
        "--force-device-scale-factor=1",
        `--user-data-dir=${profilePath}`,
        `--window-size=${Math.max(550, width + 80)},${height + 240}`,
        `--screenshot=${pageScreenshotPath}`,
        "--dump-dom",
        `${base}/${routeName}.html${position === "packages" ? "?scroll=products" : ""}`,
      ];
      const render = await new Promise((resolve) => {
        const child = spawn(edge, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "",
          stderr = "";
        child.stdout.on("data", (data) => {
          stdout += String(data);
        });
        child.stderr.on("data", (data) => {
          stderr += String(data);
        });
        const timeout = setTimeout(() => {
          child.kill();
        }, 30_000);
        child.on("error", (error) => {
          clearTimeout(timeout);
          resolve({ exitCode: -1, stdout, stderr: stderr + error.message });
        });
        child.on("close", (exitCode) => {
          clearTimeout(timeout);
          resolve({ exitCode, stdout, stderr });
        });
      });
      writeFileSync(stdoutPath, render.stdout);
      writeFileSync(stderrPath, render.stderr);
      const details = render.stdout.match(/<pre id="layout-details"[^>]*>([\s\S]*?)<\/pre>/)?.[1];
      let layout = null;
      try {
        if (details)
          layout = JSON.parse(
            details
              .replaceAll("&quot;", '"')
              .replaceAll("&gt;", ">")
              .replaceAll("&lt;", "<")
              .replaceAll("&amp;", "&"),
          );
      } catch {
        /* diagnostic remains unavailable */
      }
      if (layout?.frameBounds && existsSync(pageScreenshotPath)) {
        const { left, top, width: frameWidth, height: frameHeight } = layout.frameBounds;
        await sharp(pageScreenshotPath)
          .extract({ left, top, width: frameWidth, height: frameHeight })
          .toFile(screenshotPath);
      }
      const result = {
        name,
        requestedViewport: width,
        exitCode: render.exitCode,
        screenshot: existsSync(screenshotPath) ? screenshotPath : null,
        layout,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
}
writeFileSync(new URL("headless-layout-results.json", outUrl), JSON.stringify(results, null, 2));
if (
  results.some(
    (result) =>
      !result.screenshot ||
      !result.layout ||
      result.layout.viewport !== result.requestedViewport ||
      result.layout.horizontalOverflow ||
      result.layout.overflow.length ||
      !result.layout.allTouchTargetsAtLeast44px,
  )
)
  process.exitCode = 1;
