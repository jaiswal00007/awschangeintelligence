import type { RiskResult } from '../types'

const COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

const BG: Record<string, string> = {
  critical: 'bg-red-950 border-red-500',
  high: 'bg-orange-950 border-orange-500',
  medium: 'bg-yellow-950 border-yellow-500',
  low: 'bg-green-950 border-green-500',
}

interface Props {
  risk: RiskResult
  expanded: boolean
  onToggle: () => void
}

export function RiskBadge({ risk, expanded, onToggle }: Props) {
  const color = COLORS[risk.level] || '#64748b'
  const bg = BG[risk.level] || 'bg-slate-900 border-slate-600'

  return (
    <div className={`rounded-xl border p-6 ${bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="text-5xl font-black tabular-nums"
            style={{ color }}
          >
            {risk.score}
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest font-semibold" style={{ color }}>
              Risk Level
            </div>
            <div className="text-2xl font-bold uppercase tracking-wide" style={{ color }}>
              {risk.level}
            </div>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="text-xs text-slate-400 hover:text-slate-200 underline"
        >
          {expanded ? 'Hide signals' : 'Show signals'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2">
          {Object.entries(risk.signals).map(([key, val]) => (
            <div key={key} className="flex items-center gap-3">
              <div className="text-xs text-slate-400 w-48 truncate">
                {key.replace(/_/g, ' ')}
              </div>
              <div className="flex-1 bg-slate-800 rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${(val / 30) * 100}%`, background: color }}
                />
              </div>
              <div className="text-xs font-mono text-slate-300 w-8 text-right">
                +{val}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
