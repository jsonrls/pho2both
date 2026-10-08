import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

function useBrowser(t) {
  globalThis.window = { location: { hostname: "studio.example", protocol: "https:" } };
  t.after(() => { delete globalThis.window; });
}

test("a browser save uses the same-origin proxy exactly once", async (t) => {
  useBrowser(t);
  const response = Response.json({ session: { id: "session-1" } }, { status: 201 });
  const fetch = t.mock.method(globalThis, "fetch", async () => response);

  assert.deepEqual(await api.createBoothSession({ photoCount: 4 }), { session: { id: "session-1" } });
  assert.equal(fetch.mock.callCount(), 1);
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, "/api/sessions");
  assert.equal(options.method, "POST");
  assert.deepEqual(JSON.parse(options.body), { photoCount: 4 });
});

test("an HTTP failure is preserved without replaying a POST", async (t) => {
  useBrowser(t);
  const response = Response.json({ error: "Internal service details" }, { status: 503 });
  const fetch = t.mock.method(globalThis, "fetch", async () => response);

  const result = await api.fetchWithFallback("api/sessions", { method: "POST" });
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: "Internal service details" });
  assert.equal(fetch.mock.callCount(), 1);
});

test("a failed save reports an actionable error and hides server internals", async (t) => {
  useBrowser(t);
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "Internal service details" }, { status: 503 }));

  await assert.rejects(api.createBoothSession({}), (error) => {
    assert.ok(error instanceof api.ApiError);
    assert.equal(error.status, 503);
    assert.equal(error.code, "BACKEND_UNAVAILABLE");
    assert.match(error.message, /unavailable.*try again/i);
    assert.doesNotMatch(error.message, /Internal service details/);
    return true;
  });
  assert.equal(fetch.mock.callCount(), 1);
});

test("a rejected fetch becomes a recoverable network error without another request", async (t) => {
  useBrowser(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  const clearTimer = t.mock.method(globalThis, "clearTimeout");

  await assert.rejects(api.createBoothSession({}), (error) => {
    assert.equal(error.code, "API_NETWORK_ERROR");
    assert.match(error.message, /connection.*try again/i);
    return true;
  });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(clearTimer.mock.callCount(), 1);
});

test("the timeout still applies when the caller supplies a signal", async (t) => {
  useBrowser(t);
  let expire;
  t.mock.method(globalThis, "setTimeout", (callback) => { expire = callback; return 123; });
  const clearTimer = t.mock.method(globalThis, "clearTimeout", () => {});
  const fetch = t.mock.method(globalThis, "fetch", (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  const caller = new AbortController();
  const request = api.fetchWithFallback("/api/sessions", { method: "POST", signal: caller.signal });
  expire();

  await assert.rejects(request, (error) => error.code === "API_TIMEOUT" && error.status === 504);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(caller.signal.aborted, false);
  assert.equal(clearTimer.mock.callCount(), 1);
});

test("caller cancellation propagates and never triggers a fallback", async (t) => {
  useBrowser(t);
  const fetch = t.mock.method(globalThis, "fetch", (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  const caller = new AbortController();
  const request = api.fetchWithFallback("/api/sessions", { method: "POST", signal: caller.signal });
  caller.abort();

  await assert.rejects(request, (error) => error.name === "AbortError");
  assert.equal(fetch.mock.callCount(), 1);
});

test("a stalled response body times out after successful headers", async (t) => {
  useBrowser(t);
  let expire;
  t.mock.method(globalThis, "setTimeout", (callback) => { expire = callback; return 123; });
  const clearTimer = t.mock.method(globalThis, "clearTimeout", () => {});
  const fetch = t.mock.method(globalThis, "fetch", async (_url, { signal }) => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"session":'));
        signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      },
    });
    return new Response(body, { status: 201 });
  });
  const request = api.createBoothSession({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(clearTimer.mock.callCount(), 0);
  expire();

  await assert.rejects(request, (error) => error.code === "API_TIMEOUT" && error.status === 504);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(clearTimer.mock.callCount(), 1);
});

test("caller cancellation remains connected after response headers", async (t) => {
  useBrowser(t);
  const fetch = t.mock.method(globalThis, "fetch", async (_url, { signal }) => {
    const body = new ReadableStream({
      start(controller) {
        signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      },
    });
    return new Response(body, { status: 200 });
  });
  const caller = new AbortController();
  const request = api.fetchWithFallback("/api/sessions", { signal: caller.signal });
  await new Promise(resolve => setImmediate(resolve));
  caller.abort();

  await assert.rejects(request, (error) => error.name === "AbortError");
  assert.equal(fetch.mock.callCount(), 1);
});

test("an empty response retains its status and headers", async (t) => {
  useBrowser(t);
  t.mock.method(globalThis, "fetch", async () => new Response(null, {
    status: 204,
    headers: { "X-Photo-Service": "ready" },
  }));
  const result = await api.fetchWithFallback("/api/health");

  assert.equal(result.status, 204);
  assert.equal(result.headers.get("X-Photo-Service"), "ready");
  assert.equal(result.body, null);
});

test("a cancelled request does not start a fetch", async (t) => {
  useBrowser(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  const caller = new AbortController();
  caller.abort();

  await assert.rejects(api.fetchWithFallback("/api/sessions", { signal: caller.signal }), (error) => error.name === "AbortError");
  assert.equal(fetch.mock.callCount(), 0);
});

test("validation and expired-link errors retain their HTTP status", async (t) => {
  useBrowser(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Photo count is invalid" }, { status: 400 }));
  await assert.rejects(api.createBoothSession({}), (error) => error.status === 400 && error.message === "Photo count is invalid");

  fetch.mock.mockImplementation(async () => Response.json({ isExpired: true, message: "Guest link expired" }, { status: 410 }));
  await assert.rejects(api.getPhotoStrip("expired"), (error) => error.isExpired && error.status === 410 && error.message === "Guest link expired");
});

test("server requests honor the configured internal backend URL", async (t) => {
  const previous = process.env.BACKEND_INTERNAL_URL;
  process.env.BACKEND_INTERNAL_URL = "https://internal.example/";
  t.after(() => {
    if (previous === undefined) delete process.env.BACKEND_INTERNAL_URL;
    else process.env.BACKEND_INTERNAL_URL = previous;
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({}));

  await api.fetchWithFallback("/api/health");
  assert.equal(fetch.mock.calls[0].arguments[0], "https://internal.example/api/health");
});
