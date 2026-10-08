import assert from "node:assert/strict";

export function installPolarTransport() {
  process.env.POLAR_ACCESS_TOKEN = "polar_oat_test_only";
  process.env.POLAR_SERVER = "sandbox";
  process.env.POLAR_PRODUCT_CREATOR_MONTHLY = "11111111-1111-4111-8111-111111111111";
  process.env.POLAR_PRODUCT_CREATOR_YEARLY = "22222222-2222-4222-8222-222222222222";
  process.env.POLAR_PRODUCT_EVENT_PASS = "33333333-3333-4333-8333-333333333333";
  const originalFetch = globalThis.fetch;
  const requests = [];
  let failureStatus = null;
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname === "127.0.0.1") return originalFetch(input, options);
    assert.equal(url.hostname, "sandbox-api.polar.sh", "Unexpected external request");
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    requests.push({ path: url.pathname, body });
    if (failureStatus) return Response.json({ detail: "private billing-test@example.invalid polar_oat_test_only" }, { status: failureStatus });
    if (url.pathname === "/v1/checkouts/") {
      assert.ok(Array.isArray(body.products));
      assert.equal(body.products.length, 1);
      return Response.json({ id: "checkout_test", url: "https://sandbox.polar.sh/checkout/test" });
    }
    assert.equal(url.pathname, "/v1/customer-sessions/");
    assert.ok(body.customer_id);
    return Response.json({ customer_portal_url: "https://sandbox.polar.sh/portal/test" });
  };
  return { requests, failWith(status) { failureStatus = status; }, restore() { globalThis.fetch = originalFetch; } };
}
