import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { DEFAULT_QUESTIONS, cleanAnswers, cleanQuestions, proofTypeOf } from '@/lib/proof'
import { bestEffort, parentIds, sendToProfiles } from '@/lib/push'
import { submitBody } from '@/lib/push-copy'

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
    .select('id, assigned_to, status, task_template:task_templates(*)')
    .eq('id', taskId)
    .eq('assigned_to', profileId)
    .single()

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  // A rejected chore can be redone; anything else already in review cannot.
  if (task.status !== 'pending' && task.status !== 'rejected') {
    return NextResponse.json({ error: 'Already sent. A parent will check it.' }, { status: 400 })
  }

  const template = Array.isArray(task.task_template) ? task.task_template[0] : task.task_template
  const proofType = proofTypeOf(template)

  // The server decides what counts as proof, not the browser.
  const hasPhoto = !!photo && photo.size > 0
  let answers: { q: string; a: string }[] | null = null
  if (proofType === 'written') {
    let raw: unknown = null
    try {
      raw = JSON.parse((formData.get('answers') as string | null) ?? 'null')
    } catch {}
    const questions = cleanQuestions(template?.questions).length ? cleanQuestions(template?.questions) : DEFAULT_QUESTIONS
    const checked = cleanAnswers(questions, raw)
    if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 })
    answers = checked.answers!
  }
  if (proofType === 'photo' && !hasPhoto) {
    return NextResponse.json({ error: 'This chore needs a photo' }, { status: 400 })
  }

  let photoUrl: string | null = null

  // Upload photo if provided
  if (hasPhoto && photo) {
    const MAX_SIZE = 5 * 1024 * 1024
    if (photo.size > MAX_SIZE) {
      return NextResponse.json({ error: 'That photo is too big. Take it again with the camera button.' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(photo.type)) {
      return NextResponse.json({ error: 'That photo did not work. Take a new one with the camera button.' }, { status: 400 })
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
      return NextResponse.json({ error: 'The photo did not upload. Check the Wi-Fi and try again.' }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('task-photos')
      .getPublicUrl(filePath)

    photoUrl = urlData.publicUrl
  }

  // Update the task instance
  const updateData: Record<string, unknown> = {
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    // Clear any earlier rejection so the reviewer sees a clean resubmission.
    reviewed_at: null,
    review_note: null,
  }

  if (answers) updateData.answers = answers
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

  // Tell the parents (best effort; never blocks or fails the submit).
  await bestEffort(
    (async () => {
      const { data: kid } = await supabaseAdmin.from('profiles').select('name').eq('id', profileId).maybeSingle()
      await sendToProfiles(supabaseAdmin, await parentIds(supabaseAdmin, familyId), {
        title: `${kid?.name ?? 'Your kid'} sent: ${template?.name ?? 'a chore'}`,
        body: submitBody(proofType),
        url: '/dashboard',
        tag: `submit-${taskId}`,
      })
    })()
  )

  return NextResponse.json({ ok: true, photoUrl })
}
