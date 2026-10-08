import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";

process.env.DATABASE_URL = process.env.GUARDRAILS_TEST_DATABASE_URL || "";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3001";

const { app } = await import("../src/app.ts");
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => new Promise(resolve => server.close(resolve)));

const testImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=";
const updatedImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const run = randomUUID().slice(0, 8);

class TestClient {
  cookies = new Map();

  async request(path, { method = "GET", body, origin = "http://localhost:3001", contentType = "application/json" } = {}) {
    const headers = {};
    if (method !== "GET" && method !== "HEAD") {
      if (origin) headers.Origin = origin;
      if (body !== undefined && contentType) headers["Content-Type"] = contentType;
    }
    const credential = [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    if (credential) headers.Cookie = credential;

    const response = await fetch(base + path, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const split = pair.indexOf("=");
      const name = pair.slice(0, split);
      const value = pair.slice(split + 1);
      if (!value || /Max-Age=0/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return { status: response.status, data, headers: response.headers };
  }
}

test("User A creates a record; User B attempts to read, update, and delete it — every attempt returns 403 or 404", async () => {
  const userAClient = new TestClient();
  const userBClient = new TestClient();

  // 1. Sign up User A
  const signupA = await userAClient.request("/api/auth/signup", {
    method: "POST",
    body: {
      email: `usera-${run}@example.invalid`,
      password: "user-a-super-secure-pass-1234",
      name: "User A",
    },
  });
  assert.equal(signupA.status, 201, "User A signup should succeed");
  const userA = signupA.data.user;
  assert.ok(userA?.id, "User A must have an id");

  // 2. Sign up User B
  const signupB = await userBClient.request("/api/auth/signup", {
    method: "POST",
    body: {
      email: `userb-${run}@example.invalid`,
      password: "user-b-super-secure-pass-5678",
      name: "User B",
    },
  });
  assert.equal(signupB.status, 201, "User B signup should succeed");
  const userB = signupB.data.user;
  assert.ok(userB?.id, "User B must have an id");
  assert.notEqual(userA.id, userB.id, "User A and User B must be distinct accounts");

  // 3. User A creates records (Session, Photo, and Strip)
  const createSessionRes = await userAClient.request("/api/sessions", {
    method: "POST",
    body: {
      boothName: "Alice Private Booth",
      theme: "vintage",
      layout: "strip-4",
      photoCount: 4,
      countdownSeconds: 3,
    },
  });
  assert.equal(createSessionRes.status, 201, "User A session creation should succeed");
  const sessionA = createSessionRes.data.session;
  assert.equal(sessionA.userId, userA.id, "Session must belong to User A");

  const createPhotoRes = await userAClient.request("/api/photos", {
    method: "POST",
    body: {
      sessionId: sessionA.id,
      shotIndex: 0,
      imageData: testImage,
      filterName: "noir",
    },
  });
  assert.equal(createPhotoRes.status, 201, "User A photo creation should succeed");
  const photoA = createPhotoRes.data.photo;

  const createStripRes = await userAClient.request("/api/strips", {
    method: "POST",
    body: {
      sessionId: sessionA.id,
      stripData: testImage,
      template: "strip-4",
      headerText: "User A Keepsake",
      footerText: "PHO2BOOTH • 2026",
    },
  });
  assert.equal(createStripRes.status, 201, "User A strip creation should succeed");
  const stripA = createStripRes.data.strip;

  // Verify User A can read their own records
  const readOwnSession = await userAClient.request(`/api/sessions/${sessionA.id}`);
  assert.equal(readOwnSession.status, 200, "User A can read their own session");
  assert.equal(readOwnSession.data.photos.length, 1, "User A can see their own photos");

  // Helper assertion to check for 403 or 404
  const assertForbiddenOrNotFound = (res, operationDescription) => {
    console.log(`[Cross-User Test] ${operationDescription} -> HTTP ${res.status}`);
    assert.ok(
      res.status === 403 || res.status === 404,
      `${operationDescription} must return 403 or 404, got HTTP ${res.status}`
    );
  };

  // ==========================================
  // READ ATTEMPTS BY USER B
  // ==========================================

  // Attempt 1: User B tries to read User A's session details
  const readSession = await userBClient.request(`/api/sessions/${sessionA.id}`);
  assertForbiddenOrNotFound(readSession, "User B reading User A session");

  // Attempt 2: User B tries to read User A's session photos
  const readPhotos = await userBClient.request(`/api/photos/${sessionA.id}`);
  assertForbiddenOrNotFound(readPhotos, "User B reading User A photos");

  // Attempt 3: User B tries to read User A's user gallery
  const readUserGallery = await userBClient.request(`/api/strips/user/${userA.id}`);
  assertForbiddenOrNotFound(readUserGallery, "User B reading User A gallery");

  // Attempt 4: User B tries to read User A's photos via library pagination
  const readLibraryPhotos = await userBClient.request(`/api/library/sessions/${sessionA.id}/photos`);
  assertForbiddenOrNotFound(readLibraryPhotos, "User B reading User A photos via library");

  // Attempt 5: User B tries to read User A's strips via library pagination
  const readLibraryStrips = await userBClient.request(`/api/library/sessions/${sessionA.id}/strips`);
  assertForbiddenOrNotFound(readLibraryStrips, "User B reading User A strips via library");

  // Attempt 6: User B tries to read User A's photo binary media
  const readPhotoMedia = await userBClient.request(`/api/library/photos/${photoA.id}/media`);
  assertForbiddenOrNotFound(readPhotoMedia, "User B reading User A photo binary");

  // Attempt 7: User B tries to read User A's strip private binary media
  const readStripMedia = await userBClient.request(`/api/library/strips/${stripA.id}/media`);
  assertForbiddenOrNotFound(readStripMedia, "User B reading User A strip binary");

  // ==========================================
  // UPDATE ATTEMPTS BY USER B
  // ==========================================

  // Attempt 8: User B tries to overwrite/update User A's captured photo (POST onConflictDoUpdate)
  const updatePhoto = await userBClient.request("/api/photos", {
    method: "POST",
    body: {
      sessionId: sessionA.id,
      shotIndex: 0,
      imageData: updatedImage,
      filterName: "tampered",
    },
  });
  assertForbiddenOrNotFound(updatePhoto, "User B updating/overwriting User A photo");

  // Attempt 9: User B tries to append/create a photo strip in User A's session
  const updateStrip = await userBClient.request("/api/strips", {
    method: "POST",
    body: {
      sessionId: sessionA.id,
      stripData: updatedImage,
      template: "strip-4",
      headerText: "Malicious Strip",
    },
  });
  assertForbiddenOrNotFound(updateStrip, "User B injecting strip into User A session");

  // Attempt 10: User B tries HTTP PUT to update User A's session
  const putSession = await userBClient.request(`/api/sessions/${sessionA.id}`, {
    method: "PUT",
    body: { boothName: "Maliciously Modified Session" },
  });
  assertForbiddenOrNotFound(putSession, "User B PUT to User A session");

  // Attempt 11: User B tries HTTP PATCH to modify User A's session
  const patchSession = await userBClient.request(`/api/sessions/${sessionA.id}`, {
    method: "PATCH",
    body: { boothName: "Maliciously Patched Session" },
  });
  assertForbiddenOrNotFound(patchSession, "User B PATCH to User A session");

  // Attempt 12: User B tries HTTP PUT to modify User A's photo
  const putPhoto = await userBClient.request(`/api/photos/${photoA.id}`, {
    method: "PUT",
    body: { filterName: "hacked" },
  });
  assertForbiddenOrNotFound(putPhoto, "User B PUT to User A photo");

  // ==========================================
  // DELETE ATTEMPTS BY USER B
  // ==========================================

  // Attempt 13: User B tries HTTP DELETE on User A's session
  const deleteSession = await userBClient.request(`/api/sessions/${sessionA.id}`, {
    method: "DELETE",
  });
  assertForbiddenOrNotFound(deleteSession, "User B deleting User A session");

  // Attempt 14: User B tries HTTP DELETE on User A's photo
  const deletePhoto = await userBClient.request(`/api/photos/${photoA.id}`, {
    method: "DELETE",
  });
  assertForbiddenOrNotFound(deletePhoto, "User B deleting User A photo");

  // Attempt 15: User B tries HTTP DELETE on User A's photo strip
  const deleteStrip = await userBClient.request(`/api/strips/${stripA.id}`, {
    method: "DELETE",
  });
  assertForbiddenOrNotFound(deleteStrip, "User B deleting User A strip");

  // Attempt 16: User B deletes their OWN account and verifies User A's data remains untouched
  const deleteOwnAccount = await userBClient.request("/api/auth/account", {
    method: "DELETE",
  });
  assert.equal(deleteOwnAccount.status, 200, "User B deleting own account succeeds");

  // 4. Verify User A's record remains completely intact and unaffected
  const verifySessionA = await userAClient.request(`/api/sessions/${sessionA.id}`);
  assert.equal(verifySessionA.status, 200, "User A session still exists");
  assert.equal(verifySessionA.data.session.boothName, "Alice Private Booth", "Session data was not modified");
  assert.equal(verifySessionA.data.photos.length, 1, "Session photo was not deleted");
  assert.equal(verifySessionA.data.photos[0].filterName, "noir", "Photo was not modified");
});
