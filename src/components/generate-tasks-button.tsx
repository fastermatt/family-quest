'use client'

import { useState } from 'react'

export function GenerateTasksButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/generate-task-instances', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setResult(data.created === 0 ? 'Tasks already generated for today!' : `✅ Created ${data.created} task${data.created !== 1 ? 's' : ''} for today!`)
      } else {
        setResult(`❌ Error: ${data.error}`)
      }
    } catch {
      setResult('❌ Failed to generate tasks')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-6 py-2 rounded-2xl bg-teal-600/30 text-teal-300 border border-teal-400/50 hover:bg-teal-600/50 transition-all font-medium disabled:opacity-50"
      >
        {loading ? 'Generating...' : '⚡ Generate Today\'s Tasks'}
      </button>
      {result && (
        <p className="text-sm text-white/70">{result}</p>
      )}
    </div>
  )
}
