import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.DATABASE_URL = "";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3001";
const { app } = await import("../src/app.ts");
const { memorySessions, memoryPhotos, memoryStrips } = await import("../src/security/resources.ts");
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => new Promise(resolve => server.close(resolve)));

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=";
const now = new Date(Date.now() - 1000);
const password = "a quiet studio password 🌷";
async function account(label) {
  const response = await fetch(`${base}/api/auth/signup`, { method: "POST", headers: { Origin: "http://localhost:3001", "Content-Type": "application/json" }, body: JSON.stringify({ name: label, email: `${label}@example.invalid`, password }) });
  assert.equal(response.status, 201);
  return { user: (await response.json()).user, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}
const alice = await account("library-alice"), bob = await account("library-bob");
function session(id, userId, extra = {}) {
  const value = { id, userId, isGuest: false, guestOwnerHash: null, sessionCode: id, boothName: "Stored memory", theme: "cream", layout: "strip-4", photoCount: 4, countdownSeconds: 3, status: "active", createdAt: now, updatedAt: now, ...extra };
  memorySessions.set(id, value);
  return value;
}
function strip(id, parent, extra = {}) {
  const value = { id, sessionId: parent.id, userId: parent.userId, isGuest: parent.isGuest, expiresAt: null, shareCode: id.padStart(32, "A"), stripData: image, template: "strip-4", headerText: "A happy day", footerText: "Keepsake", frameColor: "#ffffff", textColor: "#29251f", downloadCount: 0, createdAt: now, ...extra };
  memoryStrips.set(value.shareCode, value);
  return value;
}
for (let index = 0; index < 60; index++) {
  const id = `session-${String(index).padStart(2, "0")}`;
  strip(`strip-${String(index).padStart(2, "0")}`, session(id, alice.user.id));
}
const own = memorySessions.get("session-00"), other = session("other-session", bob.user.id), guest = session("claimed-guest", alice.user.id, { isGuest: true, guestOwnerHash: "private-fixture-owner" });
strip("other-strip", other);
strip("wrong-parent-strip", other, { userId: alice.user.id });
strip("wrong-strip-owner", own, { userId: bob.user.id });
strip("claimed-guest-strip", guest, { isGuest: false });
strip("guest-on-member", own, { isGuest: true });
strip("expired-strip", own, { expiresAt: new Date(0) });
const photo = { id: "owned-photo", sessionId: own.id, shotIndex: 0, imageData: image, filterName: "normal", width: 1, height: 1, createdAt: now };
memoryPhotos.set(own.id, [photo]);
memoryPhotos.set(other.id, [{ ...photo, id: "other-photo", sessionId: other.id }]);
memoryPhotos.set(guest.id, [{ ...photo, id: "claimed-guest-photo", sessionId: guest.id }]);

async function request(path, client = alice, method = "GET") {
  return fetch(`${base}/api/library${path}`, { method, headers: client?.cookie ? { Cookie: client.cookie } : {} });
}
async function collect(path, client = alice) {
  const items = [];
  let cursor = null;
  do {
    const query = new URLSearchParams({ limit: "7", ...(cursor ? { cursor } : {}) });
    const response = await request(`${path}?${query}`, client);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(data.items.length <= 7);
    items.push(...data.items);
    cursor = data.nextCursor;
  } while (cursor);
  return items;
}

test("all library collections and images require a verified account", async () => {
  for (const path of ["/sessions", "/strips", `/sessions/${own.id}/photos`, `/sessions/${own.id}/strips`, "/photos/owned-photo/media", "/strips/strip-00/media"]) {
    assert.equal((await request(path, null)).status, 401);
    assert.equal((await request(path, { cookie: `p2b_session=${"0".repeat(64)}` })).status, 401);
  }
});

test("pagination reaches older records beyond the old caps without tie duplicates", async () => {
  const sessions = await collect("/sessions"), strips = await collect("/strips");
  assert.equal(sessions.length, 60);
  assert.equal(strips.length, 60);
  assert.equal(new Set(sessions.map(item => item.id)).size, 60);
  assert.equal(new Set(strips.map(item => item.id)).size, 60);
  assert.equal(sessions[0].id, "session-59");
  assert.equal(sessions.at(-1).id, "session-00");
  assert.equal(strips[0].id, "strip-59");
});

test("metadata contains no image payloads, credentials, guest claims, or other owners", async () => {
  for (const path of ["/sessions", "/strips", `/sessions/${own.id}/photos`, `/sessions/${own.id}/strips`]) {
    const response = await request(path);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("vary"), /Cookie/);
    const text = await response.text();
    for (const secret of ["stripData", "imageData", "guestOwnerHash", "passwordHash", "tokenHash", "salt", "userId", "data:image", "claimed-guest", "wrong-parent", "other-session", "expired-strip"]) assert.ok(!text.includes(secret), `${path} leaked ${secret}`);
    assert.ok(text.length < 12000);
  }
  const summaries = (await (await request("/sessions")).json()).items;
  assert.equal(summaries.find(item => item.id === "session-59").storedPhotoCount, 0);
  const ownSummary = (await collect("/sessions")).find(item => item.id === own.id);
  assert.equal(ownSummary.storedPhotoCount, 1);
  assert.equal(ownSummary.storedStripCount, 1);
});

test("inaccessible parents, mismatched strip owners, guest rows and expired strips are concealed", async () => {
  for (const path of [`/sessions/${other.id}/photos`, `/sessions/${other.id}/strips`, `/sessions/${guest.id}/photos`, `/sessions/${guest.id}/strips`, "/photos/other-photo/media", "/photos/claimed-guest-photo/media", "/strips/other-strip/media", "/strips/wrong-parent-strip/media", "/strips/wrong-strip-owner/media", "/strips/claimed-guest-strip/media", "/strips/guest-on-member/media", "/strips/expired-strip/media", "/photos/missing/media"]) assert.equal((await request(path)).status, 404, path);
  assert.equal((await request("/photos/owned-photo/media", bob)).status, 404);
  assert.equal((await request("/strips/strip-00/media", bob)).status, 404);
});

test("one-image reads return actual binary with private headers and no counter mutation", async () => {
  for (const path of ["/photos/owned-photo/media", "/strips/strip-00/media"]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("vary"), /Cookie/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(image.split(",")[1], "base64"));
    const head = await request(path, alice, "HEAD");
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  }
  assert.equal([...memoryStrips.values()].find(item => item.id === "strip-00").downloadCount, 0);
});

test("cursors are bound to collection, session and owner; queries cannot supply ownership", async () => {
  const cursor = (await (await request("/sessions?limit=1")).json()).nextCursor;
  assert.ok(cursor);
  for (const path of ["/sessions?userId=" + bob.user.id, "/sessions?limit=0", "/sessions?limit=51", "/sessions?limit=1&limit=2", "/sessions?cursor=bad", "/sessions?cursor=", `/strips?cursor=${cursor}`, `/sessions/${own.id}/photos?cursor=${cursor}`, "/photos/owned-photo/media?userId=x"]) assert.equal((await request(path)).status, 400, path);
  assert.equal((await request(`/sessions?cursor=${cursor}`, bob)).status, 400);
  const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString());
  decoded.time = "2026-02-31T00:00:00.000000";
  const invalidDate = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  assert.equal((await request(`/sessions?cursor=${invalidDate}`)).status, 400);
});

test("legacy executable or oversized image representations are not served", async () => {
  const valid = photo.imageData;
  for (const value of ["data:image/svg+xml;base64,PHN2Zy8+", "data:image/png;base64," + "A".repeat(14_000_000), "data:image/png;base64,bm90LWFuLWltYWdl"]) {
    photo.imageData = value;
    assert.equal((await request("/photos/owned-photo/media")).status, 404);
  }
  photo.imageData = valid;
});
