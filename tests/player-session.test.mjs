import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, beforeEach, test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
import { playerNameDependencies } from "./helpers/player-name-ui.mjs";
import * as store from "../src/lib/playfab/session-store.ts";
import * as errors from "../src/lib/playfab/session-errors.ts";
import { playFabAdmin } from "../src/lib/playfab/admin-client.server.ts";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalSecret = process.env.PLAYFAB_SECRET_KEY;
const originalTitle = process.env.VITE_PLAYFAB_TITLE_ID;
const identity = {
  playFabId: "ABC123",
  displayName: "Stored name",
  role: "player",
  isAdmin: false,
};
const good = () =>
  Response.json({
    code: 200,
    data: { AccountInfo: { PlayFabId: "ABC123", TitleInfo: { DisplayName: "Verified name" } } },
  });
const invalid = () =>
  Response.json({ code: 400, error: "InvalidSessionTicket", errorCode: 1100 }, { status: 400 });
let timers;
function compile(path, imports) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    exports,
    require: (name) => imports[name] ?? imports[name.replace(/\.ts$/, "")] ?? require(name),
    window: globalThis.window,
    fetch: (...args) => globalThis.fetch(...args),
    Headers,
    AbortSignal,
    URL,
  });
  return exports;
}
let client;
beforeEach(() => {
  const storage = new Map();
  timers = new Map();
  const target = new EventTarget();
  globalThis.window = Object.assign(target, {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    setInterval: (fn) => {
      const id = timers.size + 1;
      timers.set(id, fn);
      return id;
    },
    clearInterval: (id) => timers.delete(id),
  });
  globalThis.fetch = async () => good();
  process.env.PLAYFAB_SECRET_KEY = "test-server-secret";
  process.env.VITE_PLAYFAB_TITLE_ID = "17FA03";
  client = compile("../src/lib/playfab/client.ts", {
    "./session-store": store,
    "./session-errors": errors,
    "./config": {
      playFabConfig: { titleId: "17FA03" },
      playFabUrl: (path) => "https://17FA03.playfabapi.com" + path,
    },
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  if (originalSecret === undefined) delete process.env.PLAYFAB_SECRET_KEY;
  else process.env.PLAYFAB_SECRET_KEY = originalSecret;
  if (originalTitle === undefined) delete process.env.VITE_PLAYFAB_TITLE_ID;
  else process.env.VITE_PLAYFAB_TITLE_ID = originalTitle;
});
const save = (ticket = "old-ticket") =>
  store.writeSession("player", { identity, sessionTicket: ticket });
function storageEvent() {
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: store.PLAYER_SESSION_KEY });
  window.dispatchEvent(event);
}

test("valid restored ticket is checked with PlayFab and identity comes from the response", async () => {
  save();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, init]);
    return good();
  };
  const result = await client.validatePlayerSession();
  assert.equal(result.displayName, "Verified name");
  assert.match(calls[0][0], /Client\/GetAccountInfo$/);
  assert.equal(calls[0][1].headers["X-Authorization"], "old-ticket");
});

test("expired direct PlayFab calls clear storage and notify once; login errors do not", async () => {
  save();
  let changes = 0;
  const unsubscribe = store.subscribePlayerSession(() => changes++);
  try {
    globalThis.fetch = async () => invalid();
    await assert.rejects(
      client.callPlayerApi("/Client/GetAccountInfo"),
      (e) => e.kind === "session_expired",
    );
    assert.equal(store.readSession("player"), null);
    assert.equal(store.sessionEnded(), true);
    assert.equal(changes, 1);
    save("new-ticket");
    await assert.rejects(client.callPlayFab("/Client/LoginWithPlayFab", {}));
    assert.equal(store.currentSessionTicket(), "new-ticket");
  } finally {
    unsubscribe();
  }
});

test("central first-party transport expires player APIs, but not permissions, outages or admin auth", async () => {
  for (const path of [
    "/api/leaderboard?mode=efficient",
    "/api/leaderboard/me",
    "/api/player/messages",
    "/api/player/bug-reports",
    "/api/player/email-preference",
    "/api/payments/paymongo/create-checkout",
    "/api/payments/paymongo/player-orders",
    "/api/contact",
  ]) {
    save();
    globalThis.fetch = async () => Response.json({}, { status: 401 });
    await assert.rejects(
      client.playerFetch(path, { headers: { Authorization: "Bearer old-ticket" } }),
    );
    assert.equal(store.currentSessionTicket(), null, path);
  }
  for (const status of [403, 404, 429, 500, 503]) {
    save();
    globalThis.fetch = async () => Response.json({}, { status });
    await client.playerFetch("/api/leaderboard", {
      headers: { Authorization: "Bearer old-ticket" },
    });
    assert.equal(store.currentSessionTicket(), "old-ticket");
  }
  globalThis.fetch = async () => Response.json({}, { status: 401 });
  await client.playerFetch("/api/admin/products", {
    headers: { Authorization: "Bearer old-ticket" },
  });
  assert.equal(store.currentSessionTicket(), "old-ticket");
  globalThis.fetch = async () => {
    throw new TypeError("offline");
  };
  await assert.rejects(client.playerFetch("/api/player/messages"));
  assert.equal(store.currentSessionTicket(), "old-ticket");
});

test("unclassified PlayFab 401, permission denial, network and service errors retain the ticket", async () => {
  save();
  for (const [status, error] of [
    [401, "InvalidSecretKey"],
    [403, "NotAuthorized"],
    [400, "UnknownError"],
    [503, "InvalidSessionTicket"],
  ]) {
    globalThis.fetch = async () => Response.json({ code: status, error }, { status });
    await assert.rejects(client.validatePlayerSession());
    assert.equal(store.currentSessionTicket(), "old-ticket");
  }
  globalThis.fetch = async () => {
    throw new TypeError("offline");
  };
  await assert.rejects(client.validatePlayerSession());
  assert.equal(store.currentSessionTicket(), "old-ticket");
});

test("late rejection of an older ticket cannot expire a new login", async () => {
  save();
  let release;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const request = client.callPlayerApi("/Client/GetAccountInfo");
  save("new-ticket");
  release(invalid());
  await assert.rejects(request);
  assert.equal(store.currentSessionTicket(), "new-ticket");
  assert.equal(store.sessionEnded(), false);
});

test("server maps explicit invalid/expired tickets to 401 but keeps secret/permission/server failures separate", async () => {
  for (const [response, status] of [
    [invalid, 401],
    [() => Response.json({ code: 200, data: { IsSessionTicketExpired: true } }), 401],
    [() => Response.json({ code: 200, data: {} }), 502],
    [() => Response.json({ code: 401, error: "InvalidSecretKey" }, { status: 401 }), 503],
    [() => Response.json({ code: 403, error: "NotAuthorized" }, { status: 403 }), 503],
    [() => Response.json({ code: 503, error: "InvalidSessionTicket" }, { status: 503 }), 503],
  ]) {
    globalThis.fetch = async () => response();
    await assert.rejects(
      playFabAdmin("Server/AuthenticateSessionTicket", { SessionTicket: "ticket" }),
      (e) => e.status === status,
    );
  }
});

async function mountAuth() {
  let state;
  let clearedQueries = 0;
  const queryClient = {
    cancelQueries: async () => {},
    removeQueries: () => {
      clearedQueries++;
    },
  };
  const auth = compile("../src/lib/auth.tsx", {
    "@tanstack/react-query": { useQueryClient: () => queryClient },
    "@/lib/playfab/client": client,
    "@/lib/playfab/session-store": store,
    "@/lib/playfab": {
      authService: {
        login: async () => {
          save("login-ticket");
          return identity;
        },
        logout: async () => store.clearSession("player"),
      },
    },
    "@/lib/admin-auth/functions": {
      getAdminSession: async () => ({
        authenticated: true,
        configured: true,
        user: { id: "staff", displayName: "Admin" },
      }),
    },
    "@/lib/admin-auth/types": { ADMIN_AUTH_MESSAGES: { failed: "failed" } },
  });
  function Consumer() {
    state = auth.useAuth();
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(auth.AuthProvider, null, React.createElement(Consumer)));
  });
  return {
    get clearedQueries() {
      return clearedQueries;
    },
    get state() {
      return state;
    },
    close: () => act(async () => renderer.unmount()),
  };
}

test("background checks expire a long-running session without waiting for another page request", async () => {
  save();
  const app = await mountAuth();
  try {
    assert.equal(app.state.isAuthenticated, true);
    globalThis.fetch = async () => invalid();
    await act(async () => {
      for (const tick of timers.values()) tick();
    });
    assert.equal(app.state.isAuthenticated, false);
    assert.equal(app.state.sessionExpired, true);
    assert.equal(store.currentSessionTicket(), null);
    assert.equal(app.state.isAdmin, true);
  } finally {
    await app.close();
  }
});

test("focus reconciles changed storage and clears old player data even if a tab missed its storage event", async () => {
  save();
  const app = await mountAuth();
  try {
    window.localStorage.removeItem(store.PLAYER_SESSION_KEY);
    await act(async () => window.dispatchEvent(new Event("focus")));
    assert.equal(app.state.isAuthenticated, false);
    assert.equal(app.clearedQueries, 1);
    assert.equal(app.state.isAdmin, true);
  } finally {
    await app.close();
  }
});

test("AuthProvider withholds restored identity until validation; expiration updates UI and preserves admin", async () => {
  save();
  let release;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const app = await mountAuth();
  try {
    assert.equal(app.state.ready, false);
    assert.equal(app.state.isAuthenticated, false);
    await act(async () => release(good()));
    assert.equal(app.state.ready, true);
    assert.equal(app.state.player.displayName, "Verified name");
    globalThis.fetch = async () => invalid();
    await act(async () => {
      await assert.rejects(client.callPlayerApi("/Client/GetAccountInfo"));
    });
    assert.equal(app.state.isAuthenticated, false);
    assert.equal(app.state.sessionExpired, true);
    assert.equal(app.state.isAdmin, true);
    globalThis.fetch = async () => good();
    await act(async () => {
      await app.state.login({ email: "player", password: "never-stored" });
    });
    assert.equal(app.state.isAuthenticated, true);
    assert.equal(app.state.sessionExpired, false);
    assert.ok(!window.localStorage.getItem(store.PLAYER_SESSION_KEY).includes("never-stored"));
  } finally {
    await app.close();
  }
});

test("restoration outage offers retry without deleting storage; ongoing outage keeps verified player", async () => {
  save();
  globalThis.fetch = async () => {
    throw new TypeError("offline");
  };
  const app = await mountAuth();
  try {
    assert.equal(app.state.ready, false);
    assert.equal(app.state.playerSessionError, true);
    assert.equal(store.currentSessionTicket(), "old-ticket");
    globalThis.fetch = async () => good();
    await act(async () => app.state.retryPlayerSession());
    assert.equal(app.state.isAuthenticated, true);
    globalThis.fetch = async () => {
      throw new TypeError("offline");
    };
    await act(async () => window.dispatchEvent(new Event("focus")));
    assert.equal(app.state.isAuthenticated, true);
    assert.equal(app.state.ready, true);
  } finally {
    await app.close();
  }
});

test("expired restore and cross-tab logout/expiration/login synchronize auth state", async () => {
  save();
  globalThis.fetch = async () => invalid();
  const app = await mountAuth();
  try {
    assert.equal(app.state.ready, true);
    assert.equal(app.state.sessionExpired, true);
    assert.equal(app.state.isAuthenticated, false);
    globalThis.fetch = async () => good();
    await act(async () => {
      window.localStorage.setItem(
        store.PLAYER_SESSION_KEY,
        JSON.stringify({ identity, sessionTicket: "other-tab" }),
      );
      storageEvent();
    });
    assert.equal(app.state.isAuthenticated, true);
    await act(async () => {
      window.localStorage.removeItem(store.PLAYER_SESSION_KEY);
      storageEvent();
    });
    assert.equal(app.state.isAuthenticated, false);
    assert.equal(app.state.isAdmin, true);
  } finally {
    await app.close();
  }
});

test("return destinations preserve internal path/query/hash and reject external redirects", () => {
  assert.equal(
    errors.playerReturnTo("/dashboard/leaderboards?contract=VancesContract#rank"),
    "/dashboard/leaderboards?contract=VancesContract#rank",
  );
  assert.equal(errors.playerReturnTo("/shop"), "/shop");
  for (const value of [
    "https://evil.test",
    "//evil.test",
    "/%2fevil.test",
    "/\\evil.test",
    "/login",
    "/admin/products",
    "javascript:alert(1)",
  ])
    assert.equal(errors.playerReturnTo(value), "/dashboard");
});

test("protected dashboard and shop preserve destination and distinguish expiration from a restore outage", async () => {
  window.location = {
    pathname: "/dashboard/leaderboards",
    search: "?contract=VancesContract",
    hash: "#rank",
  };
  for (const path of ["../src/routes/dashboard.tsx"]) {
    for (const outage of [false, true]) {
      const navigations = [];
      const component = ({ children }) => React.createElement("div", null, children);
      const generic = new Proxy({}, { get: () => component });
      const auth = {
        ready: !outage,
        isAuthenticated: false,
        sessionExpired: !outage,
        playerSessionError: outage,
        retryPlayerSession: () => {},
      };
      const imports = new Proxy(
        {
          "@tanstack/react-router": {
            createFileRoute: () => (config) => config,
            useNavigate: () => (args) => navigations.push(args),
          },
          "@/lib/auth": { useAuth: () => auth },
          "@/lib/playfab/session-errors": errors,
          react: React,
          "react/jsx-runtime": require("react/jsx-runtime"),
        },
        { get: (target, key) => target[key] ?? generic },
      );
      const { Route } = compile(path, imports);
      let renderer;
      try {
        await act(async () => {
          renderer = create(React.createElement(Route.component));
        });
        if (outage) assert.equal(navigations.length, 0);
        else {
          assert.equal(navigations[0].to, "/login");
          assert.equal(navigations[0].search.reason, "expired");
          assert.equal(
            navigations[0].search.redirect,
            "/dashboard/leaderboards?contract=VancesContract#rank",
          );
        }
      } finally {
        if (renderer) await act(async () => renderer.unmount());
      }
    }
  }
});

test("Login displays expiration message and returns to a validated internal destination", async () => {
  const navigations = [];
  const welcomeMessages = [];
  const component = ({ children, ...props }) => React.createElement("div", props, children);
  const generic = new Proxy({}, { get: () => component });
  const destination = "/dashboard/leaderboards?contract=VancesContract#rank";
  const imports = new Proxy(
    {
      react: React,
      "react/jsx-runtime": require("react/jsx-runtime"),
      zod: require("zod"),
      ...playerNameDependencies,
      "@/lib/playfab/session-errors": errors,
      "@/lib/auth": {
        useAuth: () => ({
          isAuthenticated: false,
          sessionExpired: true,
          login: async () => ({ ...identity, displayName: `<#BF40BF>${identity.displayName}` }),
        }),
      },
      "@tanstack/react-router": {
        createFileRoute: () => (config) => ({
          ...config,
          useSearch: () => ({ redirect: destination, reason: "expired" }),
        }),
        useNavigate: () => (args) => navigations.push(args),
        Link: component,
      },
      sonner: {
        toast: {
          success: (message) => welcomeMessages.push(message),
          error: (message) => {
            throw new Error(message);
          },
        },
      },
      "@/components/ui/input": { Input: (props) => React.createElement("input", props) },
    },
    { get: (target, key) => target[key] ?? generic },
  );
  const { Route } = compile("../src/routes/login.tsx", imports);
  assert.equal(
    Route.validateSearch({ redirect: "//evil.test", reason: "expired" }).redirect,
    "/dashboard",
  );
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(Route.component));
    });
    assert.ok(JSON.stringify(renderer.toJSON()).includes(errors.SESSION_EXPIRED_MESSAGE));
    await act(async () => {
      renderer.root
        .findAllByType("input")
        .find((i) => i.props.id === "email")
        .props.onChange({ target: { value: "engineer" } });
      renderer.root
        .findAllByType("input")
        .find((i) => i.props.id === "password")
        .props.onChange({ target: { value: "password123" } });
    });
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    assert.equal(navigations.at(-1).to, destination);
    assert.deepEqual(welcomeMessages, [`Welcome back, ${identity.displayName}`]);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
  }
});
