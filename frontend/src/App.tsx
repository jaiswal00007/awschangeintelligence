import { useState, useEffect } from 'react'
import { fetchResources, analyzeChange, fetchGraph } from './api'
import type { Resource, AnalysisResult, GraphData } from './types'
import { RiskBadge } from './components/RiskBadge'
import { DependencyGraph } from './components/DependencyGraph'

const CHANGE_TYPES = [
  { value: 'delete', label: 'Delete' },
  { value: 'downsize', label: 'Downsize' },
  { value: 'config_change', label: 'Config Change' },
  { value: 'scale', label: 'Scale' },
  { value: 'iam_change', label: 'IAM Change' },
]

const RESOURCE_TYPE_ICON: Record<string, string> = {
  'AWS::Lambda::Function': '⚡',
  'AWS::RDS::DBInstance': '🗄️',
  'AWS::ApiGateway::RestApi': '🌐',
  'AWS::SQS::Queue': '📬',
  'AWS::DynamoDB::Table': '⚡',
  'AWS::SecretsManager::Secret': '🔑',
}

function icon(rt: string) {
  return RESOURCE_TYPE_ICON[rt] || '☁️'
}

export default function App() {
  const [resources, setResources] = useState<Resource[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [changeType, setChangeType] = useState('delete')
  const [beforeVal, setBeforeVal] = useState('')
  const [afterVal, setAfterVal] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [error, setError] = useState('')
  const [signalsExpanded, setSignalsExpanded] = useState(false)
  const [planExpanded, setPlanExpanded] = useState(false)

  useEffect(() => {
    fetchResources().then(setResources).catch(() => setError('Could not load resources — is the backend running?'))
  }, [])

  const selectedResource = resources.find(r => r.id === selectedId)

  async function handleAnalyze() {
    if (!selectedId) return
    setLoading(true)
    setError('')
    setResult(null)
    setGraphData(null)
    try {
      const req = {
        target: selectedId,
        change_type: changeType,
        before: beforeVal ? JSON.parse(beforeVal) : null,
        after: afterVal ? JSON.parse(afterVal) : null,
      }
      const [analysis, graph] = await Promise.all([
        analyzeChange(req),
        fetchGraph(selectedId, 3),
      ])
      setResult(analysis)
      setGraphData(graph)
    } catch (e: any) {
      setError(e.message || 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f1117' }}>
      <header className="border-b border-slate-800 px-8 py-4 flex items-center gap-3">
        <div className="text-xl font-bold text-white">⚡ AWS Change Intelligence</div>
        <div className="text-xs text-slate-500 ml-2">Know the impact before you make the change</div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">

        {/* ── LEFT: Change Composer ── */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">
              Change Composer
            </h2>

            {/* Resource picker */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Resource</label>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-2.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select a resource…</option>
                {resources.map(r => (
                  <option key={r.id} value={r.id}>
                    {icon(r.resource_type)} {r.name} [{r.criticality}]
                  </option>
                ))}
              </select>
            </div>

            {selectedResource && (
              <div className="text-xs text-slate-500 space-y-0.5 bg-slate-800 rounded-lg px-3 py-2">
                <div><span className="text-slate-400">Type:</span> {selectedResource.resource_type}</div>
                <div><span className="text-slate-400">Criticality:</span> {selectedResource.criticality}</div>
                {selectedResource.customer_facing && (
                  <div className="text-orange-400">⚠ Customer-facing</div>
                )}
              </div>
            )}

            {/* Change type */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Change Type</label>
              <div className="grid grid-cols-2 gap-2">
                {CHANGE_TYPES.map(ct => (
                  <button
                    key={ct.value}
                    onClick={() => setChangeType(ct.value)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${
                      changeType === ct.value
                        ? ct.value === 'delete'
                          ? 'bg-red-900 border-red-500 text-red-200'
                          : 'bg-indigo-900 border-indigo-500 text-indigo-200'
                        : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400'
                    }`}
                  >
                    {ct.value === 'delete' && changeType === 'delete' ? '🗑 ' : ''}{ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Before/After — shown for non-delete */}
            {changeType !== 'delete' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Before (JSON, e.g. {`{"memory": 1024}`})
                  </label>
                  <textarea
                    rows={2}
                    value={beforeVal}
                    onChange={e => setBeforeVal(e.target.value)}
                    placeholder='{"memory": 1024}'
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 text-xs text-slate-200 px-3 py-2 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">After (JSON)</label>
                  <textarea
                    rows={2}
                    value={afterVal}
                    onChange={e => setAfterVal(e.target.value)}
                    placeholder='{"memory": 512}'
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 text-xs text-slate-200 px-3 py-2 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={!selectedId || loading}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 text-sm transition-colors"
            >
              {loading ? 'Building impact graph…' : '⚡ Analyze Impact'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Impact View ── */}
        <div className="space-y-6">
          {!result && !loading && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 flex flex-col items-center justify-center text-center gap-4">
              <div className="text-4xl">🔍</div>
              <div className="text-slate-400 text-sm">
                Select a resource and change type, then click Analyze Impact.
              </div>
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-slate-400 text-sm">Building impact graph…</div>
            </div>
          )}

          {result && (
            <>
              {/* Card A: What is changing */}
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
                <div className="text-xs uppercase tracking-widest font-semibold text-slate-500 mb-4">
                  What is changing
                </div>
                <div className="flex items-start gap-4">
                  <div className="text-3xl">{icon(selectedResource?.resource_type || '')}</div>
                  <div className="space-y-1">
                    <div className="font-semibold text-white">{selectedResource?.name}</div>
                    <div className="text-xs text-slate-400">{selectedResource?.resource_type}</div>
                    <div className="text-xs text-slate-500 font-mono truncate max-w-xl">{selectedId}</div>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                    changeType === 'delete' ? 'bg-red-900 text-red-300' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {changeType.replace('_', ' ').toUpperCase()}
                  </span>
                  {result.change.before && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-mono">
                      {JSON.stringify(result.change.before)} → {JSON.stringify(result.change.after)}
                    </span>
                  )}
                </div>
              </div>

              {/* Card B: What it affects */}
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-5">
                <div className="text-xs uppercase tracking-widest font-semibold text-slate-500">
                  What it affects
                </div>

                {/* Blast radius summary */}
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: 'Resources', val: result.blast_radius.resources },
                    { label: 'Apps', val: result.blast_radius.applications },
                    { label: 'Teams', val: result.blast_radius.teams },
                    { label: 'Alarms', val: result.blast_radius.alarms },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-800 rounded-lg px-3 py-3 text-center">
                      <div className="text-2xl font-bold text-white">{item.val}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{item.label}</div>
                    </div>
                  ))}
                  <div className={`rounded-lg px-3 py-3 text-center ${
                    result.blast_radius.customer_facing
                      ? 'bg-red-950 border border-red-700'
                      : 'bg-slate-800'
                  }`}>
                    <div className="text-2xl font-bold">
                      {result.blast_radius.customer_facing ? '⚠' : '✓'}
                    </div>
                    <div className={`text-xs mt-0.5 ${
                      result.blast_radius.customer_facing ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {result.blast_radius.customer_facing ? 'Customer-facing' : 'No customer impact'}
                    </div>
                  </div>
                </div>

                {/* Blind spots */}
                {result.blind_spots.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-red-400 font-semibold uppercase tracking-wide">
                      ⚠ {result.blind_spots.length} Hidden Dependenc{result.blind_spots.length > 1 ? 'ies' : 'y'} Detected
                    </div>
                    {result.blind_spots.map((bs, i) => (
                      <div key={i} className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-xs space-y-1">
                        <div className="font-semibold text-red-300">
                          {bs.source_name} → {bs.target_name}
                        </div>
                        <div className="text-red-400">{bs.why_hidden}</div>
                        <div className="text-slate-400">
                          Confidence: {(bs.confidence * 100).toFixed(0)}% · Via: {bs.observed_via}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Graph */}
                {graphData && (
                  <DependencyGraph data={graphData} targetId={selectedId} />
                )}
              </div>

              {/* Card C: Should I do it? */}
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-5">
                <div className="text-xs uppercase tracking-widest font-semibold text-slate-500">
                  Should I do it?
                </div>

                <RiskBadge
                  risk={result.risk}
                  expanded={signalsExpanded}
                  onToggle={() => setSignalsExpanded(x => !x)}
                />

                <div className="space-y-1">
                  <div className="font-semibold text-white">{result.verdict}</div>
                </div>

                {result.historical_matches.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">
                      Historical Precedent
                    </div>
                    {result.historical_matches.slice(0, 2).map((m, i) => (
                      <div key={i} className="bg-slate-800 rounded-lg px-4 py-3 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-400">{m.incident_id}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-400">{new Date(m.date).toLocaleDateString()}</span>
                          {m.outage_minutes > 0 && (
                            <span className="bg-red-900 text-red-300 px-2 py-0.5 rounded text-xs font-semibold">
                              {m.outage_minutes} min outage
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400">{m.root_cause}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-indigo-950 border border-indigo-700 rounded-lg px-4 py-3">
                  <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wide mb-1">
                    Recommendation
                  </div>
                  <div className="text-sm text-indigo-200">{result.recommendation}</div>
                </div>

                {(result.risk.level === 'high' || result.risk.level === 'critical') && (
                  <div>
                    <button
                      onClick={() => setPlanExpanded(x => !x)}
                      className="w-full rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-3 text-sm transition-colors"
                    >
                      {planExpanded ? 'Hide Change Plan' : '📋 Generate Change Plan'}
                    </button>

                    {planExpanded && result.change_plan.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">
                          Change Plan — {result.change_plan.length} steps
                        </div>
                        {result.change_plan.map((step, i) => (
                          <label key={i} className="flex items-start gap-3 bg-slate-800 rounded-lg px-4 py-3 cursor-pointer group">
                            <input type="checkbox" className="mt-0.5 accent-indigo-500" />
                            <span className="text-xs text-slate-300 group-has-[:checked]:line-through group-has-[:checked]:text-slate-500">
                              <span className="font-mono text-slate-500 mr-2">{i + 1}.</span>
                              {step}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
