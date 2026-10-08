"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { Dialog } from "@/components/Dialog";
import { useAuth } from "@/lib/authContext";
import { ApiError } from "@/lib/api";
import { LAYOUTS } from "@/lib/constants";
import { getLibraryMedia, getLibraryPage, type LibraryList, type LibraryPhoto, type LibrarySession, type LibraryStrip } from "@/lib/libraryApi";
import styles from "./library.module.css";

type Access = { current: () => boolean; expired: () => void };
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const layoutLabel = (value: string) => LAYOUTS.find(layout => layout.id === value)?.name || ({ strip: "Photo strip", classic: "Classic strip", grid: "Photo grid", polaroid: "Polaroid", single: "Single photo" }[value] || "Photo keepsake");
const signIn = "/auth?redirect=%2Flibrary";

function useLibraryPage<T extends { id: string }>(list: LibraryList, access: Access, enabled = true) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (next: string | null) => {
    if (!access.current() || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError(false);
    try {
      const page = await getLibraryPage<T>(list, next, controller.signal);
      if (controller.signal.aborted || request.current !== controller || !access.current()) return;
      setItems(previous => {
        const existing = next ? previous : [];
        const ids = new Set(existing.map(item => item.id));
        return [...existing, ...page.items.filter(item => !ids.has(item.id))];
      });
      setCursor(page.nextCursor); setLoaded(true);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) access.expired();
      else if (access.current() && request.current === controller) setError(true);
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (access.current() && !controller.signal.aborted) setLoading(false);
      }
    }
  }, [list, access]);
  useEffect(() => {
    if (!enabled || loaded) return;
    const timer = setTimeout(() => void load(null), 0);
    return () => clearTimeout(timer);
  }, [enabled, loaded, load]);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  return { items, cursor, loading, loaded, error, more: () => void load(cursor) };
}

function PrivateImage({ kind, id, alt, access, href, thumbnail = false }: { thumbnail?: boolean; href?: string; kind: "photos" | "strips"; id: string; alt: string; access: Access }) {
  const host = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    let started = false;
    const load = async () => {
      if (started || !access.current()) return;
      started = true;
      setError(""); setSource("");
      try {
        const blob = await getLibraryMedia(kind, id, controller.signal);
        if (controller.signal.aborted || !access.current()) return;
        objectUrl = URL.createObjectURL(blob); setSource(objectUrl);
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) access.expired();
        else if (access.current()) setError(failure instanceof ApiError && failure.status === 404 ? "This photo is no longer available." : "Preview couldn’t load.");
      }
    };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void load(); }, { rootMargin: "160px" });
    if (host.current) observer.observe(host.current);
    return () => { controller.abort(); observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [kind, id, attempt, access]);
  return <div ref={host} className={styles.preview}>
    {error ? thumbnail ? <span>Preview unavailable</span> : <div><p>{error}</p><button className="button button-secondary" onClick={() => setAttempt(value => value + 1)}>Retry preview</button></div> : source ?
      // Private object URLs must not enter Next's shared image optimizer/cache.
      <ImageLink source={source} alt={alt} href={href} failed={() => setError("Preview couldn’t load.")} /> : <p>{thumbnail ? "…" : "Loading preview…"}</p>}
  </div>;
}

function ImageLink({ source, alt, href, failed }: { source: string; alt: string; href?: string; failed: () => void }) {
  // eslint-disable-next-line @next/next/no-img-element
  const image = <img src={source} alt={alt} onError={failed} />;
  return href ? <Link className={styles.imageLink} href={href} aria-label={`Open keepsake: ${alt}`}>{image}</Link> : image;
}

function Pagination({ page, noun }: { page: { loading: boolean; error: boolean; cursor: string | null; items: unknown[]; more: () => void }; noun: string }) {
  return <div className={styles.actions}>
    {page.error && <p role="alert">{page.items.length ? "More items couldn’t be loaded." : `We couldn’t load your ${noun}. Check your connection and try again.`}</p>}
    {(page.cursor || page.error) && <button className="button button-secondary" disabled={page.loading} onClick={page.more}>{page.loading ? "Loading…" : page.error ? "Try again" : `Load more ${noun}`}</button>}
  </div>;
}

function OriginalBrowser({ session, access, close }: { session: LibrarySession; access: Access; close: () => void }) {
  const page = useLibraryPage<LibraryPhoto>(`sessions/${session.id}/photos`, access);
  const [index, setIndex] = useState(0);
  const [downloadState, setDownloadState] = useState("");
  const download = useRef<AbortController | null>(null);
  const downloadUrl = useRef("");
  useEffect(() => () => { download.current?.abort(); if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current); }, []);
  const photo = page.items[index];
  const countConsistent = page.cursor ? session.storedPhotoCount > page.items.length : session.storedPhotoCount === page.items.length;
  const position = countConsistent ? `Photo ${index + 1} of ${session.storedPhotoCount}` : `Photo ${index + 1} · ${page.items.length} loaded`;
  const startDownload = async () => {
    if (!photo || download.current || !access.current()) return;
    const controller = new AbortController();
    download.current = controller; setDownloadState("Preparing download…");
    try {
      const blob = await getLibraryMedia("photos", photo.id, controller.signal);
      if (controller.signal.aborted || download.current !== controller || !access.current()) return;
      const url = URL.createObjectURL(blob);
      downloadUrl.current = url;
      const link = document.createElement("a");
      link.href = url; link.download = `original-${photo.shotIndex + 1}.${blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png"}`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadState("Download started. Check your device’s downloads.");
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) access.expired();
      else if (access.current()) setDownloadState("We couldn’t download this original. Try again.");
    } finally { if (download.current === controller) download.current = null; }
  };
  return <Dialog title="Original photos" className={styles.dialog} onClose={close}>
    <p>{dateLabel(session.createdAt)}</p>
    {page.loading && !page.items.length && <p role="status">Loading your originals…</p>}
    {page.loaded && !page.items.length && <p>No originals stored for this session.</p>}
    {photo && <>
      <div className={styles.viewer} tabIndex={0} aria-label="Photo viewer. Use Left and Right to browse." onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); setIndex(value => Math.max(0, value - 1)); }
        if (event.key === "ArrowRight") { event.preventDefault(); setIndex(value => Math.min(page.items.length - 1, value + 1)); }
      }}><PrivateImage key={photo.id} kind="photos" id={photo.id} access={access} alt={`${position}, session ${dateLabel(session.createdAt)}`} /></div>
      <p role="status">{position}</p>
      <p>Shot {photo.shotIndex + 1}{photo.width && photo.height ? ` · ${photo.width} × ${photo.height}` : ""}{photo.filterName ? ` · ${photo.filterName}` : ""}</p>
      <div className={styles.actions}>
        <button className="button button-secondary" disabled={index === 0} onClick={() => setIndex(value => value - 1)}>Previous</button>
        <button className="button button-secondary" disabled={index === page.items.length - 1} onClick={() => setIndex(value => value + 1)}>Next</button>
        <button className="button button-primary" disabled={downloadState === "Preparing download…"} onClick={() => void startDownload()}>{downloadState === "Preparing download…" ? downloadState : downloadState.startsWith("We couldn’t") ? "Retry download" : "Download original"}</button>
      </div>
      <p role="status">{downloadState}</p>
      <div className={styles.choices} role="group" aria-label="Choose an original photo">{page.items.map((item, ordinal) => <div className={styles.choice} key={item.id}>{Math.abs(ordinal - index) <= 1 && <PrivateImage thumbnail kind="photos" id={item.id} access={access} alt={`Photo ${ordinal + 1} preview`} />}<button aria-label={`View photo ${ordinal + 1}${countConsistent ? ` of ${session.storedPhotoCount}` : ` · ${page.items.length} loaded`}`} aria-pressed={ordinal === index} onClick={() => setIndex(ordinal)}>{ordinal + 1}</button></div>)}</div>
    </>}
    <Pagination page={page} noun="photos" />
  </Dialog>;
}

function VerifiedLibrary({ expired }: { expired: () => void }) {
  const { generation, isCurrent } = useAuth();
  const current = useCallback(() => isCurrent(generation), [generation, isCurrent]);
  const [access] = useState<Access>(() => ({ current, expired }));
  const [view, setView] = useState<"strips" | "sessions">("strips");
  const [session, setSession] = useState<LibrarySession | null>(null);
  const strips = useLibraryPage<LibraryStrip>("strips", access, view === "strips");
  const sessions = useLibraryPage<LibrarySession>("sessions", access, view === "sessions");
  const page = view === "strips" ? strips : sessions;
  const noun = view === "strips" ? "keepsakes" : "sessions";
  return <>
    <div className={styles.views} role="group" aria-label="Library view">
      <button className="button button-secondary" aria-pressed={view === "strips"} onClick={() => setView("strips")}>Keepsakes</button>
      <button className="button button-secondary" aria-pressed={view === "sessions"} onClick={() => setView("sessions")}>Sessions &amp; originals</button>
    </div>
    <p className="sr-only" role="status">{view === "strips" ? "Keepsakes" : "Sessions and originals"} view</p>
    <section aria-label={view === "strips" ? "Keepsakes" : "Sessions and originals"} aria-busy={page.loading}>
      {!page.loaded && !page.error && <p role="status">Loading your {noun}…</p>}
      {page.loaded && !page.items.length && <div className={styles.state}><h2>No {noun} saved yet.</h2><p>{view === "strips" ? "Keepsakes you save while signed in will appear here." : "Photos made as a guest aren’t added to your account."}</p><Link className="button button-primary" href="/?booth=1">Start a new session</Link></div>}
      {view === "strips" ? <div className={styles.grid}>{strips.items.map(strip => <article className={styles.card} key={strip.id}>
        <PrivateImage href={`/download/${encodeURIComponent(strip.shareCode)}`} kind="strips" id={strip.id} access={access} alt={`Saved keepsake from ${dateLabel(strip.createdAt)}`} />
        <div className={styles.copy}><h2>{strip.headerText?.trim() || "Photo keepsake"}</h2><p>{dateLabel(strip.createdAt)} · {layoutLabel(strip.template)}</p>{strip.shareCode && <p>Share code: {strip.shareCode}</p>}<Link className="button button-secondary" href={`/download/${encodeURIComponent(strip.shareCode)}`}>Open keepsake</Link></div>
      </article>)}</div> : <div className={styles.sessions}>{sessions.items.map(item => <article className={styles.card} key={item.id}><div className={styles.copy}>
        <h2>{item.boothName?.trim() || dateLabel(item.createdAt)}</h2>{item.boothName?.trim() && <p>{dateLabel(item.createdAt)}</p>}<p>{layoutLabel(item.layout)}</p><p>{item.storedPhotoCount} {item.storedPhotoCount === 1 ? "original" : "originals"} · {item.storedStripCount} {item.storedStripCount === 1 ? "keepsake" : "keepsakes"}</p>
        {item.storedPhotoCount ? <button className="button button-secondary" onClick={() => setSession(item)}>View originals</button> : <p>No originals stored for this session.</p>}
      </div></article>)}</div>}
      <Pagination page={page} noun={noun} />
    </section>
    <p className={styles.note}>Only photos saved to your account appear here. Motion downloads stay on your device.</p>
    {session && <OriginalBrowser key={session.id} session={session} access={access} close={() => setSession(null)} />}
  </>;
}

export default function Library() {
  const { user, status, generation, refresh, logout } = useAuth();
  const [expiredGeneration, setExpiredGeneration] = useState<number | null>(null);
  const expired = expiredGeneration === generation;
  const expire = useCallback(() => setExpiredGeneration(generation), [generation]);
  const verified = status === "authenticated" && user && !expired;
  let message = "Checking your session…";
  if (status === "signing-out") message = "Signing out…";
  else if (status === "logout-failed") message = "Sign-out couldn’t be completed. Your library is hidden.";
  else if (status === "unavailable") message = "We couldn’t verify your session.";
  else if (expired) message = "Your session expired. Sign in to view your library.";
  else if (status === "guest") message = "Sign in to see the photos saved to your account.";
  return <><SiteHeader compact /><main id="main-content" className={`page-container ${styles.main}`}>
    <div className={styles.heading}><div><h1 tabIndex={-1}>My library<span>.</span></h1><p>Keepsakes and original photos saved to your account.</p></div><Link className="button button-secondary" href="/?booth=1">Start a new session</Link></div>
    {verified ? <VerifiedLibrary key={`${user.id}:${generation}`} expired={expire} /> : <div className={styles.state}><p role="status">{message}</p><div className={styles.actions}>
      {(status === "guest" || expired) && <><Link className="button button-primary" href={signIn}>Sign in</Link><Link className="button button-secondary" href="/download">Find by code</Link></>}
      {status === "unavailable" && <button className="button button-primary" onClick={() => void refresh()}>Try again</button>}
      {status === "logout-failed" && <button className="button button-primary" onClick={() => void logout()}>Retry sign-out</button>}
    </div></div>}
  </main></>;
}
