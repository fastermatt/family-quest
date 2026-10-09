/**
 * Phone photos are often 4–8 MB; storage takes 5 MB. Shrink to a sharp
 * 1600px JPEG in the browser before upload. Falls back to the original file
 * if the browser cannot decode it.
 */
export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
    if (!blob) return file
    return new File([blob], 'proof.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
