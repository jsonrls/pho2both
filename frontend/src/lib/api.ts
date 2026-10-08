const REQUEST_TIMEOUT_MS = 15000;
const SERVICE_UNAVAILABLE_MESSAGE =
  "Online saving and sharing are unavailable right now. Please try again.";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly isExpired: boolean;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.isExpired = status === 410;
  }
}

export function getBackendUrl() {
  // Browsers always use the same-origin proxy, including phones and HTTPS hosts.
  if (typeof window !== "undefined") return "";
  return (
    process.env.BACKEND_INTERNAL_URL ||
    "http://127.0.0.1:5001"
  ).replace(/\/+$/, "");
}

export async function fetchWithFallback(endpoint: string, options?: RequestInit): Promise<Response> {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const controller = new AbortController();
  const callerSignal = options?.signal;
  const cancel = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) callerSignal.throwIfAborted();
  callerSignal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Never automatically repeat a write: a failed response may follow a successful save.
    const response = await fetch(`${getBackendUrl()}${cleanEndpoint}`, {
      ...options,
      signal: controller.signal,
    });
    if (response.status === 401 && !cleanEndpoint.startsWith("/api/auth/") && typeof window !== "undefined") window.dispatchEvent(new Event("pho2booth:unauthorized"));
    if (!response.body) return response;

    // API responses must arrive completely before timeout/cancellation is released.
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (callerSignal?.aborted) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(
        "The photo service took too long to respond. Please try again.",
        504,
        "API_TIMEOUT"
      );
    }
    throw new ApiError(
      "We couldn’t reach the photo service. Check your connection and try again.",
      0,
      "API_NETWORK_ERROR"
    );
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", cancel);
  }
}

async function responseError(res: Response, fallback: string): Promise<ApiError> {
  const data: { error?: unknown; message?: unknown; isExpired?: boolean } | null =
    await res.json().catch(() => null);
  const message = typeof data?.message === "string" ? data.message :
    typeof data?.error === "string" ? data.error : "";

  if (res.status === 410 || data?.isExpired) {
    return new ApiError(
      message || "This guest photo strip has expired after 24 hours.",
      410,
      "STRIP_EXPIRED"
    );
  }
  if (res.status >= 500) {
    return new ApiError(
      res.status === 504 ? "The photo service took too long to respond. Please try again." : SERVICE_UNAVAILABLE_MESSAGE,
      res.status,
      res.status === 504 ? "API_TIMEOUT" : "BACKEND_UNAVAILABLE"
    );
  }
  return new ApiError(message || `${fallback} (${res.status})`, res.status, "API_REQUEST_FAILED");
}

export async function checkBackendHealth() {
  try {
    const res = await fetchWithFallback("/api/health", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      return { status: "offline" as const, neonConfigured: false };
    }
    const data = await res.json();
    return {
      status: "online" as const,
      neonConfigured: Boolean(data?.neon?.configured),
      neonStatus: data?.neon?.status,
      dbError: data?.neon?.error,
    };
  } catch {
    return { status: "offline" as const, neonConfigured: false };
  }
}

export async function createBoothSession(params: {
  boothName?: string;
  theme?: string;
  layout?: string;
  photoCount?: number;
  countdownSeconds?: number;
}) {
  const res = await fetchWithFallback("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw await responseError(res, "Failed to create session");
  }
  return res.json();
}

export async function recordCapturedPhoto(payload: {
  sessionId: string;
  shotIndex: number;
  imageData: string;
  filterName: string;
  width?: number;
  height?: number;
}) {
  const res = await fetchWithFallback("/api/photos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await responseError(res, "Failed to save photo");
  }
  return res.json();
}

export async function persistPhotoStrip(payload: {
  sessionId: string;
  stripData: string;
  template?: string;
  headerText?: string;
  footerText?: string;
  frameColor?: string;
  textColor?: string;
}) {
  const res = await fetchWithFallback("/api/strips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await responseError(res, "Failed to save strip");
  }
  return res.json();
}

export async function getPhotoStrip(idOrShareCode: string) {
  const res = await fetchWithFallback(`/api/strips/${idOrShareCode}`);
  if (!res.ok) {
    throw await responseError(res, "Strip not found");
  }
  return res.json();
}

export async function getUserStrips(userId: string) {
  const res = await fetchWithFallback(`/api/strips/user/${userId}`);
  if (!res.ok) {
    throw await responseError(res, "Failed to fetch user photo strips");
  }
  return res.json();
}

export async function getSessionPhotos(sessionId: string) {
  const res = await fetchWithFallback(`/api/photos/${sessionId}`);
  if (!res.ok) {
    throw await responseError(res, "Failed to load photos");
  }
  return res.json();
}

export async function recordDownload(idOrShareCode: string) {
  try {
    const res = await fetchWithFallback(`/api/strips/${idOrShareCode}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getNetworkIp(): Promise<string | null> {
  try {
    const res = await fetchWithFallback("/api/health/network-ip");
    if (!res.ok) return null;
    const data = await res.json();
    return data.ip || null;
  } catch {
    return null;
  }
}
