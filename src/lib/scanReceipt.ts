import { parseReceipt, type ScannedReceipt } from './receipt';

/**
 * Reads a receipt photo on the phone itself (Tesseract, loaded only when someone scans) and
 * turns it into bill lines. The photo never leaves the phone for this. `onProgress` gets 0–1.
 */
export async function scanReceipt(file: Blob, onProgress?: (p: number) => void): Promise<ScannedReceipt & { text: string }> {
  const image = await prepare(file);
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      // Loading the reader is the first fifth; reading the text is the rest.
      if (m.status === 'recognizing text') onProgress?.(0.2 + m.progress * 0.8);
      else if (m.status.startsWith('loading')) onProgress?.(Math.min(0.2, m.progress * 0.2));
    },
  });
  try {
    // Receipts are one column of text, laid out in blocks.
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(image);
    return { ...parseReceipt(data.text), text: data.text };
  } finally {
    await worker.terminate();
  }
}

/** Greyscale, a sensible size and a contrast stretch: Tesseract reads phone photos much better. */
async function prepare(file: Blob): Promise<Blob | HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  // About 1800px across is plenty for receipt text, and keeps it quick.
  const scale = Math.min(2.5, 1800 / Math.max(bitmap.width, 1));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  // Greyscale, then stretch so the darkest 2% are black and the lightest 2% white.
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
    px[i] = g;
    hist[g]++;
  }
  const total = px.length / 4;
  let lo = 0;
  let hi = 255;
  for (let n = 0; lo < 255 && (n += hist[lo]) < total * 0.02; lo++);
  for (let n = 0; hi > 0 && (n += hist[hi]) < total * 0.02; hi--);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
