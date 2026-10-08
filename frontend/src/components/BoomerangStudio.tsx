"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Download, Video } from 'lucide-react';
import { CapturedShot } from '@/types/booth';
import { FRAME_COLORS } from '@/lib/constants';
import { useAuth } from '@/lib/authContext';
import { drawWatermark } from '@/lib/watermark';
import { drawCover, loadStudioImage, motionFrame, recordMotion, encodeLoop, yieldExport } from './motionExport';
import styles from './Studios.module.css';

type Props = { shots: CapturedShot[]; onBack: () => void };
export function BoomerangStudio(props: Props) { return <MotionStudio {...props} />; }

export function MotionStudio({ shots, onBack, reel = false }: Props & { reel?: boolean }) {
  const { user, status, generation, isCurrent } = useAuth();
  const speedInputId = useId();
  const [speed, setSpeed] = useState(reel ? 1800 : 180);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [notice, setNotice] = useState('');
  const [reverse, setReverse] = useState(false);
  const [motion, setMotion] = useState<'zoom' | 'fade' | 'cut'>('zoom');
  const [frame, setFrame] = useState(FRAME_COLORS[1]);
  const [caption, setCaption] = useState(reel ? 'A little moment, in motion.' : 'Once more, with feeling.');
  const [tab, setTab] = useState('Effects');
  const [pendingFormat, setPendingFormat] = useState<string | null>(null);
  const pending = pendingFormat !== null;
  const [error, setError] = useState('');
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<((elapsed: number, canvas: HTMLCanvasElement) => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => () => abortRef.current?.abort(), [generation, status]);

  useEffect(() => {
    let cancelled = false;
    let animation = 0;
    const loading = new AbortController();
    drawRef.current = null;
    if (!shots.length) return;
    loadImages();
    async function loadImages() {
      try {
        await Promise.resolve();
        if (cancelled) return;
        setPreviewState('loading');
        setError('');
        const images = await Promise.all(shots.map(shot => loadStudioImage(shot.dataUrl, loading.signal)));
        if (cancelled) return;
        if (!Number.isFinite(elapsedRef.current) || elapsedRef.current < 0) elapsedRef.current = 0;
        const forward = images.map((_, index) => index);
        const order = reel ? forward : [...forward, ...forward.slice(1, -1).reverse()];
        if (reverse) order.reverse();
        const draw = (elapsed: number, canvas: HTMLCanvasElement) => {
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas preview is unavailable in this browser.');
          const { index, progress } = motionFrame(elapsed, speed, order.length);
          const w = canvas.width, h = canvas.height;
          ctx.fillStyle = frame.hex;
          ctx.fillRect(0, 0, w, h);
          const x = 28, y = 70, pw = w - 56, ph = h - 150;
          ctx.save();
          ctx.beginPath(); ctx.rect(x, y, pw, ph); ctx.clip();
          if (reel && motion === 'fade') {
            drawCover(ctx, images[order[(index + order.length - 1) % order.length]], x, y, pw, ph);
            ctx.globalAlpha = Math.min(1, progress * 4);
          }
          const zoom = reel && motion === 'zoom' ? 1 + progress * .1 : 1;
          drawCover(ctx, images[order[index]], x - pw * (zoom - 1) / 2, y - ph * (zoom - 1) / 2, pw * zoom, ph * zoom);
          ctx.restore();
          ctx.fillStyle = frame.textColor; ctx.textAlign = 'center';
          ctx.font = 'bold 24px sans-serif'; ctx.fillText(caption, w / 2, 43, w - 40);
          ctx.font = '16px sans-serif'; ctx.fillText(reel ? 'PHO2BOOTH • VIDEO REEL' : 'PHO2BOOTH • MOTION LOOP', w / 2, h - 48);
          drawWatermark(ctx, w, h, 1, !user);
        };
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('Preview canvas is unavailable. Retry the preview.');
        // Paint before scheduling playback; the first RAF timestamp can precede performance.now().
        draw(elapsedRef.current, canvas);
        drawRef.current = draw;
        setPreviewState('ready');
        let previous: number | undefined;
        const tick = (now: number) => {
          if (cancelled) return;
          try {
            if (previous !== undefined) elapsedRef.current += Math.max(0, now - previous);
            previous = now;
            if (canvasRef.current) draw(elapsedRef.current, canvasRef.current);
            animation = requestAnimationFrame(tick);
          } catch (cause) {
            drawRef.current = null;
            setPreviewState('error');
            setError(cause instanceof Error ? cause.message : 'Preview drawing failed. Please retry.');
          }
        };
        if (!reducedMotion) animation = requestAnimationFrame(tick);
      } catch (cause) {
        if (!cancelled) {
          drawRef.current = null;
          setPreviewState('error');
          setError(cause instanceof Error ? cause.message : 'Could not load photos.');
        }
      }
    }
    return () => { cancelled = true; loading.abort(); drawRef.current = null; cancelAnimationFrame(animation); };
  }, [shots, speed, reducedMotion, reverse, motion, frame, caption, reel, user, retry]);

  const download = async (target: 'GIF' | 'MP4' | 'PNG') => {
    if (!drawRef.current || previewState !== 'ready' || abortRef.current || !isCurrent(generation)) return;
    const controller = new AbortController(); abortRef.current = controller;
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = (target === 'MP4' && reel) ? 1280 : 960;
    setPendingFormat(target); setError(''); setNotice('');
    let objectUrl: string | undefined;
    try {
      const draw = drawRef.current;
      await yieldExport(controller.signal);
      let blob: Blob;
      if (target === 'PNG') {
        draw(elapsedRef.current, canvas);
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG could not be created.')), 'image/png'));
      } else if (target === 'MP4') {
        const length = reel ? shots.length : shots.length + Math.max(0, shots.length - 2);
        blob = await recordMotion(canvas, elapsed => draw(elapsed, canvas), length * speed, controller.signal);
      } else {
        const length = reel ? shots.length : shots.length + Math.max(0, shots.length - 2);
        blob = await encodeLoop(canvas, elapsed => draw(elapsed, canvas), length, speed, controller.signal);
      }
      await yieldExport(controller.signal);
      if (controller.signal.aborted || !isCurrent(generation)) return;
      const link = document.createElement('a');
      objectUrl = URL.createObjectURL(blob); link.href = objectUrl;
      link.download = `pho2booth-${reel ? 'reel' : 'loop'}-${Date.now()}.${target.toLowerCase()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setNotice('Download started. Check your device’s downloads.');
      await yieldExport(controller.signal, 1000);
    } catch (cause) {
      if (!controller.signal.aborted) {
        console.warn('motion_export_failed', { format: target, stage: 'download' });
        setError(cause instanceof Error && cause.message.includes('isn’t available') ? cause.message : `We couldn’t create your ${target}. Try again, or download a still PNG.`);
      }
    } finally {
      if (objectUrl) {
        const urlToRevoke = objectUrl;
        setTimeout(() => URL.revokeObjectURL(urlToRevoke), 10000);
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
        setPendingFormat(null);
      }
    }
  };

  return <section className={`studio-page ${styles.studio}`}>
    <header className="studio-heading"><button className="button button-quiet button-change-format" onClick={() => { abortRef.current?.abort(); onBack(); }}><ArrowLeft size={18} /> Change format</button><div><h1>{reel ? 'Video reel' : 'Motion loop'}</h1></div></header>
    <div className="studio-grid">
      <aside className="studio-sidebar">
        <div className="flex-shrink-0 control-tabs" role="group" aria-label="Customize motion">{['Effects', 'Frame', 'Details'].map(item => <button key={item} className="control-option min-h-[36px]" aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
        <fieldset disabled={pending} className={`${styles.controls} flex-1 min-h-0 overflow-y-auto pr-1`}>
          {tab === 'Effects' && <><label className="control-label" htmlFor={speedInputId}>Time per photo: {speed} ms</label><input id={speedInputId} type="range" min={reel ? 500 : 90} max={reel ? 3000 : 500} step={10} value={speed} onChange={event => setSpeed(Number(event.target.value))} /><label className={styles.reverseControl}><input type="checkbox" checked={reverse} onChange={event => setReverse(event.target.checked)} /><span>Reverse order</span></label>{reel && <div className="control-tabs" role="group" aria-label="Reel transition">{(['zoom', 'fade', 'cut'] as const).map(value => <button className="control-option" key={value} aria-pressed={motion === value} onClick={() => setMotion(value)}>{value === 'zoom' ? 'Slow zoom' : value === 'fade' ? 'Crossfade' : 'Cut'}</button>)}</div>}</>}
          {tab === 'Frame' && <div className={styles.swatches}>{FRAME_COLORS.map(value => <button key={value.id} aria-label={value.name} aria-pressed={frame.id === value.id} className={styles.swatch} style={{ background: value.hex }} onClick={() => setFrame(value)} />)}</div>}
          {tab === 'Details' && <label className="control-label">Caption<input className="control-input" value={caption} maxLength={35} onChange={event => setCaption(event.target.value)} /></label>}
        </fieldset>
        <div className="flex-shrink-0 flex flex-col gap-2 pt-2 border-t border-[#ded8cc]/80 mt-auto">
          {reel ? (
            <div className="flex flex-col gap-1.5">
              <button className="button button-primary min-h-[38px] text-xs" disabled={pending || !shots.length || previewState !== 'ready'} onClick={() => void download('MP4')}><Download size={16} />{pending && pendingFormat === 'MP4' ? 'Preparing MP4…' : 'Download MP4'}</button>
              <button className="button button-secondary min-h-[34px] text-xs" disabled={pending || !shots.length || previewState !== 'ready'} onClick={() => void download('PNG')}>Download still PNG</button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <button className="button button-primary flex-1 min-h-[38px] text-xs" disabled={pending || !shots.length || previewState !== 'ready'} onClick={() => void download('GIF')}><Download size={16} />{pending && pendingFormat === 'GIF' ? 'Preparing GIF…' : 'Download GIF'}</button>
                <button className="button button-secondary flex-1 min-h-[38px] text-xs" disabled={pending || !shots.length || previewState !== 'ready'} onClick={() => void download('MP4')}><Video size={16} />MP4</button>
              </div>
              <button className="button button-secondary min-h-[34px] text-xs" disabled={pending || !shots.length || previewState !== 'ready'} onClick={() => void download('PNG')}>Download still PNG</button>
            </div>
          )}
          <div className={`${styles.noteStack} max-h-20 overflow-y-auto`}>
            {(pending || notice) && <p className="status-note text-[11px] py-1" data-tone={notice ? "success" : undefined} role="status">{pending ? `Creating your ${pendingFormat}…` : notice}</p>}
            {error && <p className="status-note text-[11px] py-1" data-tone="error" role="alert">{error}</p>}
          </div>
          {previewState === 'error' && <button className="button button-secondary min-h-[34px] text-xs" onClick={() => setRetry(value => value + 1)}>Retry preview</button>}
        </div>
      </aside>
      <div className="studio-preview" aria-busy={shots.length > 0 && previewState === 'loading'}>{shots.length > 0 && previewState === 'loading' && <p className="status-note" role="status">Loading your photos…</p>}{shots.length ? <canvas ref={canvasRef} width={720} height={reel ? 1280 : 960} className={styles.motionCanvas} aria-label={`${reel ? 'Reel' : 'Loop'} preview`} /> : <p>No photos yet. Go back to capture your moment.</p>}</div>
    </div>
  </section>;
}
