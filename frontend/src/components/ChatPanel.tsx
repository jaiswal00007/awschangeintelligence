import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Send, Bot, User, Loader2 } from 'lucide-react'
import type { AnalysisResult } from '../types'
import { chatWithAnalysis } from '../api'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  result: AnalysisResult
  onClose: () => void
}

const SUGGESTED = [
  'Why is this change critical?',
  'What is the cost blast radius?',
  'Any blind spots I should know?',
  'Give me the safest change plan.',
]

export function ChatPanel({ result, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: `I have full context on this **${result.change.change_type.replace('_', ' ')}** change to **${result.change.target.split(':').pop()}**. Risk: ${result.risk.level.toUpperCase()} (${result.risk.score}/100), ${result.affected_nodes.length} affected nodes, ${result.blind_spots.length} blind spot(s). Ask me anything.`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const context = {
    change: result.change,
    blast_radius: result.blast_radius,
    affected_nodes: result.affected_nodes,
    blind_spots: result.blind_spots,
    historical_matches: result.historical_matches,
    risk: result.risk,
    verdict: result.verdict,
    recommendation: result.recommendation,
    change_plan: result.change_plan,
  }

  async function send(text: string) {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: 'user', text: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const reply = await chatWithAnalysis(text.trim(), context)
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error contacting AI — check backend connection.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className="fixed top-0 right-0 bottom-0 z-50 flex flex-col border-l border-[#1a2438]"
      style={{ width: 380, background: '#060c17' }}
      initial={{ x: 380 }}
      animate={{ x: 0 }}
      exit={{ x: 380 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2438] shrink-0"
        style={{ background: 'rgba(3,5,13,0.9)' }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)' }}>
            <Bot size={13} style={{ color: '#3b82f6' }} />
          </div>
          <span className="text-sm font-mono font-bold text-[#3b82f6] uppercase tracking-[0.15em]">AI Assistant</span>
          <span className="text-[10px] font-mono text-[#22c55e] px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            context-aware
          </span>
        </div>
        <button onClick={onClose}
          className="text-[#475569] hover:text-[#94a3b8] transition-colors p-1 rounded hover:bg-[#0d1424]">
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
              style={msg.role === 'assistant'
                ? { background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }
                : { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}>
              {msg.role === 'assistant'
                ? <Bot size={12} style={{ color: '#3b82f6' }} />
                : <User size={12} style={{ color: '#8b5cf6' }} />}
            </div>
            {/* Bubble */}
            <div className="max-w-[84%] rounded-xl px-3 py-2 text-xs font-mono leading-relaxed"
              style={msg.role === 'assistant'
                ? { background: '#0d1424', border: '1px solid #1a2438', color: '#cbd5e1' }
                : { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#e2e8f0' }}>
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
              <Bot size={12} style={{ color: '#3b82f6' }} />
            </div>
            <div className="rounded-xl px-3 py-2 flex items-center gap-1.5"
              style={{ background: '#0d1424', border: '1px solid #1a2438' }}>
              <Loader2 size={11} className="animate-spin" style={{ color: '#3b82f6' }} />
              <span className="text-[10px] font-mono text-[#475569]">thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {SUGGESTED.map(q => (
            <button key={q} onClick={() => send(q)}
              className="text-[10px] font-mono px-2.5 py-1 rounded-full border border-[#1a2438] text-[#475569] hover:border-[#3b82f6] hover:text-[#3b82f6] transition-all"
              style={{ background: '#0d1424' }}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-[#1a2438] shrink-0" style={{ background: 'rgba(3,5,13,0.6)' }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder="Ask about this change…"
            disabled={loading}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-mono bg-[#0d1424] border border-[#1a2438] text-[#cbd5e1] placeholder-[#334155] focus:outline-none focus:border-[#3b82f6] transition-colors disabled:opacity-50"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#3b82f6' }}>
            <Send size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
