export function loadStudioImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    };
    const abort = () => finish(new Error('Photo loading cancelled.'));
    const timeout = window.setTimeout(() => finish(new Error('Photo loading timed out. Retry the preview.')), 15000);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) finish(new Error('Photo has no drawable pixels. Please retake it.'));
      else finish();
    };
    image.onerror = () => finish(new Error('Photo could not be loaded. Please retake it and try again.'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    image.src = src;
  });
}

export function motionFrame(elapsed: number, speed: number, count: number) {
  if (!Number.isFinite(speed) || speed <= 0 || count < 1) throw new Error('No playable photo sequence.');
  const safeElapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  return { index: Math.floor(safeElapsed / speed) % count, progress: (safeElapsed % speed) / speed };
}

export function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  if (!image?.naturalWidth || !image.naturalHeight) throw new Error('Photo is not ready to draw. Retry the preview.');
  const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sw = width / ratio;
  const sh = height / ratio;
  ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, width, height);
}


function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
}

export async function yieldExport(signal: AbortSignal, delay = 16) {
  checkCancelled(signal);
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Export cancelled.', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delay);
    signal.addEventListener('abort', abort, { once: true });
  });
  checkCancelled(signal);
}

export async function validateMotion(blob: Blob, format: 'gif' | 'mp4') {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  const valid = format === 'gif' ? text.startsWith('GIF89a') : bytes.length >= 12 && text.slice(4, 8) === 'ftyp';
  if (!valid || blob.type.split(';')[0] !== (format === 'gif' ? 'image/gif' : 'video/mp4')) {
    throw new Error('The encoder did not produce the requested format.');
  }
  return blob;
}

export async function encodeLoop(canvas: HTMLCanvasElement, draw: (elapsed: number) => void, count: number, speed: number, signal: AbortSignal) {
  if (!Number.isInteger(count) || count < 1 || count > 14 || !Number.isFinite(speed) || speed <= 0) throw new Error('Invalid motion sequence.');
  await yieldExport(signal);
  const { Encoder } = await import('modern-gif');
  checkCancelled(signal);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('GIF export isn’t available in this browser. You can download a still PNG.');
  const encoder = new Encoder({ width: canvas.width, height: canvas.height, version: '89a', looped: true, loopCount: 0, dither: 'floyd-steinberg' });
  for (let index = 0; index < count; index++) {
    await yieldExport(signal);
    draw(index * speed);
    await encoder.encode({ data: context.getImageData(0, 0, canvas.width, canvas.height).data, delay: speed });
  }
  await yieldExport(signal);
  const blob = await encoder.flush('blob');
  await yieldExport(signal);
  return validateMotion(blob, 'gif');
}

async function recordNative(canvas: HTMLCanvasElement, draw: (elapsed: number) => void, duration: number, signal: AbortSignal) {
  const mimeType = typeof MediaRecorder !== 'undefined' && ['video/mp4;codecs=avc1.42001f', 'video/mp4;codecs=avc1', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType || !canvas.captureStream) throw new Error('Native MP4 unavailable.');
  checkCancelled(signal);
  draw(0);
  const stream = canvas.captureStream(30);
  return new Promise<Blob>((resolve, reject) => {
    let timer: ReturnType<typeof setInterval>;
    let watchdog: ReturnType<typeof setTimeout>;
    let recorder: MediaRecorder;
    let settled = false;
    const chunks: Blob[] = [];
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearInterval(timer); clearTimeout(watchdog);
      signal.removeEventListener('abort', abort);
      if (recorder) {
        recorder.onstop = null; recorder.onerror = null; recorder.ondataavailable = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      stream.getTracks().forEach(track => track.stop());
      if (error) reject(error);
      else resolve(new Blob(chunks, { type: 'video/mp4' }));
    };
    const abort = () => finish(new DOMException('Export cancelled.', 'AbortError'));
    try {
      recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => finish(new Error('MP4 recording failed.'));
      recorder.onstop = () => finish();
      signal.addEventListener('abort', abort, { once: true });
      recorder.start();
      const started = performance.now();
      watchdog = setTimeout(() => finish(new Error('MP4 recording timed out.')), duration + 15000);
      timer = setInterval(() => {
        try {
          const elapsed = performance.now() - started;
          if (elapsed >= duration) { clearInterval(timer); if (recorder.state === 'recording') recorder.stop(); }
          else draw(elapsed);
        } catch (error) { finish(error); }
      }, 1000 / 30);
    } catch (error) { finish(error); }
  });
}

async function encodeMp4(canvas: HTMLCanvasElement, draw: (elapsed: number) => void, duration: number, signal: AbortSignal) {
  checkCancelled(signal);
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH, canEncodeVideo } = await import('mediabunny');
  checkCancelled(signal);
  const supported = await canEncodeVideo('avc', { width: canvas.width, height: canvas.height, frameRate: 30, quality: QUALITY_HIGH });
  checkCancelled(signal);
  if (!supported) throw new Error('AVC encoding is unavailable.');
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: 30 });
  let cancellation: Promise<void> | undefined;
  const abort = () => { cancellation ??= output.cancel(); void cancellation.catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await output.start();
    const frames = Math.ceil(duration / 1000 * 30);
    for (let index = 0; index < frames; index++) {
      checkCancelled(signal);
      draw(index * 1000 / 30);
      await source.add(index / 30, Math.min(1 / 30, duration / 1000 - index / 30));
      if (index % 10 === 0) await yieldExport(signal);
    }
    checkCancelled(signal);
    await output.finalize();
    checkCancelled(signal);
    if (!target.buffer) throw new Error('MP4 output is empty.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    signal.removeEventListener('abort', abort);
    if (output.state !== 'finalized') { abort(); await cancellation; }
  }
}

export async function recordMotion(canvas: HTMLCanvasElement, draw: (elapsed: number) => void, duration: number, signal: AbortSignal): Promise<Blob> {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid motion duration.');
  await yieldExport(signal);
  // A drawing failure is not a codec failure: preserve it instead of silently retrying.
  let drawingFailed = false;
  const render = (elapsed: number) => {
    try { draw(elapsed); } catch (error) { drawingFailed = true; throw error; }
  };
  try {
    return await validateMotion(await recordNative(canvas, render, duration, signal), 'mp4');
  } catch (error) {
    checkCancelled(signal);
    if (drawingFailed) throw error;
    console.info('motion_export_fallback', { from: 'media-recorder', to: 'webcodecs', format: 'mp4' });
  }
  try {
    return await validateMotion(await encodeMp4(canvas, render, duration, signal), 'mp4');
  } catch (error) {
    checkCancelled(signal);
    if (drawingFailed) throw error;
    console.warn('motion_export_failed', { format: 'mp4', stage: 'webcodecs' });
    throw new Error('MP4 export isn’t available in this browser. You can download a still PNG.');
  }
}
