import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlayerName } from "./helpers/player-name-ui.mjs";

test("player names render the hex color without the Unity tag", () => {
  const html = renderToStaticMarkup(
    React.createElement(PlayerName, { name: "<#BF40BF>.dev_hyakkimaru", className: "truncate" }),
  );
  assert.equal(html, '<span class="truncate" style="color:#BF40BF">.dev_hyakkimaru</span>');
});

test("untagged, invalid and empty names keep inherited colors", () => {
  assert.equal(
    renderToStaticMarkup(React.createElement(PlayerName, { name: "Engineer" })),
    "<span>Engineer</span>",
  );
  assert.equal(
    renderToStaticMarkup(
      React.createElement(PlayerName, {
        name: "<#BF40BF></color>",
        fallback: "Player",
      }),
    ),
    "<span>Player</span>",
  );
  const html = renderToStaticMarkup(React.createElement(PlayerName, { name: "<#GG40BF>Name" }));
  assert.ok(html.includes("&lt;#GG40BF&gt;Name"));
  assert.ok(!html.includes("style="));
});

test("name markup is escaped rather than interpreted as HTML", () => {
  const html = renderToStaticMarkup(
    React.createElement(PlayerName, {
      name: '<#BF40BF><img src=x onerror="alert(1)"><script>alert(1)</script></color>',
    }),
  );
  assert.ok(html.includes('style="color:#BF40BF"'));
  assert.ok(html.includes("&lt;img") && html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<img") && !html.includes("<script"));
});
