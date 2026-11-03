import { t } from './i18n';

/** Phone photos are several MB; a 1600px JPEG is plenty to read a receipt. */
export async function shrinkPhoto(file: Blob, max = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (blob) return blob;
  } catch {
    // Fall through: send the photo as it is if the browser can't decode it.
  }
  if (file.size > 3 * 1024 * 1024) throw new Error(t('That photo is too big. Try a smaller one.'));
  return file;
}

