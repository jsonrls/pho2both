"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { ApiError } from "./api";
import { authRequest, type AuthUser, type AuthSession } from "./authApi";
export type { AuthUser } from "./authApi";
type AuthStatus = "loading" | "guest" | "authenticated" | "unavailable" | "signing-out" | "logout-failed";
interface AuthContextType {
  user: AuthUser | null; status: AuthStatus; isLoading: boolean; notice: string; generation: number;
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (email: string, password: string, name?: string) => Promise<AuthUser>;
  logout: () => Promise<void>; refresh: () => Promise<void>;
  isCurrent: (generation: number) => boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const CHANGE_KEY = "pho2booth_session_change";
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>({ user: null });
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [notice, setNotice] = useState("");
  const [generation, setGeneration] = useState(0);
  const epoch = useRef(0);
  const accountVersion = useRef(0);
  const checking = useRef(false);
  const verifiedIdentity = useRef<string | null>(null);
  const suspended = useRef(false);
  const authenticating = useRef(false);
  const hadUser = useRef(false);
  const invalidate = useCallback(() => { setGeneration(++accountVersion.current); return ++epoch.current; }, []);
  const broadcast = () => { try { localStorage.setItem(CHANGE_KEY, crypto.randomUUID()); } catch { /* Storage may be disabled. */ } };
  const refresh = useCallback(async () => {
    if (suspended.current || authenticating.current) return;
    const request = ++epoch.current;
    checking.current = true;
    setStatus("loading");
    setSession({ user: null });
    try {
      const result = await authRequest("session");
      if (request !== epoch.current) return;
      if (verifiedIdentity.current !== (result.user?.id ?? null)) setGeneration(++accountVersion.current);
      verifiedIdentity.current = result.user?.id ?? null;
      checking.current = false;
      setSession(result); setStatus(result.user ? "authenticated" : "guest");
      const ended = !result.user && (hadUser.current || result.reason === "expired" || result.reason === "invalid");
      setNotice(current => ended ? "Your session ended. Sign in again for member features. Your photos and edits are still here." : result.user ? "" : current);
      hadUser.current = Boolean(result.user);
    } catch {
      if (request === epoch.current) { checking.current = false; setGeneration(++accountVersion.current); setStatus("unavailable"); }
    }
  }, []);
  useEffect(() => {
    try { localStorage.removeItem("pho2booth_auth_user"); localStorage.removeItem("pho2booth_auth_token"); } catch { /* Never restore legacy browser identity. */ }
    const timer = setTimeout(() => void refresh(), 0);
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    const changed = () => { invalidate(); suspended.current = false; authenticating.current = false; void refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === CHANGE_KEY) changed(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    window.addEventListener("pho2booth:unauthorized", focus); window.addEventListener("pho2booth:authchange", changed);
    window.addEventListener("storage", storage);
    return () => { clearTimeout(timer); ++epoch.current; window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); window.removeEventListener("pho2booth:unauthorized", focus); window.removeEventListener("pho2booth:authchange", changed); window.removeEventListener("storage", storage); };
  }, [refresh, invalidate]);
  useEffect(() => {
    if (status !== "authenticated" || !session.expiresAt) return;
    const delay = new Date(session.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(delay)) return;
    const timer = setTimeout(() => void refresh(), Math.max(0, Math.min(delay, 2147483647)));
    return () => clearTimeout(timer);
  }, [status, session.expiresAt, refresh]);
  const authenticate = useCallback(async (path: string, body: object) => {
    if (authenticating.current || suspended.current) throw new Error("Please finish your current account action first.");
    authenticating.current = true; checking.current = false;
    const request = invalidate(); setSession({ user: null }); setStatus("guest");
    try {
      const result = await authRequest(path, body);
      if (request !== epoch.current) throw new Error("Your account status changed. Please try again.");
      if (!result.user) throw new Error("We couldn’t verify your account. Please try again.");
      setSession(result); setStatus("authenticated"); setNotice(""); verifiedIdentity.current = result.user.id; hadUser.current = true; broadcast();
      return result.user;
    } catch (error) {
      if (request === epoch.current) setStatus(error instanceof ApiError && [400, 401, 409, 429].includes(error.status) ? "guest" : "unavailable");
      throw error;
    } finally { if (request === epoch.current) authenticating.current = false; }
  }, [invalidate]);
  const login = useCallback((email: string, password: string) => authenticate("signin", { email, password }), [authenticate]);
  const signup = useCallback((email: string, password: string, name?: string) => authenticate("signup", { email, password, name }), [authenticate]);
  const logout = useCallback(async () => {
    if (suspended.current && authenticating.current) return;
    suspended.current = true; authenticating.current = true; checking.current = false;
    const request = invalidate(); setSession({ user: null }); setStatus("signing-out"); setNotice("");
    try {
      await authRequest("logout", {});
      if (request !== epoch.current) return;
      hadUser.current = false; verifiedIdentity.current = null; suspended.current = false; setStatus("guest"); setNotice(""); broadcast();
    } catch {
      if (request === epoch.current) { setStatus("logout-failed"); setNotice("We couldn’t confirm sign-out. Your session may still be active. Please try again."); }
    } finally { if (request === epoch.current) authenticating.current = false; }
  }, [invalidate]);
  const isCurrent = useCallback((value: number) => value === accountVersion.current && !suspended.current && !checking.current && !authenticating.current, []);
  return <AuthContext.Provider value={{ user: status === "authenticated" ? session.user : null, status, isLoading: status === "loading", notice, generation, login, signup, logout, refresh, isCurrent }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error("useAuth must be used within an AuthProvider"); return context; }
