import { t } from './i18n';

export interface CardInfo {
  room: string;
  /** "Tuesday 3 Nov" */
  date: string;
  food: string;
  /** Where you're eating or meeting, if set. */
  place?: string | null;
  /** "Leaving 12:30", if a meet-up is set. */
  time?: string | null;
  /** "Wei picked" or "Picked by the wheel". */
  by?: string | null;
  /** A photo of the meal (a link the canvas can load), shown at the top of the card. */
  photo?: string | null;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const W = 1080;
const H = 1350;

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/** A 1080×1350 picture of today's pick, for the group chat or a story. */
export async function drawCard(info: CardInfo): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const display = "'Bricolage Grotesque', 'Plus Jakarta Sans', sans-serif";
  const body = "'Plus Jakarta Sans', system-ui, sans-serif";

  ctx.fillStyle = '#CC3F17';
  ctx.fillRect(0, 0, W, H);
  // A big faint wheel in the corner.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 6;
  for (const r of [380, 260, 90]) {
    ctx.beginPath();
    ctx.arc(W - 120, 170, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 44px ${body}`;
  ctx.fillText(`${info.date} · ${info.room}`, 80, 140);
  ctx.font = `800 64px ${display}`;
  ctx.fillText(t('Today we’re eating'), 80, 250);

  // The white card with the food.
  const top = 330;
  const cardH = 700;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(60, top, W - 120, cardH, 48);
  ctx.fill();
  // With a photo, it fills the top of the card (cropped to fit) and the words go underneath.
  const img = info.photo ? await loadImage(info.photo) : null;
  let textTop = top + 190;
  let size = 128;
  if (img) {
    const ph = 400;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(60, top, W - 120, ph, [48, 48, 0, 0]);
    ctx.clip();
    const scale = Math.max((W - 120) / img.width, ph / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, 60 + (W - 120 - w) / 2, top + (ph - h) / 2, w, h);
    ctx.restore();
    textTop = top + ph + 120;
    size = 96;
  }
  ctx.fillStyle = '#18181B';
  ctx.font = `800 ${size}px ${display}`;
  const lines = wrap(ctx, `${info.food}!`, W - 240).slice(0, img ? 2 : 3);
  lines.forEach((l, i) => ctx.fillText(l, 120, textTop + i * (size + 12)));
  ctx.fillStyle = '#52525B';
  ctx.font = `600 44px ${body}`;
  let y = textTop + lines.length * (size + 12) + 30;
  for (const extra of [info.place && `📍 ${info.place}`, info.time && `🕧 ${info.time}`, info.by]) {
    if (!extra) continue;
    ctx.fillText(extra, 120, y);
    y += 64;
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 72px ${display}`;
  ctx.fillText('Makan apa?', 80, H - 110);
  ctx.font = `500 36px ${body}`;
  ctx.fillText(t('Decided together on Makan apa?'), 80, H - 60);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}

/** Share the card where the phone can (WhatsApp, Instagram…), or save it. Returns a toast or null. */
export async function shareCard(info: CardInfo): Promise<string | null> {
  const blob = await drawCard(info);
  const file = new File([blob], 'makan-apa.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: t('Today: {food}', { food: info.food }) });
    } catch {
      /* closed the share sheet */
    }
    return null;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'makan-apa.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return t('Picture saved. Send it to your group chat.');
}
