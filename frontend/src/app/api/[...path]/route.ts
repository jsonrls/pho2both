import { networkInterfaces } from "node:os";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_INTERNAL_URL = (
  process.env.BACKEND_INTERNAL_URL ||
  (process.env.VERCEL || process.env.SERVERLESS_BACKEND === "1" ? "" : (process.env.BACKEND_URL || "http://127.0.0.1:5001"))
).replace(/\/+$/, "");
const SERVICES = new Set(["auth", "sessions", "photos", "strips", "health", "library", "billing"]);
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };

function failure(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status, headers: PRIVATE_HEADERS });
}

function trustedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const configured = [
    ...(process.env.FRONTEND_URL || "").split(",").map(value => value.trim()),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "",
  ].filter(Boolean);
  if (configured.some(value => value === origin && /^https?:\/\//.test(value))) return true;
  if (process.env.NODE_ENV === "production") return false;
  const lan = Object.values(networkInterfaces()).flat().find(address =>
    address?.family === "IPv4" && !address.internal
  )?.address;
  return ["localhost", "127.0.0.1", lan].filter(Boolean).some(host =>
    [3000, 3001].some(port => origin === `http://${host}:${port}`)
  );
}

async function readBody(req: NextRequest, limit: number): Promise<ArrayBuffer | null> {
  if (!req.body) return new ArrayBuffer(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function proxyRequest(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path?.length || !SERVICES.has(path[0]) || path.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) {
    return failure(404, "NOT_FOUND", "Not found");
  }
  const writes = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const isBillingWebhook = path[0] === "billing" && path[1] === "webhook";
  const limit = path[0] === "photos" ? 16 * 1024 * 1024 : path[0] === "strips" ? 28 * 1024 * 1024 : isBillingWebhook ? 1024 * 1024 : 16 * 1024;
  if (writes && !isBillingWebhook) {
    if (!trustedOrigin(req.headers.get("origin")) || req.headers.get("sec-fetch-site") === "cross-site") {
      return failure(403, "ORIGIN_FORBIDDEN", "Trusted origin required");
    }
    const isDeleteNoBody = req.method === "DELETE" && !req.headers.get("content-type");
    if (!isDeleteNoBody && (req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json" ||
        ![null, "identity"].includes(req.headers.get("content-encoding")))) {
      return failure(415, "UNSUPPORTED_MEDIA_TYPE", "An uncompressed JSON request is required");
    }
    const length = req.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
      return failure(413, "BODY_TOO_LARGE", "The request is too large");
    }
  }

  const timeoutSignal = AbortSignal.timeout(10000);
  try {
    const headers = new Headers();
    for (const name of [
      "accept", "content-type", "cookie", "origin",
      "webhook-id", "webhook-timestamp", "webhook-signature"
    ]) {
      const value = req.headers.get(name);
      if (value) headers.set(name, value);
    }
    const body = writes ? await readBody(req, limit) : undefined;
    if (body === null) return failure(413, "BODY_TOO_LARGE", "The request is too large");

    // When BACKEND_INTERNAL_URL is not set, run the API directly as a Vercel Serverless Function in-process
    if (!BACKEND_INTERNAL_URL) {
      const { executeServerlessApi } = await import("@/server/handler");
      return await executeServerlessApi(req, body);
    }

    const backendRes = await fetch(`${BACKEND_INTERNAL_URL}/api/${path.join("/")}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.any([req.signal, timeoutSignal]),
    });
    const resHeaders = new Headers(PRIVATE_HEADERS);
    for (const name of ["content-type", "retry-after"]) {
      const value = backendRes.headers.get(name);
      if (value) resHeaders.set(name, value);
    }
    // Each cookie needs its own header, including an expiry containing a comma.
    for (const cookie of backendRes.headers.getSetCookie()) resHeaders.append("Set-Cookie", cookie);
    const data = req.method === "HEAD" || [204, 304].includes(backendRes.status) ? null : await backendRes.arrayBuffer();
    return new NextResponse(data, { status: backendRes.status, headers: resHeaders });
  } catch {
    const timedOut = timeoutSignal.aborted;
    const status = timedOut ? 504 : 503;
    const code = timedOut ? "API_TIMEOUT" : "BACKEND_UNAVAILABLE";
    console.warn("[api-proxy]", { method: req.method, service: path[0], status, code });
    return failure(status, code, timedOut
      ? "The photo service took too long to respond. Please try again."
      : "The photo service is unavailable. Please try again in a moment.");
  }
}

export const GET = proxyRequest;
export const HEAD = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
