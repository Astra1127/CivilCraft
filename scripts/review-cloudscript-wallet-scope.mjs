// Pure static review: no files, credentials, environment, network, or code execution.
import { createHash } from "node:crypto";
import ts from "typescript";

const MAX_BYTES = 2 * 1024 * 1024;
const PRIVILEGED = new Set(["entity", "server", "http"]);
const FORBIDDEN = new Set([
  "DeletePlayer",
  "DeleteMasterPlayerAccount",
  "DeleteObjects",
  "AddUserVirtualCurrency",
  "AddCharacterVirtualCurrency",
  "SubtractUserVirtualCurrency",
  "SubtractCharacterVirtualCurrency",
  "ExecuteCloudScript",
  "ExecuteEntityCloudScript",
  "ExecuteFunction",
]);
const SERVER_DATA_METHODS = new Set([
  "UpdatePlayerStatistics",
  "GetPlayerStatistics",
  "GetPlayerProfile",
  "UpdateUserData",
  "UpdateUserInternalData",
  "GetUserInternalData",
  "GetUserData",
  "GetLeaderboard",
]);
const FIXED_URLS = new Set(["http://httpbin.org/status/200", "https://httpbin.org/status/200"]);
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const sha = (text) => createHash("sha256").update(text).digest("hex");
const isFunction = (node) =>
  ts.isFunctionExpression(node) ||
  ts.isFunctionDeclaration(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node) ||
  ts.isConstructorDeclaration(node);
const unwrap = (node) => {
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
};
const literal = (node) => {
  node = unwrap(node);
  return node && ts.isStringLiteralLike(node) ? node.text : null;
};
const boundNames = (node) => {
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node))
    return node.elements.flatMap((element) =>
      ts.isBindingElement(element) ? boundNames(element.name) : [],
    );
  return [];
};
const directlyRegisteredHandler = (node) => {
  const assignment = node.parent;
  return (
    ts.isFunctionExpression(node) &&
    node.parameters.length === 2 &&
    node.parameters.every(
      (parameter) =>
        ts.isIdentifier(parameter.name) && !parameter.initializer && !parameter.dotDotDotToken,
    ) &&
    ts.isBinaryExpression(assignment) &&
    assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    assignment.right === node &&
    ts.isPropertyAccessExpression(assignment.left) &&
    ts.isIdentifier(assignment.left.expression) &&
    assignment.left.expression.text === "handlers"
  );
};

/** Narrow syntactic evidence only; never a historical receipt/protection attestation. */
export function reviewCloudScriptWalletScope(source) {
  const report = {
    classification: "FAIL_CLOSED",
    approval: "UNAPPROVED",
    historicalCompleteness: "NOT_ESTABLISHED",
    receiptProtectionProof: "NOT_ESTABLISHED",
    sourceSha256: typeof source === "string" ? sha(source) : null,
    normalizedSourceSha256: null,
    parsed: false,
    objectMutationCallCount: 0,
    fixedObjectMutationCallCount: 0,
    outboundHttpCallCount: 0,
    fixedOutboundHttpCallCount: 0,
    findings: [],
    limitation:
      "Pure narrow AST classification only; not exhaustive call-graph, platform, delegated/external code, policy continuity, historical completeness, or authorization certification.",
  };
  try {
    if (typeof source !== "string" || Buffer.byteLength(source) > MAX_BYTES) throw new Error();
    const file = ts.createSourceFile(
      "scope.js",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    if (file.parseDiagnostics.length) throw new Error();
    report.parsed = true;
    report.normalizedSourceSha256 = sha(printer.printFile(file));
    const scopes = new Map();
    const scopeOf = (node) => {
      for (let parent = node.parent; parent; parent = parent.parent)
        if (isFunction(parent)) return parent;
      return file;
    };
    const getScope = (node) => {
      if (!scopes.has(node))
        scopes.set(node, {
          declarations: new Map(),
          writes: new Set(),
          parameters: new Set(
            node === file ? [] : node.parameters.flatMap((p) => boundNames(p.name)),
          ),
        });
      return scopes.get(node);
    };
    const declarationPass = (node) => {
      if (isFunction(node)) getScope(node);
      const declare = (owner, name) => {
        const scope = getScope(owner);
        const entries = scope.declarations.get(name) || [];
        entries.push(node);
        scope.declarations.set(name, entries);
      };
      if (ts.isVariableDeclaration(node)) {
        // Includes catch variables. Block scopes are conservatively merged into their
        // containing function: possible shadows must never fall back to a global URL.
        for (const name of boundNames(node.name)) declare(scopeOf(node), name);
      }
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name)
        declare(scopeOf(node), node.name.text);
      if (ts.isFunctionExpression(node) && node.name) declare(node, node.name.text);
      if (ts.isClassExpression(node) && node.name) declare(scopeOf(node), node.name.text);
      ts.forEachChild(node, declarationPass);
    };
    getScope(file);
    declarationPass(file);
    const binding = (name, anchor) => {
      for (let owner = scopeOf(anchor); ; owner = scopeOf(owner)) {
        const scope = getScope(owner);
        if (scope.parameters.has(name)) return { owner, scope, parameter: true };
        if (scope.declarations.has(name))
          return { owner, scope, entries: scope.declarations.get(name) };
        if (owner === file) return { owner, scope };
      }
    };
    const baseIdentifier = (node) => {
      node = unwrap(node);
      while (node && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)))
        node = unwrap(node.expression);
      return node && ts.isIdentifier(node) ? node.text : null;
    };
    const write = (node, anchor) => {
      node = unwrap(node);
      if (node && ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          if (ts.isPropertyAssignment(property)) write(property.initializer, anchor);
          else if (ts.isShorthandPropertyAssignment(property)) write(property.name, anchor);
          else if (ts.isSpreadAssignment(property)) write(property.expression, anchor);
        }
        return;
      }
      if (node && ts.isArrayLiteralExpression(node)) {
        for (const element of node.elements)
          write(ts.isSpreadElement(element) ? element.expression : element, anchor);
        return;
      }
      if (
        node &&
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        write(node.left, anchor);
        return;
      }
      const name = baseIdentifier(node);
      if (name) binding(name, anchor).scope.writes.add(name);
    };
    const writePass = (node) => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      )
        write(node.left, node);
      if (
        ts.isPostfixUnaryExpression(node) ||
        (ts.isPrefixUnaryExpression(node) &&
          [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator))
      )
        write(node.operand, node);
      if (ts.isDeleteExpression(node)) write(node.expression, node);
      if (
        (ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
        !ts.isVariableDeclarationList(node.initializer)
      )
        write(node.initializer, node);
      ts.forEachChild(node, writePass);
    };
    writePass(file);
    const resolve = (node, anchor, visited = new Set()) => {
      node = unwrap(node);
      if (!node || !ts.isIdentifier(node)) return node;
      const found = binding(node.text, anchor);
      if (found.parameter || found.entries?.length !== 1 || found.scope.writes.has(node.text))
        return null;
      const declaration = found.entries[0];
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.initializer ||
        visited.has(declaration) ||
        visited.size >= 16 ||
        declaration.pos >= anchor.pos
      )
        return null;
      visited.add(declaration);
      return resolve(declaration.initializer, declaration, visited);
    };
    const entityPath = (node, anchor, visited = new Set()) => {
      node = unwrap(node);
      if (!node) return null;
      if (ts.isIdentifier(node)) {
        const found = binding(node.text, anchor);
        if (found.scope.writes.has(node.text)) return null;
        if (found.parameter) {
          const parameter = found.owner.parameters[1];
          return parameter &&
            directlyRegisteredHandler(found.owner) &&
            ts.isIdentifier(parameter.name) &&
            parameter.name.text === node.text &&
            !found.scope.declarations.has(node.text)
            ? ["HOST_CONTEXT"]
            : null;
        }
        if (
          found.entries?.length !== 1 ||
          !ts.isIdentifier(found.entries[0].name) ||
          visited.has(found.entries[0]) ||
          visited.size >= 16 ||
          found.entries[0].pos >= anchor.pos
        )
          return null;
        visited.add(found.entries[0]);
        return entityPath(found.entries[0].initializer, found.entries[0], visited);
      }
      if (ts.isPropertyAccessExpression(node)) {
        const base = entityPath(node.expression, anchor, visited);
        return base ? [...base, node.name.text] : null;
      }
      return null;
    };
    const ownLiteralProperties = (node, allowed) => {
      node = unwrap(node);
      if (!node || !ts.isObjectLiteralExpression(node)) return null;
      const properties = new Map();
      for (const property of node.properties) {
        if (
          !ts.isPropertyAssignment(property) ||
          ts.isComputedPropertyName(property.name) ||
          (!ts.isIdentifier(property.name) && !ts.isStringLiteralLike(property.name))
        )
          return null;
        const name = property.name.text;
        if (!allowed.has(name) || properties.has(name)) return null;
        properties.set(name, property.initializer);
      }
      return properties;
    };
    const fixedSetRequest = (call) => {
      if (call.arguments.length !== 1) return false;
      const request = ownLiteralProperties(
        call.arguments[0],
        new Set(["Entity", "Objects", "ExpectedProfileVersion"]),
      );
      if (
        !request ||
        !request.has("Entity") ||
        !request.has("Objects") ||
        JSON.stringify(entityPath(request.get("Entity"), call)) !==
          JSON.stringify(["HOST_CONTEXT", "currentEntity", "Entity"])
      )
        return false;
      const objects = unwrap(request.get("Objects"));
      if (!objects || !ts.isArrayLiteralExpression(objects) || !objects.elements.length)
        return false;
      return objects.elements.every((entry) => {
        const properties = ownLiteralProperties(entry, new Set(["ObjectName", "DataObject"]));
        return (
          properties &&
          properties.has("DataObject") &&
          literal(properties.get("ObjectName")) === "obj1"
        );
      });
    };
    const seen = new Set();
    const finding = (node, classification) => {
      const key = `${node.pos}:${classification}`;
      if (seen.has(key)) return;
      seen.add(key);
      const owner = scopeOf(node);
      report.findings.push({
        classification,
        containingFunctionSha256:
          owner === file ? null : sha(printer.printNode(ts.EmitHint.Unspecified, owner, file)),
      });
    };
    const visit = (node) => {
      if (ts.isWithStatement(node)) finding(node, "FAIL_CLOSED_DYNAMIC_BINDING_SCOPE");
      if (ts.isIdentifier(node) && node.text === "handlers") {
        const property = node.parent;
        const assignment = property?.parent;
        if (
          !ts.isPropertyAccessExpression(property) ||
          property.expression !== node ||
          !ts.isBinaryExpression(assignment) ||
          assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
          assignment.left !== property ||
          !ts.isFunctionExpression(assignment.right)
        )
          finding(node, "FAIL_CLOSED_HANDLER_ALIAS_OR_INVOCATION");
      }
      if (ts.isIdentifier(node) && PRIVILEGED.has(node.text)) {
        if (!ts.isPropertyAccessExpression(node.parent) || node.parent.expression !== node)
          finding(node, "FAIL_CLOSED_PRIVILEGED_ALIAS_OR_REBIND");
      }
      if (
        ts.isIdentifier(node) &&
        [
          "eval",
          "Function",
          "require",
          "fetch",
          "XMLHttpRequest",
          "WebSocket",
          "setTimeout",
          "setInterval",
        ].includes(node.text)
      )
        finding(node, "FAIL_CLOSED_DYNAMIC_EXECUTION");
      if (
        node.kind === ts.SyntaxKind.ThisKeyword ||
        (ts.isIdentifier(node) && ["globalThis", "global", "window"].includes(node.text))
      )
        finding(node, "FAIL_CLOSED_UNREVIEWED_GLOBAL_CONTEXT");
      if (ts.isPropertyAccessExpression(node) && FORBIDDEN.has(node.name.text))
        finding(node, "FAIL_CLOSED_FORBIDDEN_WRITER_OR_NESTED_EXECUTION");
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        PRIVILEGED.has(node.expression.text) &&
        (!ts.isCallExpression(node.parent) || node.parent.expression !== node)
      )
        finding(node, "FAIL_CLOSED_PRIVILEGED_MEMBER_REFERENCE");
      if (
        ts.isElementAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        PRIVILEGED.has(node.expression.text)
      )
        finding(node, "FAIL_CLOSED_COMPUTED_PRIVILEGED_ACCESS");
      if (ts.isCallExpression(node)) {
        const callee = unwrap(node.expression);
        if (ts.isPropertyAccessExpression(callee) && callee.name.text === "constructor")
          finding(node, "FAIL_CLOSED_DYNAMIC_EXECUTION");
        if (callee.kind === ts.SyntaxKind.ImportKeyword)
          finding(node, "FAIL_CLOSED_DYNAMIC_EXECUTION");
        if (ts.isElementAccessExpression(callee)) finding(node, "FAIL_CLOSED_COMPUTED_CALL");
        if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
          const receiver = callee.expression.text,
            method = callee.name.text;
          if (receiver === "entity" && method === "SetObjects") {
            report.objectMutationCallCount++;
            if (fixedSetRequest(node)) report.fixedObjectMutationCallCount++;
            else finding(node, "FAIL_CLOSED_OBJECT_REQUEST");
          } else if (receiver === "http" && method === "request") {
            report.outboundHttpCallCount++;
            if (FIXED_URLS.has(literal(resolve(node.arguments[0], node))))
              report.fixedOutboundHttpCallCount++;
            else finding(node, "FAIL_CLOSED_HTTP_URL");
          } else if (
            (receiver === "server" && !SERVER_DATA_METHODS.has(method)) ||
            (PRIVILEGED.has(receiver) && receiver !== "server")
          ) {
            finding(node, "FAIL_CLOSED_UNREVIEWED_PRIVILEGED_CALL");
          }
          if (
            (receiver === "Object" &&
              ["assign", "defineProperty", "defineProperties", "setPrototypeOf"].includes(
                method,
              )) ||
            (receiver === "Reflect" && ["set", "defineProperty", "setPrototypeOf"].includes(method))
          )
            finding(node, "FAIL_CLOSED_DYNAMIC_PROPERTY_WRITE");
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    if (!report.findings.length) report.classification = "STATIC_OBJECT_SCOPE_ONLY";
  } catch {
    report.classification = "FAIL_CLOSED";
    report.findings.push({
      classification: "FAIL_CLOSED_PARSE_OR_REVIEW",
      containingFunctionSha256: null,
    });
  }
  return report;
}
