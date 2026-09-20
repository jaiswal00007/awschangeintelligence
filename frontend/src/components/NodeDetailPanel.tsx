import type { AffectedNode, BlindSpot } from '../types'

const CRIT_COLOR: Record<string, string> = {
  critical: '#ff003c', high: '#ff6b00', medium: '#ffd200', low: '#39ff14', unknown: '#64748b',
}

interface Props {
  node: AffectedNode | null
  blindSpots: BlindSpot[]
  onClose: () => void
}

export function NodeDetailPanel({ node, blindSpots, onClose }: Props) {
  const relatedBlindSpots = node
    ? blindSpots.filter(bs => bs.source_id === node.node_id || bs.target_id === node.node_id)
    : []

  return (
    <div
      className="absolute top-0 right-0 h-full w-80 z-20 border-l border-[#1e2535] bg-[#070c14] overflow-y-auto"
      style={{
        transform: node ? 'translateX(0)' : 'translateX(100%)',
        opacity: node ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease',
        boxShadow: node ? '-8px 0 32px rgba(0,0,0,0.5)' : 'none',
        pointerEvents: node ? 'auto' : 'none',
      }}
    >
      {node && (
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-mono text-[#00f5ff] uppercase tracking-widest mb-1">Node Inspector</div>
              <div className="font-bold font-mono text-white text-sm truncate">{node.name}</div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition-colors text-lg leading-none flex-shrink-0 mt-1"
            >
              ✕
            </button>
          </div>

          {/* Criticality */}
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-mono font-bold px-2.5 py-1 rounded border uppercase"
              style={{
                color: CRIT_COLOR[node.criticality] || '#64748b',
                borderColor: `${CRIT_COLOR[node.criticality] || '#64748b'}44`,
                background: `${CRIT_COLOR[node.criticality] || '#64748b'}0d`,
                textShadow: `0 0 8px ${CRIT_COLOR[node.criticality] || '#64748b'}66`,
              }}
            >
              {node.criticality.toUpperCase()}
            </span>
            <span className="text-xs font-mono text-slate-500 px-2.5 py-1 rounded border border-[#1e2535] bg-[#0d1120]">
              {node.node_type}
            </span>
          </div>

          {/* ARN */}
          <div className="rounded-lg bg-[#0d1120] border border-[#1e2535] px-3 py-2">
            <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-1">Resource ID</div>
            <div className="text-[10px] font-mono text-slate-400 break-all">{node.node_id}</div>
          </div>

          {/* Type */}
          <div className="rounded-lg bg-[#0d1120] border border-[#1e2535] px-3 py-2">
            <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-1">Resource Type</div>
            <div className="text-xs font-mono text-slate-300">{node.resource_type}</div>
          </div>

          {/* Hop distance */}
          <div className="flex gap-2">
            <div className="flex-1 rounded-lg bg-[#0d1120] border border-[#1e2535] px-3 py-2 text-center">
              <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-1">Blast Hop</div>
              <div className="text-2xl font-black font-mono text-[#00f5ff]" style={{ textShadow: '0 0 10px #00f5ff66' }}>
                {node.hop_distance}
              </div>
            </div>
            {node.cost_delta && (
              <div className="flex-1 rounded-lg bg-[#0d1120] border border-[#1e2535] px-3 py-2 text-center">
                <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-1">Cost Impact</div>
                <div
                  className="text-xl font-black font-mono"
                  style={{
                    color: node.cost_delta.monthly_delta_usd < 0 ? '#39ff14' : '#ff003c',
                    textShadow: `0 0 10px ${node.cost_delta.monthly_delta_usd < 0 ? '#39ff14' : '#ff003c'}66`,
                  }}
                >
                  {node.cost_delta.monthly_delta_usd < 0 ? '-' : '+'}${Math.abs(node.cost_delta.monthly_delta_usd).toFixed(0)}
                  <span className="text-[10px] font-normal text-slate-500">/mo</span>
                </div>
              </div>
            )}
          </div>

          {/* Blast path */}
          {node.path.length > 0 && (
            <div className="rounded-lg bg-[#0d1120] border border-[#1e2535] px-3 py-3">
              <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-2">Blast Path</div>
              <div className="flex flex-wrap items-center gap-1">
                {node.path.map((step, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-slate-400 bg-[#050810] px-1.5 py-0.5 rounded border border-[#1e2535] truncate max-w-[80px]" title={step}>
                      {step.split(':').pop()?.slice(0, 18)}
                    </span>
                    {i < node.path.length - 1 && (
                      <span className="text-[#1e2535] text-xs">›</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Related blind spots */}
          {relatedBlindSpots.length > 0 && (
            <div className="rounded-lg border border-[#ff003c44] bg-[rgba(255,0,60,0.04)] px-3 py-3">
              <div className="text-[10px] font-mono text-[#ff003c] uppercase tracking-wider mb-2">
                ⚠ Blind Spots Involving This Node
              </div>
              <div className="space-y-2">
                {relatedBlindSpots.map((bs, i) => (
                  <div key={i} className="text-[10px] font-mono text-slate-400 leading-relaxed">
                    <span className="text-[#ff003c]">{bs.source_name}</span>
                    <span className="text-slate-600"> → </span>
                    <span className="text-[#ff003c]">{bs.target_name}</span>
                    <div className="text-slate-600 mt-0.5">{bs.why_hidden}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cost driver */}
          {node.cost_delta && (
            <div className="rounded-lg bg-[#0d1120] border border-[#1e2535] px-3 py-2">
              <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-1">Cost Driver</div>
              <div className="text-[11px] font-mono text-slate-400">{node.cost_delta.driver.replace(/_/g, ' ')}</div>
              <div className="text-[10px] font-mono text-slate-600 mt-1">
                Baseline: ${node.cost_delta.baseline_usd}/mo · {Math.round(node.cost_delta.confidence * 100)}% confidence
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
