import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(path, mocks) {
  const exports = {};
  runInNewContext(
    ts.transpileModule(readFileSync(new URL("../" + path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    { exports, require: (name) => mocks[name] ?? require(name) },
  );
  return exports;
}

// These adapters exercise component composition and dismissal wiring. Actual
// portal/focus-trap/outside-pointer behavior belongs to browser QA and Radix.
const context = React.createContext(null);
const primitives = {
  Dialog: ({ children }) => {
    const [open, setOpen] = React.useState(false);
    return React.createElement(context.Provider, { value: { open, setOpen } }, children);
  },
  DialogTrigger: ({ children }) => {
    const { setOpen } = React.useContext(context);
    return React.cloneElement(children, { onClick: () => setOpen(true) });
  },
  DialogPortal: ({ children }) => (React.useContext(context).open ? children : null),
  DialogOverlay: ({ children, ...props }) => React.createElement("overlay", props, children),
  DialogClose: ({ children }) => {
    const { setOpen } = React.useContext(context);
    return React.cloneElement(children, { onClick: () => setOpen(false) });
  },
  DialogTitle: ({ children, ...props }) => React.createElement("h2", props, children),
  DialogDescription: ({ children, ...props }) => React.createElement("p", props, children),
};
const Content = ({ children, ...props }) => {
  const { setOpen } = React.useContext(context);
  return React.createElement(
    "preview-dialog",
    {
      ...props,
      onOutside: () => setOpen(false),
      onEscape: (event) => {
        props.onEscapeKeyDown(event);
        if (!event.defaultPrevented) setOpen(false);
      },
    },
    children,
  );
};
const { IllustrationPreview } = load("src/components/dashboard/almanac/IllustrationPreview.tsx", {
  "@/components/ui/dialog": primitives,
  "@radix-ui/react-dialog": { Content },
  "lucide-react": { X: () => React.createElement("svg"), ZoomIn: () => React.createElement("svg") },
});

test("image and SVG previews open via labeled buttons, remain above a parent modal and close independently", async () => {
  for (const kind of ["image", "diagram"]) {
    const visual =
      kind === "image"
        ? React.createElement("img", {
            src: "/original.png",
            className: "object-contain max-h-[calc(85vh-2rem)]",
            alt: "Original lesson",
          })
        : React.createElement("svg", {
            viewBox: "0 0 320 180",
            role: "img",
            "aria-label": "Concept diagram",
          });
    let view;
    await act(async () => {
      view = create(
        React.createElement(
          "parent-modal",
          { open: true },
          React.createElement(
            IllustrationPreview,
            { title: "Lesson", preview: visual },
            React.createElement("span", null, "Thumbnail"),
          ),
        ),
      );
    });
    const trigger = () => view.root.findByProps({ "aria-label": "Enlarge Lesson illustration" });
    assert.equal(trigger().props.type, "button");
    assert.equal(view.root.findAllByType("preview-dialog").length, 0);
    for (const close of ["button", "outside", "escape"]) {
      await act(async () => trigger().props.onClick());
      const dialog = view.root.findByType("preview-dialog");
      assert.match(dialog.props.className, /z-\[101\].*max-w-\[90vw\].*max-h-\[85vh\]/);
      assert.ok(dialog.props.className.includes("h-[min(85vh,max(20rem,50vw))] w-[90vw]"));
      assert.doesNotMatch(dialog.props.className, /w-fit/);
      assert.match(view.root.findByType("overlay").props.className, /z-\[100\].*bg-black\/75/);
      assert.match(view.root.findByType("h2").children.join(""), /Lesson.*enlarged illustration/);
      assert.doesNotMatch(view.root.findByType("h2").props.className, /sr-only/);
      if (kind === "image") assert.equal(view.root.findByType("img").props.src, "/original.png");
      let stopped = false;
      await act(async () => {
        if (close === "button")
          view.root.findByProps({ "aria-label": "Close illustration preview" }).props.onClick();
        if (close === "outside") dialog.props.onOutside();
        if (close === "escape")
          dialog.props.onEscape({
            stopPropagation: () => {
              stopped = true;
            },
          });
      });
      if (close === "escape") assert.equal(stopped, true);
      assert.equal(view.root.findAllByType("preview-dialog").length, 0);
      assert.equal(view.root.findByType("parent-modal").props.open, true);
    }
    await act(async () => view.unmount());
  }
});

test("shared lesson visual uses original image or vector, contain sizing and no zoom for unavailable illustrations", async () => {
  const { LessonIllustration } = load("src/components/dashboard/almanac/LessonIllustration.tsx", {
    "./IllustrationPreview": {
      IllustrationPreview: ({ children, preview, ...props }) =>
        React.createElement("preview-wrapper", { ...props, preview }, children),
    },
  });
  let view;
  await act(async () => {
    view = create(
      React.createElement(LessonIllustration, {
        id: "LESSON001",
        title: "Live Load",
        image: "/same-original.png",
        compact: true,
      }),
    );
  });
  const image = view.root.findByType("preview-wrapper").props.preview;
  assert.equal(image.props.src, "/same-original.png");
  assert.match(image.props.className, /object-contain/);
  assert.match(image.props.className, /h-full w-full/);
  assert.doesNotMatch(image.props.className, /h-28|h-auto|w-auto/);
  await act(async () => view.root.findByType("img").props.onError());
  assert.equal(view.root.findAllByType("preview-wrapper").length, 0);
  await act(async () =>
    view.update(
      React.createElement(LessonIllustration, { id: "bending", title: "Bending", compact: true }),
    ),
  );
  assert.equal(view.root.findByType("preview-wrapper").props.preview.type, "svg");
  assert.equal(view.root.findByType("preview-wrapper").props.preview.props.viewBox, "0 0 320 180");
  await act(async () => view.unmount());
});
