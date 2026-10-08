import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

// Database testing is opt-in and must point at an isolated, disposable branch.
process.env.DATABASE_URL = process.env.GUARDRAILS_TEST_DATABASE_URL || "";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3001";
const { app } = await import("../src/app.ts");
const { getDb, schema } = await import("../src/db/index.ts");
const { memoryUsers } = await import("../src/security/auth.ts");
const { eq, inArray } = await import("drizzle-orm");
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => new Promise(resolve => server.close(resolve)));
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=";
const password = "a quiet studio password 🌷";
const run = randomUUID();

class Client {
  cookies = new Map();
  async request(path, { method = "GET", body, origin = "http://localhost:3001", contentType = "application/json", cookie, raw } = {}) {
    const headers = {};
    if (method !== "GET") {
      if (origin) headers.Origin = origin;
      if (contentType) headers["Content-Type"] = contentType;
    }
    const credential = cookie ?? [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    if (credential) headers.Cookie = credential;
    const response = await fetch(base + path, { method, headers, ...(method !== "GET" ? { body: raw ?? JSON.stringify(body ?? {}) } : {}) });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const split = pair.indexOf("=");
      const name = pair.slice(0, split), value = pair.slice(split + 1);
      if (!value || /Max-Age=0/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const data = await response.json();
    return { status: response.status, data, headers: response.headers };
  }
  credential() { return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "); }
}
const alice = new Client(), bob = new Client(), guest = new Client(), stranger = new Client();
let aliceUser, bobUser, memberSession, guestSession, memberCode, memberId, guestCode;

test("signed-up identities use private cookies, safe users, and persisted verification", async () => {
  for (const [client, label] of [[alice, "alice"], [bob, "bob"]]) {
    const result = await client.request("/api/auth/signup", { method: "POST", body: { email: `${label}-${run}@example.invalid`, password, name: label } });
    assert.equal(result.status, 201);
    assert.equal(result.data.user.role, "user");
    assert.ok(!("token" in result.data) && !("passwordHash" in result.data.user) && !("salt" in result.data.user));
    assert.ok(result.headers.getSetCookie().some(value => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value) && /Path=\//.test(value)));
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    const checked = await client.request("/api/auth/session");
    assert.equal(checked.data.user.id, result.data.user.id);
    assert.ok(new Date(checked.data.expiresAt).getTime() > Date.now());
    if (label === "alice") aliceUser = result.data.user; else bobUser = result.data.user;
  }
});

test("server derives owner and lifetime; another member cannot enumerate or append", async () => {
  const rejected = await alice.request("/api/sessions", { method: "POST", body: { userId: bobUser.id, isGuest: true, photoCount: 1 } });
  assert.equal(rejected.status, 400);
  const result = await alice.request("/api/sessions", { method: "POST", body: { photoCount: 1 } });
  assert.equal(result.status, 201);
  memberSession = result.data.session.id;
  assert.equal(result.data.session.userId, aliceUser.id);
  assert.equal(result.data.session.isGuest, false);
  assert.ok(!("guestOwnerHash" in result.data.session));
  assert.equal((await bob.request(`/api/sessions/${memberSession}`)).status, 404);
  assert.equal((await stranger.request("/api/sessions")).status, 401);
  assert.equal((await bob.request(`/api/strips/user/${aliceUser.id}`)).status, 404);
  assert.equal((await bob.request("/api/photos", { method: "POST", body: { sessionId: memberSession, shotIndex: 0, imageData: image } })).status, 404);
  assert.equal((await alice.request("/api/photos", { method: "POST", body: { sessionId: memberSession, shotIndex: 0, imageData: image } })).status, 201);
  assert.equal((await alice.request("/api/photos", { method: "POST", body: { sessionId: memberSession, shotIndex: 0, imageData: image } })).status, 201);
  assert.equal((await alice.request(`/api/photos/${memberSession}`)).data.photos.length, 1);
  assert.equal((await bob.request(`/api/photos/${memberSession}`)).status, 404);
});

test("legacy guest rows with a claimed user ID do not enter member history", async () => {
  const id = randomUUID(), now = new Date();
  const fixture = { id, userId: aliceUser.id, isGuest: true, guestOwnerHash: null, sessionCode: randomUUID().slice(0, 10), boothName: "Legacy guest fixture", theme: "test", layout: "strip-4", photoCount: 1, countdownSeconds: 0, status: "active", createdAt: now, updatedAt: now };
  const db = getDb();
  if (db) await db.insert(schema.boothSessions).values(fixture);
  else (await import("../src/security/resources.ts")).memorySessions.set(id, fixture);
  const result = await alice.request("/api/sessions");
  assert.equal(result.status, 200);
  assert.ok(result.data.sessions.some(session => session.id === memberSession));
  assert.ok(!result.data.sessions.some(session => session.id === id));
  assert.equal((await alice.request(`/api/sessions/${id}`)).status, 404);
});

test("public share codes expose composites only, while verified owners get originals", async () => {
  const rejected = await alice.request("/api/strips", { method: "POST", body: { sessionId: memberSession, stripData: image, userId: bobUser.id } });
  assert.equal(rejected.status, 400);
  const result = await alice.request("/api/strips", { method: "POST", body: { sessionId: memberSession, stripData: image } });
  assert.equal(result.status, 201);
  memberCode = result.data.strip.shareCode;
  assert.ok(/^[A-Z2-7]{32}$/.test(memberCode));
  assert.equal(result.data.strip.canDownloadOriginals, true);
  assert.equal(result.data.strip.sessionId, memberSession);
  const publicResult = await stranger.request(`/api/strips/${memberCode}`);
  assert.equal(publicResult.status, 200);
  assert.equal(publicResult.data.strip.canDownloadOriginals, false);
  for (const field of ["sessionId", "id", "userId", "guestOwnerHash", "photos"]) assert.ok(!(field in publicResult.data.strip));
  assert.equal((await bob.request(`/api/strips/${memberCode}`)).data.strip.canDownloadOriginals, false);
  assert.equal((await stranger.request(`/api/photos/${memberSession}`)).status, 401);
  const gallery = await alice.request(`/api/strips/user/${aliceUser.id}`);
  assert.equal(gallery.data.strips.length, 1);
  const db = getDb();
  if (db) memberId = (await db.select({ id: schema.photoStrips.id }).from(schema.photoStrips).where(eq(schema.photoStrips.shareCode, memberCode)))[0].id;
  else {
    const { memoryStrips } = await import("../src/security/resources.ts");
    memberId = memoryStrips.get(memberCode).id;
  }
  assert.equal((await stranger.request(`/api/strips/${memberId}`)).status, 404);
});

test("guest writes require the creating browser capability and never become member-owned", async () => {
  const rejectedSession = await guest.request("/api/sessions", { method: "POST", body: { userId: aliceUser.id, photoCount: 1 } });
  assert.equal(rejectedSession.status, 400);
  const result = await guest.request("/api/sessions", { method: "POST", body: { photoCount: 1 } });
  assert.equal(result.status, 201);
  guestSession = result.data.session.id;
  assert.equal(result.data.session.userId, null);
  assert.equal(result.data.session.isGuest, true);
  assert.ok(guest.cookies.has("p2b_guest"));
  const payload = { sessionId: guestSession, shotIndex: 0, imageData: image };
  assert.equal((await stranger.request("/api/photos", { method: "POST", body: payload })).status, 404);
  assert.equal((await guest.request("/api/photos", { method: "POST", body: payload })).status, 201);
  assert.equal((await guest.request(`/api/sessions/${guestSession}`)).data.photos.length, 0);
  assert.equal((await guest.request(`/api/photos/${guestSession}`)).status, 401);
  const rejectedStrip = await guest.request("/api/strips", { method: "POST", body: { sessionId: guestSession, stripData: image, userId: aliceUser.id, isGuest: false, expiresAt: "2099-01-01" } });
  assert.equal(rejectedStrip.status, 400);
  const strip = await guest.request("/api/strips", { method: "POST", body: { sessionId: guestSession, stripData: image } });
  assert.equal(strip.status, 201);
  guestCode = strip.data.strip.shareCode;
  assert.equal(strip.data.strip.isGuest, true);
  assert.ok(new Date(strip.data.strip.expiresAt).getTime() <= Date.now() + 86_400_000);
  assert.equal((await stranger.request(`/api/strips/${guestCode}`)).status, 200);
  assert.equal((await alice.request(`/api/photos/${guestSession}`)).status, 404);
});

test("expired guest links, writes, and counters fail consistently", async () => {
  const realNow = Date.now;
  Date.now = () => realNow() + 25 * 60 * 60 * 1000;
  try {
    assert.equal((await stranger.request(`/api/strips/${guestCode}`)).status, 410);
    assert.equal((await stranger.request(`/api/strips/${guestCode}/download`, { method: "POST" })).status, 410);
    assert.equal((await guest.request("/api/photos", { method: "POST", body: { sessionId: guestSession, shotIndex: 0, imageData: image } })).status, 404);
    assert.equal((await alice.request("/api/sessions", { method: "POST" })).status, 401);
  } finally { Date.now = realNow; }
});

test("legacy guest expiry cannot be bypassed by a missing expiry field", async () => {
  const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const db = getDb();
  if (db) await db.update(schema.photoStrips).set({ expiresAt: null, createdAt }).where(eq(schema.photoStrips.shareCode, guestCode));
  else {
    const { memoryStrips } = await import("../src/security/resources.ts");
    Object.assign(memoryStrips.get(guestCode), { expiresAt: null, createdAt });
  }
  assert.equal((await stranger.request(`/api/strips/${guestCode}`)).status, 410);
  assert.equal((await stranger.request(`/api/strips/${guestCode}/download`, { method: "POST" })).status, 410);
});

test("tampered and ambiguous cookies fail closed; stale cookies can reauthenticate", async () => {
  assert.equal((await stranger.request("/api/sessions", { method: "POST", cookie: "p2b_session=forged" })).status, 401);
  const token = alice.cookies.get("p2b_session");
  assert.equal((await stranger.request("/api/sessions", { method: "POST", cookie: `p2b_session=${token}; p2b_session=${token}` })).status, 401);
  const reauth = await bob.request("/api/auth/signin", { method: "POST", cookie: "p2b_session=stale", body: { email: bobUser.email, password } });
  assert.equal(reauth.status, 200);
  const invalid = await stranger.request("/api/auth/session", { cookie: "p2b_session=stale" });
  assert.equal(invalid.data.user, null);
  assert.ok(invalid.headers.getSetCookie().some(value => /p2b_session=;/.test(value)));
});

test("session rotation and logout revoke the server credential", async () => {
  const old = alice.credential();
  const signedIn = await alice.request("/api/auth/signin", { method: "POST", body: { email: aliceUser.email, password } });
  assert.equal(signedIn.status, 200);
  assert.equal((await stranger.request("/api/auth/session", { cookie: old })).data.user, null);
  const current = alice.credential();
  assert.equal((await alice.request("/api/auth/logout", { method: "POST" })).status, 200);
  assert.equal((await stranger.request("/api/auth/session", { cookie: current })).data.user, null);
  assert.equal((await stranger.request("/api/sessions", { method: "POST", cookie: current })).status, 401);
});

test("legacy credentials verify once, upgrade to scrypt, and remain usable", async () => {
  const id = randomUUID(), email = `legacy-${run}@example.invalid`, salt = "legacy-test-salt", legacyPassword = "old123";
  const legacy = { id, email, name: "Legacy fixture", salt, passwordHash: createHmac("sha256", salt).update(legacyPassword).digest("hex"), avatarUrl: null, provider: "email", role: "user", createdAt: new Date(), updatedAt: new Date() };
  const db = getDb();
  if (db) await db.insert(schema.users).values(legacy); else memoryUsers.set(id, legacy);
  const client = new Client();
  assert.equal((await client.request("/api/auth/signin", { method: "POST", body: { email, password: legacyPassword } })).status, 200);
  const updated = db ? (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0] : memoryUsers.get(id);
  assert.ok(updated.passwordHash.startsWith("scrypt$v1$131072$8$1$"));
  assert.equal(updated.salt, null);
  assert.equal((await client.request("/api/auth/signin", { method: "POST", body: { email, password: legacyPassword } })).status, 200);
});

test("origins, JSON, bounds, Unicode passwords, and image formats are enforced", async () => {
  assert.equal((await stranger.request("/api/auth/signup", { method: "POST", origin: "https://hostile.invalid" })).status, 403);
  assert.equal((await stranger.request("/api/auth/signup", { method: "POST", origin: null })).status, 403);
  assert.equal((await stranger.request("/api/auth/signup", { method: "POST", contentType: "text/plain", raw: "{}" })).status, 415);
  assert.equal((await stranger.request("/api/auth/signup", { method: "POST", raw: "{broken" })).status, 400);
  assert.equal((await stranger.request("/api/auth/signup", { method: "POST", body: { name: "x".repeat(17_000) } })).status, 413);
  assert.equal((await stranger.request("/api/auth/signup", { method: "POST", body: { email: `short-${run}@example.invalid`, password: "🌷".repeat(14) } })).status, 400);
  const unicode = await stranger.request("/api/auth/signup", { method: "POST", body: { email: `unicode-${run}@example.invalid`, password: "🌷".repeat(15) } });
  assert.equal(unicode.status, 201);
  assert.equal((await stranger.request("/api/sessions", { method: "POST", body: { photoCount: -1 } })).status, 400);
  const parent = (await stranger.request("/api/sessions", { method: "POST", body: { photoCount: 1 } })).data.session.id;
  for (const data of ["data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,YWJj", "https://hostile.invalid/photo"]) {
    assert.equal((await stranger.request("/api/photos", { method: "POST", body: { sessionId: parent, shotIndex: 0, imageData: data } })).status, 400);
  }
  assert.equal((await stranger.request("/api/photos", { method: "POST", body: { sessionId: parent, shotIndex: 1, imageData: image } })).status, 400);
  assert.equal((await stranger.request("/api/photos", { method: "POST", body: { sessionId: parent, shotIndex: 0, imageData: image, width: 2 } })).status, 400);
});

test("concurrent strip creation stays within ten database slots", async () => {
  const parent = (await bob.request("/api/sessions", { method: "POST", body: { photoCount: 1 } })).data.session.id;
  const results = await Promise.all(Array.from({ length: 11 }, () => bob.request("/api/strips", { method: "POST", body: { sessionId: parent, stripData: image } })));
  assert.equal(results.filter(result => result.status === 201).length, 10);
  assert.equal(results.filter(result => result.status === 409).length, 1);
  assert.equal(new Set(results.filter(result => result.status === 201).map(result => result.data.strip.shareCode)).size, 10);
});

test("production missing or invalid storage never falls back to memory", () => {
  const script = `const {app}=await import('./src/app.ts'); const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/session'); const data=await response.json(); console.log(JSON.stringify({status:response.status,code:data.code,privateError:!('stack' in data)})); await new Promise(r=>server.close(r));`;
  for (const url of ["", "invalid-config"]) {
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: new URL("..", import.meta.url), env: { ...process.env, NODE_ENV: "production", DATABASE_URL: url, DATABASE_URL_UNPOOLED: "" }, encoding: "utf8", timeout: 15_000 });
    assert.equal(child.status, 0);
    const result = JSON.parse(child.stdout.trim().split("\n").at(-1));
    assert.equal(result.status, 503);
    assert.equal(result.code, "SERVICE_UNAVAILABLE");
    assert.equal(result.privateError, true);
  }
});

test("expired credential cleanup is bounded and preserves valid sessions", { skip: !getDb() }, async () => {
  const db = getDb();
  const expired = Array.from({ length: 101 }, () => ({ tokenHash: createHash("sha256").update(randomUUID()).digest("hex"), userId: aliceUser.id, expiresAt: new Date(0) }));
  await db.insert(schema.authSessions).values(expired);
  const validHash = createHash("sha256").update(bob.cookies.get("p2b_session")).digest("hex");
  const client = new Client();
  const result = await client.request("/api/auth/signin", { method: "POST", body: { email: aliceUser.email, password } });
  assert.equal(result.status, 200);
  const remaining = await db.select({ tokenHash: schema.authSessions.tokenHash }).from(schema.authSessions).where(inArray(schema.authSessions.tokenHash, expired.map(row => row.tokenHash)));
  assert.equal(remaining.length, 1);
  assert.equal((await db.select({ tokenHash: schema.authSessions.tokenHash }).from(schema.authSessions).where(eq(schema.authSessions.tokenHash, validHash))).length, 1);
});

test("repeated failed credentials are bounded with an explicit retry time", async () => {
  const client = new Client(), email = `throttle-${run}@example.invalid`;
  const attempts = [];
  for (let index = 0; index < 11; index++) attempts.push(await client.request("/api/auth/signin", { method: "POST", body: { email, password } }));
  assert.equal(attempts.at(-1).status, 429);
  assert.ok(Number(attempts.at(-1).headers.get("retry-after")) > 0);
  assert.ok(attempts.slice(0, 10).some(result => result.status === 401));
});

test("password reset flow allows recovery and invalidates expired tokens", async () => {
  const resetClient = new Client();
  const email = `reset-${run}@example.invalid`;
  const initialPassword = "old password 123456789";
  const newPassword = "new password 987654321";

  const signup = await resetClient.request("/api/auth/signup", { method: "POST", body: { email, password: initialPassword, name: "Reset User" } });
  assert.equal(signup.status, 201);

  const forgot = await resetClient.request("/api/auth/forgot-password", { method: "POST", body: { email } });
  assert.equal(forgot.status, 200);
  assert.ok(forgot.data.resetToken);

  const reset = await resetClient.request("/api/auth/reset-password", { method: "POST", body: { token: forgot.data.resetToken, password: newPassword } });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.user.email, email);

  const reuse = await resetClient.request("/api/auth/reset-password", { method: "POST", body: { token: forgot.data.resetToken, password: newPassword } });
  assert.equal(reuse.status, 400);

  const loginClient = new Client();
  const login = await loginClient.request("/api/auth/signin", { method: "POST", body: { email, password: newPassword } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.email, email);
});

test("authenticated user can change password and delete account", async () => {
  const accountClient = new Client();
  const email = `account-${run}@example.invalid`;
  const pwd1 = "initial password 12345";
  const pwd2 = "updated password 54321";

  const signup = await accountClient.request("/api/auth/signup", { method: "POST", body: { email, password: pwd1, name: "Account Test" } });
  assert.equal(signup.status, 201);

  const wrongChange = await accountClient.request("/api/auth/change-password", { method: "POST", body: { currentPassword: "wrong password 111", newPassword: pwd2 } });
  assert.equal(wrongChange.status, 401);

  const change = await accountClient.request("/api/auth/change-password", { method: "POST", body: { currentPassword: pwd1, newPassword: pwd2 } });
  assert.equal(change.status, 200);

  const del = await accountClient.request("/api/auth/account", { method: "DELETE" });
  assert.equal(del.status, 200);

  const checkSession = await accountClient.request("/api/auth/session");
  assert.equal(checkSession.data.user, null);

  const tryLogin = await accountClient.request("/api/auth/signin", { method: "POST", body: { email, password: pwd2 } });
  assert.equal(tryLogin.status, 401);
});

