import { countsTowardUnlock, type UnlockTask } from '../proof.ts'

export type ChoreRow = Omit<UnlockTask, 'task_template'> & {
  template: (NonNullable<UnlockTask['task_template']> & { name: string; xp_value: number | null }) | null
}

const statusOrder = ['rejected', 'redo', 'pending', 'missed', 'submitted', 'approved', 'excused']

export function summarizeChores(rows: ChoreRow[], day: string, childName: string, requireApproval: boolean) {
  const chores = rows.flatMap(row => {
    const template = row.template
    if (!template || template.required === false) return []
    const status = statusOrder.includes(row.status) ? row.status : 'pending'
    return [{
      id: row.id,
      name: template.name.slice(0, 160),
      status,
      required: true,
      xp: template.xp_value ?? 0,
      counts: status === 'approved' || status === 'excused' || (!requireApproval && countsTowardUnlock({ ...row, status, task_template: template })),
    }]
  }).sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || a.name.localeCompare(b.name, 'en-US') || a.id.localeCompare(b.id))

  const submittedCount = chores.filter(c => c.status === 'submitted').length
  const approvedCount = chores.filter(c => c.status === 'approved' || c.status === 'excused').length
  return {
    day,
    childName,
    chores,
    pendingCount: chores.length - submittedCount - approvedCount,
    submittedCount,
    approvedCount,
    totalRequired: chores.length,
    allDone: chores.length > 0 && chores.every(c => c.counts),
  }
}
