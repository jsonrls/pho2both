import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import ts from "typescript";
import { NextRequest } from "next/server.js";

function moduleUrl(source) {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const read = path => readFile(new URL(path, import.meta.url), "utf8");
const apiUrl = moduleUrl(await read("../src/lib/api.ts"));
const library = await import(moduleUrl((await read("../src/lib/libraryApi.ts")).replace('"./api"', JSON.stringify(apiUrl))));
const require = createRequire(import.meta.url);
const nextUrl = pathToFileURL(require.resolve("next/server.js")).href;
const proxy = await import(moduleUrl((await read("../src/app/api/[...path]/route.ts")).replace('"next/server"', JSON.stringify(nextUrl))));
const context = path => ({ params: Promise.resolve({ path: path.split("/") }) });

function browser(t) { globalThis.window = { dispatchEvent() {} }; t.after(() => { delete globalThis.window; }); }

test("library lists use opaque encoded cursors and never accept owner query parameters", async t => {
  browser(t);
  const page = { items: [{ id: "fixture", createdAt: "2026-10-06T00:00:00Z" }], nextCursor: "opaque_next" };
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(page));
  assert.deepEqual(await library.getLibraryPage("sessions", "opaque&userId=other", new AbortController().signal), page);
  const [path, options] = fetch.mock.calls[0].arguments;
  const url = new URL(path, "https://fixture.invalid");
  assert.equal(url.pathname, "/api/library/sessions");
  assert.equal(url.searchParams.get("cursor"), "opaque&userId=other");
  assert.deepEqual([...url.searchParams.keys()], ["limit", "cursor"]);
  assert.equal(options.credentials, "same-origin"); assert.equal(options.cache, "no-store");
  for (const invalid of ["sessions/user/other", "strips?userId=other", "sessions/../photos"]) assert.throws(() => library.libraryListPath(invalid));
  assert.equal(library.libraryListPath("sessions/fixture/photos"), "/api/library/sessions/fixture/photos?limit=20");
});

test("private binary survives proxy with cookie authentication and no-store headers", async t => {
  const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(bytes, { headers: { "content-type": "image/png", "set-cookie": "session=fixture; HttpOnly; Path=/" } }));
  const request = new NextRequest("http://localhost:3001/api/library/photos/fixture/media", { headers: { cookie: "session=fixture" } });
  const response = await proxy.GET(request, context("library/photos/fixture/media"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.getSetCookie().length, 1);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(fetch.mock.calls[0].arguments[1].headers.get("cookie"), "session=fixture");
  assert.equal(fetch.mock.calls[0].arguments[1].cache, "no-store");
});

test("library proxy forwards paginated queries unchanged", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ items: [], nextCursor: null }));
  const request = new NextRequest("http://localhost:3001/api/library/strips?limit=20&cursor=opaque_next");
  assert.equal((await proxy.GET(request, context("library/strips"))).status, 200);
  assert.ok(fetch.mock.calls[0].arguments[0].endsWith("/api/library/strips?limit=20&cursor=opaque_next"));
});

test("binary client returns actual bytes, rejects non-image bodies and hides backend errors", async t => {
  browser(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array([1, 2, 255]), { headers: { "content-type": "image/webp" } }));
  const blob = await library.getLibraryMedia("photos", "fixture", new AbortController().signal);
  assert.equal(blob.type, "image/webp"); assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array([1, 2, 255]));
  fetch.mock.mockImplementation(async () => Response.json({ private: "secret" }));
  await assert.rejects(library.getLibraryMedia("photos", "fixture", new AbortController().signal), /Invalid image response/);
  for (const status of [401, 404, 503]) {
    fetch.mock.mockImplementation(async () => Response.json({ error: "private database details" }, { status }));
    await assert.rejects(library.getLibraryMedia("photos", "fixture", new AbortController().signal), error => error.status === status && !error.message.includes("database"));
  }
});

test("aborted private responses cannot complete even when a transport ignores abort", async t => {
  browser(t);
  let resolve;
  const fetch = t.mock.method(globalThis, "fetch", () => new Promise(done => { resolve = done; }));
  const controller = new AbortController();
  const pending = library.getLibraryMedia("photos", "fixture", controller.signal);
  controller.abort();
  resolve(new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } }));
  await assert.rejects(pending, error => error.name === "AbortError");
  assert.equal(fetch.mock.callCount(), 1);
  const canceled = new AbortController(); canceled.abort();
  await assert.rejects(library.getLibraryPage("strips", null, canceled.signal), error => error.name === "AbortError");
  assert.equal(fetch.mock.callCount(), 1);
});

test("metadata rejects malformed pages instead of reporting an empty library", async t => {
  browser(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ items: null }));
  await assert.rejects(library.getLibraryPage("strips", null, new AbortController().signal), /Invalid library response/);
});

test("both keepsake destinations resolve to the share code, never the private record ID", async () => {
  const source = await read("../src/app/library/Library.tsx");
  const file = ts.createSourceFile("Library.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const destinations = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === "href" && node.initializer && ts.isJsxExpression(node.initializer)) {
      const expression = node.initializer.expression?.getText(file);
      if (expression?.includes("strip.")) destinations.push(expression);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(destinations.length, 2);
  const strip = { id: "b4dcfcab-4b50-440c-b023-f378c6a56186", shareCode: "A".repeat(32) };
  for (const expression of destinations) {
    const resolve = new Function("strip", `return ${expression}`);
    assert.equal(resolve(strip), `/download/${strip.shareCode}`);
    assert.equal(resolve({ ...strip, shareCode: "legacy/code" }), "/download/legacy%2Fcode");
  }
});
