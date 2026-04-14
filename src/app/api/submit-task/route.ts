import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Resolve the calling profile (same pattern as /api/tasks)
async function resolveProfileId(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const profileToken = cookieStore.get('profile_token')?.value
  const activeProfileId = cookieStore.get('active_profile_id')?.value

  let sessionProfile: { id: string; role: string; family_id: string } | null = null

  if (profileToken) {
    const { data } = await supabase
      .from('profiles')
      .select('id, role, family_id')
      .eq('access_token', profileToken)
      .single()
    sessionProfile = data
  }

  if (!sessionProfile) {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('id, role, family_id')
        .eq('auth_user_id', user.id)
        .single()
      sessionProfile = data
    }
  }

  if (!sessionProfile) return null

  if (activeProfileId && sessionProfile.role === 'parent') {
    const { data: child } = await supabase
      .from('profiles')
      .select('id, family_id')
      .eq('id', activeProfileId)
      .eq('family_id', sessionProfile.family_id)
      .single()
    if (child) return { profileId: child.id, familyId: child.family_id }
  }

  return { profileId: sessionProfile.id, familyId: sessionProfile.family_id }
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const resolved = await resolveProfileId(cookieStore)

  if (!resolved) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { profileId, familyId } = resolved

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Parse multipart form data
  const formData = await req.formData()
  const taskId = formData.get('taskId') as string
  const photoChallengePrompt = formData.get('photoChallengePrompt') as string | null
  const photo = formData.get('photo') as File | null

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  // Verify this task belongs to the calling profile
  const { data: task, error: taskError } = await supabaseAdmin
    .from('task_instances')
    .select('id, assigned_to, status')
    .eq('id', taskId)
    .eq('assigned_to', profileId)
    .single()

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.status !== 'pending') {
    return NextResponse.json({ error: 'Task already submitted' }, { status: 400 })
  }

  let photoUrl: string | null = null

  // Upload photo if provided
  if (photo && photo.size > 0) {
    const MAX_SIZE = 5 * 1024 * 1024
    if (photo.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Photo must be under 5MB' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    if (!allowedTypes.includes(photo.type)) {
      return NextResponse.json({ error: 'Invalid image type' }, { status: 400 })
    }

    const fileExt = photo.name.split('.').pop() || 'jpg'
    const fileName = `${profileId}-${taskId}-${Date.now()}.${fileExt}`
    const filePath = `task-submissions/${familyId}/${fileName}`

    const arrayBuffer = await photo.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabaseAdmin.storage
      .from('task-photos')
      .upload(filePath, buffer, {
        contentType: photo.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Photo upload error:', uploadError)
      return NextResponse.json({ error: 'Photo upload failed' }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('task-photos')
      .getPublicUrl(filePath)

    photoUrl = urlData.publicUrl
  }

  // Update the task instance
  const updateData: Record<string, any> = {
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  }

  if (photoUrl) {
    updateData.photo_url = photoUrl
  }

  if (photoChallengePrompt) {
    updateData.photo_challenge_prompt = photoChallengePrompt
  }

  const { error: updateError } = await supabaseAdmin
    .from('task_instances')
    .update(updateData)
    .eq('id', taskId)

  if (updateError) {
    console.error('Task update error:', updateError)
    return NextResponse.json({ error: 'Failed to submit task' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, photoUrl })
}
