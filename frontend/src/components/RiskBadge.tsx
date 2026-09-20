import { useEffect, useRef, useState } from 'react'
import type { RiskResult } from '../types'

const LEVEL_CONFIG: Record<string, { glow: string; neon: string; ring: string; label: string }> = {
  critical: { glow: 'glow-red', neon: '#ff003c', ring: '#ff003c', label: 'CRITICAL' },
  high: { glow: 'glow-orange', neon: '#ff6b00', ring: '#ff6b00', label: 'HIGH' },
  medium: { glow: 'glow-yellow', neon: '#ffd200', ring: '#ffd200', label: 'MEDIUM' },
  low: { glow: 'glow-green', neon: '#39ff14', ring: '#39ff14', label: 'LOW' },
}

const SIGNAL_COLORS: Record<string, string> = {
  customer_facing: '#ff003c',
  blast_radius_size: '#ff6b00',
  change_type_severity: '#ffd200',
  historical_incident: '#bf00ff',
  blind_spot_present: '#ff003c',
  prod_critical_node: '#ff6b00',
}

interface Props {
  risk: RiskResult
  expanded: boolean
  onToggle: () => void
}

export function RiskBadge({ risk, expanded, onToggle }: Props) {
  const config = LEVEL_CONFIG[risk.level] || { glow: '', neon: '#00f5ff', ring: '#00f5ff', label: risk.level.toUpperCase() }
  const [displayScore, setDisplayScore] = useState(0)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const duration = 900
    const target = risk.score

    cancelAnimationFrame(animRef.current)
    setDisplayScore(0)

    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayScore(Math.round(eased * target))
      if (progress < 1) animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [risk.score])

  // SVG ring params
  const radius = 54
  const circumference = 2 * Math.PI * radius  // ~339.3
  const fillFraction = Math.min(risk.score / 100, 1)
  const dashOffset = circumference * (1 - fillFraction)

  const borderStyle = risk.level === 'critical'
    ? 'border-[#ff003c] pulse-red'
    : risk.level === 'high'
      ? 'border-[#ff6b00]'
      : risk.level === 'medium'
        ? 'border-[#ffd200]'
        : 'border-[#39ff14]'

  return (
    <div className={`rounded-xl border p-5 bg-[#070c14] ${borderStyle}`} style={{
      boxShadow: `0 0 20px ${config.neon}22, 0 0 40px ${config.neon}0a`
    }}>
      <div className="flex items-center gap-6">
        {/* SVG ring + score */}
        <div className="relative flex-shrink-0 w-32 h-32">
          <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
            {/* Track */}
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              stroke="#1e2535"
              strokeWidth="8"
            />
            {/* Fill arc */}
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              stroke={config.ring}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
                filter: `drop-shadow(0 0 6px ${config.ring})`,
              }}
            />
            {/* Glow arc (thicker, low opacity) */}
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              stroke={config.ring}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              opacity="0.12"
              style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)' }}
            />
          </svg>
          {/* Score + level centered */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
            <div
              className={`text-4xl font-black tabular-nums leading-none ${config.glow}`}
              style={{ color: config.neon, fontFamily: 'monospace' }}
            >
              {displayScore}
            </div>
            <div
              className={`text-[10px] font-bold tracking-[0.2em] mt-1 uppercase ${config.glow}`}
              style={{ color: config.neon }}
            >
              {config.label}
            </div>
          </div>
        </div>

        {/* Right: label + toggle */}
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-widest font-semibold text-slate-500 mb-1 font-mono">
            Risk Score
          </div>
          <div
            className={`text-3xl font-black uppercase tracking-wide ${config.glow}`}
            style={{ color: config.neon, fontFamily: 'monospace' }}
          >
            {config.label}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-mono">
            {Object.keys(risk.signals).length} active signal{Object.keys(risk.signals).length !== 1 ? 's' : ''}
          </div>
          <button
            onClick={onToggle}
            className="mt-3 text-xs font-mono px-3 py-1 rounded border border-[#1e2535] text-slate-400 hover:text-[#00f5ff] hover:border-[#00f5ff] transition-colors"
          >
            {expanded ? '▲ hide signals' : '▼ show signals'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-5 space-y-2.5 border-t border-[#1e2535] pt-4">
          <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-3">Signal Breakdown</div>
          {Object.entries(risk.signals).sort((a, b) => b[1] - a[1]).map(([key, val]) => {
            const sigColor = SIGNAL_COLORS[key] || '#00f5ff'
            const pct = Math.min(100, (val / 30) * 100)
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="text-xs font-mono text-slate-400 w-44 truncate">
                  {key.replace(/_/g, ' ')}
                </div>
                <div className="flex-1 h-1.5 rounded-full bg-[#1e2535] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: sigColor,
                      boxShadow: `0 0 8px ${sigColor}`,
                    }}
                  />
                </div>
                <div className="text-xs font-mono w-8 text-right" style={{ color: sigColor }}>
                  +{val}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
