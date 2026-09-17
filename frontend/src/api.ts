import type { AnalysisResult, ChangeRequest, GraphData, Resource } from './types'

const BASE = '/api'

export async function fetchResources(): Promise<Resource[]> {
  const res = await fetch(`${BASE}/resources`)
  const data = await res.json()
  return data.resources
}

export async function analyzeChange(req: ChangeRequest): Promise<AnalysisResult> {
  const res = await fetch(`${BASE}/change/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Analysis failed')
  }
  return res.json()
}

export async function fetchGraph(resourceId: string, hops = 2): Promise<GraphData> {
  const res = await fetch(`${BASE}/graph/${encodeURIComponent(resourceId)}?hops=${hops}`)
  if (!res.ok) throw new Error('Graph fetch failed')
  return res.json()
}
