import { NextRequest, NextResponse } from 'next/server'
import { adminClient, getSessionProfile } from '@/lib/session'
import { PHOTO_BUCKET, photoPathFromUrl } from '@/lib/storage'

export const dynamic = 'force-dynamic'

// Proof photos are private to the family. <img src="/api/proof/{instanceId}">
// checks who is asking, then redirects to a short-lived signed link.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const me = await getSessionProfile()
  if (!me) return new NextResponse('Unauthorized', { status: 401 })

  const admin = adminClient()
  const { data: instance } = await admin
    .from('task_instances')
    .select('photo_url, assigned_to, assignee:profiles!task_instances_assigned_to_fkey(family_id)')
    .eq('id', id)
    .single()
  if (!instance) return new NextResponse('Not found', { status: 404 })

  const assignee = Array.isArray(instance.assignee) ? instance.assignee[0] : instance.assignee
  const sameFamily = assignee?.family_id === me.family_id
  const allowed = sameFamily && (me.role === 'parent' || instance.assigned_to === me.id)
  if (!allowed) return new NextResponse('Forbidden', { status: 403 })

  const path = photoPathFromUrl(instance.photo_url)
  if (!path) return new NextResponse('No photo', { status: 404 })

  const { data, error } = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60)
  if (error || !data?.signedUrl) return new NextResponse('Could not load photo', { status: 502 })

  const res = NextResponse.redirect(data.signedUrl, 302)
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
