import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server.js";
import { executeServerlessApi } from "../src/server/handler.js";

// Use test mode so memory storage is allowed without requiring live network DB
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3000";

function createNextRequest(path, options = {}) {
  const method = options.method || "GET";
  const url = `http://localhost:3000/api/${path}`;
  const headers = new Headers({
    origin: "http://localhost:3000",
    ...(options.headers || {}),
  });
  if (options.body) {
    headers.set("content-type", "application/json");
  }
  return new NextRequest(url, {
    method,
    headers,
    body: options.body,
  });
}

test("serverless in-process: health endpoint returns 200 ok", async () => {
  const req = createNextRequest("health");
  const res = await executeServerlessApi(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ok");
});

test("serverless in-process: anonymous auth session returns 200 with user null", async () => {
  const req = createNextRequest("auth/session");
  const res = await executeServerlessApi(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.user, null);
  assert.equal(data.reason, "anonymous");
});

test("serverless in-process: create session returns 201 and sets guest cookie", async () => {
  const body = Buffer.from(JSON.stringify({ boothName: "Serverless Booth", photoCount: 4 }));
  const req = createNextRequest("sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(body.length),
    },
  });
  const res = await executeServerlessApi(req, body);
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.session.boothName, "Serverless Booth");
  assert.equal(data.session.isGuest, true);
  assert.ok(data.session.id);
  assert.ok(data.session.sessionCode);

  const cookies = res.headers.getSetCookie();
  assert.ok(cookies.some(c => c.includes("p2b_guest=")));
});

test("serverless in-process: unauthorized origin returns 403", async () => {
  const body = Buffer.from(JSON.stringify({ boothName: "Hostile Booth" }));
  const req = new NextRequest("http://localhost:3000/api/sessions", {
    method: "POST",
    headers: {
      origin: "https://evil.attacker.invalid",
      "content-type": "application/json",
      "content-length": String(body.length),
    },
  });
  const res = await executeServerlessApi(req, body);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.code, "ORIGIN_FORBIDDEN");
});

test("serverless in-process: full booth flow (session -> photo -> strip -> retrieval)", async () => {
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=";
  
  // 1. Create Session
  const sessionBody = Buffer.from(JSON.stringify({ boothName: "Flow Test", photoCount: 4 }));
  const sessionReq = createNextRequest("sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(sessionBody.length),
    },
  });
  const sessionRes = await executeServerlessApi(sessionReq, sessionBody);
  assert.equal(sessionRes.status, 201);
  const sessionData = await sessionRes.json();
  const sessionId = sessionData.session.id;

  // Extract guest cookie
  const guestCookie = sessionRes.headers.getSetCookie().find(c => c.includes("p2b_guest="));
  assert.ok(guestCookie);
  const cookieHeader = guestCookie.split(";")[0];

  // 2. Upload Photo
  const photoBody = Buffer.from(JSON.stringify({
    sessionId,
    shotIndex: 0,
    imageData: image,
    filterName: "normal",
  }));
  const photoReq = createNextRequest("photos", {
    method: "POST",
    headers: {
      cookie: cookieHeader,
      "content-type": "application/json",
      "content-length": String(photoBody.length),
    },
  });
  const photoRes = await executeServerlessApi(photoReq, photoBody);
  assert.equal(photoRes.status, 201);

  // 3. Persist Strip
  const stripBody = Buffer.from(JSON.stringify({
    sessionId,
    stripData: image,
    template: "classic-strip",
  }));
  const stripReq = createNextRequest("strips", {
    method: "POST",
    headers: {
      cookie: cookieHeader,
      "content-type": "application/json",
      "content-length": String(stripBody.length),
    },
  });
  const stripRes = await executeServerlessApi(stripReq, stripBody);
  assert.equal(stripRes.status, 201);
  const stripData = await stripRes.json();
  assert.ok(stripData.strip.shareCode);

  // 4. Retrieve Strip via public shareCode
  const getReq = createNextRequest(`strips/${stripData.strip.shareCode}`);
  const getRes = await executeServerlessApi(getReq);
  assert.equal(getRes.status, 200);
  const retrieved = await getRes.json();
  assert.equal(retrieved.strip.shareCode, stripData.strip.shareCode);
  assert.equal(retrieved.strip.template, "classic-strip");
});

test("serverless in-process: billing plans returns 200 with all 4 plans", async () => {
  const req = createNextRequest("billing/plans");
  const res = await executeServerlessApi(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.plans));
  assert.equal(data.plans.length, 4);
  assert.ok(data.plans.some(p => p.id === "creator_yearly" && p.isHero));
});

test("serverless in-process: signed webhook processes order.created and subscription.active", async () => {
  const { Webhook } = await import("standardwebhooks");
  const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  process.env.POLAR_WEBHOOK_SECRET = secret;
  const wh = new Webhook(secret);

  const payload = JSON.stringify({
    type: "order.created",
    data: {
      id: "ord_serverless_123",
      customerId: "cust_serverless_123",
      metadata: { userId: "user_test_serverless", plan: "event" },
    },
  });
  const now = new Date();
  const msgId = "msg_serverless_123";
  const sig = wh.sign(msgId, now, payload);

  const body = Buffer.from(payload);
  const req = new NextRequest("http://localhost:3000/api/billing/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(body.length),
      "webhook-id": msgId,
      "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
      "webhook-signature": sig,
    },
    body,
  });

  const res = await executeServerlessApi(req, body);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.received, true);
  assert.equal(data.processed, true);
  assert.equal(data.plan, "event");
});

test("production public billing catalog regression", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  execFileSync(process.execPath, [
    "--import", "tsx", "--test",
    fileURLToPath(new URL("./billing-public.test.mjs", import.meta.url)),
  ], { timeout: 30_000, stdio: "pipe", env });
});
