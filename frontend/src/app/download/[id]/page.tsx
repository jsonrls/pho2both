"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Clock, Download, Images, Loader2, Lock, Printer, RotateCw, Share2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Dialog } from "@/components/Dialog";
import { getPhotoStrip, getSessionPhotos, recordDownload } from "@/lib/api";
import { LAYOUTS } from "@/lib/constants";
import { useAuth } from "@/lib/authContext";

interface PhotoStripData {
  sessionId?: string;
  canDownloadOriginals?: boolean;
  shareCode: string;
  stripData: string;
  template: string;
  headerText?: string;
  downloadCount?: number;
  createdAt: string;
  isGuest?: boolean;
  expiresAt?: string;
}

type LookupState = "loading" | "ready" | "expired" | "missing" | "offline";

function downloadImage(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function DownloadPage() {
  const { user, status, generation, isCurrent } = useAuth();
  const params = useParams<{ id: string }>();
  const idOrCode = params.id?.trim() || "";
  const [strip, setStrip] = useState<PhotoStripData | null>(null);
  const [state, setState] = useState<LookupState>("loading");
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [permissionRetry, setPermissionRetry] = useState(0);
  const [permissionCheck, setPermissionCheck] = useState({ generation, code: idOrCode, status, user, state, retry: permissionRetry });
  const [permission, setPermission] = useState<{ check: typeof permissionCheck; strip: PhotoStripData | null; error: boolean } | null>(null);
  const activePermissionCheck = useRef<typeof permissionCheck | null>(null);
  const permissionChanged = permissionCheck.generation !== generation || permissionCheck.code !== idOrCode || permissionCheck.status !== status || permissionCheck.user !== user || permissionCheck.state !== state || permissionCheck.retry !== permissionRetry;
  // Reset before committing UI: same-account verification deliberately preserves generation.
  if (permissionChanged) {
    setPermissionCheck({ generation, code: idOrCode, status, user, state, retry: permissionRetry });
    setPermission(null);
  }
  const requestRef = useRef(0);
  const mountedRef = useRef(false);
  const downloadTimerRef = useRef<{ timer: ReturnType<typeof setTimeout>; resolve: () => void } | null>(null);

  const loadStrip = useCallback(async () => {
    const request = ++requestRef.current;
    setState("loading");
    setStrip(null);
    setNotice("");
    try {
      if (!idOrCode) throw new Error("Missing share code");
      const data: { strip?: PhotoStripData } = await getPhotoStrip(idOrCode);
      if (request !== requestRef.current) return;
      if (!data.strip?.stripData) throw new Error("Photo strip missing");
      const result = data.strip;
      if (result.isGuest && result.expiresAt && new Date(result.expiresAt).getTime() < Date.now()) {
        setState("expired");
        return;
      }
      setStrip(result);
      setState("ready");
    } catch (failure) {
      if (request !== requestRef.current) return;
      const details = failure as { status?: number; isExpired?: boolean; message?: string };
      const expired = details.isExpired || details.status === 410;
      const missing = details.status === 404 || /404|missing|not found \(400\)/i.test(details.message || "");
      setState(expired ? "expired" : missing ? "missing" : "offline");
      console.warn("[photo-lookup]", { status: expired ? "expired" : missing ? "not_found" : "unavailable" });
    }
  }, [idOrCode]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(() => void loadStrip(), 0);
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      requestRef.current += 1;
      if (downloadTimerRef.current) {
        clearTimeout(downloadTimerRef.current.timer);
        downloadTimerRef.current.resolve();
        downloadTimerRef.current = null;
      }
    };
  }, [loadStrip]);

  useLayoutEffect(() => {
    activePermissionCheck.current = permissionCheck;
    return () => { activePermissionCheck.current = null; };
  }, [permissionCheck]);

  useEffect(() => {
    const { state, status, generation, code } = permissionCheck;
    if (state !== "ready" || (status !== "authenticated" && status !== "guest")) return;
    let cancelled = false;
    const isActive = () => !cancelled && activePermissionCheck.current === permissionCheck && isCurrent(generation);
    void getPhotoStrip(code).then((result: { strip: PhotoStripData }) => {
      if (!isActive()) return;
      if (typeof result.strip?.canDownloadOriginals !== "boolean") {
        setPermission({ check: permissionCheck, strip: null, error: true });
        return;
      }
      setPermission({ check: permissionCheck, strip: result.strip, error: false });
    }).catch(() => {
      if (isActive()) setPermission({ check: permissionCheck, strip: null, error: true });
    });
    return () => { cancelled = true; };
  }, [permissionCheck, isCurrent]);
  const currentPermission = !permissionChanged && permission?.check === permissionCheck ? permission.strip : null;
  const permissionError = !permissionChanged && permission?.check === permissionCheck && permission.error;
  const canDownload = status === "authenticated" && currentPermission?.canDownloadOriginals === true && Boolean(currentPermission.sessionId);

  const updateDownloadCount = async () => {
    const recorded = await recordDownload(idOrCode);
    if (recorded && mountedRef.current) setStrip((current) => current ? { ...current, downloadCount: (current.downloadCount || 0) + 1 } : current);
  };

  const download = () => {
    if (!strip?.stripData) return;
    downloadImage(strip.stripData, `pho2booth-${strip.shareCode || "keepsake"}.png`);
    setNoticeIsError(false);
    setNotice("Download has started. Look for it in your device’s downloads.");
    void updateDownloadCount();
  };

  const downloadAll = async () => {
    if (!user) { setShowAuth(true); return; }
    if (!strip || downloadingAll) return;
    if (!canDownload || !currentPermission?.sessionId || activePermissionCheck.current !== permissionCheck || !isCurrent(generation)) return;
    const downloadingGeneration = generation;
    const isDownloadCurrent = () => mountedRef.current && activePermissionCheck.current === permissionCheck && isCurrent(downloadingGeneration);
    setDownloadingAll(true);
    setNotice("");
    try {
      const result: { photos?: { imageData: string }[] } = await getSessionPhotos(currentPermission.sessionId);
      if (!isDownloadCurrent()) return;
      const photos = result.photos || [];
      if (!photos.length) { setNoticeIsError(true); setNotice("Individual photos aren’t available for this keepsake. You can still download the finished PNG."); return; }
      for (let index = 0; index < photos.length; index++) {
        if (!isDownloadCurrent()) return;
        downloadImage(photos[index].imageData, `pho2booth-${strip.shareCode}-photo-${index + 1}.png`);
        if (index < photos.length - 1) await new Promise<void>((resolve) => {
          const timer = setTimeout(() => { downloadTimerRef.current = null; resolve(); }, 350);
          downloadTimerRef.current = { timer, resolve };
        });
      }
      if (isDownloadCurrent()) {
        setNoticeIsError(false);
        setNotice(`${photos.length} photo downloads requested. Your browser may ask to allow multiple downloads.`);
      }
    } catch {
      if (isDownloadCurrent()) { setNoticeIsError(true); setNotice("The individual photos couldn’t be loaded. Try again, or download your finished keepsake."); }
    } finally {
      if (mountedRef.current) setDownloadingAll(false);
    }
  };

  const share = async () => {
    if (!strip || sharing) return;
    setSharing(true);
    try {
      if (navigator.share) {
        const blob = await (await fetch(strip.stripData)).blob();
        const file = new File([blob], `pho2booth-${strip.shareCode}.png`, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "A little keepsake from Pho2Booth" });
        else await navigator.share({ url: window.location.href, title: "A little keepsake from Pho2Booth" });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setNoticeIsError(false);
        setNotice("Sharing link copied. Send it to someone who was there.");
      } else download();
    } catch (failure) {
      if (!(failure instanceof Error && failure.name === "AbortError")) {
        setNoticeIsError(true);
        setNotice("Sharing couldn’t open. You can download the photo or copy this page’s address.");
      }
    } finally { if (mountedRef.current) setSharing(false); }
  };

  const capturedDate = strip?.createdAt && !Number.isNaN(new Date(strip.createdAt).getTime()) ? new Date(strip.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "Just now";
  const redirect = `/auth?redirect=${encodeURIComponent(`/download/${idOrCode}`)}`;

  return (
    <>
      <SiteHeader compact />
      <main id="main-content" className="download-main page-container">
        {state === "loading" && (
          <div className="screen-loading" role="status">
            <Loader2 size={30} aria-hidden="true" />
            <span>Finding your good times…</span>
          </div>
        )}
        {state !== "loading" && state !== "ready" && (
          <section className="error-card">
            {state === "expired" ? <Clock aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
            <h1>{state === "expired" ? "This guest link has expired." : state === "missing" ? "A tiny mix-up, perhaps?" : "Sharing is taking a moment."}</h1>
            <p>
              {state === "expired"
                ? "Guest sharing links last 24 hours. Signing in cannot restore an expired link. A photo you’ve already downloaded stays on your device."
                : state === "missing"
                ? "We couldn’t find a keepsake with this code. Check the code and give it another try."
                : "We couldn’t reach the photo service. Your code is still here. Try again in a moment."}
            </p>
            <div className="control-actions">
              {state !== "expired" && (
                <button className="button button-primary" onClick={() => void loadStrip()}>
                  <RotateCw size={15} /> Try again
                </button>
              )}
              <Link className="button button-secondary" href="/download">
                Try another code
              </Link>
            </div>
            <Link className="text-link" href="/?booth=1">
              Make a new memory
            </Link>
          </section>
        )}
        {state === "ready" && strip && (
          <>
            <div className="download-heading">
              <h1>
                One for the camera roll<span style={{ color: "var(--tomato)" }}>.</span>
              </h1>
              <p>A little keepsake of a very good time.</p>
            </div>
            <div className="download-grid">
              <div className="download-photo">
                <img
                  className="print-artifact"
                  src={strip.stripData}
                  alt={strip.headerText ? `Photo keepsake: ${strip.headerText}` : "Your photo booth keepsake"}
                  onError={() => setState("missing")}
                />
              </div>
              <section className="download-details">
                <h2>Your photos, to keep.</h2>
                <p className="muted-copy">
                  Download your finished keepsake, share it with your favorite people, or make a print for the fridge.
                </p>

                {strip.isGuest ? (
                  <div className="p-3.5 bg-[#f5ede4] border border-[#e4d5c3] rounded-xl flex flex-col gap-1.5 text-xs text-[#29251f]">
                    <div className="flex items-center gap-1.5 font-bold text-[#8b3d2f]">
                      <Clock className="w-4 h-4 text-[#d94c35]" />
                      Guest Free Tier · Link expires in 24 hours
                    </div>
                    <p className="text-[#655f55] leading-snug">
                      Downloads save directly to your device. Upgrade to a Pro Account for permanent cloud saves, clean unbranded exports, and original raw photo downloads.
                    </p>
                    <Link href={redirect} className="inline-flex items-center gap-1 font-bold text-[#8b3d2f] hover:underline mt-0.5">
                      Upgrade to Pro / Sign in <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
                    <span className="text-base">⭐</span>
                    <div>
                      <span className="font-bold">Pro Keepsake</span> · Permanently saved in your cloud library with unbranded exports.
                    </div>
                  </div>
                )}

                <button className="button button-primary" onClick={download}>
                  <Download size={17} /> Download keepsake · PNG
                </button>
                <button className="button button-secondary" onClick={() => void share()} disabled={sharing}>
                  {sharing ? <Loader2 className="animate-spin" size={17} /> : <Share2 size={17} />} Share or copy link
                </button>
                {status === "loading" || status === "signing-out" ? (
                  <p className="status-note" role="status">Checking individual photo access…</p>
                ) : status === "unavailable" || status === "logout-failed" ? (
                  <p className="status-note">Your session could not be verified. The finished PNG is still available.</p>
                ) : status === "guest" ? (
                  <button className="button button-secondary" onClick={() => setShowAuth(true)}>
                    <Lock size={13} /> Sign in to download raw photos (Pro)
                  </button>
                ) : permissionError ? (
                  <div className="status-note">
                    We couldn’t check individual photo access.{" "}
                    <button className="text-link" onClick={() => { setPermissionRetry((value) => value + 1); }}>
                      Try again
                    </button>
                  </div>
                ) : !currentPermission ? (
                  <p className="status-note" role="status">Checking individual photo access…</p>
                ) : canDownload ? (
                  <button className="button button-secondary" onClick={() => void downloadAll()} disabled={downloadingAll}>
                    {downloadingAll ? <Loader2 className="animate-spin" size={17} /> : <Images size={17} />}
                    {downloadingAll ? "Getting your photos…" : "Download individual photos (Pro)"}
                  </button>
                ) : (
                  <p className="status-note">
                    {currentPermission.sessionId
                      ? "Individual photos aren’t available for this keepsake. You can still download the finished PNG."
                      : "Individual photos are private to the Pro Account that saved this keepsake. The finished PNG is available to you."}
                  </p>
                )}
                <button className="button button-quiet" onClick={() => window.print()}>
                  <Printer size={16} /> Print your keepsake
                </button>
                {notice && (
                  <p className="status-note" data-tone={noticeIsError ? "error" : "success"} role="status">
                    {!noticeIsError && <CheckCircle2 size={16} aria-hidden="true" />}
                    {notice}
                  </p>
                )}
                <dl className="download-metadata">
                  <div>
                    <dt>Share code</dt>
                    <dd className="download-code">{strip.shareCode}</dd>
                  </div>
                  <div>
                    <dt>Made on</dt>
                    <dd>{capturedDate}</dd>
                  </div>
                  <div>
                    <dt>Layout</dt>
                    <dd>{LAYOUTS.find((layout) => layout.id === strip.template)?.name || "Photo keepsake"}</dd>
                  </div>
                  <div>
                    <dt>Storage Tier</dt>
                    <dd>{strip.isGuest ? "Guest (24-Hour Expiration)" : "Pro Member (Permanent Library)"}</dd>
                  </div>
                </dl>
                <Link className="button button-quiet" href="/?booth=1">
                  Back for another round
                </Link>
              </section>
            </div>
          </>
        )}
      </main>
      {showAuth && (
        <Dialog title="Unlock Pro photo access" onClose={() => setShowAuth(false)}>
          <p>
            Sign in to your Pro Account to unlock individual original photos in full resolution and save keepsakes permanently to your cloud library.
          </p>
          <div className="control-actions">
            <Link className="button button-primary" href={redirect}>
              Sign in to Pro
            </Link>
            <button className="button button-secondary" onClick={() => setShowAuth(false)}>
              <ArrowLeft size={15} /> Keep browsing
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
