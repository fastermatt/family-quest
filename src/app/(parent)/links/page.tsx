import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { CopyLinkCard } from '@/components/copy-link-card'

export default async function LinksPage() {
  const supabase = await createClient()
  const cookieStore = await cookies()

  let familyId: string | null = null

  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('auth_user_id', user.id)
      .single()
    familyId = profile?.family_id ?? null
  } else {
    const profileToken = cookieStore.get('profile_token')?.value
    if (profileToken) {
      const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: profile } = await adminClient
        .from('profiles')
        .select('family_id')
        .eq('access_token', profileToken)
        .single()
      familyId = profile?.family_id ?? null
    }
  }

  if (!familyId) return null

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: members } = await adminClient
    .from('profiles')
    .select('id, name, role, avatar_emoji, access_token')
    .eq('family_id', familyId)
    .order('role', { ascending: true })
    .order('name', { ascending: true })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://family-tasks-deploy.vercel.app'

  const parents = members?.filter(m => m.role === 'parent') || []
  const children = members?.filter(m => m.role === 'child') || []

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold mb-1">Family Login Links</h1>
        <p className="text-white/60">
          Copy and send each person their personal link via text message. When they tap it, they&apos;re instantly logged in — no password needed. Kids tap their link once in Safari, then add the app to their Home Screen — they'll stay logged in automatically from then on.
        </p>
      </div>

      {parents.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3 text-white/80 uppercase tracking-wide text-sm">Parents</h2>
          <div className="space-y-3">
            {parents.map((member) => (
              <CopyLinkCard
                key={member.id}
                name={member.name}
                emoji={member.avatar_emoji}
                role={member.role}
                link={member.role === 'child' ? `${baseUrl}/child-login?token=${member.access_token}` : `${baseUrl}/api/join/${member.access_token}`}
              />
            ))}
          </div>
        </section>
      )}

      {children.length > 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3 text-white/80 uppercase tracking-wide text-sm">Kids</h2>
          <div className="space-y-3">
            {children.map((member) => (
              <CopyLinkCard
                key={member.id}
                name={member.name}
                emoji={member.avatar_emoji}
                role={member.role}
                link={member.role === 'child' ? `${baseUrl}/child-login?token=${member.access_token}` : `${baseUrl}/api/join/${member.access_token}`}
              />
            ))}
          </div>
        </section>
      )}

      <div className="glass-card p-5 border-yellow-400/20 bg-yellow-500/5">
        <p className="text-sm text-yellow-300/80">
          💡 <strong>Kids setup:</strong> Send them their link. They tap it in Safari, then tap Share → &quot;Add to Home Screen&quot;. After that, the app icon will log them in automatically — no link needed again.
        </p>
      </div>
    </div>
  )
}
