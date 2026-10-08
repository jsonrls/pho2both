import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { Webhook } from "standardwebhooks";

process.env.DATABASE_URL = "";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3001";
const WEBHOOK_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
process.env.POLAR_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { app } = await import("../src/app.ts");
const { memoryUsers } = await import("../src/security/auth.ts");
const { getUserPlan } = await import("../src/services/polar.ts");

const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => new Promise(resolve => server.close(resolve)));

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=";
const password = "a quiet studio password 🌷";

class Client {
  cookies = new Map();
  async request(path, { method = "GET", body, origin = "http://localhost:3001", contentType = "application/json", raw, headers: extraHeaders = {} } = {}) {
    const headers = { ...extraHeaders };
    if (method !== "GET") {
      if (origin) headers.Origin = origin;
      if (contentType) headers["Content-Type"] = contentType;
    }
    const credential = [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    if (credential) headers.Cookie = credential;
    const response = await fetch(base + path, {
      method,
      headers,
      ...(method !== "GET" ? { body: raw ?? JSON.stringify(body ?? {}) } : {})
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const split = pair.indexOf("=");
      const name = pair.slice(0, split), value = pair.slice(split + 1);
      if (!value || /Max-Age=0/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const data = await response.json().catch(() => null);
    return { status: response.status, data, headers: response.headers };
  }
}

const user = new Client();
const stranger = new Client();
let testUserId = "";

test("GET /api/billing/plans returns public plan metadata with hero Creator Yearly", async () => {
  const res = await stranger.request("/api/billing/plans");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.plans));
  assert.equal(res.data.plans.length, 4);

  const yearly = res.data.plans.find(p => p.id === "creator_yearly");
  assert.ok(yearly);
  assert.equal(yearly.isHero, true);
  assert.equal(yearly.trialDays, 7);
  assert.equal(yearly.discountPercent, 18);
  assert.equal(yearly.price, 59);

  const eventPass = res.data.plans.find(p => p.id === "event");
  assert.ok(eventPass);
  assert.equal(eventPass.price, 19);
});

test("GET /api/billing/status requires authenticated session", async () => {
  const anon = await stranger.request("/api/billing/status");
  assert.equal(anon.status, 401);
  assert.equal(anon.data.code, "AUTH_REQUIRED");

  // Sign up user
  const email = `billing-test-${randomUUID()}@example.invalid`;
  const signup = await user.request("/api/auth/signup", {
    method: "POST",
    body: { email, password, name: "Billing Tester" }
  });
  assert.equal(signup.status, 201);
  testUserId = signup.data.user.id;

  const status = await user.request("/api/billing/status");
  assert.equal(status.status, 200);
  assert.equal(status.data.plan, "free");
  assert.equal(status.data.isPaid, false);
  assert.equal(status.data.canExportClean, false);
  assert.equal(status.data.limits.maxStripsPerSession, 10);
});

test("POST /api/billing/checkout generates checkout session for member", async () => {
  const anon = await stranger.request("/api/billing/checkout", {
    method: "POST",
    body: { plan: "creator_yearly" }
  });
  assert.equal(anon.status, 401);

  const invalid = await user.request("/api/billing/checkout", {
    method: "POST",
    body: { plan: "invalid_plan" }
  });
  assert.equal(invalid.status, 400);

  const checkout = await user.request("/api/billing/checkout", {
    method: "POST",
    body: { plan: "creator_yearly" }
  });
  assert.equal(checkout.status, 200);
  assert.ok(checkout.data.checkoutUrl);
  assert.ok(checkout.data.checkoutUrl.includes("sandbox.polar.sh"));
});

test("POST /api/billing/portal blocks free user without customer record", async () => {
  const portal = await user.request("/api/billing/portal", { method: "POST" });
  assert.equal(portal.status, 400);
  assert.equal(portal.data.code, "NO_CUSTOMER_RECORD");
});

test("POST /api/billing/webhook rejects invalid or unsigned requests", async () => {
  const unsigned = await fetch(`${base}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "order.created" })
  });
  assert.equal(unsigned.status, 403);

  const fakeSig = await fetch(`${base}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": "msg_bad",
      "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
      "webhook-signature": "v1,invalid_signature_hex"
    },
    body: JSON.stringify({ type: "order.created" })
  });
  assert.equal(fakeSig.status, 403);
});

test("POST /api/billing/webhook activates Event Pass and Creator subscription via signed webhooks", async () => {
  const wh = new Webhook(WEBHOOK_SECRET);

  // 1. Send order.created event for Event Pass
  const eventPayload = JSON.stringify({
    type: "order.created",
    data: {
      id: `ord_${randomUUID()}`,
      customerId: `cust_${testUserId}`,
      metadata: { userId: testUserId, plan: "event" }
    }
  });

  const now = new Date();
  const msgId1 = `msg_${randomUUID()}`;
  const sig1 = wh.sign(msgId1, now, eventPayload);

  const res1 = await fetch(`${base}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": msgId1,
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
      "webhook-signature": sig1
    },
    body: eventPayload
  });
  assert.equal(res1.status, 200);

  // Status now shows event plan active
  const status1 = await user.request("/api/billing/status");
  assert.equal(status1.data.plan, "event");
  assert.equal(status1.data.isPaid, true);
  assert.equal(status1.data.limits.maxStripsPerSession, 100);

  // 2. Send subscription.active event for Creator Yearly
  const subPayload = JSON.stringify({
    type: "subscription.active",
    data: {
      id: `sub_${randomUUID()}`,
      customerId: `cust_${testUserId}`,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      metadata: { userId: testUserId, plan: "creator_yearly" }
    }
  });

  const msgId2 = `msg_${randomUUID()}`;
  const sig2 = wh.sign(msgId2, now, subPayload);

  const res2 = await fetch(`${base}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": msgId2,
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
      "webhook-signature": sig2
    },
    body: subPayload
  });
  assert.equal(res2.status, 200);

  // Status now shows creator_yearly active
  const status2 = await user.request("/api/billing/status");
  assert.equal(status2.data.plan, "creator_yearly");
  assert.equal(status2.data.isPaid, true);
  assert.equal(status2.data.canExportClean, true);

  // Customer portal now succeeds
  const portal = await user.request("/api/billing/portal", { method: "POST" });
  assert.equal(portal.status, 200);
  assert.ok(portal.data.portalUrl);

  // 3. Send subscription.revoked event
  const revokePayload = JSON.stringify({
    type: "subscription.revoked",
    data: {
      id: `sub_${randomUUID()}`,
      customerId: `cust_${testUserId}`,
      metadata: { userId: testUserId }
    }
  });

  const msgId3 = `msg_${randomUUID()}`;
  const sig3 = wh.sign(msgId3, now, revokePayload);

  const res3 = await fetch(`${base}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": msgId3,
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
      "webhook-signature": sig3
    },
    body: revokePayload
  });
  assert.equal(res3.status, 200);

  // Status returns to free
  const status3 = await user.request("/api/billing/status");
  assert.equal(status3.data.plan, "free");
  assert.equal(status3.data.isPaid, false);
});

test("production public billing catalog regression", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  execFileSync(process.execPath, [
    "--import", "tsx", "--test",
    fileURLToPath(new URL("./billing-public.test.mjs", import.meta.url)),
  ], { timeout: 30_000, stdio: "pipe", env });
});
