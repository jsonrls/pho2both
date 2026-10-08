import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "";
process.env.FRONTEND_URL = "https://billing.example.invalid";

const { app } = await import("../src/app.ts");
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
after(() => new Promise(resolve => server.close(resolve)));
const base = `http://127.0.0.1:${server.address().port}`;
const send = (path, options) => fetch(base + path, options);

const sessionCookie = `__Host-p2b_session=${"a".repeat(64)}`;
let requests = 0;
function request(path, method = "GET", cookie = sessionCookie) {
  requests++;
  return send(path, {
    method,
    ...(method === "POST" ? { body: "{}" } : {}),
    headers: {
      origin: process.env.FRONTEND_URL,
      "content-type": "application/json",
      ...(method === "POST" ? { "content-length": "2" } : {}),
      ...(cookie ? { cookie } : {}),
    },
  });
}

test("public catalog works in production without usable storage, with or without session cookies", async () => {
  let catalog;
  for (const cookie of ["", sessionCookie, "__Host-p2b_session=malformed"]) {
    const response = await request("/api/billing/plans", "GET", cookie);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.plans.length, 4);
    assert.deepEqual(data.plans, Object.values(data.plansById));
    if (catalog) assert.deepEqual(data, catalog);
    catalog = data;
  }
});

test("protected billing operations and non-GET catalog requests fail closed", async () => {
  for (const cookie of ["", sessionCookie]) {
    for (const [method, path] of [
      ["GET", "/api/billing/status"],
      ["POST", "/api/billing/checkout"],
      ["POST", "/api/billing/portal"],
      ["POST", "/api/billing/plans"],
      ["GET", "/api/billing/plans/extra"],
    ]) {
      const response = await request(path, method, cookie);
      assert.equal(response.status, 503, `${method} ${path}`);
      assert.equal((await response.json()).code, "SERVICE_UNAVAILABLE");
    }
  }
});

test("public catalog remains subject to the shared API rate limit", async () => {
  while (requests < 300) {
    const response = await request("/api/billing/plans");
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  const response = await request("/api/billing/plans");
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "RATE_LIMITED");
  assert.ok(response.headers.get("retry-after"));
});
