import { useEffect, useRef, useState } from 'react'

const LINES = [
  '> INITIALIZING AWS CHANGE INTELLIGENCE v2.0.0',
  '> CONNECTING TO GRAPH ENGINE................. OK',
  '> LOADING X-RAY SERVICE MAP......... 27 NODES, 40 EDGES',
  '> BLIND SPOT DETECTOR................................ ARMED',
  '> COST ESTIMATOR.............................. CALIBRATED',
  '> RISK SCORER........................................... ONLINE',
  '> ████████████████████████████ 100%',
  '> ALL SYSTEMS READY. INITIATING...',
]

interface Props {
  onDone: () => void
}

export function BootScreen({ onDone }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [currentLine, setCurrentLine] = useState('')
  const [exiting, setExiting] = useState(false)
  const lineIndexRef = useRef(0)
  const charIndexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const tick = () => {
      const li = lineIndexRef.current
      const ci = charIndexRef.current
      if (li >= LINES.length) {
        clearInterval(timerRef.current!)
        setTimeout(() => {
          setExiting(true)
          setTimeout(onDone, 380)
        }, 300)
        return
      }
      const line = LINES[li]
      if (ci < line.length) {
        charIndexRef.current += 1
        setCurrentLine(line.slice(0, ci + 1))
      } else {
        setLines(prev => [...prev, line])
        setCurrentLine('')
        lineIndexRef.current += 1
        charIndexRef.current = 0
      }
    }
    timerRef.current = setInterval(tick, 18)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [onDone])

  const isProgressLine = currentLine.startsWith('> ████')
  const progressPct = isProgressLine
    ? Math.round((currentLine.replace('> ', '').replace(/ 100%.*/, '').length / 28) * 100)
    : 0

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center ${exiting ? 'boot-exit' : ''}`}
      style={{ background: '#020509' }}
    >
      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)'
      }} />

      <div className="relative w-full max-w-2xl px-8">
        {/* Terminal header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-[#ff003c]" style={{ boxShadow: '0 0 6px #ff003c' }} />
          <div className="w-3 h-3 rounded-full bg-[#ffd200]" style={{ boxShadow: '0 0 6px #ffd200' }} />
          <div className="w-3 h-3 rounded-full bg-[#39ff14]" style={{ boxShadow: '0 0 6px #39ff14' }} />
          <span className="ml-3 text-xs font-mono text-slate-600">aci-terminal — bash</span>
        </div>

        {/* Terminal body */}
        <div className="rounded-lg border border-[#1e2535] bg-[#030508] p-6 font-mono text-sm space-y-1.5"
          style={{ boxShadow: '0 0 40px rgba(0,245,255,0.08), 0 0 80px rgba(0,245,255,0.03)' }}>

          {lines.map((line, i) => (
            <div key={i} className="text-[#39ff14]" style={{ textShadow: '0 0 8px rgba(57,255,20,0.6)' }}>
              {line}
              {i === lines.length - 1 && line === LINES[LINES.length - 1] && (
                <span className="ml-2 text-[#00f5ff]" style={{ textShadow: '0 0 8px #00f5ff' }}>✓</span>
              )}
            </div>
          ))}

          {currentLine && (
            <div>
              {isProgressLine ? (
                <div className="text-[#00f5ff]" style={{ textShadow: '0 0 8px rgba(0,245,255,0.6)' }}>
                  <span>{currentLine}</span>
                  {progressPct < 100 && (
                    <span className="text-slate-600 ml-1">{' '.repeat(Math.max(0, 28 - currentLine.replace('> ', '').length))}░░░░░░</span>
                  )}
                </div>
              ) : (
                <div className="text-[#00f5ff]" style={{ textShadow: '0 0 8px rgba(0,245,255,0.6)' }}>
                  {currentLine}
                  <span className="inline-block w-2 h-4 bg-[#00f5ff] ml-0.5 animate-pulse" style={{ verticalAlign: 'text-bottom' }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom label */}
        <div className="mt-4 text-center text-[10px] font-mono text-slate-700 tracking-[0.3em] uppercase">
          AWS Change Intelligence · Pre-Change Blast Radius Analysis
        </div>
      </div>
    </div>
  )
}
