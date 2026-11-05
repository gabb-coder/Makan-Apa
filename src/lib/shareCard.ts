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

/** A 1080×1350 picture of a room's month or year, for sharing. `lines` are the highlights. */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A room's Wrapped as one picture: the period, four big numbers, the highlights and the vibe. */
export async function drawWrapped(card: { room: string; title: string; tiles: { value: string; label: string }[]; lines: string[]; vibe: string | null }): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const display = "'Bricolage Grotesque', 'Plus Jakarta Sans', sans-serif";
  const body = "'Plus Jakarta Sans', system-ui, sans-serif";

  // A deep gradient with two glowing blobs, like the story's last slide.
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, '#18181B');
  bg.addColorStop(1, '#5B21B6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, colour: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W - 80, 120, 560, 'rgba(236,72,153,0.75)');
  glow(60, H - 160, 620, 'rgba(245,158,11,0.55)');
  // Confetti along the top.
  const colours = ['#FFFFFF', '#FDE047', '#F472B6', '#60A5FA', '#34D399', '#FB923C'];
  for (let i = 0; i < 34; i++) {
    ctx.save();
    ctx.translate((i * 137) % W, 30 + ((i * 71) % 230));
    ctx.rotate(((i * 47) % 360) * (Math.PI / 180));
    ctx.fillStyle = colours[i % colours.length];
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-7, -11, 14, 22);
    ctx.restore();
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 34px ${body}`;
  ctx.fillText(card.room.toUpperCase().slice(0, 40), 80, 300);
  ctx.font = `800 104px ${display}`;
  const titleLines = wrap(ctx, card.title, W - 160).slice(0, 2);
  titleLines.forEach((l, i) => ctx.fillText(l, 80, 400 + i * 104));
  let y = 400 + (titleLines.length - 1) * 104 + 50;

  // Four tiles, two by two.
  const gap = 24;
  const tw = (W - 160 - gap) / 2;
  const th = 170;
  card.tiles.slice(0, 4).forEach((tile, k) => {
    const x = 80 + (k % 2) * (tw + gap);
    const ty = y + Math.floor(k / 2) * (th + gap);
    roundRect(ctx, x, ty, tw, th, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    let size = 84;
    ctx.font = `800 ${size}px ${display}`;
    while (ctx.measureText(tile.value).width > tw - 56 && size > 40) ctx.font = `800 ${(size -= 4)}px ${display}`;
    ctx.fillText(tile.value, x + 28, ty + 98);
    ctx.font = `700 34px ${body}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(tile.label, x + 28, ty + 144);
    ctx.globalAlpha = 1;
  });
  y += 2 * th + gap + 70;

  ctx.font = `700 42px ${body}`;
  for (const line of card.lines.slice(0, 3)) {
    const [l] = wrap(ctx, line, W - 160);
    ctx.fillText(l, 80, y);
    y += 62;
  }
  if (card.vibe && y < H - 230) {
    ctx.font = `600 34px ${body}`;
    ctx.globalAlpha = 0.9;
    for (const l of wrap(ctx, card.vibe, W - 160).slice(0, 2)) {
      y += 6;
      ctx.fillText(l, 80, y + 20);
      y += 44;
    }
    ctx.globalAlpha = 1;
  }

  ctx.font = `800 64px ${display}`;
  ctx.fillText('Makan Wrapped', 80, H - 100);
  ctx.font = `500 32px ${body}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(t('Decided together on Makan apa?'), 80, H - 52);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}

/** Share a picture where the phone can, or save it. Returns a toast or null. */
export async function shareBlob(blob: Blob, text: string): Promise<string | null> {
  const file = new File([blob], 'makan-apa.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
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

