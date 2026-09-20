import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { GraphData, GraphNode, GraphEdge, AffectedNode, BlastRadiusSummary } from '../types'

/* ── Color palette ─────────────────────────────────────── */

const HOP_COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6']
const TYPE_COLORS: Record<string, string> = {
  application: '#8b5cf6',
  team: '#06b6d4',
  alarm: '#eab308',
  customer: '#ef4444',
}

function nodeHex(
  node: GraphNode,
  targetId: string,
  blastIds: Set<string>,
  affectedMap: Record<string, AffectedNode>,
  highlightBlast: boolean,
): string {
  if (node.id === targetId) return '#ffffff'
  if (highlightBlast && !blastIds.has(node.id)) return '#0a1020'
  const tc = TYPE_COLORS[node.node_type]
  if (tc) return tc
  const hop = affectedMap[node.id]?.hop_distance ?? 1
  return HOP_COLORS[Math.min(hop - 1, HOP_COLORS.length - 1)]
}

function edgeHex(
  edge: GraphEdge,
  blastIds: Set<string>,
  highlightBlast: boolean,
): { color: string; intensity: number } {
  if (edge.is_blind_spot) return { color: '#ef4444', intensity: 0.7 }
  const srcIn = blastIds.has(edge.source)
  const tgtIn = blastIds.has(edge.target)
  if (highlightBlast && !srcIn && !tgtIn) return { color: '#1a2438', intensity: 0.03 }
  const conf = edge.confidence ?? 0.5
  return { color: '#3b82f6', intensity: 0.12 + conf * 0.35 }
}

/* ── 3D graph scene ─────────────────────────────────────── */

interface SceneProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  targetId: string
  blastIds: Set<string>
  affectedMap: Record<string, AffectedNode>
  highlightBlast: boolean
  positions: Map<string, THREE.Vector3>
  focusTarget: THREE.Vector3 | null
  onNodeClick: (id: string) => void
}

/* Camera fly-to animation */
function CameraFly({ target, controlsRef }: {
  target: THREE.Vector3 | null
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
  const { camera } = useThree()
  const dest = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null)
  const progress = useRef(1)

  useEffect(() => {
    if (!target) return
    const look = target.clone()
    const pos = target.clone().add(new THREE.Vector3(80, 60, 150))
    dest.current = { pos, look }
    progress.current = 0
  }, [target])

  useFrame(() => {
    if (!dest.current || progress.current >= 1) return
    progress.current = Math.min(1, progress.current + 0.025)
    const t = 1 - Math.pow(1 - progress.current, 3)
    camera.position.lerp(dest.current.pos, t * 0.08)
    const ctrl = controlsRef.current
    if (ctrl) {
      ctrl.target.lerp(dest.current.look, t * 0.08)
      ctrl.update()
    }
  })
  return null
}

/* Idle auto-rotate after 60 s */
function IdleRotate({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsImpl | null> }) {
  const last = useRef(Date.now())
  const reset = useCallback(() => {
    last.current = Date.now()
    if (controlsRef.current) controlsRef.current.autoRotate = false
  }, [controlsRef])

  useEffect(() => {
    const c = document.querySelector('canvas')
    if (!c) return
    c.addEventListener('pointerdown', reset)
    c.addEventListener('wheel', reset)
    return () => { c.removeEventListener('pointerdown', reset); c.removeEventListener('wheel', reset) }
  }, [reset])

  useFrame(() => {
    if (!controlsRef.current) return
    controlsRef.current.autoRotate = Date.now() - last.current > 60_000
  })
  return null
}

/* Instanced spheres for all nodes */
function NodeSpheres({ nodes, targetId, blastIds, affectedMap, highlightBlast, positions, onClick }: {
  nodes: GraphNode[]
  targetId: string
  blastIds: Set<string>
  affectedMap: Record<string, AffectedNode>
  highlightBlast: boolean
  positions: Map<string, THREE.Vector3>
  onClick: (id: string) => void
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const temp = useMemo(() => new THREE.Object3D(), [])
  const tempColor = useMemo(() => new THREE.Color(), [])

  const colors = useMemo(() => {
    const arr = new Float32Array(nodes.length * 3)
    for (let i = 0; i < nodes.length; i++) {
      const hex = nodeHex(nodes[i], targetId, blastIds, affectedMap, highlightBlast)
      tempColor.set(hex)
      // Boost highlighted nodes above 1 so Bloom picks them up as corona
      const isTarget = nodes[i].id === targetId
      const isBlast = blastIds.has(nodes[i].id)
      const boost = isTarget ? 2.2 : (isBlast ? 1.4 : 0.15)
      arr[i * 3]     = tempColor.r * boost
      arr[i * 3 + 1] = tempColor.g * boost
      arr[i * 3 + 2] = tempColor.b * boost
    }
    return arr
  }, [nodes, targetId, blastIds, affectedMap, highlightBlast, tempColor])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]
      const pos = positions.get(n.id) ?? new THREE.Vector3(0, 0, 0)
      temp.position.copy(pos)
      const isTarget = n.id === targetId
      const isBlast = blastIds.has(n.id)
      const s = isTarget ? 14 : (isBlast ? 5 + (affectedMap[n.id]?.hop_distance ?? 1) : 2)
      temp.scale.set(s, s, s)
      temp.updateMatrix()
      mesh.setMatrixAt(i, temp.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [nodes, positions, targetId, blastIds, affectedMap, temp])

  return (
    <instancedMesh
      key={nodes.length}
      ref={meshRef}
      args={[undefined, undefined, nodes.length]}
      frustumCulled={false}
      onClick={(e) => {
        e.stopPropagation()
        if (e.instanceId !== undefined) onClick(nodes[e.instanceId].id)
      }}
    >
      <sphereGeometry args={[1, 20, 14]} />
      <meshBasicMaterial vertexColors toneMapped={false} />
      <instancedBufferAttribute attach="geometry-attributes-color" args={[colors, 3]} />
    </instancedMesh>
  )
}

/* Target node concentric ring halo */
function TargetHalo({ pos }: { pos: THREE.Vector3 }) {
  const groupRef = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.rotation.z = clock.getElapsedTime() * 0.3
    groupRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.4) * 0.15
  })
  return (
    <group ref={groupRef} position={pos}>
      {[
        { inner: 18, outer: 20, opacity: 0.7 },
        { inner: 25, outer: 26.5, opacity: 0.35 },
        { inner: 33, outer: 34.5, opacity: 0.15 },
      ].map((r, i) => (
        <mesh key={i}>
          <ringGeometry args={[r.inner, r.outer, 64]} />
          <meshBasicMaterial
            color={0x3b82f6}
            side={THREE.DoubleSide}
            transparent
            opacity={r.opacity}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

/* Additive-blended line segments for edges */
function EdgeLines({ edges, blastIds, highlightBlast, positions }: {
  edges: GraphEdge[]
  blastIds: Set<string>
  highlightBlast: boolean
  positions: Map<string, THREE.Vector3>
}) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(edges.length * 6)
    const col = new Float32Array(edges.length * 6)
    let count = 0

    for (const edge of edges) {
      const s = positions.get(edge.source)
      const t = positions.get(edge.target)
      if (!s || !t) continue
      const { color, intensity } = edgeHex(edge, blastIds, highlightBlast)
      const c = new THREE.Color(color)
      const off = count * 6
      pos[off] = s.x; pos[off + 1] = s.y; pos[off + 2] = s.z
      pos[off + 3] = t.x; pos[off + 4] = t.y; pos[off + 5] = t.z
      col[off] = c.r * intensity; col[off + 1] = c.g * intensity; col[off + 2] = c.b * intensity
      col[off + 3] = c.r * intensity; col[off + 4] = c.g * intensity; col[off + 5] = c.b * intensity
      count++
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, count * 6), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col.slice(0, count * 6), 3))
    return geo
  }, [edges, blastIds, highlightBlast, positions])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={1} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </lineSegments>
  )
}

function Scene({
  nodes, edges, targetId, blastIds, affectedMap, highlightBlast, positions, focusTarget, onNodeClick,
}: SceneProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const targetPos = positions.get(targetId)

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[400, 400, 400]} intensity={0.5} />
      <pointLight position={[-300, -200, -300]} intensity={0.3} color="#4040ff" />

      <EdgeLines edges={edges} blastIds={blastIds} highlightBlast={highlightBlast} positions={positions} />
      <NodeSpheres
        nodes={nodes}
        targetId={targetId}
        blastIds={blastIds}
        affectedMap={affectedMap}
        highlightBlast={highlightBlast}
        positions={positions}
        onClick={onNodeClick}
      />
      {targetPos && <TargetHalo pos={targetPos} />}

      <CameraFly target={focusTarget} controlsRef={controlsRef} />
      <IdleRotate controlsRef={controlsRef} />

      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.25} luminanceSmoothing={0.7} intensity={1.8} mipmapBlur radius={0.6} />
      </EffectComposer>

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        zoomSpeed={1.4}
        minDistance={20}
        maxDistance={8000}
        autoRotateSpeed={0.35}
      />
    </>
  )
}

/* ── Force layout (simple repulsion + spring) ─────────── */

function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  targetId: string,
): Map<string, THREE.Vector3> {
  const positions = new Map<string, THREE.Vector3>()
  const velocities = new Map<string, THREE.Vector3>()

  // Seed positions — target at center, others random sphere
  for (const n of nodes) {
    if (n.id === targetId) {
      positions.set(n.id, new THREE.Vector3(0, 0, 0))
    } else {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 150 + Math.random() * 300
      positions.set(n.id, new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      ))
    }
    velocities.set(n.id, new THREE.Vector3())
  }

  const REPULSE = 18000
  const SPRING_K = 0.05
  const REST_LEN = 80
  const DAMP = 0.75

  for (let iter = 0; iter < 120; iter++) {
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const pi = positions.get(nodes[i].id)!
        const pj = positions.get(nodes[j].id)!
        const diff = pi.clone().sub(pj)
        const dist = Math.max(diff.length(), 1)
        const f = REPULSE / (dist * dist)
        diff.normalize().multiplyScalar(f)
        velocities.get(nodes[i].id)!.add(diff)
        velocities.get(nodes[j].id)!.sub(diff)
      }
    }
    // Spring attraction
    for (const e of edges) {
      const ps = positions.get(e.source)
      const pt = positions.get(e.target)
      if (!ps || !pt) continue
      const diff = pt.clone().sub(ps)
      const dist = Math.max(diff.length(), 1)
      const f = SPRING_K * (dist - REST_LEN)
      diff.normalize().multiplyScalar(f)
      velocities.get(e.source)!.add(diff)
      velocities.get(e.target)!.sub(diff)
    }
    // Apply + damp
    for (const n of nodes) {
      const v = velocities.get(n.id)!
      v.multiplyScalar(DAMP)
      positions.get(n.id)!.add(v)
    }
    // Pin target at origin
    positions.set(targetId, new THREE.Vector3(0, 0, 0))
  }

  return positions
}

/* ── Public component ───────────────────────────────────── */

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
  const [hops, setHops] = useState(initialHops)
  const [hopsLoading, setHopsLoading] = useState(false)
  const [highlightBlast, setHighlightBlast] = useState(true)
  const [focusTarget, setFocusTarget] = useState<THREE.Vector3 | null>(null)

  const blastIds = useMemo(() => {
    const s = new Set(affectedNodes.map(n => n.node_id))
    s.add(targetId)
    return s
  }, [affectedNodes, targetId])

  const affectedMap = useMemo(() => {
    const m: Record<string, AffectedNode> = {}
    affectedNodes.forEach(n => { m[n.node_id] = n })
    return m
  }, [affectedNodes])

  const positions = useMemo(
    () => computeLayout(data.nodes, data.edges, targetId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.nodes.length, data.edges.length, targetId],
  )

  const handleNodeClick = useCallback((id: string) => {
    const pos = positions.get(id)
    if (pos) setFocusTarget(pos.clone())
    onNodeClick?.(id)
  }, [positions, onNodeClick])

  const handleHopsChange = async (val: number) => {
    setHops(val)
    if (onHopsChange) {
      setHopsLoading(true)
      try { await onHopsChange(val) } finally { setHopsLoading(false) }
    }
  }

  const toggleStyle = (active: boolean) =>
    active
      ? 'border-[#3b82f6] text-[#3b82f6] bg-[rgba(59,130,246,0.1)]'
      : 'border-[#1a2438] text-[#475569] hover:border-[#475569]'

  return (
    <div className="w-full h-full relative" style={{ background: '#06090f' }}>
      {/* Controls bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-1.5 border-b border-[#ffffff08] overflow-x-auto"
        style={{ background: 'rgba(6,9,15,0.8)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Hops</span>
          <input
            type="range" min={1} max={5} value={hops}
            className="hop-slider w-24"
            style={{ '--pct': `${((hops - 1) / 4) * 100}%` } as React.CSSProperties}
            onChange={e => handleHopsChange(Number(e.target.value))}
          />
          <span className="text-[10px] font-mono text-[#3b82f6] w-3 text-center">
            {hopsLoading ? '…' : hops}
          </span>
        </div>

        <div className="w-px h-3 bg-[#1e2535] shrink-0" />

        <button onClick={() => setHighlightBlast(x => !x)}
          className={`text-[10px] px-2 py-0.5 rounded border font-mono transition-all shrink-0 ${toggleStyle(highlightBlast)}`}>
          {highlightBlast ? '■' : '□'} Blast
        </button>

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
            <span className="flex items-center gap-1 text-[10px] font-mono text-[#ef4444]">
              <span className="w-5 h-0.5 inline-block" style={{ background: '#ef4444', boxShadow: '0 0 4px #ef4444' }} />
              Blind spot
            </span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="absolute inset-0 top-8">
        <Canvas
          camera={{ position: [0, 0, 600], fov: 50, near: 0.1, far: 50000 }}
          style={{ background: '#06090f' }}
          dpr={[1, 1.5]}
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={['#06090f']} />
          <Scene
            nodes={data.nodes}
            edges={data.edges}
            targetId={targetId}
            blastIds={blastIds}
            affectedMap={affectedMap}
            highlightBlast={highlightBlast}
            positions={positions}
            focusTarget={focusTarget}
            onNodeClick={handleNodeClick}
          />
        </Canvas>
      </div>

      {/* Blast counters */}
      {blastSummary && (
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 z-10 pointer-events-none">
          {[
            { label: 'Resources', val: blastSummary.resources, color: '#3b82f6' },
            { label: 'Apps', val: blastSummary.applications, color: '#8b5cf6' },
            { label: 'Teams', val: blastSummary.teams, color: '#06b6d4' },
            { label: 'Alarms', val: blastSummary.alarms, color: '#eab308' },
          ].filter(i => i.val > 0).map(item => (
            <div key={item.label}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono"
              style={{ background: 'rgba(6,9,15,0.88)', border: '1px solid #1a2438' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: item.color }} />
              <span style={{ color: item.color }}>{item.val}</span>
              <span className="text-slate-600">{item.label}</span>
            </div>
          ))}
          {blastSummary.customer_facing && (
            <div className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)' }}>
              <span className="text-[#ef4444]">⚠ CUSTOMER</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
