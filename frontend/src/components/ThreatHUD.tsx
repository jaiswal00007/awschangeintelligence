import { useEffect, useState } from 'react'
import type { RiskResult, BlastRadiusSummary } from '../types'

interface Props {
  risk: RiskResult
  blastSummary: BlastRadiusSummary
  blindSpotCount: number
  historicalCount: number
}

const LEVEL_CONFIG = {
  critical: { color: '#ef4444', label: 'CRITICAL', pulse: true },
  high:     { color: '#f97316', label: 'HIGH',     pulse: false },
  medium:   { color: '#eab308', label: 'MEDIUM',   pulse: false },
  low:      { color: '#22c55e', label: 'LOW',      pulse: false },
}

export function ThreatHUD({ risk, blastSummary, blindSpotCount, historicalCount }: Props) {
  const [fillPct,      setFillPct]      = useState(0)
  const [pillsVisible, setPillsVisible] = useState(0)
  const cfg = LEVEL_CONFIG[risk.level as keyof typeof LEVEL_CONFIG] || LEVEL_CONFIG.low

  useEffect(() => {
    setFillPct(0); setPillsVisible(0)
    const t1 = setTimeout(() => setFillPct(risk.score), 80)
    const t2 = setTimeout(() => setPillsVisible(1), 500)
    const t3 = setTimeout(() => setPillsVisible(2), 680)
    const t4 = setTimeout(() => setPillsVisible(3), 860)
    const t5 = setTimeout(() => setPillsVisible(4), 1040)
    return () => [t1,t2,t3,t4,t5].forEach(clearTimeout)
  }, [risk.score, risk.level])

  const pills = [
    blastSummary.customer_facing
      ? { label: '⚠ CUSTOMER SURFACE', color: '#ef4444' }
      : { label: '✓ NO CUSTOMER IMPACT', color: '#22c55e' },
    { label: `${blastSummary.resources} RESOURCES`, color: cfg.color },
    blindSpotCount > 0
      ? { label: `⚠ ${blindSpotCount} BLIND SPOT${blindSpotCount > 1 ? 'S' : ''}`, color: '#ef4444' }
      : { label: '✓ NO BLIND SPOTS', color: '#22c55e' },
    historicalCount > 0
      ? { label: `${historicalCount} HISTORICAL MATCH${historicalCount > 1 ? 'ES' : ''}`, color: '#eab308' }
      : { label: 'NO PRECEDENT', color: '#334155' },
  ]

  return (
    <div className={`h-full flex flex-col gap-2.5 ${cfg.pulse ? 'pulse-red' : ''}`}>
      {/* Score bar row */}
      <div className="flex items-center gap-3">
        <div className="text-3xl font-black font-mono tabular-nums leading-none"
          style={{ color: cfg.color, textShadow: `0 0 16px ${cfg.color}` }}>
          {risk.score}
        </div>
        <div className="text-lg font-black font-mono uppercase tracking-widest"
          style={{ color: cfg.color, textShadow: `0 0 10px ${cfg.color}88` }}>
          {cfg.label}
        </div>
        <div className="flex-1 h-2 rounded-full bg-[#0d1424] border border-[#1a2438] overflow-hidden ml-1">
          <div className="h-full rounded-full transition-all duration-[1100ms] ease-out"
            style={{ width: `${fillPct}%`, background: `linear-gradient(90deg, ${cfg.color}88, ${cfg.color})`, boxShadow: `0 0 8px ${cfg.color}` }} />
        </div>
      </div>

      {/* Pills */}
      <div className="flex flex-wrap gap-1.5">
        {pills.map((pill, i) => (
          <div key={i} className="transition-all duration-200"
            style={{ opacity: pillsVisible > i ? 1 : 0, transform: pillsVisible > i ? 'translateY(0)' : 'translateY(5px)' }}>
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded border"
              style={{ color: pill.color, borderColor: `${pill.color}33`, background: `${pill.color}0c` }}>
              {pill.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
