"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QrCode } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SampleStrip } from "@/components/PhotoArt";

export default function DownloadIndexPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!/^(?:[A-Z0-9_-]{4,16}|[A-Z0-9_-]{32})$/.test(cleanCode)) {
      setError("Enter the complete share code: 32 characters, or a legacy code of 4–16 characters.");
      return;
    }
    router.push(`/download/${encodeURIComponent(cleanCode)}`);
  };

  return <><SiteHeader compact /><main id="main-content" className="lookup-main page-container"><section className="lookup-story"><h1>Your good times,<br />right here<span style={{ color: "var(--tomato)" }}>.</span></h1><p>Already had your moment in the booth? Your keepsake is just a share code away.</p><SampleStrip theme="lilac" variant="grid" label="remember this? ♡" /></section><section className="lookup-card" aria-labelledby="lookup-title"><div className="lookup-icon"><QrCode size={28} strokeWidth={1.5} aria-hidden="true" /></div><h2 id="lookup-title">Find by code.</h2><p>Use the share code shown after saving your photo. Scanning its QR code takes you straight to the same place.</p><form onSubmit={submit}><label className="control-label" htmlFor="share-code">Your share code</label><input id="share-code" className="control-input" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(""); }} placeholder="7X9K2M1Q" maxLength={32} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby={error ? "share-code-error" : "share-code-hint"} /><p className="form-footnote" id="share-code-hint">Guest sharing links are available for 24 hours.</p>{error && <p className="status-note" data-tone="error" id="share-code-error" role="alert">{error}</p>}<button className="button button-primary" type="submit">Find my keepsake</button></form><div className="lookup-hint">Saved photos to your account? <Link className="text-link" href="/library">Open My library</Link></div><div className="lookup-hint">Want to make a new memory? <Link className="text-link" href="/?booth=1">Step into the booth</Link></div></section></main></>;
}
