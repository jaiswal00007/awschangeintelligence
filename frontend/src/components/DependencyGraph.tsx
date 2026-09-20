import { useEffect, useRef, useState, useCallback } from 'react'
import { ForceGraph3D } from 'react-force-graph'
import * as THREE from 'three'
import type { GraphData, GraphNode, GraphEdge, AffectedNode, BlastRadiusSummary } from '../types'

const HOP_COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6']

const NODE_TYPE_COLOR: Record<string, string> = {
  application: '#8b5cf6',
  team: '#06b6d4',
  alarm: '#eab308',
  customer: '#ef4444',
}

interface Props {
  data: GraphData
  targetId: string
  blastSummary?: BlastRadiusSummary
  affectedNodes?: AffectedNode[]
  blindSpotCount?: number
  onHopsChange?: (hops: number) => Promise<void>
  initialHops?: number
  onNodeClick?: (nodeId: string) => void
}

export function DependencyGraph({
  data,
  targetId,
  blastSummary,
  affectedNodes = [],
  blindSpotCount = 0,
  onHopsChange,
  initialHops = 3,
  onNodeClick,
}: Props) {
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 500 })
  const [hops, setHops] = useState(initialHops)
  const [hopsLoading, setHopsLoading] = useState(false)
  const [highlightBlast, setHighlightBlast] = useState(true)

  // Measure real container size
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Derived maps
  const blastIds = new Set(affectedNodes.map(n => n.node_id))
  blastIds.add(targetId)

  const affectedNodesMap: Record<string, AffectedNode> = {}
  affectedNodes.forEach(n => { affectedNodesMap[n.node_id] = n })

  const inDegree: Record<string, number> = {}
  data.edges.forEach((e: GraphEdge) => {
    inDegree[e.target] = (inDegree[e.target] || 0) + 1
  })

  const nodeColor = useCallback((node: any): string => {
    if (node.isTarget) return '#ffffff'
    if (highlightBlast && !blastIds.has(node.id)) return '#0a1020'
    const typeColor = NODE_TYPE_COLOR[node.node_type]
    if (typeColor) return typeColor
    const hop = affectedNodesMap[node.id]?.hop_distance ?? 1
    return HOP_COLORS[Math.min(hop - 1, HOP_COLORS.length - 1)]
  }, [highlightBlast, blastIds, affectedNodesMap])

  const nodeVal = useCallback((node: any): number => {
    if (node.isTarget) return 50
    const deg = inDegree[node.id] || 0
    const base = blastIds.has(node.id) ? 8 : 2
    return base + deg * 2
  }, [inDegree, blastIds])

  const nodeThreeObject = useCallback((node: any) => {
    if (!node.isTarget) return new THREE.Object3D()
    const group = new THREE.Group()
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 })
    group.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 16), coreMat))
    const rings = [
      { inner: 14, outer: 16, opacity: 0.8 },
      { inner: 20, outer: 21.5, opacity: 0.4 },
      { inner: 27, outer: 28, opacity: 0.15 },
    ]
    rings.forEach(r => {
      group.add(new THREE.Mesh(
        new THREE.RingGeometry(r.inner, r.outer, 48),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide, transparent: true, opacity: r.opacity })
      ))
    })
    return group
  }, [])

  const linkColor = useCallback((link: any): string => {
    if (link.is_blind_spot) return '#ef4444'
    if (highlightBlast) {
      const src = typeof link.source === 'object' ? link.source.id : link.source
      const tgt = typeof link.target === 'object' ? link.target.id : link.target
      if (!blastIds.has(src) && !blastIds.has(tgt)) return '#0a1020'
    }
    const conf = link.confidence || 0.5
    const g = Math.round(58 + conf * 107)
    const b = Math.round(95 + conf * 139)
    return `rgb(14,${g},${b})`
  }, [highlightBlast, blastIds])

  const linkWidth = useCallback((link: any): number => {
    if (link.is_blind_spot) return 3
    return Math.max(0.5, Math.min(4, Math.log((link.observed_count || 1) + 1) * 0.7))
  }, [])

  const particleCount = useCallback((link: any): number => {
    if (link.is_blind_spot) return 6
    if ((link.observed_count || 0) > 1000) return 4
    if ((link.observed_count || 0) > 100) return 2
    return 0
  }, [])

  useEffect(() => {
    if (fgRef.current) {
      setTimeout(() => fgRef.current?.zoomToFit?.(800, 60), 600)
    }
  }, [data, dims])

  const handleHopsChange = async (val: number) => {
    setHops(val)
    if (onHopsChange) {
      setHopsLoading(true)
      try { await onHopsChange(val) } finally { setHopsLoading(false) }
    }
  }

  const graphData = {
    nodes: data.nodes.map((n: GraphNode) => ({
      id: n.id,
      name: n.name,
      node_type: n.node_type,
      resource_type: n.resource_type,
      criticality: n.criticality,
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

  const toggleStyle = (active: boolean) =>
    active
      ? 'border-[#3b82f6] text-[#3b82f6] bg-[rgba(59,130,246,0.1)]'
      : 'border-[#1a2438] text-[#475569] hover:border-[#475569]'

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ background: '#020408' }}>
      {/* Controls bar — compact single row */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-2 border-b border-[#ffffff08] overflow-x-auto"
        style={{ background: 'rgba(2,4,8,0.75)', backdropFilter: 'blur(10px)' }}>
        {/* Hops */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Hops</span>
          <input
            type="range" min={1} max={5} value={hops}
            className="hop-slider w-24"
            style={{ '--pct': `${((hops - 1) / 4) * 100}%` } as any}
            onChange={e => handleHopsChange(Number(e.target.value))}
          />
          <span className="text-[10px] font-mono text-[#00f5ff] w-3 text-center">
            {hopsLoading ? '…' : hops}
          </span>
        </div>

        <div className="w-px h-3 bg-[#1e2535] shrink-0" />

        <button onClick={() => setHighlightBlast(x => !x)}
          className={`text-[10px] px-2 py-0.5 rounded border font-mono transition-all shrink-0 ${toggleStyle(highlightBlast)}`}>
          {highlightBlast ? '■' : '□'} Blast highlight
        </button>

        {/* Legend — pushed right */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {[
            { color: '#ffffff', label: 'Target' },
            { color: '#ef4444', label: 'Hop 1' },
            { color: '#f97316', label: 'Hop 2' },
            { color: '#eab308', label: 'Hop 3+' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1 text-[10px] font-mono text-slate-500">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 5px ${color}` }} />
              {label}
            </span>
          ))}
          {blindSpotCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-[#ff003c]">
              <span className="w-5 h-0.5 inline-block" style={{ background: '#ff003c', boxShadow: '0 0 4px #ff003c' }} />
              Blind spot
            </span>
          )}
        </div>
      </div>

      {/* 3D Graph — fills container minus controls bar */}
      <div className="absolute inset-0 top-9">
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          width={dims.w}
          height={dims.h - 36}
          backgroundColor="#020408"
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeRelSize={4}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={true}
          nodeLabel={(node: any) => {
            const hop = affectedNodesMap[node.id]?.hop_distance
            return `<div style="background:rgba(5,8,16,0.95);border:1px solid #1e2535;padding:5px 9px;border-radius:5px;font-family:monospace;font-size:11px;color:#e2e8f0;max-width:220px">
              <b style="color:#00f5ff">${node.name}</b><br/>
              <span style="color:#64748b">${node.resource_type || node.node_type}</span>${hop ? `<span style="color:#ffd200"> · hop ${hop}</span>` : ''}
            </div>`
          }}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.88}
          linkDirectionalArrowColor={linkColor}
          linkDirectionalParticles={particleCount}
          linkDirectionalParticleWidth={(link: any) => link.is_blind_spot ? 3 : 2}
          linkDirectionalParticleColor={(link: any) => link.is_blind_spot ? '#ef4444' : '#3b82f6'}
          linkDirectionalParticleSpeed={(link: any) => link.is_blind_spot ? 0.008 : 0.004}
          onNodeClick={(node: any) => onNodeClick?.(node.id)}
          enableNodeDrag={true}
          enableNavigationControls={true}
          showNavInfo={false}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          cooldownTicks={150}
          controlType="orbit"
        />
      </div>

      {/* Blast counters — bottom left, above the floating composer */}
      {blastSummary && (
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 z-10 pointer-events-none">
          {[
            { label: 'Resources', val: blastSummary.resources, color: '#00f5ff' },
            { label: 'Apps', val: blastSummary.applications, color: '#7c3aed' },
            { label: 'Teams', val: blastSummary.teams, color: '#bf00ff' },
            { label: 'Alarms', val: blastSummary.alarms, color: '#ffd200' },
          ].filter(i => i.val > 0).map(item => (
            <div key={item.label}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono"
              style={{ background: 'rgba(2,4,8,0.88)', border: '1px solid #1a2438' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: item.color }} />
              <span style={{ color: item.color }}>{item.val}</span>
              <span className="text-slate-600">{item.label}</span>
            </div>
          ))}
          {blastSummary.customer_facing && (
            <div className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono"
              style={{ background: 'rgba(255,0,60,0.1)', border: '1px solid rgba(255,0,60,0.4)' }}>
              <span className="text-[#ff003c]">⚠ CUSTOMER</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
