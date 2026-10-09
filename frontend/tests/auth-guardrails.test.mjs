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
const apiUrl = moduleUrl(await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8"));
const authSource = (await readFile(new URL("../src/lib/authApi.ts", import.meta.url), "utf8")).replace('"./api"', JSON.stringify(apiUrl));
const auth = await import(moduleUrl(authSource));
const require = createRequire(import.meta.url);
const nextUrl = pathToFileURL(require.resolve("next/server.js")).href;
const proxySource = (await readFile(new URL("../src/app/api/[...path]/route.ts", import.meta.url), "utf8")).replace('"next/server"', JSON.stringify(nextUrl));
const proxy = await import(moduleUrl(proxySource));

test("auth return destinations stay within approved public pages", () => {
  for (const value of ["/", "/?booth=1", "/auth", "/library", "/download", "/billing", "/download/OLD_CODE", `/download/${"A".repeat(32)}`]) assert.equal(auth.safeAuthReturn(value), value);
  for (const value of [null, "https://hostile.invalid", "//hostile.invalid", "/\\hostile.invalid", "/api/auth/logout", "/download/%2f%2fhostile", "/download/CODE?redirect=bad", "/download/" + "A".repeat(20), "/auth\n", "/library/", "/library?userId=other", "/library#other", "/?booth=2"]) assert.equal(auth.safeAuthReturn(value), "/?booth=1");
});

test("auth verification uses same-origin cookies without browser-readable credentials", async t => {
  globalThis.window = {}; t.after(() => { delete globalThis.window; });
  const result = { user: { id: "verified", email: "fixture@example.invalid" }, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(result));
  assert.deepEqual(await auth.authRequest("session"), result);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, "/api/auth/session");
  assert.equal(options.credentials, "same-origin");
  assert.equal(options.cache, "no-store");
  assert.ok(!options.headers?.Authorization);
});

test("unverifiable, expired, or missing session metadata fails closed", async t => {
  const fetch = t.mock.method(globalThis, "fetch");
  for (const result of [{}, { user: { id: "bad", email: "fixture@example.invalid" } }, { user: { id: "bad", email: "fixture@example.invalid" }, expiresAt: "invalid" }, { user: { id: "bad", email: "fixture@example.invalid" }, expiresAt: new Date(0).toISOString() }]) {
    fetch.mock.mockImplementation(async () => Response.json(result));
    await assert.rejects(auth.authRequest("session"), /couldn’t check your session/);
  }
});

test("logout awaits a successful revocation response and reports service failure", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "private storage failure" }, { status: 503 }));
  await assert.rejects(auth.authRequest("logout", {}), error => error.status === 503 && !error.message.includes("private storage"));
  fetch.mock.mockImplementation(async () => Response.json({ success: true }));
  assert.deepEqual(await auth.authRequest("logout", {}), { user: null });
});

function request(path, options = {}) {
  return new NextRequest(`http://localhost:3001/api/${path}`, { method: "POST", headers: { origin: "http://localhost:3001", "content-type": "application/json", ...options.headers }, body: options.body ?? "{}" });
}
const context = path => ({ params: Promise.resolve({ path: path.split("/") }) });

test("proxy preserves each Set-Cookie and forwards only intended request headers", async t => {
  const old = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = "http://localhost:3001";
  t.after(() => { if (old === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = old; });
  const headers = new Headers({ "Content-Type": "application/json", "X-Private-Internal": "hidden" });
  headers.append("Set-Cookie", "session=fixture; HttpOnly; Path=/; Expires=Wed, 07 Oct 2026 07:30:00 GMT");
  headers.append("Set-Cookie", "guest=fixture; HttpOnly; Path=/");
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("{}", { headers }));
  const result = await proxy.POST(request("auth/signin", { headers: { cookie: "session=fixture", "x-forwarded-for": "spoofed", authorization: "untrusted" } }), context("auth/signin"));
  assert.equal(result.status, 200);
  assert.equal(result.headers.getSetCookie().length, 2);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("x-private-internal"), null);
  const options = fetch.mock.calls[0].arguments[1];
  assert.equal(options.headers.get("cookie"), "session=fixture");
  assert.equal(options.headers.get("x-forwarded-for"), null);
  assert.equal(options.headers.get("authorization"), null);
  assert.equal(options.redirect, "manual");
  assert.equal(fetch.mock.callCount(), 1);
});

test("proxy rejects cross-site, compressed, and oversized writes before contacting storage", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  const cases = [
    [request("auth/signup", { headers: { origin: "https://hostile.invalid" } }), 403],
    [request("auth/signup", { headers: { origin: "null" } }), 403],
    [request("auth/signup", { headers: { "content-type": "text/plain" } }), 415],
    [request("auth/signup", { headers: { "content-encoding": "gzip" } }), 415],
    [request("auth/signup", { body: "x".repeat(17_000) }), 413],
  ];
  for (const [req, status] of cases) assert.equal((await proxy.POST(req, context("auth/signup"))).status, status);
  assert.equal(fetch.mock.callCount(), 0);
});

test("proxy path traversal and unrecognized services never reach the backend", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  for (const path of ["unknown", "strips/../auth", "strips/encoded%2Fpath"]) {
    assert.equal((await proxy.GET(new NextRequest("http://localhost:3001/api/health"), context(path))).status, 404);
  }
  assert.equal(fetch.mock.callCount(), 0);
});
