import assert from "node:assert/strict";
import { after, test } from "node:test";
import { installPolarTransport } from "./fixtures/polar-transport.mjs";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.FRONTEND_URL = "https://booth.example.invalid";
process.env.VERCEL_PROJECT_PRODUCTION_URL = "production.example.invalid";
const transport = installPolarTransport();
after(() => transport.restore());
const { createCheckoutSession, createCustomerPortalSession, memorySubscriptions } = await import("../src/services/polar.ts");
const { app } = await import("../src/app.ts");
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
after(() => new Promise(resolve => server.close(resolve)));
const base = `http://127.0.0.1:${server.address().port}`;
const params = { userId: "user_test", email: "billing-test@example.invalid", plan: "creator_monthly" };

for (const [plan, productVariable] of [
  ["creator_monthly", "POLAR_PRODUCT_CREATOR_MONTHLY"],
  ["creator_yearly", "POLAR_PRODUCT_CREATOR_YEARLY"],
  ["event", "POLAR_PRODUCT_EVENT_PASS"],
]) {
  test(`${plan} serializes the SDK checkout contract`, async () => {
    assert.deepEqual(await createCheckoutSession({ ...params, plan }), { checkoutId: "checkout_test", checkoutUrl: "https://sandbox.polar.sh/checkout/test" });
    assert.deepEqual(transport.requests.at(-1).body, {
      products: [process.env[productVariable]],
      customer_email: params.email,
      external_customer_id: params.userId,
      metadata: { userId: params.userId, plan },
      success_url: "https://booth.example.invalid/auth?checkout=success",
      ...(plan === "creator_yearly" ? { trial_interval: "day", trial_interval_count: 7 } : {}),
    });
  });
}

test("return URLs prefer explicit override, frontend origin, then production hostname", async () => {
  process.env.NODE_ENV = "production";
  try {
    await createCheckoutSession({ ...params, successUrl: "https://return.example.invalid/done?keep=1" });
    assert.equal(transport.requests.at(-1).body.success_url, "https://return.example.invalid/done?keep=1");
    delete process.env.FRONTEND_URL;
    await createCheckoutSession(params);
    assert.equal(transport.requests.at(-1).body.success_url, "https://production.example.invalid/auth?checkout=success");
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    await assert.rejects(createCheckoutSession(params), /return URL is not configured/);
    await assert.rejects(createCheckoutSession({ ...params, successUrl: "http://localhost:3000/done" }), /Invalid checkout return URL/);
    process.env.NODE_ENV = "test";
    await createCheckoutSession(params);
    assert.equal(transport.requests.at(-1).body.success_url, "http://localhost:3000/auth?checkout=success");
  } finally {
    process.env.NODE_ENV = "test";
    process.env.FRONTEND_URL = "https://booth.example.invalid";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "production.example.invalid";
  }
});

test("missing credentials or products fail without transport or fabricated URLs", async () => {
  const count = transport.requests.length;
  process.env.POLAR_ACCESS_TOKEN = "";
  await assert.rejects(createCheckoutSession(params), /POLAR_ACCESS_TOKEN/);
  await assert.rejects(createCustomerPortalSession("customer_test"), /POLAR_ACCESS_TOKEN/);
  process.env.POLAR_ACCESS_TOKEN = "polar_oat_test_only";
  for (const [plan, variable] of [["creator_monthly", "POLAR_PRODUCT_CREATOR_MONTHLY"], ["creator_yearly", "POLAR_PRODUCT_CREATOR_YEARLY"], ["event", "POLAR_PRODUCT_EVENT_PASS"]]) {
    const value = process.env[variable];
    process.env[variable] = " ";
    await assert.rejects(createCheckoutSession({ ...params, plan }), /product is not configured/);
    process.env[variable] = value;
  }
  assert.equal(transport.requests.length, count);
});

test("portal uses the SDK customer_id contract", async () => {
  assert.deepEqual(await createCustomerPortalSession("customer_test"), { portalUrl: "https://sandbox.polar.sh/portal/test" });
  assert.deepEqual(transport.requests.at(-1).body, { customer_id: "customer_test" });
});

test("billing routes retain authentication and log only safe upstream diagnostics", async () => {
  const headers = { origin: "https://booth.example.invalid", "content-type": "application/json" };
  for (const path of ["checkout", "portal"]) {
    const response = await fetch(`${base}/api/billing/${path}`, { method: "POST", headers, body: JSON.stringify({ plan: "creator_monthly" }) });
    assert.equal(response.status, 401);
    await response.arrayBuffer();
  }
  const signup = await fetch(`${base}/api/auth/signup`, { method: "POST", headers, body: JSON.stringify({ name: "Test", email: params.email, password: "a long test password 12345" }) });
  assert.equal(signup.status, 201);
  const { user } = await signup.json();
  headers.cookie = signup.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  memorySubscriptions.set("subscription_test", { id: "subscription_test", userId: user.id, polarCustomerId: "customer_test", createdAt: new Date() });
  const originalError = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values);
  try {
    for (const status of [422, 401]) {
      transport.failWith(status);
      for (const operation of ["checkout", "portal"]) {
        const response = await fetch(`${base}/api/billing/${operation}`, { method: "POST", headers, body: JSON.stringify(operation === "checkout" ? { plan: "creator_monthly" } : {}) });
        assert.equal(response.status, 500);
        const data = await response.json();
        assert.equal(data.code, operation === "checkout" ? "CHECKOUT_FAILED" : "PORTAL_FAILED");
        assert.deepEqual(logs.at(-1), [JSON.stringify({ event: "billing_failed", operation, category: "upstream", upstreamStatus: status })]);
        assert.ok(!JSON.stringify(data).includes(params.email));
      }
    }
  } finally {
    console.error = originalError;
    transport.failWith(null);
  }
});
