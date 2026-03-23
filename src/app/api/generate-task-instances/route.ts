import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
          // Support cron secret bypass for scheduled tasks
      const authHeader = request.headers.get('authorization')
          const cronSecret = process.env.CRON_SECRET
          const isCronCall = cronSecret && authHeader === `Bearer ${cronSecret}`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let supabase: any
          if (isCronCall) {
                  // Use admin client to bypass RLS for cron jobs
            supabase = createAdminClient(
                      process.env.NEXT_PUBLIC_SUPABASE_URL!,
                      process.env.SUPABASE_SERVICE_ROLE_KEY!
                    )
          } else {
                  supabase = await createClient()
          }

      const today = new Date().toISOString().split('T')[0]
          const dayOfWeek = new Date().getDay()
          const dayOfMonth = new Date().getDate()

      // Get all active task templates
      const { data: templates } = await supabase
            .from('task_templates')
            .select('*')
            .eq('active', true)

      if (!templates) {
              return NextResponse.json({ success: false, error: 'No templates' })
      }

      let created = 0

      for (const template of templates) {
              let shouldCreate = false

            switch (template.recurrence_type) {
              case 'daily':
                          shouldCreate = true
                          break
              case 'weekdays':
                          shouldCreate = dayOfWeek >= 1 && dayOfWeek <= 5
                          break
              case 'weekly':
                          shouldCreate = template.recurrence_days?.includes(dayOfWeek) ?? false
                          break
              case 'monthly':
                          shouldCreate = template.recurrence_days?.includes(dayOfMonth) ?? false
                          break
              case 'once':
                          shouldCreate = false
                          break
            }

            if (!shouldCreate) continue

            // Get assignments for this template
            const { data: assignments } = await supabase
                .from('task_assignments')
                .select('*')
                .eq('template_id', template.id)

            if (!assignments) continue

            for (const assignment of assignments) {
                      // Check if instance already exists
                const { data: existing } = await supabase
                        .from('task_instances')
                        .select('id')
                        .eq('template_id', template.id)
                        .eq('assigned_to', assignment.assigned_to)
                        .eq('due_date', today)
                        .single()

                if (existing) continue

                // Pick a random photo challenge if photo required
                let photoChallengePrompt = null

                if (template.photo_required) {
                            const { data: challenges } = await supabase
                              .from('photo_challenges')
                              .select('prompt_text, emoji')

                        if (challenges?.length) {
                                      const randomIndex = Math.floor(
                                                      Math.random() * challenges.length
                                                    )
                                      const challenge = challenges[randomIndex]
                                      photoChallengePrompt = `${challenge.emoji} ${challenge.prompt_text}`
                        }
                }

                // Create task instance
                const { error } = await supabase
                        .from('task_instances')
                        .insert([
                          {
                                          template_id: template.id,
                                          assigned_to: assignment.assigned_to,
                                          due_date: today,
                                          status: 'pending',
                                          photo_challenge_prompt: photoChallengePrompt,
                          },
                                    ])

                if (!error) {
                            created++
                }
            }
      }

      return NextResponse.json({
              success: true,
              created,
              message: `Created ${created} task instances for ${today}`,
      })
    } catch (error) {
          console.error('Error generating task instances:', error)
          return NextResponse.json(
            {
                      success: false,
                      error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
                )
    }
}
