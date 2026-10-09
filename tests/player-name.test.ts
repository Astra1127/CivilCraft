import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePlayerName } from "../src/lib/player-name.ts";

test("leading six-digit Unity color tags become CSS colors and plain names", () => {
  assert.deepEqual(parsePlayerName("<#BF40BF>.dev_hyakkimaru"), {
    text: ".dev_hyakkimaru",
    color: "#BF40BF",
  });
  assert.deepEqual(parsePlayerName("<#bf40bf>Name</color>"), {
    text: "Name",
    color: "#bf40bf",
  });
  assert.deepEqual(parsePlayerName("<#Bf40bF>  Name \t</COLOR>"), {
    text: "  Name \t",
    color: "#Bf40bF",
  });
});

test("ordinary names preserve their text", () => {
  for (const name of ["Engineer", "  Name \t", "工程师", "Name\nPlayer"]) {
    assert.deepEqual(parsePlayerName(name), { text: name });
  }
});

test("empty names use the fallback without custom color", () => {
  for (const name of [null, undefined, "", " \n\t", "<#BF40BF>", "<#BF40BF> \t</color>"]) {
    assert.deepEqual(parsePlayerName(name), { text: "Engineer" });
    assert.deepEqual(parsePlayerName(name, "Player"), { text: "Player" });
  }
});

test("malformed, unsupported and nonleading tags remain literal", () => {
  for (const name of [
    "<#FFF>Name",
    "<#BF40BFFF>Name",
    "<#GG40BF>Name",
    "<#BF40BF Name",
    "<#BF40BF >Name",
    "<color=#BF40BF>Name</color>",
    "Name<#BF40BF>",
    " <#BF40BF>Name",
    "Name</color>",
    "&lt;#BF40BF&gt;Name",
  ]) {
    assert.deepEqual(parsePlayerName(name), { text: name });
  }
});

test("only one exact terminal closing tag is removed", () => {
  assert.deepEqual(parsePlayerName("<#123456>A</color></color>"), {
    text: "A</color>",
    color: "#123456",
  });
  for (const text of ["A</color>B", "A</color>\n", "A</color> ", "<#FFFFFF>A"]) {
    assert.deepEqual(parsePlayerName(`<#123456>${text}`), { text, color: "#123456" });
  }
});

test("HTML and CSS injection strings stay plain text", () => {
  const unsafe = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
  assert.deepEqual(parsePlayerName(unsafe), { text: unsafe });
  assert.deepEqual(parsePlayerName(`<#BF40BF>${unsafe}</color>`), {
    text: unsafe,
    color: "#BF40BF",
  });
  const injectedPrefix = "<#BF40BF; background:url(javascript:alert(1))>Name";
  assert.deepEqual(parsePlayerName(injectedPrefix), { text: injectedPrefix });
});
