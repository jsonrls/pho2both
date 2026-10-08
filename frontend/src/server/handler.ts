/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import http from "node:http";
import { Readable } from "node:stream";
import { app } from "./app";

export async function executeServerlessApi(
  req: NextRequest,
  bodyBuffer?: ArrayBuffer | Uint8Array | null
): Promise<NextResponse> {
  return new Promise((resolve) => {
    const url = req.nextUrl.pathname + req.nextUrl.search;
    const inReq = new http.IncomingMessage(null as any);
    inReq.method = req.method;
    inReq.url = url;
    inReq.headers = {};

    req.headers.forEach((value, key) => {
      inReq.headers[key.toLowerCase()] = value;
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    (inReq as any).socket = { remoteAddress: ip };

    const chunksToSend: Buffer[] = [];
    if (bodyBuffer) {
      if (bodyBuffer instanceof Uint8Array) {
        chunksToSend.push(Buffer.from(bodyBuffer.buffer, bodyBuffer.byteOffset, bodyBuffer.byteLength));
      } else if (bodyBuffer.byteLength > 0) {
        chunksToSend.push(Buffer.from(bodyBuffer));
      }
    }

    const stream = Readable.from(chunksToSend);
    Object.assign(inReq, {
      _read: () => {},
      on: stream.on.bind(stream),
      once: stream.once.bind(stream),
      emit: stream.emit.bind(stream),
      pipe: stream.pipe.bind(stream),
      resume: stream.resume.bind(stream),
      pause: stream.pause.bind(stream),
      unshift: stream.unshift.bind(stream),
      read: stream.read.bind(stream),
      [Symbol.asyncIterator]: stream[Symbol.asyncIterator].bind(stream),
    });

    const resHeaders = new Headers();
    const chunks: Buffer[] = [];
    let statusCode = 200;

    const res: any = {
      statusCode: 200,
      setHeader(name: string, val: any) {
        if (Array.isArray(val)) {
          for (const v of val) {
            if (name.toLowerCase() === "set-cookie") resHeaders.append(name, String(v));
            else resHeaders.set(name, String(v));
          }
        } else {
          if (name.toLowerCase() === "set-cookie") {
            resHeaders.append(name, String(val));
          } else {
            resHeaders.set(name, String(val));
          }
        }
      },
      getHeader(name: string) {
        return resHeaders.get(name);
      },
      getHeaders() {
        const out: Record<string, string> = {};
        resHeaders.forEach((v, k) => { out[k] = v; });
        return out;
      },
      removeHeader(name: string) {
        resHeaders.delete(name);
      },
      write(chunk: any) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      },
      end(chunk: any) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        statusCode = res.statusCode;
        const body = chunks.length ? Buffer.concat(chunks) : null;
        resolve(new NextResponse(body, { status: statusCode, headers: resHeaders }));
      },
      on() { return this; },
      once() { return this; },
      emit() { return true; },
    };

    app(inReq as any, res as any);
  });
}
