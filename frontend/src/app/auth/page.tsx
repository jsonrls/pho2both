"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, LogOut, QrCode, Sparkles, ExternalLink } from "lucide-react";
import { AccountForm } from "@/components/AccountForm";
import { SiteHeader } from "@/components/SiteHeader";
import { SampleStrip } from "@/components/PhotoArt";
import { changePassword, deleteAccount, safeAuthReturn } from "@/lib/authApi";
import { createCustomerPortal } from "@/lib/billingApi";
import { useAuth } from "@/lib/authContext";

function AccountSettings() {
  const { refresh } = useAuth();
  const router = useRouter();
  const [openSection, setOpenSection] = useState<"none" | "password" | "delete">("none");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);
    if (!currentPassword) {
      setPasswordStatus({ tone: "error", text: "Enter your current password." });
      return;
    }
    if (newPassword.length < 15 || newPassword.length > 128) {
      setPasswordStatus({ tone: "error", text: "New password must be 15–128 characters." });
      return;
    }
    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordStatus({ tone: "success", text: "Password updated successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => setOpenSection("none"), 1500);
    } catch (err) {
      setPasswordStatus({ tone: "error", text: err instanceof Error ? err.message : "Failed to update password." });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteSaving(true);
    setDeleteStatus(null);
    try {
      await deleteAccount();
      await refresh();
      router.push("/?booth=1");
    } catch (err) {
      setDeleteStatus(err instanceof Error ? err.message : "Could not delete account.");
      setDeleteSaving(false);
    }
  };

  return (
    <div className="account-settings" style={{ marginTop: 20, textAlign: "left", width: "100%", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button
          type="button"
          className="text-link"
          style={{ fontSize: 13 }}
          onClick={() => {
            setOpenSection(curr => curr === "password" ? "none" : "password");
            setPasswordStatus(null);
          }}
        >
          {openSection === "password" ? "Hide password change" : "Change password"}
        </button>
        <span style={{ color: "var(--muted-foreground)" }}>·</span>
        <button
          type="button"
          className="text-link"
          style={{ fontSize: 13, color: "var(--tomato)" }}
          onClick={() => {
            setOpenSection(curr => curr === "delete" ? "none" : "delete");
            setDeleteConfirm(false);
            setDeleteStatus(null);
          }}
        >
          {openSection === "delete" ? "Cancel delete" : "Delete account"}
        </button>
      </div>

      {openSection === "password" && (
        <form onSubmit={handlePasswordChange} style={{ marginTop: 14 }}>
          <div className="form-field">
            <label className="control-label" style={{ fontSize: 12 }}>Current password</label>
            <input
              type="password"
              className="control-input"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              disabled={passwordSaving}
              autoComplete="current-password"
            />
          </div>
          <div className="form-field" style={{ marginTop: 8 }}>
            <label className="control-label" style={{ fontSize: 12 }}>New password (15–128 characters)</label>
            <input
              type="password"
              className="control-input"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              disabled={passwordSaving}
              autoComplete="new-password"
            />
          </div>
          {passwordStatus && (
            <p className="status-note" data-tone={passwordStatus.tone} style={{ margin: "10px 0" }}>
              {passwordStatus.text}
            </p>
          )}
          <button type="submit" className="button button-secondary" style={{ width: "100%", marginTop: 8 }} disabled={passwordSaving}>
            {passwordSaving ? <><Loader2 size={14} className="animate-spin" /> Updating…</> : "Save new password"}
          </button>
        </form>
      )}

      {openSection === "delete" && (
        <div style={{ marginTop: 14, background: "rgba(225, 29, 72, 0.05)", border: "1px solid rgba(225, 29, 72, 0.2)", borderRadius: "var(--radius)", padding: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>Permanently delete account?</p>
          <p style={{ margin: "6px 0 12px", fontSize: 12, color: "var(--muted-foreground)" }}>
            This permanently removes your credentials, saved photos, and keepsakes. This cannot be undone.
          </p>
          {deleteStatus && (
            <p className="status-note" data-tone="error" style={{ margin: "8px 0" }}>{deleteStatus}</p>
          )}
          {!deleteConfirm ? (
            <button
              type="button"
              className="button button-secondary"
              style={{ width: "100%", color: "var(--tomato)", borderColor: "var(--tomato)" }}
              onClick={() => setDeleteConfirm(true)}
            >
              I understand, proceed to delete
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              style={{ width: "100%", background: "var(--tomato)", borderColor: "var(--tomato)" }}
              onClick={handleDeleteAccount}
              disabled={deleteSaving}
            >
              {deleteSaving ? <><Loader2 size={14} className="animate-spin" /> Deleting account…</> : "Confirm permanent deletion"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AuthContent() {
  const router = useRouter();
  const [formOpened, setFormOpened] = useState(false);
  const searchParams = useSearchParams();
  const redirectUrl = safeAuthReturn(searchParams.get("redirect"));
  const guestUrl = redirectUrl.startsWith("/download") ? redirectUrl : "/?booth=1";
  const { user, logout, status, notice, refresh } = useAuth();

  if (!formOpened && (status === "loading" || status === "signing-out" || status === "unavailable" || status === "logout-failed")) return <><SiteHeader compact /><main id="main-content" className="account-main page-container"><div className="account-card"><h1>Your account</h1><p role="status">{status === "loading" ? "Checking your session…" : status === "signing-out" ? "Signing out…" : status === "logout-failed" ? notice : "We couldn’t check your session. You can keep creating and download a guest PNG."}</p>{status === "unavailable" && <button className="button button-primary" onClick={() => void refresh()}>Try again</button>}{status === "logout-failed" && <button className="button button-primary" onClick={() => void logout()}>Retry sign-out</button>}<Link className="button button-secondary" href={guestUrl}>Continue as a guest</Link></div></main></>;


  if (user) {
    return (
      <>
        <SiteHeader compact />
        <main id="main-content" className="account-main page-container">
          <div className="account-card">
            <div className="account-avatar" aria-hidden="true">
              {(user.name || "").trim().slice(0, 1).toUpperCase() || "♡"}
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200" style={{ margin: "4px auto 8px" }}>
              {user.plan === "creator_yearly"
                ? "⭐ Creator Yearly Plan"
                : user.plan === "creator_monthly"
                  ? "⭐ Creator Monthly Plan"
                  : user.plan === "event"
                    ? "⭐ Event Pass Active"
                    : "Free Member Account"}
            </div>
            <h1>Hi, {(user.name || "friend").split(" ")[0]}.</h1>
            <p>{user.email}</p>
            <p>
              {user.plan === "creator_yearly" || user.plan === "creator_monthly"
                ? "You’re on the Creator Plan. Permanent cloud library, clean unbranded exports, all 23+ layouts, and raw photo downloads are active."
                : user.plan === "event"
                  ? "Your 72-hour Event Pass is active. Custom event branding, all 23+ layouts, and 1-year guest link retention are active."
                  : "You’re signed in with a Free Member account. 4 classic layouts, 10 vintage filters, and 7-day cloud sharing are active."}
            </p>
            {(!user.plan || user.plan === "free") && (
              <Link className="button button-primary" href="/pricing" style={{ margin: "4px auto 8px" }}>
                <Sparkles size={16} /> Upgrade to Creator (7-Day Trial)
              </Link>
            )}
            {(user.plan === "creator_yearly" || user.plan === "creator_monthly") && (
              <button
                type="button"
                className="button button-secondary"
                style={{ margin: "4px auto 8px" }}
                onClick={async () => {
                  try {
                    const portal = await createCustomerPortal();
                    if (portal.portalUrl) window.location.href = portal.portalUrl;
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Could not open billing portal");
                  }
                }}
              >
                Manage Billing in Polar Portal <ExternalLink size={14} />
              </button>
            )}
            <Link className="button button-primary" href="/?booth=1">
              Start a new session
            </Link>
            <Link className="button button-secondary" href="/library">
              My library
            </Link>
            <Link className="button button-secondary" href="/download">
              <QrCode size={16} /> Find by code
            </Link>
            <button className="button button-quiet" onClick={() => void logout()}>
              <LogOut size={15} /> Sign out
            </button>
            <AccountSettings />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader compact />
      <main id="main-content" className="auth-main page-container">
        <section className="auth-story">
          <h2>Keep the<br />good ones<span style={{ color: "var(--tomato)" }}>.</span></h2>
          <p>
            Guests can create and download freely with a 24-hour expiration. Join Pro to keep your photos forever, export clean unbranded prints, and download all original shots.
          </p>
          <div className="auth-art"><SampleStrip theme="lilac" variant="polaroid" label="you had to be there ♡" /><SampleStrip theme="sage" variant="grid" label="our kind of day" /></div>
        </section>
        <section className="auth-form-panel" aria-label="Your account" onFocusCapture={() => setFormOpened(true)}>
          {redirectUrl === "/library" && <p className="intro">Sign in to see the photos saved to your account.</p>}<AccountForm variant="page" onSuccess={() => router.push(redirectUrl)} onContinueAsGuest={() => router.push(guestUrl)} />
        </section>
      </main>
    </>
  );
}

export default function AuthPage() {
  return <Suspense fallback={<div className="screen-loading" role="status"><Loader2 size={26} /><span>Opening your account…</span></div>}><AuthContent /></Suspense>;
}
