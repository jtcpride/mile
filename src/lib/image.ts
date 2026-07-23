import { PHOTO_MAX_DIMENSION, PHOTO_TARGET_BYTES } from '../config'

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('写真を変換できませんでした。'))),
      'image/jpeg',
      quality,
    )
  })
}

export async function compressPhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('この写真形式を読み込めません。JPEGまたはPNGを選んでください。')
  }

  const longestSide = Math.max(bitmap.width, bitmap.height)
  const initialScale = Math.min(1, PHOTO_MAX_DIMENSION / longestSide)
  let width = Math.max(1, Math.round(bitmap.width * initialScale))
  let height = Math.max(1, Math.round(bitmap.height * initialScale))
  let quality = 0.86
  let result: Blob | null = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) {
      bitmap.close()
      throw new Error('写真を縮小できませんでした。')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    result = await canvasToBlob(canvas, quality)

    if (result.size <= PHOTO_TARGET_BYTES) break
    if (quality > 0.5) {
      quality -= 0.08
    } else {
      width = Math.max(1, Math.round(width * 0.84))
      height = Math.max(1, Math.round(height * 0.84))
    }
  }

  bitmap.close()
  if (!result) throw new Error('写真を縮小できませんでした。')

  return new File([result], `${crypto.randomUUID()}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

export function formatFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

