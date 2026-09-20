import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
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
  const [key, setKey] = useState(0)
  const cfg = LEVEL_CONFIG[risk.level as keyof typeof LEVEL_CONFIG] || LEVEL_CONFIG.low

  // Re-trigger animation on new result
  useEffect(() => { setKey(k => k + 1) }, [risk.score, risk.level])

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
    <div key={key} className={`h-full flex flex-col gap-3 ${cfg.pulse ? 'pulse-red' : ''}`}>
      {/* Score row */}
      <div className="flex items-center gap-3">
        <motion.div
          className="text-3xl font-black font-mono tabular-nums leading-none"
          style={{ color: cfg.color, textShadow: `0 0 20px ${cfg.color}` }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          {risk.score}
        </motion.div>
        <motion.div
          className="text-lg font-black font-mono uppercase tracking-widest"
          style={{ color: cfg.color, textShadow: `0 0 12px ${cfg.color}88` }}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.12 }}
        >
          {cfg.label}
        </motion.div>
        {/* Progress bar */}
        <div className="flex-1 h-2 rounded-full bg-[#0d1424] border border-[#1a2438] overflow-hidden ml-1">
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${cfg.color}66, ${cfg.color})`, boxShadow: `0 0 10px ${cfg.color}` }}
            initial={{ width: '0%' }}
            animate={{ width: `${risk.score}%` }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          />
        </div>
      </div>

      {/* Staggered pills */}
      <div className="flex flex-wrap gap-1.5">
        {pills.map((pill, i) => (
          <motion.div
            key={pill.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.18, duration: 0.22 }}
          >
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded border"
              style={{ color: pill.color, borderColor: `${pill.color}33`, background: `${pill.color}0d` }}>
              {pill.label}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
