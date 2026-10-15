import type { Attachment } from './domain.ts';

export async function readAttachment(file: File): Promise<Attachment> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('仅支持 PNG、JPEG 和 WebP 图片。');
  if (file.size > 5 * 1024 * 1024 || file.size === 0) throw new Error('图片不能为空，且每张不能超过 5 MB。');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const actual = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
    : bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' ? 'image/png'
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'image/webp' : '';
  if (actual !== file.type) throw new Error('图片内容与格式不符，请重新导出图片。');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('图片无法解码，可能已经损坏，请重新导出后上传。'); }
  const tooLarge = bitmap.width * bitmap.height > 24_000_000;
  bitmap.close();
  if (tooLarge) throw new Error('图片尺寸过大，请裁剪为不超过 2400 万像素后重试。');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('无法读取图片，请重新选择。'));
    reader.readAsDataURL(file);
  });
  return { id: crypto.randomUUID(), name: file.name, data, type: file.type };
}
