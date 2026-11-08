import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

const require = createRequire(import.meta.url);

function compile(filePath, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(new URL(filePath, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, { exports, require: (name) => imports[name] ?? require(name) });
  return exports;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { BrandMark } = compile("../src/components/site/BrandMark.tsx", {
  "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
});

test("BrandMark renders main_logo image without old text branding", () => {
  let tree;
  act(() => {
    tree = create(React.createElement(BrandMark));
  });
  const root = tree.root;
  const json = tree.toJSON();
  const serialized = JSON.stringify(json);

  // Must render an image tag
  const img = root.findByType("img");
  assert.ok(img, "Must render an <img> tag");
  assert.match(img.props.src, /main_logo\.png$/);
  assert.equal(img.props.alt, "Civil Craft");

  // Must preserve 3:2 original aspect ratio dimensions and containment
  assert.equal(img.props.width, 1536);
  assert.equal(img.props.height, 1024);
  assert.match(img.props.className, /object-contain/);

  // Must NOT contain old text branding
  assert.doesNotMatch(serialized, /Civil Craft: Bridge Edition/i);
  assert.doesNotMatch(serialized, /Bridge Edition/i);
});

test("Favicon assets exist in public folder with correct sizes and formats", () => {
  const expectedFiles = [
    { path: "public/favicon.ico", minSize: 1000 },
    { path: "public/favicon.png", minSize: 500 },
    { path: "public/favicon-16x16.png", minSize: 200 },
    { path: "public/favicon-32x32.png", minSize: 400 },
    { path: "public/favicon-192x192.png", minSize: 5000 },
    { path: "public/favicon-512x512.png", minSize: 10000 },
    { path: "public/apple-touch-icon.png", minSize: 5000 },
    { path: "public/site.webmanifest", minSize: 50 },
    { path: "public/images/branding/main_logo.png", minSize: 500000 },
    { path: "public/images/branding/app_logo.png", minSize: 500000 },
  ];

  for (const { path, minSize } of expectedFiles) {
    assert.ok(fs.existsSync(path), `Expected file ${path} to exist`);
    const stat = fs.statSync(path);
    assert.ok(
      stat.size >= minSize,
      `Expected ${path} size (${stat.size}) to be >= ${minSize} bytes`,
    );
  }

  // Verify site.webmanifest contents
  const manifest = JSON.parse(fs.readFileSync("public/site.webmanifest", "utf8"));
  assert.equal(manifest.name, "Civil Craft");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});

test("Root route head configuration references new favicon and manifest", () => {
  const rootContent = fs.readFileSync("src/routes/__root.tsx", "utf8");
  assert.match(rootContent, /favicon\.ico/);
  assert.match(rootContent, /favicon-16x16\.png/);
  assert.match(rootContent, /favicon-32x32\.png/);
  assert.match(rootContent, /apple-touch-icon\.png/);
  assert.match(rootContent, /site\.webmanifest/);
});
