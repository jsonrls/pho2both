import { ApiError, fetchWithFallback } from "./api";

export interface LibraryStrip { id: string; sessionId: string; createdAt: string; template: string; headerText: string | null; shareCode: string }
export interface LibrarySession { id: string; createdAt: string; boothName: string | null; layout: string; status: string; storedPhotoCount: number; storedStripCount: number }
export interface LibraryPhoto { id: string; sessionId: string; createdAt: string; shotIndex: number; width: number | null; height: number | null; filterName: string | null }
export interface LibraryPage<T> { items: T[]; nextCursor: string | null }
export type LibraryList = "strips" | "sessions" | `sessions/${string}/photos`;

export function libraryListPath(list: LibraryList, cursor?: string | null): string {
  if (!/^(strips|sessions|sessions\/[A-Za-z0-9_-]{1,36}\/photos)$/.test(list)) throw new Error("Invalid library list");
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return `/api/library/${list}?${query}`;
}

async function libraryResponse(path: string, signal: AbortSignal) {
  const response = await fetchWithFallback(path, { method: "GET", credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new ApiError(response.status === 404 ? "This photo is no longer available." : "We couldn’t load your library. Please try again.", response.status, "LIBRARY_REQUEST_FAILED");
  signal.throwIfAborted();
  return response;
}

export async function getLibraryPage<T>(list: LibraryList, cursor: string | null, signal: AbortSignal): Promise<LibraryPage<T>> {
  const response = await libraryResponse(libraryListPath(list, cursor), signal);
  const page = await response.json();
  signal.throwIfAborted();
  if (!page || !Array.isArray(page.items) || !(page.nextCursor === null || typeof page.nextCursor === "string")) throw new Error("Invalid library response");
  return page;
}

export async function getLibraryMedia(kind: "photos" | "strips", id: string, signal: AbortSignal): Promise<Blob> {
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(id)) throw new Error("Invalid library image");
  const response = await libraryResponse(`/api/library/${kind}/${id}/media`, signal);
  if (!/^image\/(png|jpeg|webp)$/.test(response.headers.get("content-type")?.split(";")[0] ?? "")) throw new Error("Invalid image response");
  const blob = await response.blob();
  signal.throwIfAborted();
  return blob;
}
