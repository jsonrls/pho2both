import { ApiError, fetchWithFallback } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  provider?: string;
  role?: string;
  plan?: string;
}
export interface AuthSession { user: AuthUser | null; expiresAt?: string; reason?: string }

export async function authRequest(path: string, body?: object): Promise<AuthSession> {
  const response = await fetchWithFallback(`/api/auth/${path}`, {
    method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const message = response.status === 429 ? "Too many attempts. Please wait a moment before trying again."
      : response.status === 401 ? "The email or password didn’t match. Please try again."
      : response.status === 409 ? "An account with this email already exists. Try signing in."
      : "We couldn’t reach the account service. Please try again in a moment.";
    throw new ApiError(message, response.status, "AUTH_REQUEST_FAILED");
  }
  if (path === "logout") return { user: null };
  const data = await response.json();
  const user = data?.user;
  const invalidUser = user !== null && (
    !user || typeof user.id !== "string" || !user.id || typeof user.email !== "string" || !user.email ||
    ["name", "avatarUrl", "role", "plan"].some(key => user[key] != null && typeof user[key] !== "string")
  );
  const expiry = typeof data?.expiresAt === "string" ? Date.parse(data.expiresAt) : NaN;
  if (invalidUser || (user !== null && (!Number.isFinite(expiry) || expiry <= Date.now()))) {
    throw new Error("We couldn’t check your session. Please try again.");
  }
  return data;
}

export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string; resetToken?: string }> {
  const response = await fetchWithFallback("/api/auth/forgot-password", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(errorData?.error || "Could not request password reset. Please try again.", response.status, "AUTH_REQUEST_FAILED");
  }
  return response.json();
}

export async function submitPasswordReset(token: string, password: string): Promise<AuthSession> {
  const response = await fetchWithFallback("/api/auth/reset-password", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(errorData?.error || "Reset failed. The token may be invalid or expired.", response.status, "AUTH_REQUEST_FAILED");
  }
  return response.json();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  const response = await fetchWithFallback("/api/auth/change-password", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(errorData?.error || "Could not change password. Please check your current password.", response.status, "AUTH_REQUEST_FAILED");
  }
  return response.json();
}

export async function deleteAccount(): Promise<{ success: boolean; message: string }> {
  const response = await fetchWithFallback("/api/auth/account", {
    method: "DELETE", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(errorData?.error || "Could not delete account. Please try again.", response.status, "AUTH_REQUEST_FAILED");
  }
  return response.json();
}

export function safeAuthReturn(value: string | null): string {
  if (value === "/" || value === "/?booth=1" || value === "/download" || value === "/auth" || value === "/library" || value === "/billing") return value;
  if (value && /^\/download\/(?:[A-Z0-9_-]{4,16}|[A-Z0-9_-]{32})$/.test(value)) return value;
  return "/?booth=1";
}
