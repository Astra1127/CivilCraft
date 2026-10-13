import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewCloudScriptWalletScope as review } from "../scripts/review-cloudscript-wallet-scope.mjs";

const request = `{Entity: profile.Entity, Objects: [{ObjectName: "obj1", DataObject: {foo:"server value", prop1:args.prop1}}]}`;
const entityHandler = (
  body = `var profile=context.currentEntity; return entity.SetObjects(${request});`,
) => `handlers.makeEntityAPICall=function(args,context){${body}};`;
const httpHandler = (
  body = `var url="http://httpbin.org/status/200"; return http.request(url,"post",JSON.stringify(args),"application/json",null);`,
) => `handlers.makeHTTPRequest=function(args,context){${body}};`;
const closed = (source) => {
  const result = review(source);
  assert.equal(result.classification, "FAIL_CLOSED");
  assert.ok(result.findings.length > 0);
  assert.equal(result.approval, "UNAPPROVED");
  assert.equal(result.receiptProtectionProof, "NOT_ESTABLISHED");
  return result;
};

test("old fixed obj1 and HTTP sample handlers classify structurally without whole-file matching", () => {
  const source =
    entityHandler() +
    httpHandler() +
    `handlers.profile=function(args,context){return http.request('https://httpbin.org/status/200','post','{}','application/json',null);};`;
  const result = review(source);
  assert.equal(result.classification, "STATIC_OBJECT_SCOPE_ONLY");
  assert.equal(result.objectMutationCallCount, 1);
  assert.equal(result.fixedObjectMutationCallCount, 1);
  assert.equal(result.outboundHttpCallCount, 2);
  assert.equal(result.fixedOutboundHttpCallCount, 2);
  assert.deepEqual(result.findings, []);
  assert.equal(result.historicalCompleteness, "NOT_ESTABLISHED");
  assert.equal(result.approval, "UNAPPROVED");
  const older = review(source + `handlers.other=function(args){return {data:args.value};};`);
  assert.notEqual(older.normalizedSourceSha256, result.normalizedSourceSha256);
  assert.equal(older.classification, "STATIC_OBJECT_SCOPE_ONLY");
});

test("only outer request fields are interpreted: caller nested data cannot change the namespace", () => {
  const source = entityHandler(
    `return entity.SetObjects({Entity:context.currentEntity.Entity,Objects:[{ObjectName:"obj1",DataObject:args.payload}]});`,
  );
  assert.equal(review(source).classification, "STATIC_OBJECT_SCOPE_ONLY");
});

test("HOST_CONTEXT is trusted only for direct registered handlers, not helpers or nested functions", () => {
  for (const source of [
    `function helper(args,context){return entity.SetObjects({Entity:context.currentEntity.Entity,Objects:[{ObjectName:"obj1",DataObject:{}}]});}handlers.x=function(args,context){return helper(args,args.fakeContext);};`,
    entityHandler(
      `function nested(a,context){return entity.SetObjects({Entity:context.currentEntity.Entity,Objects:[{ObjectName:"obj1",DataObject:{}}]});}return nested(args,args.fakeContext);`,
    ),
    `var callback=function(args,context){return entity.SetObjects({Entity:context.currentEntity.Entity,Objects:[{ObjectName:"obj1",DataObject:{}}]});};handlers.x=callback;`,
    `handlers["x"]=function(args,context){return entity.SetObjects({Entity:context.currentEntity.Entity,Objects:[{ObjectName:"obj1",DataObject:{}}]});};`,
    entityHandler() +
      `handlers.other=function(args,context){return handlers.makeEntityAPICall(args,args.fakeContext);};`,
    entityHandler() +
      `handlers.other=function(args,context){var run=handlers.makeEntityAPICall;return run(args,args.fakeContext);};`,
  ])
    closed(source);
});

for (const [name, mutated] of [
  ["caller request", "args.request"],
  ["caller Objects", `{Entity:profile.Entity,Objects:args.objects}`],
  ["caller ObjectName", `{Entity:profile.Entity,Objects:[{ObjectName:args.name,DataObject:{}}]}`],
  [
    "receipt namespace",
    `{Entity:profile.Entity,Objects:[{ObjectName:"civilcraft.coin-purchases.v1",DataObject:{}}]}`,
  ],
  ["request spread", `{Entity:profile.Entity,Objects:[{ObjectName:"obj1",DataObject:{}}],...args}`],
  ["array spread", `{Entity:profile.Entity,Objects:[...args.objects]}`],
  ["entry spread", `{Entity:profile.Entity,Objects:[{ObjectName:"obj1",DataObject:{},...args}]}`],
  [
    "computed request key",
    `{Entity:profile.Entity,[args.key]:[{ObjectName:"obj1",DataObject:{}}]}`,
  ],
  ["computed name key", `{Entity:profile.Entity,Objects:[{[args.key]:"obj1",DataObject:{}}]}`],
  [
    "duplicate name",
    `{Entity:profile.Entity,Objects:[{ObjectName:"obj1",ObjectName:args.name,DataObject:{}}]}`,
  ],
  [
    "DeleteObject",
    `{Entity:profile.Entity,Objects:[{ObjectName:"obj1",DeleteObject:true,DataObject:{}}]}`,
  ],
  [
    "getter name",
    `{Entity:profile.Entity,Objects:[{get ObjectName(){return args.name},DataObject:{}}]}`,
  ],
  ["caller Entity", `{Entity:args.Entity,Objects:[{ObjectName:"obj1",DataObject:{}}]}`],
])
  test(`SetObjects rejects ${name}`, () =>
    closed(
      entityHandler(`var profile=context.currentEntity;return entity.SetObjects(${mutated});`),
    ));

for (const [name, source] of [
  [
    "entity alias",
    `handlers.x=function(args,context){var e=entity;return e.SetObjects(args.request);};`,
  ],
  [
    "method alias",
    `handlers.x=function(args,context){var write=entity.SetObjects;return write(args.request);};`,
  ],
  [
    "computed method",
    `handlers.x=function(args,context){return entity[args.method](args.request);};`,
  ],
  [
    "computed method constant",
    `handlers.x=function(args,context){return entity["SetObjects"](args.request);};`,
  ],
  [
    "entity rebinding",
    entityHandler(
      `entity=args.entity;var profile=context.currentEntity;return entity.SetObjects(${request});`,
    ),
  ],
  [
    "profile rebinding",
    entityHandler(
      `var profile=context.currentEntity;profile=args.profile;return entity.SetObjects(${request});`,
    ),
  ],
  [
    "profile property mutation",
    entityHandler(
      `var profile=context.currentEntity;profile.Entity=args.Entity;return entity.SetObjects(${request});`,
    ),
  ],
  [
    "context property mutation",
    entityHandler(
      `context.currentEntity=args.profile;var profile=context.currentEntity;return entity.SetObjects(${request});`,
    ),
  ],
  [
    "context shadowing",
    entityHandler(
      `var context=args.context;var profile=context.currentEntity;return entity.SetObjects(${request});`,
    ),
  ],
  [
    "profile destructuring assignment",
    entityHandler(
      `var profile=context.currentEntity;({profile}=args);return entity.SetObjects(${request});`,
    ),
  ],
  [
    "Object.assign target mutation",
    entityHandler(
      `var profile=context.currentEntity;Object.assign(profile,args);return entity.SetObjects(${request});`,
    ),
  ],
  ["eval", `handlers.x=function(args){return eval(args.source);};`],
  [
    "with scope",
    entityHandler(
      `with(args){return entity.SetObjects({Entity:context.currentEntity.Entity,Objects:[{ObjectName:"obj1",DataObject:{}}]});}`,
    ),
  ],
  [
    "constructor execution",
    `handlers.x=function(args){return ({}).constructor.constructor(args.source)();};`,
  ],
  ["eval alias", `handlers.x=function(args){var run=eval;return run(args.source);};`],
  ["Function", `handlers.x=function(args){return new Function(args.source)();};`],
  ["dynamic import", `handlers.x=function(args){return import(args.url);};`],
  ["unreviewed fetch", `handlers.x=function(args){return fetch(args.url);};`],
  ["DeleteObjects", `handlers.x=function(args){return entity.DeleteObjects(args.request);};`],
  [
    "title player deletion",
    `handlers.x=function(args){return server.DeletePlayer(args.request);};`,
  ],
  [
    "master player deletion",
    `handlers.x=function(args){return server.DeleteMasterPlayerAccount(args.request);};`,
  ],
  [
    "classic Add",
    `handlers.x=function(args){return server.AddUserVirtualCurrency(args.request);};`,
  ],
  [
    "classic character Add",
    `handlers.x=function(args){return server.AddCharacterVirtualCurrency(args.request);};`,
  ],
  [
    "nested DataObject Add",
    entityHandler(
      `return entity.SetObjects({Entity:context.currentEntity.Entity,Objects:[{ObjectName:"obj1",DataObject:(()=>{server.AddUserVirtualCurrency(args);return {};})()}]});`,
    ),
  ],
  [
    "nested CloudScript",
    `handlers.x=function(args){return server.ExecuteCloudScript(args.request);};`,
  ],
  [
    "nested Azure Function",
    `handlers.x=function(args){return entity.ExecuteFunction(args.request);};`,
  ],
])
  test(`writer review fails closed for ${name}`, () => closed(source));

test("literal URL aliases are accepted only without writes, shadows, cycles or fallbacks", () => {
  assert.equal(
    review(
      httpHandler(
        `const endpoint="https://httpbin.org/status/200";const url=endpoint;return http.request(url,"post","{}","application/json",null);`,
      ),
    ).classification,
    "STATIC_OBJECT_SCOPE_ONLY",
  );
  for (const body of [
    `var url=args.url;return http.request(url,"post","{}","application/json",null);`,
    `var url="https://httpbin.org/status/200";url=args.url;return http.request(url,"post","{}","application/json",null);`,
    `var url="https://httpbin.org/status/200";if(args.change)url=args.url;return http.request(url,"post","{}","application/json",null);`,
    `var url="https://httpbin.org/status/200";({url}=args);return http.request(url,"post","{}","application/json",null);`,
    `var url="https://httpbin.org/status/200";[url]=args.urls;return http.request(url,"post","{}","application/json",null);`,
    `var url="https://httpbin.org/status/200";globalThis.url=args.url;return http.request(url,"post","{}","application/json",null);`,
    `var url="https://httpbin.org/status/200";return http.request(url||args.url,"post","{}","application/json",null);`,
    `var url="https://httpbin.org/status/200";return http.request(args.choose?url:args.url,"post","{}","application/json",null);`,
    `return http.request(url,"post","{}","application/json",null);var url="https://httpbin.org/status/200";`,
    `var url=other;var other=url;return http.request(url,"post","{}","application/json",null);`,
    `var url="https://httpbin.org/status/200";var h=http;return h.request(url,"post","{}","application/json",null);`,
    `return http["request"]("https://httpbin.org/status/200","post","{}","application/json",null);`,
  ])
    closed(httpHandler(body));
  closed(
    `var url="https://httpbin.org/status/200";handlers.x=function(args,url){return http.request(url,"post","{}","application/json",null);};`,
  );
  closed(
    `var url="https://httpbin.org/status/200";handlers.x=function(args,{url}){return http.request(url,"post","{}","application/json",null);};`,
  );
  closed(
    `var url="https://httpbin.org/status/200";handlers.x=function(args){const {url}=args;return http.request(url,"post","{}","application/json",null);};`,
  );
  closed(
    `var url="https://httpbin.org/status/200";handlers.x=function(args){url=args.url;};handlers.y=function(args,context){return http.request(url,"post","{}","application/json",null);};`,
  );
});

test("function, class, catch and named-expression shadows cannot inherit a fixed global URL", () => {
  const global = `var url="https://httpbin.org/status/200";`;
  for (const source of [
    global +
      httpHandler(`function url(){}return http.request(url,"post","{}","application/json",null);`),
    global +
      httpHandler(`class url{}return http.request(url,"post","{}","application/json",null);`),
    global +
      httpHandler(
        `try { throw args.url; }catch(url){return http.request(url,"post","{}","application/json",null);}`,
      ),
    global +
      `handlers.x=function url(args,context){return http.request(url,"post","{}","application/json",null);};`,
    global +
      `var C=class url{method(){return http.request(url,"post","{}","application/json",null);}};`,
  ])
    closed(source);
});

for (const url of [
  "https://example.invalid/private",
  "https://httpbin.org/status/200?next=private",
  "https://httpbin.org/status/302",
  "https://httpbin.org:8443/status/200",
  "https://httpbin.org/status/200#private",
  "https://secret@httpbin.org/status/200",
])
  test("arbitrary endpoint variants fail closed without exposing their values", () =>
    closed(
      httpHandler(
        `return http.request(${JSON.stringify(url)},"post","{}","application/json",null);`,
      ),
    ));

test("reports contain hashes/fixed classifications only, never source, secrets or unknown handler names", () => {
  const secret = "DO_NOT_EXPORT_SECRET_OR_PRIVATE_SOURCE";
  const source = `handlers.${secret}=function(args,context){var url="https://private.invalid/${secret}";return http.request(url,"post",${JSON.stringify(secret)},"application/json",null);};`;
  const result = closed(source);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("private.invalid"), false);
  assert.equal(serialized.includes("function(args"), false);
  assert.match(result.sourceSha256, /^[a-f0-9]{64}$/);
  for (const row of result.findings)
    assert.ok(
      row.containingFunctionSha256 === null || /^[a-f0-9]{64}$/.test(row.containingFunctionSha256),
    );
});

test("malformed, unsupported and oversized sources fail closed without parser diagnostics", () => {
  for (const source of [
    null,
    {},
    "handlers.bad=function(",
    "/*" + "x".repeat(2 * 1024 * 1024) + "*/",
  ]) {
    const result = closed(source);
    assert.equal(JSON.stringify(result).includes("handlers.bad"), false);
    assert.equal(JSON.stringify(result).includes("Unexpected"), false);
  }
});

test("review parses source without executing statements or getters", () => {
  const marker = "__cloudScopeReviewExecutionProbe";
  const previous = globalThis[marker];
  try {
    globalThis[marker] = false;
    closed(`globalThis.${marker}=true;throw new Error("DO_NOT_RUN_SOURCE");`);
    assert.equal(globalThis[marker], false);
  } finally {
    if (previous === undefined) delete globalThis[marker];
    else globalThis[marker] = previous;
  }
});
