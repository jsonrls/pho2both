import type { ImageSegmenter, ImageSegmenterResult, MPMask } from "@mediapipe/tasks-vision";
import { getBackdropTrack, BackdropTrack } from "./backdropTracks";

const LOCAL_MODEL_URL = "/models/selfie_segmenter.tflite";
const REMOTE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

export type EdgeRefinementPreset = "studio" | "natural" | "crisp";

interface EdgeTuningParams {
  confidenceCutoff: number; // Discard confidence below this threshold (kills chair mesh & shadows)
  confidenceSolid: number;  // Confidence threshold for solid foreground
  chokeRadius: number;      // 1 or 2 boundary layers to erode
  featherPasses: number;    // Number of 5-tap Gaussian passes
  temporalWeight: number;   // Weight of current frame in EMA (0.70-0.80)
}

const EDGE_PROFILES: Record<EdgeRefinementPreset, EdgeTuningParams> = {
  // Studio: Tight choke & high confidence threshold. Eliminates chair backrests, mesh weave, and room halos completely.
  studio: {
    confidenceCutoff: 0.58,
    confidenceSolid: 0.84,
    chokeRadius: 2,
    featherPasses: 1,
    temporalWeight: 0.74,
  },
  // Natural: Moderate choke. Preserves softer edges and fine hair strands.
  natural: {
    confidenceCutoff: 0.48,
    confidenceSolid: 0.80,
    chokeRadius: 1,
    featherPasses: 1,
    temporalWeight: 0.70,
  },
  // Crisp: Aggressive choke with higher contrast ramp for posterized, razor-cut edges.
  crisp: {
    confidenceCutoff: 0.64,
    confidenceSolid: 0.88,
    chokeRadius: 2,
    featherPasses: 1,
    temporalWeight: 0.78,
  },
};

let currentPreset: EdgeRefinementPreset = "studio";

export function setEdgeRefinementPreset(preset: EdgeRefinementPreset): void {
  currentPreset = preset;
}

export function getEdgeRefinementPreset(): EdgeRefinementPreset {
  return currentPreset;
}

let segmenterInstance: ImageSegmenter | null = null;
let segmenterLoadingPromise: Promise<ImageSegmenter | null> | null = null;
let lastSegmentTimestamp = 0;
let isModelReady = false;

let maskCanvas: HTMLCanvasElement | null = null;
let personCanvas: HTMLCanvasElement | null = null;

// Pre-allocated typed arrays to prevent garbage collection pauses during live camera loop
let rawAlphaBuffer: Uint8Array | null = null;
let chokePass1Buffer: Uint8Array | null = null;
let chokePass2Buffer: Uint8Array | null = null;
let blurTempBuffer: Uint8Array | null = null;
let blurFinalBuffer: Uint8Array | null = null;
let temporalAlphaBuffer: Uint8Array | null = null;
let hasTemporalHistory = false;
let cachedBufferLength = 0;

/**
 * Initializes Google MediaPipe Selfie Segmenter with continuous confidence mask output.
 * Tries local high-speed assets first, falling back to CDN.
 */
export async function getSelfieSegmenter(): Promise<ImageSegmenter | null> {
  if (typeof window === "undefined") return null;
  if (segmenterInstance) return segmenterInstance;

  if (!segmenterLoadingPromise) {
    segmenterLoadingPromise = (async () => {
      try {
        const { ImageSegmenter, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );

        let wasmFileset;
        try {
          wasmFileset = await FilesetResolver.forVisionTasks("/models/wasm");
        } catch {
          wasmFileset = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm"
          );
        }

        const candidates = [
          { path: LOCAL_MODEL_URL, delegate: "GPU" as const },
          { path: LOCAL_MODEL_URL, delegate: "CPU" as const },
          { path: REMOTE_MODEL_URL, delegate: "GPU" as const },
          { path: REMOTE_MODEL_URL, delegate: "CPU" as const },
        ];

        for (const candidate of candidates) {
          try {
            const segmenter = await ImageSegmenter.createFromOptions(wasmFileset, {
              baseOptions: {
                modelAssetPath: candidate.path,
                delegate: candidate.delegate,
              },
              runningMode: "VIDEO",
              outputCategoryMask: false,
              outputConfidenceMasks: true,
            });

            segmenterInstance = segmenter;
            isModelReady = true;
            return segmenter;
          } catch (initErr) {
            console.warn(
              `MediaPipe segmenter init attempt failed (${candidate.path}, ${candidate.delegate}):`,
              initErr
            );
          }
        }

        console.error("All MediaPipe segmenter configurations failed to load.");
        return null;
      } catch (err) {
        console.error("Unable to initialize MediaPipe Image Segmenter:", err);
        return null;
      }
    })();
  }

  return segmenterLoadingPromise;
}

export function isSelfieSegmenterReady(): boolean {
  return isModelReady;
}

/**
 * Updates the cached mask canvas using continuous confidence scoring,
 * multi-layer boundary choke (erosion) to eliminate chair mesh & room spill,
 * separable 5-tap Gaussian feathering, and temporal smoothing (EMA).
 */
function updateMaskCanvas(segmenter: ImageSegmenter, video: HTMLVideoElement): boolean {
  if (!video || video.readyState < 2 || !video.videoWidth) return false;

  const now = performance.now();
  const timestamp = now > lastSegmentTimestamp ? now : lastSegmentTimestamp + 1;
  lastSegmentTimestamp = timestamp;

  let result: ImageSegmenterResult | null = null;
  try {
    result = segmenter.segmentForVideo(video, timestamp);
  } catch {
    return false;
  }

  if (!result) return false;

  const tuning = EDGE_PROFILES[currentPreset];

  // Retrieve mask source: prefer confidenceMasks[0], fallback to categoryMask
  let maskObj: MPMask | undefined = undefined;
  let isConfidence = false;

  if (result.confidenceMasks && result.confidenceMasks.length > 0) {
    maskObj = result.confidenceMasks[0];
    isConfidence = true;
  } else if (result.categoryMask) {
    maskObj = result.categoryMask;
    isConfidence = false;
  }

  if (!maskObj) return false;

  const maskWidth = maskObj.width;
  const maskHeight = maskObj.height;
  const totalPixels = maskWidth * maskHeight;

  // Allocate reusable typed arrays if dimensions change
  if (cachedBufferLength !== totalPixels) {
    rawAlphaBuffer = new Uint8Array(totalPixels);
    chokePass1Buffer = new Uint8Array(totalPixels);
    chokePass2Buffer = new Uint8Array(totalPixels);
    blurTempBuffer = new Uint8Array(totalPixels);
    blurFinalBuffer = new Uint8Array(totalPixels);
    temporalAlphaBuffer = new Uint8Array(totalPixels);
    hasTemporalHistory = false;
    cachedBufferLength = totalPixels;
  }

  const rawAlpha = rawAlphaBuffer!;
  const choke1 = chokePass1Buffer!;
  const choke2 = chokePass2Buffer!;
  const temp = blurTempBuffer!;
  const blurred = blurFinalBuffer!;
  const temporal = temporalAlphaBuffer!;

  // =========================================================================
  // STEP 1: Probability S-Curve Mapping & Chair/Spill Suppression
  // =========================================================================
  if (isConfidence && typeof maskObj.getAsFloat32Array === "function") {
    const confData = maskObj.getAsFloat32Array();
    const cMin = tuning.confidenceCutoff;
    const cMax = tuning.confidenceSolid;
    const invRange = 1 / Math.max(0.01, cMax - cMin);

    for (let i = 0; i < totalPixels; i++) {
      const c = confData[i];
      if (c <= cMin) {
        rawAlpha[i] = 0;
      } else if (c >= cMax) {
        rawAlpha[i] = 255;
      } else {
        const t = (c - cMin) * invRange;
        // Cubic Hermite smoothstep for anti-aliased confidence transition
        const s = t * t * (3 - 2 * t);
        rawAlpha[i] = Math.round(s * 255);
      }
    }
  } else {
    // Fallback Uint8 array handling
    const maskData = maskObj.getAsUint8Array();
    const fallbackBg = maskData[0];
    for (let i = 0; i < totalPixels; i++) {
      const v = maskData[i];
      rawAlpha[i] = v !== fallbackBg && v > 0 ? 255 : 0;
    }
  }

  // =========================================================================
  // STEP 2: Multi-Layer Morphological Boundary Choke (Erosion)
  // Layer 1: Strips the contaminated perimeter (chair frame, wall light bounce)
  // Layer 2: Feathers the inward boundary so no harsh cutoffs remain
  // =========================================================================
  const edgeThreshold = 40;

  // Pass 1: Outer perimeter erosion
  for (let y = 0; y < maskHeight; y++) {
    const rowOffset = y * maskWidth;
    for (let x = 0; x < maskWidth; x++) {
      const idx = rowOffset + x;
      const val = rawAlpha[idx];

      if (val < edgeThreshold || x === 0 || y === 0 || x === maskWidth - 1 || y === maskHeight - 1) {
        choke1[idx] = 0;
        continue;
      }

      // 4-connected boundary check
      const left = rawAlpha[idx - 1];
      const right = rawAlpha[idx + 1];
      const top = rawAlpha[idx - maskWidth];
      const bottom = rawAlpha[idx + maskWidth];

      if (left < edgeThreshold || right < edgeThreshold || top < edgeThreshold || bottom < edgeThreshold) {
        // Outer perimeter contaminated pixel: strip completely
        choke1[idx] = 0;
      } else {
        choke1[idx] = val;
      }
    }
  }

  // Pass 2: Inward choke based on preset
  if (tuning.chokeRadius >= 2) {
    for (let y = 0; y < maskHeight; y++) {
      const rowOffset = y * maskWidth;
      for (let x = 0; x < maskWidth; x++) {
        const idx = rowOffset + x;
        const val = choke1[idx];

        if (val === 0 || x === 0 || y === 0 || x === maskWidth - 1 || y === maskHeight - 1) {
          choke2[idx] = 0;
          continue;
        }

        const left = choke1[idx - 1];
        const right = choke1[idx + 1];
        const top = choke1[idx - maskWidth];
        const bottom = choke1[idx + maskWidth];

        if (left === 0 || right === 0 || top === 0 || bottom === 0) {
          // Soft transition layer
          choke2[idx] = Math.min(val, 140);
        } else {
          choke2[idx] = val;
        }
      }
    }
  } else {
    choke2.set(choke1);
  }

  // =========================================================================
  // STEP 3: Separable 5-Tap Gaussian Feathering
  // Kernel: [1, 4, 6, 4, 1] / 16
  // Eliminates 256x256 pixel stair-stepping for smooth optical roll-off
  // =========================================================================
  // Horizontal pass
  for (let y = 0; y < maskHeight; y++) {
    const rowOffset = y * maskWidth;
    for (let x = 0; x < maskWidth; x++) {
      const idx = rowOffset + x;
      const x0 = x > 1 ? choke2[idx - 2] : choke2[rowOffset];
      const x1 = x > 0 ? choke2[idx - 1] : choke2[rowOffset];
      const x2 = choke2[idx];
      const x3 = x < maskWidth - 1 ? choke2[idx + 1] : choke2[rowOffset + maskWidth - 1];
      const x4 = x < maskWidth - 2 ? choke2[idx + 2] : choke2[rowOffset + maskWidth - 1];
      temp[idx] = (x0 + (x1 << 2) + x2 * 6 + (x3 << 2) + x4) >> 4;
    }
  }

  // Vertical pass
  for (let y = 0; y < maskHeight; y++) {
    const rowOffset = y * maskWidth;
    const y0 = (y > 1 ? y - 2 : 0) * maskWidth;
    const y1 = (y > 0 ? y - 1 : 0) * maskWidth;
    const y2 = rowOffset;
    const y3 = (y < maskHeight - 1 ? y + 1 : maskHeight - 1) * maskWidth;
    const y4 = (y < maskHeight - 2 ? y + 2 : maskHeight - 1) * maskWidth;
    for (let x = 0; x < maskWidth; x++) {
      blurred[rowOffset + x] = (
        temp[y0 + x] +
        (temp[y1 + x] << 2) +
        temp[y2 + x] * 6 +
        (temp[y3 + x] << 2) +
        temp[y4 + x]
      ) >> 4;
    }
  }

  // =========================================================================
  // STEP 4: Temporal Stabilization (Exponential Moving Average / EMA)
  // Calms 60Hz neural net frame-to-frame edge noise and flickering
  // =========================================================================
  const currWeight = tuning.temporalWeight;
  const prevWeight = 1 - currWeight;

  if (!hasTemporalHistory) {
    temporal.set(blurred);
    hasTemporalHistory = true;
  } else {
    for (let i = 0; i < totalPixels; i++) {
      const currentVal = blurred[i];
      const prevVal = temporal[i];
      const smoothed = Math.round(currentVal * currWeight + prevVal * prevWeight);
      temporal[i] = smoothed;
      blurred[i] = smoothed;
    }
  }

  // =========================================================================
  // STEP 5: Render Mask Canvas
  // =========================================================================
  if (!maskCanvas) {
    maskCanvas = document.createElement("canvas");
  }
  if (maskCanvas.width !== maskWidth || maskCanvas.height !== maskHeight) {
    maskCanvas.width = maskWidth;
    maskCanvas.height = maskHeight;
  }

  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) {
    cleanupMasks(result);
    return false;
  }

  const imgData = maskCtx.createImageData(maskWidth, maskHeight);
  const data = imgData.data;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = blurred[i];
  }

  maskCtx.putImageData(imgData, 0, 0);

  cleanupMasks(result);
  return true;
}

function cleanupMasks(result: ImageSegmenterResult): void {
  if (result.confidenceMasks) {
    for (const m of result.confidenceMasks) {
      if (typeof (m as { close?: () => void }).close === "function") {
        (m as { close?: () => void }).close?.();
      }
    }
  }
  if (result.categoryMask) {
    if (typeof (result.categoryMask as { close?: () => void }).close === "function") {
      (result.categoryMask as { close?: () => void }).close?.();
    }
  }
}

/**
 * Composites the video frame over a chosen backdrop track using the AI segmentation mask.
 *
 * @param targetCtx Canvas 2D context to render the final composite into
 * @param video HTML video element supplying the camera stream
 * @param width Output canvas width
 * @param height Output canvas height
 * @param backdropId ID of the backdrop track
 * @param mirror Whether to mirror the person horizontally (selfie mode)
 * @param crop Optional crop coordinates [sx, sy, sw, sh]
 * @param filterCss Optional CSS filter string to apply strictly to the person
 */
export function renderCompositedVideo(
  targetCtx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  backdropId: string,
  mirror: boolean,
  crop?: number[],
  filterCss = "none"
): boolean {
  if (backdropId === "none" || !segmenterInstance) {
    return false;
  }

  const track: BackdropTrack = getBackdropTrack(backdropId);

  // 1. Update the refined segmentation mask from the video frame
  const maskUpdated = updateMaskCanvas(segmenterInstance, video);
  if (!maskUpdated && !maskCanvas) {
    // Mask not ready yet; fallback to natural video
    return false;
  }

  // 2. Prepare offscreen person canvas
  if (!personCanvas) {
    personCanvas = document.createElement("canvas");
  }
  if (personCanvas.width !== width || personCanvas.height !== height) {
    personCanvas.width = width;
    personCanvas.height = height;
  }

  const personCtx = personCanvas.getContext("2d");
  if (!personCtx || !maskCanvas) return false;

  personCtx.clearRect(0, 0, width, height);

  // 3. Draw video onto person canvas with the filter applied ONLY to the person
  personCtx.save();
  if (filterCss && filterCss !== "none") {
    personCtx.filter = filterCss;
  } else {
    personCtx.filter = "none";
  }
  if (mirror) {
    personCtx.translate(width, 0);
    personCtx.scale(-1, 1);
  }
  if (crop) {
    personCtx.drawImage(video, crop[0], crop[1], crop[2], crop[3], 0, 0, width, height);
  } else {
    personCtx.drawImage(video, 0, 0, width, height);
  }
  personCtx.restore();

  // 4. Apply mask with destination-in and high-quality GPU texture smoothing.
  personCtx.save();
  personCtx.filter = "none";
  personCtx.globalCompositeOperation = "destination-in";
  personCtx.imageSmoothingEnabled = true;
  personCtx.imageSmoothingQuality = "high";
  if (mirror) {
    personCtx.translate(width, 0);
    personCtx.scale(-1, 1);
  }
  personCtx.drawImage(maskCanvas, 0, 0, width, height);
  personCtx.restore();

  // 5. Draw the selected backdrop track into the target canvas (pure, untouched colors)
  targetCtx.save();
  targetCtx.filter = "none";
  track.draw(targetCtx, width, height);
  targetCtx.restore();

  // 6. Composite the cleanly cut-out, filtered person on top of the clean backdrop
  targetCtx.save();
  targetCtx.filter = "none";
  targetCtx.drawImage(personCanvas, 0, 0, width, height);
  targetCtx.restore();

  return true;
}
