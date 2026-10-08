"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { requestPasswordReset, submitPasswordReset } from "@/lib/authApi";

export interface AccountFormProps {
  variant: "page" | "dialog";
  onSuccess: () => void;
  onContinueAsGuest: () => void;
}

type AuthMode = "signin" | "signup" | "forgot";

function accountErrorMessage(failure: unknown): string {
  const unavailable = "We couldn’t reach the account service. Please try again in a moment.";
  if (!(failure instanceof Error)) return unavailable;
  const message = failure.message;
  const connectionFailure = /^(?:backend service unreachable\b|failed to fetch\b|fetch failed\b|load failed\b|network(?:error| request failed)\b)/i.test(message);
  const serviceFailure = /^(?:sign (?:in|up) failed \(5\d{2}\)|failed to sign (?:in|up)|internal server error|bad gateway|service unavailable|gateway timeout)\.?$/i.test(message);
  return connectionFailure || serviceFailure ? unavailable : message;
}

export function AccountForm({ variant, onSuccess, onContinueAsGuest }: AccountFormProps) {
  const { login, signup, status, notice, refresh, logout } = useAuth();
  const id = useId();
  const nameId = `${id}-name`;
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;
  const errorId = `${id}-error`;
  const helpId = `${id}-password-help`;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mounted = useRef(false);
  const requestRef = useRef<symbol | null>(null);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [forgotStep, setForgotStep] = useState<"request" | "reset">("request");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetSuccessMessage, setResetSuccessMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const accountBlocked = status === "loading" || status === "signing-out" || status === "logout-failed" || status === "unavailable";
  const controlsDisabled = isSubmitting || accountBlocked;
  const Heading = variant === "page" ? "h1" : "h3";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A dismissed form must not handle a request that finishes after it closes.
      requestRef.current = null;
    };
  }, []);

  const changeMode = (nextMode: AuthMode) => {
    if (requestRef.current || accountBlocked) return;
    setMode(nextMode);
    setFieldErrors({});
    setError("");
    setResetSuccessMessage("");
    if (nextMode === "forgot") setForgotStep("request");
  };

  const handleForgotRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mounted.current || requestRef.current || accountBlocked) return;
    setError("");
    setResetSuccessMessage("");
    const emailInput = event.currentTarget.elements.namedItem("email") as HTMLInputElement;
    if (!email.trim() || !emailInput?.validity.valid) {
      setFieldErrors({ email: "Enter a valid email address." });
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const res = await requestPasswordReset(email.trim());
      if (res.resetToken) {
        setResetToken(res.resetToken);
        setResetSuccessMessage("Reset code generated! Please enter your new password below.");
        setForgotStep("reset");
      } else {
        setResetSuccessMessage(res.message || "If this email is registered, password reset instructions have been issued.");
      }
    } catch (failure) {
      setError(accountErrorMessage(failure));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mounted.current || requestRef.current || accountBlocked) return;
    setError("");
    const errors: Record<string, string> = {};
    if (!resetToken.trim()) errors.token = "Enter the 64-character reset token.";
    const length = Array.from(newPassword).length;
    if (length < 15 || length > 128) errors.newPassword = "Use 15–128 characters for your new password.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await submitPasswordReset(resetToken.trim(), newPassword);
      await refresh();
      onSuccess();
    } catch (failure) {
      setError(accountErrorMessage(failure));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mounted.current || requestRef.current || mode === "forgot" || accountBlocked) return;
    setError("");
    const errors: Record<string, string> = {};
    if (mode === "signup" && !name.trim()) errors.name = "Add your name so we know what to call you.";
    const emailInput = event.currentTarget.elements.namedItem("email") as HTMLInputElement;
    if (!email.trim() || !emailInput.validity.valid) errors.email = "Enter a valid email address.";
    const length = Array.from(password).length;
    if (length < (mode === "signup" ? 15 : 1) || length > 128) errors.password = mode === "signup" ? "Use 15–128 characters for your password." : "Enter your password (1–128 characters).";
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) { (event.currentTarget.elements.namedItem(first) as HTMLInputElement)?.focus(); return; }

    const request = Symbol("account-request");
    requestRef.current = request;
    setIsSubmitting(true);
    let succeeded = false;
    try {
      if (mode === "signin") await login(email.trim(), password);
      else await signup(email.trim(), password, name.trim());
      succeeded = true;
    } catch (failure) {
      if (mounted.current && requestRef.current === request) {
        setError(accountErrorMessage(failure));
      }
    } finally {
      if (mounted.current && requestRef.current === request) {
        requestRef.current = null;
        setIsSubmitting(false);
        if (succeeded) onSuccess();
      }
    }
  };

  return (
    <div className="account-form" data-variant={variant}>
      <div className="control-tabs" role="group" aria-label="Account options">
        <button type="button" aria-pressed={mode === "signin"} disabled={controlsDisabled} onClick={() => changeMode("signin")}>Sign in</button>
        <button type="button" aria-pressed={mode === "signup"} disabled={controlsDisabled} onClick={() => changeMode("signup")}>Create Pro account</button>
      </div>
      <Heading style={variant === "dialog" ? { fontSize: 25, margin: "18px 0 12px" } : undefined}>
        {mode === "signin" ? "Lovely to see you." : mode === "signup" ? "Make yourself at home." : forgotStep === "reset" ? "Set a new password." : "Let’s get you back in."}
      </Heading>
      <p className="intro" style={variant === "dialog" ? { fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 } : undefined}>
        {mode === "signin" ? "Sign in with your email to keep creating." : mode === "signup" ? "A Pro Account for permanent cloud saves and clean unbranded exports." : forgotStep === "reset" ? "Enter your reset code and pick a new secure password." : "Enter your account email to receive password reset instructions."}
      </p>
      {notice && notice !== "You’re signed out." && <p className="status-note" role="status">{notice}</p>}
      {status === "unavailable" && <div className="status-note">We couldn’t check your session. You can keep creating and download a guest PNG. <button className="text-link" type="button" onClick={() => void refresh()}>Try again</button></div>}
      {status === "logout-failed" && <button className="button button-secondary" type="button" onClick={() => void logout()}>Retry sign-out</button>}
      {(status === "loading" || status === "signing-out") && <p className="status-note" role="status">{status === "loading" ? "Checking your session…" : "Signing out…"}</p>}
      {resetSuccessMessage && <div className="status-note" data-tone="success" role="status">{resetSuccessMessage}</div>}
      {error && <div id={errorId} className="status-note" data-tone="error" role="alert">{error}</div>}
      {mode !== "forgot" && (
        <form noValidate onSubmit={submit} aria-busy={isSubmitting || status === "loading" || status === "signing-out"} aria-describedby={error ? errorId : undefined}>
          {mode === "signup" && (
            <div className="form-field">
              <label className="control-label" htmlFor={nameId}>Your name</label>
              <input id={nameId} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined} name="name" className="control-input" required autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="What should we call you?" maxLength={80} disabled={controlsDisabled} />
              {fieldErrors.name && <p id={`${nameId}-error`} role="alert">{fieldErrors.name}</p>}
            </div>
          )}
          <div className="form-field">
            <label className="control-label" htmlFor={emailId}>Email address</label>
            <input id={emailId} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined} name="email" className="control-input" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" disabled={controlsDisabled} />
            {fieldErrors.email && <p id={`${emailId}-error`} role="alert">{fieldErrors.email}</p>}
          </div>
          <div className="form-field">
            <div className="label-row">
              <label className="control-label" htmlFor={passwordId}>Password</label>
              {mode === "signin" && <button className="text-link" type="button" onClick={() => changeMode("forgot")} disabled={controlsDisabled}>Forgot password?</button>}
            </div>
            <div className="password-field">
              <input id={passwordId} name="password" className="control-input" required type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "signup" ? "15–128 characters" : "Your password"} disabled={controlsDisabled} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={[mode === "signup" ? helpId : "", fieldErrors.password ? `${passwordId}-error` : ""].filter(Boolean).join(" ") || undefined} />
              <button type="button" className="password-toggle-btn" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} data-active={showPassword} onClick={() => setShowPassword(previous => !previous)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
            </div>
            {mode === "signup" && <p id={helpId} className="form-footnote">Use 15–128 characters. Spaces and Unicode characters are welcome. Your password is kept exactly as you type it.</p>}
            {fieldErrors.password && <p id={`${passwordId}-error`} role="alert">{fieldErrors.password}</p>}
          </div>
          <button className="button button-primary form-submit" type="submit" disabled={controlsDisabled}>
            {isSubmitting ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {mode === "signin" ? "Signing in…" : "Creating your account…"}</> : <>{mode === "signin" ? "Sign in" : "Create your account"}</>}
          </button>
        </form>
      )}
      {mode === "forgot" && forgotStep === "request" && (
        <form noValidate onSubmit={handleForgotRequest} aria-busy={isSubmitting} aria-describedby={error ? errorId : undefined}>
          <div className="form-field">
            <label className="control-label" htmlFor={emailId}>Email address</label>
            <input id={emailId} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined} name="email" className="control-input" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" disabled={controlsDisabled} />
            {fieldErrors.email && <p id={`${emailId}-error`} role="alert">{fieldErrors.email}</p>}
          </div>
          <button className="button button-primary form-submit" type="submit" disabled={controlsDisabled}>
            {isSubmitting ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Sending instructions…</> : "Send reset instructions"}
          </button>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
            <button className="text-link" type="button" onClick={() => changeMode("signin")}>Back to sign in</button>
            <button className="text-link" type="button" onClick={() => { setForgotStep("reset"); setError(""); }}>Have a reset code?</button>
          </div>
        </form>
      )}
      {mode === "forgot" && forgotStep === "reset" && (
        <form noValidate onSubmit={handleResetSubmit} aria-busy={isSubmitting} aria-describedby={error ? errorId : undefined}>
          <div className="form-field">
            <label className="control-label" htmlFor={`${id}-token`}>Reset code / token</label>
            <input id={`${id}-token`} aria-invalid={Boolean(fieldErrors.token)} aria-describedby={fieldErrors.token ? `${id}-token-error` : undefined} name="token" className="control-input" required value={resetToken} onChange={event => setResetToken(event.target.value.trim())} placeholder="Paste 64-character token" disabled={controlsDisabled} />
            {fieldErrors.token && <p id={`${id}-token-error`} role="alert">{fieldErrors.token}</p>}
          </div>
          <div className="form-field">
            <div className="label-row">
              <label className="control-label" htmlFor={`${id}-new-password`}>New password</label>
            </div>
            <div className="password-field">
              <input id={`${id}-new-password`} name="newPassword" className="control-input" required type={showPassword ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="15–128 characters" disabled={controlsDisabled} aria-invalid={Boolean(fieldErrors.newPassword)} aria-describedby={[helpId, fieldErrors.newPassword ? `${id}-new-password-error` : ""].filter(Boolean).join(" ") || undefined} />
              <button type="button" className="password-toggle-btn" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} data-active={showPassword} onClick={() => setShowPassword(previous => !previous)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
            </div>
            <p id={helpId} className="form-footnote">Use 15–128 characters for your new password.</p>
            {fieldErrors.newPassword && <p id={`${id}-new-password-error`} role="alert">{fieldErrors.newPassword}</p>}
          </div>
          <button className="button button-primary form-submit" type="submit" disabled={controlsDisabled}>
            {isSubmitting ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Updating password…</> : "Set new password"}
          </button>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
            <button className="text-link" type="button" onClick={() => { setForgotStep("request"); setError(""); }}>Request new code</button>
            <button className="text-link" type="button" onClick={() => changeMode("signin")}>Back to sign in</button>
          </div>
        </form>
      )}
      <p className="form-footnote">Just here for the photos? <button className="text-link" type="button" onClick={onContinueAsGuest}>Continue as a guest</button></p>
    </div>
  );
}
