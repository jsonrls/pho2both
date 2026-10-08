import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { decode, decodeFrames } from 'modern-gif';

const source = await readFile(new URL('../src/components/motionExport.ts', import.meta.url), 'utf8');
let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
for (const dependency of ['modern-gif', 'mediabunny']) {
  outputText = outputText.replace(`import('${dependency}')`, `import('${import.meta.resolve(dependency)}')`);
}
const motion = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('GIF bytes decode with pose order, selected timing and infinite loop', async () => {
  let color = 0;
  const colors = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [0, 255, 0, 255]];
  const canvas = { width: 2, height: 2, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(Array(4).fill(colors[color]).flat()) }) }) };
  const times = [];
  const blob = await motion.encodeLoop(canvas, elapsed => { times.push(elapsed); color = elapsed / 180; }, 4, 180, new AbortController().signal);
  assert.equal(blob.type, 'image/gif');
  const bytes = await blob.arrayBuffer();
  const gif = decode(bytes);
  assert.equal(gif.version, '89a');
  assert.equal(gif.looped, true);
  assert.equal(gif.loopCount, 0);
  assert.deepEqual(times, [0, 180, 360, 540]);
  const frames = decodeFrames(bytes);
  assert.deepEqual(frames.map(frame => frame.delay), [180, 180, 180, 180]);
  assert.deepEqual(frames.map(frame => [...frame.data.slice(0, 4)]), colors);
});

test('cancellation between GIF frames stops drawing and returns no output', async () => {
  const controller = new AbortController();
  let draws = 0;
  const canvas = { width: 1, height: 1, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }) }) };
  await assert.rejects(motion.encodeLoop(canvas, () => { draws++; controller.abort(); }, 4, 180, controller.signal), { name: 'AbortError' });
  assert.equal(draws, 1);
});

test('format validation rejects WebM bytes renamed MP4 and accepts MP4 ftyp', async () => {
  await assert.rejects(motion.validateMotion(new Blob(['WebM payload'], { type: 'video/mp4' }), 'mp4'));
  await assert.rejects(motion.validateMotion(new Blob(['GIF89a data'], { type: 'video/mp4' }), 'gif'));
  const mp4 = new Blob([new Uint8Array([0, 0, 0, 24]), 'ftypisom'], { type: 'video/mp4' });
  assert.equal(await motion.validateMotion(mp4, 'mp4'), mp4);
});

test('cancelled MP4 never starts drawing or native capture', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(motion.recordMotion({}, () => assert.fail('must not draw'), 100, controller.signal), { name: 'AbortError' });
});

test('native MP4 cleanup stops all tracks after cancellation', async t => {
  let stopped = 0;
  class Recorder {
    static isTypeSupported(type) { return type.startsWith('video/mp4'); }
    state = 'inactive';
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  globalThis.MediaRecorder = Recorder;
  t.after(() => delete globalThis.MediaRecorder);
  const controller = new AbortController();
  const canvas = { captureStream: () => ({ getTracks: () => [{ stop() { stopped++; } }] }) };
  const pending = motion.recordMotion(canvas, () => {}, 500, controller.signal);
  setTimeout(() => controller.abort(), 40);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(stopped, 1);
});

test('unsupported native and WebCodecs paths preserve explicit PNG recovery', async () => {
  await assert.rejects(motion.recordMotion({}, () => {}, 100, new AbortController().signal), /MP4 export isn’t available.*still PNG/);
});

test('negative elapsed time is clamped and frame timing wraps deterministically', () => {
  assert.deepEqual(motion.motionFrame(-1, 180, 4), { index: 0, progress: 0 });
  assert.deepEqual(motion.motionFrame(720, 180, 4), { index: 0, progress: 0 });
  assert.deepEqual(motion.motionFrame(270, 180, 4), { index: 1, progress: 0.5 });
});
