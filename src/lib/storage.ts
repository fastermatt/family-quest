const BUCKET = 'task-photos'

/**
 * Proof photos are stored as a URL in task_instances.photo_url. Whether the
 * bucket is public or private, the object path is what we need to sign it.
 */
export function photoPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = `/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  const path = url.slice(i + marker.length).split('?')[0]
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export const PHOTO_BUCKET = BUCKET
