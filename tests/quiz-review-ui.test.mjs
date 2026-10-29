import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import * as education from "../src/lib/playfab/almanac-education.ts";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function load(relative, dependencies = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  runInNewContext(source, {
    exports,
    require: (name) => dependencies[name] ?? require(name),
    ...globals,
  });
  return exports;
}

const attempt = () => ({
  quizId: "beam-quiz",
  attemptId: "submitted-a",
  title: "Beam Quiz",
  score: 1,
  totalQuestions: 2,
});
function result(overrides = {}) {
  return {
    ...attempt(),
    contentFingerprint: "a".repeat(64),
    answers: [
      {
        questionId: "live-load",
        question: "Which load moves?",
        choices: ["A vehicle", "The bridge itself"],
        selectedIndex: 0,
        correctIndex: 0,
        explanation: "A moving vehicle applies a live load.",
      },
      {
        questionId: "dead-load",
        question: "Which load is permanent?",
        choices: ["The bridge deck", "A passing vehicle"],
        selectedIndex: 1,
        correctIndex: 0,
      },
    ],
    ...overrides,
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((value) => {
    resolve = value;
  });
  return { promise, resolve };
}

function runtime(fetchReview = async () => Response.json(result())) {
  let player = { playFabId: "ACCOUNT_A" };
  let session = { identity: { playFabId: "ACCOUNT_A" }, sessionTicket: "ticket-A" };
  const calls = [];
  const hook = load(
    "../src/components/dashboard/almanac/useQuizAnswerReview.ts",
    {
      "@/lib/auth": { useAuth: () => ({ player }) },
      "@/lib/playfab/client": {
        readSession: () => session,
        playerFetch: (path, init) => {
          calls.push({ path, init });
          return fetchReview(path, init, calls.length);
        },
      },
      "@/lib/playfab/almanac-education": education,
    },
    { AbortController, URLSearchParams },
  );
  const button = ({ children, ...props }) => React.createElement("button", props, children);
  const icons = new Proxy(
    {},
    {
      get: (_, name) => (props) =>
        React.createElement("svg", { ...props, "data-icon": String(name) }),
    },
  );
  const view = load("../src/components/dashboard/almanac/QuizAnswerReview.tsx", {
    "./useQuizAnswerReview": hook,
    "@/components/ui/button": { Button: button },
    "lucide-react": icons,
  });
  return {
    hook,
    Component: view.QuizAnswerReview,
    List: view.QuizAnswerList,
    calls,
    account(id, ticket = `ticket-${id}`) {
      player = id ? { playFabId: id } : null;
      session = id ? { identity: { playFabId: id }, sessionTicket: ticket } : null;
    },
    mismatch() {
      session = { identity: { playFabId: "WRONG" }, sessionTicket: "ticket-other" };
    },
  };
}
async function render(runtime, entry = attempt()) {
  let view;
  await act(async () => {
    view = create(React.createElement(runtime.Component, { attempt: entry }));
  });
  return view;
}
async function toggle(view) {
  await act(async () =>
    view.root
      .findAllByType("button")
      .find((button) => button.props["aria-controls"])
      .props.onClick(),
  );
}
const content = (view) => JSON.stringify(view.toJSON());

test("quiz review downloads only after opening with the owner bearer and no credentials in the URL", async () => {
  const pending = deferred();
  const r = runtime(() => pending.promise);
  const view = await render(r);
  try {
    assert.equal(r.calls.length, 0);
    assert.doesNotMatch(content(view), /Which load moves/);
    await toggle(view);
    assert.equal(r.calls.length, 1);
    assert.match(content(view), /Loading your submitted answers/);
    assert.match(content(view), /motion-safe:animate-spin/);
    const { path, init } = r.calls[0];
    const url = new URL(path, "https://example.test");
    assert.equal(url.pathname, "/api/player/quiz-review");
    assert.deepEqual(
      [...url.searchParams],
      [
        ["quizId", "beam-quiz"],
        ["attemptId", "submitted-a"],
      ],
    );
    assert.doesNotMatch(path, /ticket-|ACCOUNT_A|playFabId/);
    assert.equal(init.headers.Authorization, "Bearer ticket-A");
    assert.equal(init.cache, "no-store");
    await act(async () => pending.resolve(Response.json(result())));
    assert.match(content(view), /Which load moves/);
    assert.match(content(view), /Your answer/);
    assert.match(content(view), /Correct answer/);
    assert.match(content(view), /Incorrect/);
    assert.match(content(view), /A moving vehicle applies a live load/);
    assert.doesNotMatch(content(view), /Loading your submitted answers/);
    assert.match(content(view), /max-h-\[65vh\]/);
    assert.equal(
      view.root.findByProps({ role: "region" }).props["aria-label"],
      "Beam Quiz answer review",
    );
  } finally {
    await act(async () => view.unmount());
  }
});

test("unavailable review remains distinct from a temporary service failure and retries safely", async () => {
  for (const status of [404, 503]) {
    const r = runtime(async (_path, _init, count) =>
      count === 1
        ? new Response("private-provider-key must not be rendered", { status })
        : Response.json(result()),
    );
    const view = await render(r);
    try {
      await toggle(view);
      assert.doesNotMatch(content(view), /private-provider-key/);
      if (status === 404) {
        assert.match(content(view), /Answer review unavailable for this submission/);
        assert.doesNotMatch(content(view), /couldn’t load/);
        assert.equal(view.root.findAllByType("button").length, 1);
      } else {
        assert.match(content(view), /couldn’t load your answers/);
        const retry = view.root
          .findAllByType("button")
          .find((button) => !button.props["aria-controls"]);
        await act(async () => retry.props.onClick());
        assert.equal(r.calls.length, 2);
        assert.match(content(view), /Which load moves/);
      }
    } finally {
      await act(async () => view.unmount());
    }
  }
});

test("foreign, malformed, partial and inconsistent review responses never display answers", async () => {
  const invalid = [
    { quizId: "other" },
    { attemptId: "other" },
    { title: "Other Quiz" },
    { score: 2 },
    { totalQuestions: 1 },
    { contentFingerprint: "wrong" },
    { answers: result().answers.slice(0, 1) },
    { answers: [result().answers[0], result().answers[0]] },
    { answers: result().answers.map((answer) => ({ ...answer, selectedIndex: 20 })) },
  ];
  for (const change of invalid) {
    const r = runtime(async () => Response.json(result(change)));
    const view = await render(r);
    try {
      await toggle(view);
      assert.match(content(view), /Answer review unavailable/);
      assert.doesNotMatch(content(view), /Which load moves/);
    } finally {
      await act(async () => view.unmount());
    }
  }
});

test("account switching aborts an obsolete response and cannot expose its answers", async () => {
  const pending = deferred();
  const r = runtime((_path, _init, count) =>
    count === 1 ? pending.promise : Promise.resolve(new Response(null, { status: 404 })),
  );
  const view = await render(r);
  try {
    await toggle(view);
    r.account("ACCOUNT_B");
    await act(async () => view.update(React.createElement(r.Component, { attempt: attempt() })));
    assert.equal(r.calls.length, 2);
    assert.equal(r.calls[0].init.signal.aborted, true);
    assert.equal(r.calls[1].init.headers.Authorization, "Bearer ticket-ACCOUNT_B");
    await act(async () => pending.resolve(Response.json(result())));
    assert.doesNotMatch(content(view), /Which load moves/);
    assert.match(content(view), /Answer review unavailable/);
  } finally {
    await act(async () => view.unmount());
  }
});

test("already loaded reviews are hidden immediately when the account or session changes", async () => {
  for (const mode of ["account", "ticket"]) {
    const pending = deferred();
    const r = runtime((_path, _init, count) =>
      count === 1 ? Promise.resolve(Response.json(result())) : pending.promise,
    );
    const view = await render(r);
    try {
      await toggle(view);
      assert.match(content(view), /Which load moves/);
      if (mode === "account") r.account("ACCOUNT_B");
      else r.account("ACCOUNT_A", "new-ticket-A");
      await act(async () => view.update(React.createElement(r.Component, { attempt: attempt() })));
      assert.doesNotMatch(content(view), /Which load moves/);
      assert.match(content(view), /Loading your submitted answers/);
      assert.equal(r.calls.length, 2);
    } finally {
      await act(async () => view.unmount());
    }
  }
});

test("a newer submitted attempt cannot receive an earlier request’s answers", async () => {
  const pending = deferred();
  const r = runtime((_path, _init, count) =>
    count === 1
      ? pending.promise
      : Promise.resolve(Response.json(result({ attemptId: "submitted-b" }))),
  );
  const view = await render(r);
  try {
    await toggle(view);
    await act(async () =>
      view.update(
        React.createElement(r.Component, { attempt: { ...attempt(), attemptId: "submitted-b" } }),
      ),
    );
    assert.equal(r.calls[0].init.signal.aborted, true);
    assert.match(content(view), /Which load moves/);
    await act(async () =>
      pending.resolve(
        Response.json(
          result({
            answers: result().answers.map((answer) => ({
              ...answer,
              question: "OBSOLETE PRIVATE QUESTION",
            })),
          }),
        ),
      ),
    );
    assert.doesNotMatch(content(view), /OBSOLETE PRIVATE QUESTION/);
    assert.match(content(view), /Which load moves/);
  } finally {
    await act(async () => view.unmount());
  }
});

test("same-attempt rerenders do not duplicate a request; closing aborts it and reopening retries", async () => {
  const pending = deferred();
  const r = runtime((_path, _init, count) =>
    count === 1 ? pending.promise : Promise.resolve(Response.json(result())),
  );
  const view = await render(r);
  try {
    await toggle(view);
    await act(async () =>
      view.update(React.createElement(r.Component, { attempt: { ...attempt() } })),
    );
    assert.equal(r.calls.length, 1);
    await toggle(view);
    assert.equal(r.calls[0].init.signal.aborted, true);
    assert.doesNotMatch(content(view), /Which load moves|Loading your submitted/);
    await toggle(view);
    assert.equal(r.calls.length, 2);
    assert.match(content(view), /Which load moves/);
    await act(async () => pending.resolve(Response.json(result({ title: "Stale" }))));
    assert.match(content(view), /Which load moves/);
  } finally {
    await act(async () => view.unmount());
  }
});

test("missing or mismatched sessions never request review and expired sessions show sign-in guidance", async () => {
  for (const mode of ["signed-out", "mismatch", "expired"]) {
    const r = runtime(async () => new Response(null, { status: 401 }));
    if (mode === "signed-out") r.account(null);
    if (mode === "mismatch") r.mismatch();
    const view = await render(r);
    try {
      await toggle(view);
      assert.equal(r.calls.length, mode === "expired" ? 1 : 0);
      assert.match(content(view), /Sign in again/);
      assert.doesNotMatch(content(view), /Which load moves/);
    } finally {
      await act(async () => view.unmount());
    }
  }
});

test("only authored nonempty explanations are retained in a validated review", () => {
  for (const explanation of [undefined, null, "", 24, "x".repeat(4001)]) {
    const value = result();
    value.answers[0].explanation = explanation;
    const parsed = education.parseEducation({ quizAttempts: [{ ...value, status: "completed" }] })
      .quizAttempts[0];
    assert.equal(parsed.answers[0].explanation, undefined);
  }
  const parsed = education.parseEducation({ quizAttempts: [{ ...result(), status: "completed" }] })
    .quizAttempts[0];
  assert.equal(parsed.answers[0].explanation, "A moving vehicle applies a live load.");
});
