import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Activity, TrendingDown, Settings, Lock, MessageSquare } from 'lucide-react'
import { fetchResources, analyzeChange, fetchGraph } from './api'
import type { Resource, AnalysisResult, GraphData, AffectedNode } from './types'
import { RiskBadge } from './components/RiskBadge'
import { DependencyGraph } from './components/DependencyGraph'
import { BootScreen } from './components/BootScreen'
import { ThreatHUD } from './components/ThreatHUD'
import { NodeDetailPanel } from './components/NodeDetailPanel'
import { ChatPanel } from './components/ChatPanel'
import { useTypewriter } from './hooks/useTypewriter'

const CHANGE_TYPES = [
  { value: 'delete',        label: 'DELETE',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: '#ef4444',  Icon: TrendingDown },
  { value: 'downsize',      label: 'DOWNSIZE', color: '#f97316', bg: 'rgba(249,115,22,0.1)',   border: '#f97316',  Icon: TrendingDown },
  { value: 'config_change', label: 'CONFIG',   color: '#eab308', bg: 'rgba(234,179,8,0.08)',   border: '#eab308',  Icon: Settings },
  { value: 'scale',         label: 'SCALE',    color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: '#3b82f6',  Icon: Activity },
  { value: 'iam_change',    label: 'IAM',      color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',   border: '#8b5cf6',  Icon: Lock },
]

const RESOURCE_TYPE_ICON: Record<string, string> = {
  'AWS::Lambda::Function':     '⚡',
  'AWS::RDS::DBInstance':      '🗄',
  'AWS::ApiGateway::RestApi':  '🌐',
  'AWS::SQS::Queue':           '📬',
  'AWS::DynamoDB::Table':      '⚡',
  'AWS::SecretsManager::Secret':'🔑',
}
const icon = (rt: string) => RESOURCE_TYPE_ICON[rt] || '☁'

const CRIT_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e', unknown: '#475569',
}

const RISK_COLOR = (level: string) =>
  level === 'critical' ? '#ef4444' : level === 'high' ? '#f97316' : level === 'medium' ? '#eab308' : '#22c55e'

export default function App() {
  const [booted,        setBooted]        = useState(false)
  const [resources,     setResources]     = useState<Resource[]>([])
  const [selectedId,    setSelectedId]    = useState('')
  const [changeType,    setChangeType]    = useState('delete')
  const [beforeVal,     setBeforeVal]     = useState('')
  const [afterVal,      setAfterVal]      = useState('')
  const [loading,       setLoading]       = useState(false)
  const [result,        setResult]        = useState<AnalysisResult | null>(null)
  const [graphData,     setGraphData]     = useState<GraphData | null>(null)
  const [error,         setError]         = useState('')
  const [signalsExpanded, setSignalsExpanded] = useState(false)
  const [planExpanded,  setPlanExpanded]  = useState(false)
  const [hops,          setHops]          = useState(3)
  const [selectedNode,  setSelectedNode]  = useState<AffectedNode | null>(null)
  const [chatOpen,      setChatOpen]      = useState(false)
  const [scanBadge,     setScanBadge]     = useState(false)
  const particleContainerRef = useRef<HTMLDivElement>(null)

  const { displayed: displayedVerdict } = useTypewriter(result?.verdict ?? '', 20)
  const { displayed: displayedRec }     = useTypewriter(result?.recommendation ?? '', 18)

  useEffect(() => {
    fetchResources().then(setResources).catch(() => setError('Backend offline'))
  }, [])

  const particleBurst = useCallback((x: number, y: number) => {
    const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#8b5cf6']
    for (let i = 0; i < 24; i++) {
      const el = document.createElement('span')
      el.className = 'particle'
      const angle = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
      const dist  = 40 + Math.random() * 70
      el.style.cssText = `left:${x}px;top:${y}px;background:${COLORS[i%COLORS.length]};box-shadow:0 0 6px ${COLORS[i%COLORS.length]};--px:${Math.cos(angle)*dist}px;--py:${Math.sin(angle)*dist}px;animation-duration:${0.45+Math.random()*0.3}s;`
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 800)
    }
  }, [])

  const selectedResource = resources.find(r => r.id === selectedId)
  const selectedCT       = CHANGE_TYPES.find(c => c.value === changeType)

  async function handleAnalyze(e?: React.MouseEvent) {
    if (!selectedId) return
    if (e) particleBurst(e.clientX, e.clientY)
    setLoading(true); setError(''); setResult(null); setGraphData(null)
    setSignalsExpanded(false); setPlanExpanded(false); setScanBadge(false)
    try {
      const req = { target: selectedId, change_type: changeType,
        before: beforeVal ? JSON.parse(beforeVal) : null,
        after:  afterVal  ? JSON.parse(afterVal)  : null }
      const [analysis, graph] = await Promise.all([analyzeChange(req), fetchGraph(selectedId, hops)])
      setResult(analysis); setGraphData(graph); setSelectedNode(null); setScanBadge(true)
    } catch (e: any) { setError(e.message || 'Analysis failed') }
    finally { setLoading(false) }
  }

  async function handleHopsChange(newHops: number) {
    setHops(newHops)
    if (selectedId) setGraphData(await fetchGraph(selectedId, newHops))
  }

  function handleNodeClick(nodeId: string) {
    if (!result) return
    const node = result.affected_nodes.find(n => n.node_id === nodeId) ?? null
    setSelectedNode(prev => prev?.node_id === nodeId ? null : node)
  }

  const rColor = result ? RISK_COLOR(result.risk.level) : '#3b82f6'

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {!booted && <BootScreen onDone={() => setBooted(true)} />}

      {/* ── HEADER ── */}
      <header className="shrink-0 border-b border-[rgba(59,130,246,0.2)] px-6 py-0 flex items-center justify-between sticky top-0 z-30 h-11"
        style={{ background: 'rgba(3,5,13,0.9)', backdropFilter: 'blur(24px)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-base font-black font-mono glitch-title"
            style={{ color: '#3b82f6', letterSpacing: '0.06em' }}
            data-text="AWS CHANGE INTELLIGENCE">
            <Zap size={16} className="shrink-0" style={{ color: '#3b82f6', filter: 'drop-shadow(0 0 6px #3b82f6)' }} />
            AWS CHANGE INTELLIGENCE
          </div>
          <div className="hidden md:block text-xs text-[#475569] font-mono border-l border-[#1a2438] pl-3 uppercase tracking-widest">
            Pre-Change Blast Radius Analysis
          </div>
        </div>
        <div className="flex items-center gap-4">
          {result && (
            <div className="hidden md:flex items-center gap-2 text-[11px] font-mono">
              <span className="text-[#475569]">scan:</span>
              <span className="text-[#94a3b8]">{selectedResource?.name}</span>
              <span className="px-2 py-0.5 rounded font-bold"
                style={{ color: rColor, background: `${rColor}18`, border: `1px solid ${rColor}44`, boxShadow: `0 0 8px ${rColor}33` }}>
                {result.risk.level.toUpperCase()} {result.risk.score}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            {result && (
              <button onClick={() => setChatOpen(x => !x)}
                className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded border transition-all"
                style={chatOpen
                  ? { background: 'rgba(59,130,246,0.12)', borderColor: '#3b82f6', color: '#3b82f6', boxShadow: '0 0 10px rgba(59,130,246,0.2)' }
                  : { background: 'transparent', borderColor: '#1a2438', color: '#475569' }}>
                <MessageSquare size={12} />
                Ask AI
              </button>
            )}
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#22c55e] pl-2 border-l border-[#1a2438]">
              <div className="beacon" />
              <span className="font-bold tracking-widest glow-green">ONLINE</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── 3D GRAPH — fixed 55vh ── */}
      <div className="relative border-b border-[rgba(59,130,246,0.15)]" style={{ height: '55vh', minHeight: 400 }}>
        {/* Aurora light blades */}
        {!graphData && (
          <div className="aurora-bg">
            <div className="aurora-blade blade-1" />
            <div className="aurora-blade blade-2" />
            <div className="aurora-blade blade-3" />
            <div className="aurora-vignette" />
          </div>
        )}
        {graphData && result ? (
          <div className="w-full h-full relative">
            <DependencyGraph
              data={graphData}
              targetId={selectedId}
              blastSummary={result.blast_radius}
              affectedNodes={result.affected_nodes}
              blindSpotCount={result.blind_spots.length}
              onHopsChange={handleHopsChange}
              initialHops={hops}
              onNodeClick={handleNodeClick}
            />
            <NodeDetailPanel
              node={selectedNode}
              blindSpots={result.blind_spots}
              onClose={() => setSelectedNode(null)}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: '#020510' }}>
            {loading ? (
              <div className="flex flex-col items-center gap-5">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 rounded-full border border-[#3b82f6] opacity-20 animate-ping" />
                  <div className="absolute inset-3 rounded-full border border-[#3b82f6] opacity-30 animate-ping" style={{ animationDelay: '0.3s' }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
                  </div>
                </div>
                <div className="text-[#3b82f6] text-xs font-mono tracking-[0.3em] animate-pulse">BUILDING IMPACT GRAPH</div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 opacity-25">
                <div className="w-16 h-16 rounded-full border border-[#1a2438] flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full border border-[#1a2438] flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[#1a2438]" />
                  </div>
                </div>
                <div className="text-[#475569] text-xs font-mono tracking-[0.3em] uppercase">Select a resource and analyze</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CONTROL STRIP — 220px, two columns ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[440px_1fr] border-b border-[rgba(59,130,246,0.15)]" style={{ minHeight: 220 }}>

        {/* Change Composer */}
        <div className="border-r border-[#1a2438] flex flex-col overflow-hidden glass-panel-elevated">
          <div className="px-4 py-2.5 border-b border-[rgba(59,130,246,0.12)] flex items-center justify-between shrink-0">
            <span className="header-scan text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.2em]">// Change Composer</span>
            <span className="text-xs font-mono text-[#475569]">{resources.length} resources</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Resource + type on one row */}
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-mono text-[#475569] mb-1.5 uppercase tracking-wider">Target Resource</label>
                <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
                  className="w-full rounded-lg bg-[#0d1424] border border-[#1a2438] text-sm text-[#cbd5e1] px-3 py-2 font-mono focus:outline-none focus:border-[#3b82f6] transition-colors"
                  style={{ colorScheme: 'dark' }}>
                  <option value="">— select —</option>
                  {resources.map(r => (
                    <option key={r.id} value={r.id}>{icon(r.resource_type)} {r.name} [{r.criticality.toUpperCase()}]</option>
                  ))}
                </select>
              </div>
              {selectedResource && (
                <div className="shrink-0 flex flex-col justify-center text-xs font-mono space-y-1 pt-5">
                  <span style={{ color: CRIT_COLOR[selectedResource.criticality] || '#475569' }} className="font-bold">
                    {selectedResource.criticality.toUpperCase()}
                  </span>
                  {selectedResource.customer_facing && <span className="text-[#ef4444]">⚠ CUST</span>}
                </div>
              )}
            </div>

            {/* Change type buttons */}
            <div className="flex gap-2 flex-wrap">
              {CHANGE_TYPES.map(ct => (
                <button key={ct.value} onClick={() => setChangeType(ct.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-mono font-bold border transition-all flex items-center gap-1.5${changeType === ct.value ? ' btn-active-neon' : ''}`}
                  style={changeType === ct.value
                    ? { background: ct.bg, borderColor: ct.border, color: ct.color, boxShadow: `0 0 8px ${ct.border}33`, ['--pulse-color' as any]: `${ct.color}55` }
                    : { background: 'transparent', borderColor: '#1a2438', color: '#475569' }}>
                  <ct.Icon size={11} />
                  {ct.label}
                </button>
              ))}
            </div>

            {/* Before/after — only for non-delete */}
            {changeType !== 'delete' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-mono text-[#475569] mb-1 uppercase tracking-wider">Before</label>
                  <input value={beforeVal} onChange={e => setBeforeVal(e.target.value)}
                    placeholder='{"memory":1024}'
                    className="w-full rounded-lg bg-[#0d1424] border border-[#1a2438] text-xs text-[#cbd5e1] px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#3b82f6]" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-mono text-[#475569] mb-1 uppercase tracking-wider">After</label>
                  <input value={afterVal} onChange={e => setAfterVal(e.target.value)}
                    placeholder='{"memory":512}'
                    className="w-full rounded-lg bg-[#0d1424] border border-[#1a2438] text-xs text-[#cbd5e1] px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#3b82f6]" />
                </div>
              </div>
            )}

            {error && <div className="text-xs font-mono text-[#ef4444] bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.3)] rounded-lg px-3 py-2">⚠ {error}</div>}

            <button onClick={e => handleAnalyze(e)} disabled={!selectedId || loading}
              className="w-full rounded-lg font-mono font-bold py-2.5 text-sm transition-all"
              style={!selectedId || loading
                ? { background: '#0d1424', border: '1px solid #1a2438', color: '#334155', cursor: 'not-allowed' }
                : { background: selectedCT?.bg, border: `1px solid ${selectedCT?.color}`, color: selectedCT?.color, boxShadow: `0 0 14px ${selectedCT?.color}22` }}>
              {loading
                ? <span className="flex items-center justify-center gap-2"><span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />SCANNING…</span>
                : `⚡ ANALYZE ${changeType.replace('_',' ').toUpperCase()}`}
            </button>
          </div>
        </div>

        {/* Threat Assessment */}
        <div className="flex flex-col overflow-hidden glass-panel-elevated">
          <div className="px-4 py-2.5 border-b border-[rgba(59,130,246,0.12)] shrink-0">
            <span className="header-scan text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.2em]">// Threat Assessment</span>
          </div>
          <div className="flex-1 overflow-hidden p-3">
            {result ? (
              <ThreatHUD
                risk={result.risk}
                blastSummary={result.blast_radius}
                blindSpotCount={result.blind_spots.length}
                historicalCount={result.historical_matches.length}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs font-mono text-[#1a2438] uppercase tracking-widest">
                Awaiting analysis
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── IMPACT REPORT ── */}
      <AnimatePresence>
      {result && (
        <motion.div
          className="flex-1 px-6 py-5 space-y-5 max-w-[1600px] w-full mx-auto"
          key={result.change.target + result.change.change_type}
          ref={particleContainerRef}
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
        >

          {/* Row 1: What is changing */}
          <motion.div
            className="rounded-xl border border-[#1a2438] p-4"
            style={{ background: '#060c17' }}
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22,1,0.36,1] } } }}
          >
            <div className="text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.2em] mb-3"><span className="header-scan">// What Is Changing</span></div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-3xl">{icon(selectedResource?.resource_type || '')}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-base font-mono">{selectedResource?.name}</div>
                <div className="text-xs text-[#475569] font-mono mt-0.5">{selectedResource?.resource_type}</div>
                <div className="text-xs text-[#334155] font-mono truncate mt-0.5">{selectedId}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs px-3 py-1 rounded border font-mono font-bold"
                  style={{ color: selectedCT?.color, background: selectedCT?.bg, borderColor: selectedCT?.border }}>
                  {changeType.replace('_',' ').toUpperCase()}
                </span>
                {result.change.before && (
                  <span className="text-xs px-3 py-1 rounded border border-[#1a2438] text-[#64748b] font-mono" style={{ background: '#0d1424' }}>
                    {JSON.stringify(result.change.before)} → {JSON.stringify(result.change.after)}
                  </span>
                )}
              </div>
            </div>
          </motion.div>

          {/* Row 2: Risk + Blind Spots + Verdict */}
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-3 gap-4"
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22,1,0.36,1] } } }}
          >
            {/* Risk */}
            <div>
              <div className="text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.2em] mb-2"><span className="header-scan">// Risk Score</span></div>
              <RiskBadge risk={result.risk} expanded={signalsExpanded} onToggle={() => setSignalsExpanded(x => !x)} />
            </div>

            {/* Blind Spots */}
            <div>
              <div className="text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.2em] mb-2">
                <span className="header-scan">// Blind Spots</span>
                {result.blind_spots.length > 0 && <span className="text-[#ef4444] ml-2">⚠ {result.blind_spots.length}</span>}
              </div>
              {result.blind_spots.length === 0 ? (
                <div className="rounded-xl border border-[#1a2438] p-4 flex items-center gap-2" style={{ background: '#060c17' }}>
                  <span className="text-[#22c55e]" style={{ textShadow: '0 0 6px #22c55e' }}>✓</span>
                  <span className="text-xs font-mono text-[#22c55e]">No hidden dependencies</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {result.blind_spots.map((bs, i) => (
                    <div key={i} className="rounded-xl border px-3 py-3 text-xs font-mono space-y-1.5 pulse-red"
                      style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.04)' }}>
                      <div className="font-bold text-[#ef4444] truncate">{bs.source_name} → {bs.target_name}</div>
                      <div className="text-[#64748b] text-xs leading-relaxed">{bs.why_hidden}</div>
                      <div className="flex gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded text-xs bg-[rgba(239,68,68,0.1)] text-[#ef4444] border border-[rgba(239,68,68,0.25)]">{(bs.confidence*100).toFixed(0)}%</span>
                        <span className="px-1.5 py-0.5 rounded text-xs bg-[#0d1424] text-[#64748b] border border-[#1a2438]">via {bs.observed_via}</span>
                        {bs.observed_count > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-[rgba(249,115,22,0.08)] text-[#f97316] border border-[rgba(249,115,22,0.25)]">{bs.observed_count.toLocaleString()} calls</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verdict */}
            <div>
              <div className="text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.2em] mb-2"><span className="header-scan">// AI Verdict</span></div>
              <div className="rounded-xl border border-[#1a2438] p-4 space-y-3" style={{ background: '#060c17' }}>
                <p className="text-sm text-[#94a3b8] leading-relaxed">
                  {displayedVerdict}<span className="inline-block w-1.5 h-3 bg-[#3b82f6] ml-0.5 animate-pulse" style={{ verticalAlign: 'middle' }} />
                </p>
                <div className="rounded border border-[rgba(59,130,246,0.2)] px-3 py-2.5" style={{ background: 'rgba(59,130,246,0.04)' }}>
                  <div className="text-xs font-mono text-[#3b82f6] uppercase tracking-widest mb-1.5">Recommendation</div>
                  <div className="text-sm text-[#94a3b8]">{displayedRec}</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Row 3: Blast summary */}
          <motion.div
            className="rounded-xl border border-[#1a2438] p-4"
            style={{ background: '#060c17' }}
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22,1,0.36,1] } } }}
          >
            <div className="text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.2em] mb-3"><span className="header-scan">// Blast Radius Summary</span></div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {[
                { label: 'Resources',    val: result.blast_radius.resources,    color: '#3b82f6' },
                { label: 'Applications', val: result.blast_radius.applications, color: '#8b5cf6' },
                { label: 'Teams',        val: result.blast_radius.teams,        color: '#06b6d4' },
                { label: 'Alarms',       val: result.blast_radius.alarms,       color: '#eab308' },
              ].map(item => (
                <div key={item.label} className="rounded-lg border border-[#1a2438] px-3 py-3 text-center" style={{ background: '#0d1424' }}>
                  <div className="text-2xl font-black font-mono" style={{ color: item.color, textShadow: `0 0 8px ${item.color}55` }}>{item.val}</div>
                  <div className="text-xs font-mono text-[#475569] mt-0.5 uppercase tracking-wider">{item.label}</div>
                </div>
              ))}
              <div className={`rounded-lg border px-3 py-3 text-center ${result.blast_radius.customer_facing ? 'pulse-red' : ''}`}
                style={{ background: result.blast_radius.customer_facing ? 'rgba(239,68,68,0.06)' : '#0d1424',
                         borderColor: result.blast_radius.customer_facing ? 'rgba(239,68,68,0.4)' : '#1a2438' }}>
                <div className="text-xl font-bold" style={{ color: result.blast_radius.customer_facing ? '#ef4444' : '#22c55e' }}>
                  {result.blast_radius.customer_facing ? '⚠' : '✓'}
                </div>
                <div className="text-xs font-mono mt-0.5 uppercase tracking-wider"
                  style={{ color: result.blast_radius.customer_facing ? '#ef4444' : '#22c55e' }}>
                  {result.blast_radius.customer_facing ? 'Customer Impact' : 'No Impact'}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Row 4: Cost Impact */}
          {(() => {
            const nodes = result.affected_nodes.filter(n => n.cost_delta)
            if (!nodes.length) return null
            const total     = nodes.reduce((s, n) => s + n.cost_delta!.monthly_delta_usd, 0)
            const isUp      = total > 0
            const absTotal  = Math.abs(total)
            const tc        = isUp ? '#ef4444' : '#22c55e'
            return (
              <motion.div
                className="rounded-xl border border-[#1a2438] p-4"
                style={{ background: '#060c17' }}
                variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22,1,0.36,1] } } }}
              >
                <div className="text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.2em] mb-3">
                  <span className="header-scan">// Cost Impact</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded border font-mono"
                    style={{ color: tc, borderColor: `${tc}33`, background: `${tc}0a` }}>
                    {isUp ? '+' : '-'}${absTotal.toFixed(2)}/mo
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {nodes.slice(0, 6).map((node, i) => {
                    const cd = node.cost_delta!
                    const c  = cd.monthly_delta_usd > 0 ? '#ef4444' : '#22c55e'
                    return (
                      <div key={i} className="rounded-lg border border-[#1a2438] px-2.5 py-2.5 space-y-1" style={{ background: '#0d1424' }}>
                        <div className="text-xs font-mono text-[#64748b] truncate">{node.name}</div>
                        <div className="text-base font-black font-mono" style={{ color: c }}>
                          {cd.monthly_delta_usd > 0 ? '+' : ''}${Math.abs(cd.monthly_delta_usd).toFixed(0)}
                          <span className="text-xs font-normal text-[#475569]">/mo</span>
                        </div>
                        <div className="text-[10px] font-mono text-[#334155] truncate">{cd.driver.replace(/_/g,' ')}</div>
                        <div className="h-0.5 rounded-full bg-[#1a2438] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100,(Math.abs(cd.monthly_delta_usd)/Math.max(absTotal,1))*100)}%`, background: c }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )
          })()}

          {/* Row 5: Historical + Change Plan */}
          {(result.historical_matches.length > 0 || result.risk.level === 'high' || result.risk.level === 'critical') && (
            <motion.div
              className="grid grid-cols-1 lg:grid-cols-2 gap-4"
              variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22,1,0.36,1] } } }}
            >
              {result.historical_matches.length > 0 && (
                <div>
                  <div className="text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.2em] mb-2"><span className="header-scan">// Historical Precedent</span></div>
                  <div className="space-y-2">
                    {result.historical_matches.slice(0,3).map((m, i) => (
                      <div key={i} className="rounded-xl border border-[#1a2438] px-3 py-3 text-xs font-mono space-y-1.5" style={{ background: '#060c17' }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#eab308]">{m.incident_id}</span>
                          <span className="text-[#334155]">·</span>
                          <span className="text-[#475569] text-xs">{new Date(m.date).toLocaleDateString()}</span>
                          {m.outage_minutes > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-[rgba(239,68,68,0.1)] text-[#ef4444] border border-[rgba(239,68,68,0.2)]">{m.outage_minutes}min outage</span>}
                          <span className="ml-auto px-1.5 py-0.5 rounded text-xs bg-[rgba(59,130,246,0.08)] text-[#3b82f6] border border-[rgba(59,130,246,0.2)]">{(m.similarity*100).toFixed(0)}% match</span>
                        </div>
                        <div className="text-[#64748b] text-xs">{m.root_cause}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(result.risk.level === 'high' || result.risk.level === 'critical') && (
                <div>
                  <div className="text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.2em] mb-2"><span className="header-scan">// Change Plan</span></div>
                  <button onClick={() => setPlanExpanded(x => !x)}
                    className="w-full rounded-lg border font-mono font-bold py-2.5 text-xs transition-all mb-2"
                    style={planExpanded
                      ? { background: 'rgba(59,130,246,0.08)', borderColor: '#3b82f6', color: '#3b82f6' }
                      : { background: '#060c17', borderColor: '#1a2438', color: '#475569' }}>
                    {planExpanded ? '▲ HIDE PLAN' : `▼ SHOW ${result.change_plan.length}-STEP CHANGE PLAN`}
                  </button>
                  {planExpanded && (
                    <div className="space-y-1.5">
                      {result.change_plan.map((step, i) => (
                        <label key={i} className="flex items-start gap-2.5 rounded-lg border border-[#1a2438] px-3 py-2.5 cursor-pointer group hover:border-[rgba(59,130,246,0.3)] transition-colors" style={{ background: '#060c17' }}>
                          <input type="checkbox" className="mt-0.5 accent-[#3b82f6]" />
                          <span className="text-xs font-mono text-[#94a3b8] group-has-[:checked]:line-through group-has-[:checked]:text-[#334155]">
                            <span className="text-[#334155] mr-1.5">{String(i+1).padStart(2,'0')}.</span>{step}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
        {chatOpen && result && (
          <ChatPanel result={result} onClose={() => setChatOpen(false)} />
        )}
      </AnimatePresence>

      {/* Scan complete badge */}
      {scanBadge && (
        <div className="fixed bottom-6 left-6 z-50 scan-badge flex items-center gap-2 text-[11px] font-mono px-3 py-1.5 rounded-full border border-[rgba(34,197,94,0.4)] text-[#22c55e]"
          style={{ background: 'rgba(34,197,94,0.08)', backdropFilter: 'blur(8px)' }}>
          <div className="beacon" />
          SCAN COMPLETE
        </div>
      )}
    </div>
  )
}
