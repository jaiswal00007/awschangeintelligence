import { useEffect, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { GraphData, GraphNode, GraphEdge } from '../types'

const CRIT_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  unknown: '#64748b',
}

const NODE_TYPE_COLORS: Record<string, string> = {
  application: '#6366f1',
  team: '#8b5cf6',
  alarm: '#f59e0b',
  customer: '#ec4899',
  resource: '#64748b',
}

interface Props {
  data: GraphData
  targetId: string
}

export function DependencyGraph({ data, targetId }: Props) {
  const fgRef = useRef<any>(null)

  useEffect(() => {
    if (fgRef.current) {
      setTimeout(() => fgRef.current?.zoomToFit(400), 300)
    }
  }, [data])

  const graphData = {
    nodes: data.nodes.map((n: GraphNode) => ({
      id: n.id,
      name: n.name,
      node_type: n.node_type,
      criticality: n.criticality,
      resource_type: n.resource_type,
      isTarget: n.id === targetId,
    })),
    links: data.edges.map((e: GraphEdge) => ({
      source: e.source,
      target: e.target,
      relation: e.relation,
      is_blind_spot: e.is_blind_spot,
      confidence: e.confidence,
      observed_count: e.observed_count,
      provenance: e.provenance,
    })),
  }

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden bg-slate-950">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={560}
        height={380}
        backgroundColor="#0a0c14"
        nodeLabel={(node: any) => `${node.name} (${node.resource_type || node.node_type})`}
        nodeColor={(node: any) => {
          if (node.isTarget) return '#ffffff'
          const typeColor = NODE_TYPE_COLORS[node.node_type]
          if (typeColor && node.node_type !== 'resource') return typeColor
          return CRIT_COLORS[node.criticality] || CRIT_COLORS.unknown
        }}
        nodeRelSize={5}
        nodeVal={(node: any) => (node.isTarget ? 3 : 1)}
        linkColor={(link: any) => (link.is_blind_spot ? '#ef4444' : '#334155')}
        linkWidth={(link: any) => (link.is_blind_spot ? 2.5 : 1)}
        linkLineDash={(link: any) => (link.is_blind_spot ? [4, 3] : null)}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkLabel={(link: any) => {
          const prov = Array.isArray(link.provenance) ? link.provenance.join(', ') : ''
          const blind = link.is_blind_spot ? ' ⚠ BLIND SPOT' : ''
          return `${link.relation} [${prov}] confidence: ${(link.confidence * 100).toFixed(0)}%${blind}`
        }}
        cooldownTicks={80}
      />
      <div className="px-4 py-2 flex flex-wrap gap-4 text-xs border-t border-slate-800">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-red-500 inline-block border-dashed border" />
          Blind spot (observed, not declared)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-slate-600 inline-block" />
          Declared dependency
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-white inline-block" />
          Target
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
          Critical
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />
          Application
        </span>
      </div>
    </div>
  )
}
