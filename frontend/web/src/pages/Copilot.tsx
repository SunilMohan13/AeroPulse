import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { Bot, Send } from 'lucide-react'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { ScientificBadge } from '../components/common/Badge'
import {
  queryCopilot,
  suggestedQuestions,
} from '../services/copilotService'
import type { CopilotMessage } from '../types'

type Phase = 'idle' | 'thinking' | 'retrieval' | 'typing' | 'done'

export function Copilot() {
  const { pendingCopilotQuestion, setPendingCopilotQuestion } = useApp()
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [displayedText, setDisplayedText] = useState('')
  const seqRef = useRef(0)

  const sendMessage = async (text: string) => {
    seqRef.current += 1
    const userMsg: CopilotMessage = {
      id: `u_${seqRef.current}`,
      role: 'user',
      content: text,
    }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setPhase('thinking')

    await new Promise((r) => setTimeout(r, 300))
    setPhase('retrieval')
    await new Promise((r) => setTimeout(r, 350))

    const response = await queryCopilot(text)
    setPhase('typing')

    let i = 0
    const full = response.content
    const typeInterval = setInterval(() => {
      i += 3
      setDisplayedText(full.slice(0, i))
      if (i >= full.length) {
        clearInterval(typeInterval)
        setMessages((m) => [...m, response])
        setDisplayedText('')
        setPhase('done')
        setTimeout(() => setPhase('idle'), 200)
      }
    }, 12)
  }

  const isLoading = phase !== 'idle' && phase !== 'done'

  useEffect(() => {
    if (!pendingCopilotQuestion || isLoading) return
    const q = pendingCopilotQuestion
    setPendingCopilotQuestion(null)
    void sendMessage(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot tour prompt
  }, [pendingCopilotQuestion])

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-intel" />
          <h1 className="text-xl font-semibold">AeroPulse Intelligence Copilot</h1>
        </div>
        <p className="text-sm text-text-secondary">
          Ask questions about current environmental conditions.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestedQuestions.map((q) => (
          <button
            key={q}
            type="button"
            disabled={isLoading}
            onClick={() => sendMessage(q)}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-intel/40 hover:text-intel disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <ScientificBadge label="INFERRED" />
        </CardHeader>
        <CardBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {messages.length === 0 && phase === 'idle' && (
            <p className="text-sm text-text-muted">
              Select a suggested question or type your own. Responses are grounded in retrieved evidence.
            </p>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg p-3 text-sm ${
                msg.role === 'user'
                  ? 'ml-8 bg-intel/10 text-text-primary'
                  : 'mr-8 bg-bg-elevated whitespace-pre-line'
              }`}
            >
              {msg.content}
              {msg.citations && (
                <div className="mt-3 border-t border-border pt-2">
                  <p className="text-xs font-medium text-text-muted">Sources</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {msg.citations.map((c) => (
                      <span key={c.source} className="text-xs text-intel">
                        {c.source} · {c.time}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="mr-8 rounded-lg bg-bg-elevated p-3 text-sm">
              {phase === 'thinking' && (
                <span className="text-text-muted">Analyzing evidence...</span>
              )}
              {phase === 'retrieval' && (
                <span className="text-text-muted">Retrieving evidence from CPCB, FIRMS, IMD, CAMS...</span>
              )}
              {phase === 'typing' && (
                <span className="whitespace-pre-line">{displayedText}</span>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim() && !isLoading) sendMessage(input.trim())
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about pollution, plume, evidence..."
          disabled={isLoading}
          className="flex-1 rounded-lg border border-border bg-bg-panel px-4 py-2.5 text-sm outline-none focus:border-intel/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-lg bg-intel/20 px-4 py-2.5 text-intel hover:bg-intel/30 disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
