// Validate container structure and dimensions without accepting executable image formats.
export function imageDimensions(value: string, maxBytes: number): { width: number; height: number } | null {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 || match[2].length > Math.ceil(maxBytes / 3) * 4) return null;
  const data = Buffer.from(match[2], "base64");
  if (data.length > maxBytes || data.toString("base64") !== match[2]) return null;
  let width = 0, height = 0;
  try {
    if (match[1] === "png") {
      if (data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
      let offset = 8, image = false, end = false;
      while (offset + 12 <= data.length) {
        const size = data.readUInt32BE(offset), kind = data.toString("ascii", offset + 4, offset + 8);
        if (offset + size + 12 > data.length) return null;
        if (offset === 8) {
          if (kind !== "IHDR" || size !== 13) return null;
          width = data.readUInt32BE(offset + 8); height = data.readUInt32BE(offset + 12);
          const depth = data[offset + 16], color = data[offset + 17];
          const depths: Record<number, number[]> = { 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] };
          if (!depths[color]?.includes(depth) || data[offset + 18] || data[offset + 19] || data[offset + 20] > 1) return null;
        }
        if (kind === "IDAT" && size) image = true;
        offset += size + 12;
        if (kind === "IEND") { end = size === 0 && offset === data.length; break; }
      }
      if (!image || !end) return null;
    } else if (match[1] === "jpeg") {
      if (data.readUInt16BE(0) !== 0xffd8 || data.readUInt16BE(data.length - 2) !== 0xffd9) return null;
      let offset = 2, scan = false;
      while (offset + 4 <= data.length) {
        if (data[offset++] !== 255) return null;
        while (data[offset] === 255) offset++;
        const marker = data[offset++], size = data.readUInt16BE(offset);
        if (size < 2 || offset + size > data.length) return null;
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          if (size < 8 || data[offset + 2] !== 8) return null;
          height = data.readUInt16BE(offset + 3); width = data.readUInt16BE(offset + 5);
          if (![1,3,4].includes(data[offset + 7]) || size !== 8 + 3 * data[offset + 7]) return null;
        }
        if (marker === 0xda) { scan = size >= 6 && offset + size < data.length - 2; break; }
        offset += size;
      }
      if (!scan) return null;
    } else {
      if (data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP" || data.readUInt32LE(4) + 8 !== data.length) return null;
      let offset = 12, image = false;
      while (offset + 8 <= data.length) {
        const kind = data.toString("ascii", offset, offset + 4), size = data.readUInt32LE(offset + 4), start = offset + 8;
        if (start + size > data.length) return null;
        if (kind === "VP8 " && size >= 10) {
          if ((data[start] & 1) || data.subarray(start + 3, start + 6).toString("hex") !== "9d012a") return null;
          width = data.readUInt16LE(start + 6) & 0x3fff; height = data.readUInt16LE(start + 8) & 0x3fff; image = true;
        }
        if (kind === "VP8L" && size >= 5) {
          if (data[start] !== 0x2f || data[start + 4] >> 5) return null;
          const bits = data.readUInt32LE(start + 1); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; image = true;
        }
        offset = start + size + (size % 2);
      }
      if (!image || offset !== data.length) return null;
    }
  } catch { return null; }
  return width > 0 && height > 0 && width <= 8192 && height <= 8192 ? { width, height } : null;
}
