/** Offline visual QA only. Generated markup goes into ignored .tanstack, never a route. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import * as display from "../../src/lib/payments/shop-display.ts";
import * as products from "../../src/lib/payments/products.ts";
import * as sessionErrors from "../../src/lib/playfab/session-errors.ts";
import { playerNameDependencies } from "./player-name-ui.mjs";

const require = createRequire(import.meta.url);
const repoUrl = new URL("../../", import.meta.url);
const testUrl = new URL("../diamond-shop-ui.test.mjs", import.meta.url);
const outUrl = new URL(".tanstack/diamond-visual/", repoUrl);
const assetsUrl = new URL(".output/public/assets/", repoUrl);
const cssFile = readdirSync(assetsUrl).find((name) => /^styles-.*\.css$/.test(name));
assert.ok(cssFile, "Build the website first so its actual stylesheet is available.");
const cn = (...values) => twMerge(clsx(values));

function actualComponent(path) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, repoUrl), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    exports,
    require: (name) => (name === "@/lib/utils" ? { cn } : require(name)),
  });
  return exports;
}

const actualModules = {
  "lucide-react": require("lucide-react"),
  "@/components/ui/button": actualComponent("src/components/ui/button.tsx"),
  "@/components/site/SectionDivider": actualComponent("src/components/site/SectionDivider.tsx"),
  "@/lib/utils": { cn },
};

// Reuse the authenticated UI regression loader, overriding presentation-only mocks
// with the real Button, Divider, Lucide and class-merging implementations.
const testSource = readFileSync(testUrl, "utf8");
const start = testSource.indexOf("function load(path, options = {}) {");
const end = testSource.indexOf("async function mount(module) {");
assert.ok(start >= 0 && end > start, "The frontend loader must remain available.");
const loaderSource = testSource
  .slice(start, end)
  .replaceAll("import.meta.url", JSON.stringify(testUrl.href))
  .replace(
    "require: (name) => {",
    "require: (name) => { if (actualModules[name]) return actualModules[name];",
  );
const context = {
  require,
  React,
  display,
  products,
  sessionErrors,
  playerNameDependencies,
  actualModules,
  readFileSync,
  ts,
  runInNewContext,
  URL,
  AbortController,
  Error,
  element:
    (tag) =>
    ({ children, asChild, ...props }) =>
      React.createElement(tag, props, children),
  load: null,
};
runInNewContext(`${loaderSource}\nthis.load = load;`, context);
mkdirSync(outUrl, { recursive: true });

for (const currency of ["coins", "diamonds"]) {
  const module = context.load("../src/routes/dashboard.shop.tsx", {
    search: { currency },
    auth: {
      isAuthenticated: true,
      player: { playFabId: "MOCK-PLAYER-VISUAL-QA", displayName: "Sample Engineer" },
    },
    balances: { coins: 12345, diamonds: 500, diamondsAvailable: true },
    products: products.DEFAULT_PRODUCTS,
  });
  const markup = renderToStaticMarkup(React.createElement(module.Route.component));
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:"><title>${currency} shop — local mocked visual QA</title><link rel="stylesheet" href="/assets/${cssFile}"><script defer src="/qa-layout.js"></script></head><body><aside class="border-b-2 border-border bg-card px-4 py-3 text-center text-xs font-semibold"><p>LOCAL VISUAL QA · MOCK ACCOUNT · NO LIVE API OR CHECKOUT</p><output id="layout-check" class="block text-muted-foreground" aria-live="polite">Checking layout…</output></aside><main data-fixture-currency="${currency}">${markup}</main><details class="panel m-4 p-4"><summary>Layout diagnostics</summary><pre id="layout-details" class="whitespace-pre-wrap break-all text-xs"></pre></details></body></html>`;
  writeFileSync(new URL(`${currency}.html`, outUrl), html);
  for (const [size, width, height] of [
    ["phone", 390, 844],
    ["tablet", 1024, 768],
  ]) {
    const frame = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; connect-src 'none'"><title>${currency} ${size} — fixed-viewport local QA</title><link rel="stylesheet" href="/qa-frames.css"><script defer src="/qa-frame-layout.js"></script></head><body><h1>${currency} · ${width}×${height} ${size} fixture</h1><p>Local mock data only. Scroll inside the viewport to inspect every package.</p><iframe width="${width}" height="${height}" src="/${currency}.html" title="${width}px ${currency} storefront"></iframe><pre id="layout-details" hidden></pre></body></html>`;
    writeFileSync(new URL(`${currency}-${size}.html`, outUrl), frame);
  }
}

const script = `function reportLayout() {
  const viewport = window.innerWidth;
  const targets = [...document.querySelectorAll('main h1, main h2, main h3, main p, main button, main a')];
  const overflow = targets.filter(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && (bounds.right > viewport + 1 || bounds.left < -1 || element.scrollWidth > element.clientWidth + 1);
  }).map(element => ({ tag: element.tagName, text: element.textContent.trim().slice(0, 100), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  const buttons = [...document.querySelectorAll('main button')].map(element => ({ text: element.textContent.trim(), height: element.getBoundingClientRect().height }));
  const result = { currency: document.querySelector('main').dataset.fixtureCurrency, viewport, documentWidth: document.documentElement.scrollWidth, overflow, buttons, horizontalOverflow: document.documentElement.scrollWidth > viewport + 1, allTouchTargetsAtLeast44px: buttons.every(button => button.height >= 44) };
  window.shopVisualQA = result;
  document.getElementById('layout-check').textContent = viewport + 'px · ' + (result.horizontalOverflow || overflow.length ? 'OVERFLOW DETECTED' : 'No horizontal/text overflow') + ' · ' + (result.allTouchTargetsAtLeast44px ? 'Shop buttons ≥44px' : 'Small shop button detected');
  document.getElementById('layout-details').textContent = JSON.stringify(result, null, 2);
}
window.addEventListener('load', reportLayout);
window.addEventListener('resize', reportLayout);
document.fonts.ready.then(reportLayout);`;
writeFileSync(new URL("qa-layout.js", outUrl), script);
writeFileSync(
  new URL("qa-frame-layout.js", outUrl),
  `function reportFrameLayout() {
  const frame = document.querySelector('iframe');
  const diagnostics = frame.contentWindow.shopVisualQA;
  if (!diagnostics) return;
  if (new URL(window.location.href).searchParams.get('scroll') === 'products') {
    const packages = frame.contentDocument.querySelector('main .items-stretch');
    if (packages) frame.contentWindow.scrollTo(0, Math.max(0, packages.getBoundingClientRect().top + frame.contentWindow.scrollY - 30));
  }
  const bounds = frame.getBoundingClientRect();
  const result = { ...diagnostics, frameBounds: { left: Math.round(bounds.left), top: Math.round(bounds.top), width: Math.round(bounds.width), height: Math.round(bounds.height) } };
  document.getElementById('layout-details').textContent = JSON.stringify(result, null, 2);
}
window.addEventListener('load', reportFrameLayout);
window.addEventListener('resize', reportFrameLayout);
document.fonts.ready.then(reportFrameLayout);`,
);
writeFileSync(
  new URL("qa-frames.css", outUrl),
  "body{margin:16px;background:#e1dfda;color:#4a3428;font-family:system-ui,sans-serif}h1{font-size:18px;margin-bottom:4px}p{font-size:12px}iframe{display:block;border:0;background:#f3e7d1;box-shadow:0 2px 16px #0003}",
);

console.log(`Generated offline fixtures: ${fileURLToPath(outUrl)}`);
if (process.argv.includes("--serve")) {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const entry = path === "/" ? "diamonds.html" : path.slice(1);
    const fileUrl = [
      "diamonds.html",
      "coins.html",
      "diamonds-phone.html",
      "coins-phone.html",
      "diamonds-tablet.html",
      "coins-tablet.html",
      "qa-layout.js",
      "qa-frame-layout.js",
      "qa-frames.css",
    ].includes(entry)
      ? new URL(entry, outUrl)
      : path === `/assets/${cssFile}`
        ? new URL(cssFile, assetsUrl)
        : null;
    if (!fileUrl) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": entry.endsWith(".js")
        ? "text/javascript"
        : entry.endsWith(".css")
          ? "text/css"
          : "text/html",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(readFileSync(fileUrl));
  });
  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    console.log(`Diamonds: http://127.0.0.1:${port}/diamonds.html`);
    console.log(`Coins: http://127.0.0.1:${port}/coins.html`);
  });
}
