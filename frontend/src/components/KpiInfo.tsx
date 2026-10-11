import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext, useParams } from 'react-router-dom'
import { Info, Send, Sparkles, X } from 'lucide-react'
import { api, errMsg, type AskMessage } from '../api/client'
import { KPI } from '../kpiDefinitions'

const WIDTH = 360
const SUGGESTED = ['What does this value mean for my project?', 'How is it calculated?', 'How can I improve it?']

let assistantEnabled: Promise<boolean> | null = null
const checkEnabled = () =>
  (assistantEnabled ??= api.askStatus().then(s => s.enabled).catch(() => false))

/** (i) button for a KPI card: shows the KPI's definition and lets the user ask the LLM about it,
 *  grounded in this project's evidence. `data` is any extra numbers the card renders. */
export default function KpiInfo({ term, value, data, title, pid: pidProp, eid: eidProp, className = '' }: {
  term: string
  value?: string | number | null
  data?: unknown
  title?: string
  pid?: string
  eid?: string
  className?: string
}) {
  const def = KPI[term]
  const params = useParams() as { pid?: string }
  const outlet = useOutletContext<{ eid?: string } | undefined>()
  const pid = pidProp ?? params.pid
  const eid = eidProp ?? outlet?.eid
  const heading = title ?? def?.title

  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [messages, setMessages] = useState<AskMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open && enabled === null) checkEnabled().then(setEnabled) }, [open, enabled])

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      if (!btn.current) return
      const r = btn.current.getBoundingClientRect()
      const h = pop.current?.offsetHeight ?? 360
      const left = Math.max(8, Math.min(r.left + r.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8))
      const below = r.bottom + 8
      setPos({ left, top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 8) : below })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, messages.length, busy, enabled])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy])

  if (!def || !heading) return null
  const shown = value == null || value === '' ? undefined : String(value)

  const ask = async (text: string) => {
    const q = text.trim()
    if (!q || busy || !pid) return
    const next: AskMessage[] = [...messages, { role: 'user', content: q }]
    setMessages(next); setInput(''); setErr(''); setBusy(true)
    try {
      const answer = await api.askAboutKpi(pid, next, { title: heading, definition: def.text, value: shown }, eid, data)
      setMessages([...next, { role: 'assistant', content: answer }])
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  // The popover is portaled, but React events still bubble to the card (e.g. a graph node's
  // click handler), so stop them at the popover root.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <>
      <button
        ref={btn}
        type="button"
        title={`About ${heading} · ask AI`}
        aria-label={`About ${heading}`}
        aria-expanded={open}
        onMouseDown={stop}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`nodrag nopan inline-flex items-center justify-center shrink-0 align-middle w-4 h-4 rounded-full normal-case tracking-normal transition-colors ${
          open ? 'text-brand-600' : 'text-slate-400 hover:text-brand-600'
        } ${className}`}
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && createPortal(
        <div
          ref={pop}
          role="dialog"
          aria-label={heading}
          onClick={stop}
          onMouseDown={stop}
          onDoubleClick={stop}
          style={{ top: pos.top, left: pos.left, width: WIDTH }}
          className="fixed z-[110] flex flex-col max-h-[min(32rem,calc(100vh-1rem))] bg-white border border-slate-200 rounded-2xl shadow-xl text-left font-sans font-normal normal-case tracking-normal text-slate-700"
        >
          <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2.5 border-b border-slate-100">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">{heading}</div>
              {shown && <div className="text-[11px] font-mono text-brand-700 mt-0.5 break-words">Shown: {shown}</div>}
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close"
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs leading-relaxed">
            <p className="text-slate-600">{def.text}</p>

            {enabled === false && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5">
                Asking questions needs an LLM. Set <code className="font-mono">LLM_PROVIDER</code>,{' '}
                <code className="font-mono">LLM_MODEL</code> and <code className="font-mono">LLM_API_KEY</code> in{' '}
                <code className="font-mono">.env</code> and restart the server.
              </div>
            )}

            {enabled && messages.length === 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Sparkles className="w-3 h-3 text-brand-500" /> Ask AI about this
                </div>
                {SUGGESTED.map(q => (
                  <button key={q} onClick={() => ask(q)}
                    className="block w-full text-left px-3 py-1.5 rounded-xl border border-brand-200 bg-brand-50 text-brand-800 font-semibold hover:bg-brand-100 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={m.role === 'user'
                  ? 'max-w-[85%] bg-brand-500 text-white rounded-2xl rounded-br-md px-3 py-1.5 whitespace-pre-wrap'
                  : 'max-w-[95%] bg-slate-100 text-slate-800 rounded-2xl rounded-bl-md px-3 py-2 space-y-1.5'}>
                  {m.role === 'user' ? m.content : <Answer text={m.content} />}
                </div>
              </div>
            ))}
            {busy && <div className="text-slate-400 animate-pulse">Thinking…</div>}
            {err && <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-2.5">{err}</div>}
            <div ref={end} />
          </div>

          {enabled && (
            <form onSubmit={e => { e.preventDefault(); ask(input) }} className="flex gap-2 p-2.5 border-t border-slate-100">
              <input value={input} onChange={e => setInput(e.target.value)} autoFocus
                placeholder={`Ask about ${heading.toLowerCase()}…`}
                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-brand-500" />
              <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
                className="p-2 rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40">
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

/** Minimal Markdown for answers: paragraphs, "-"/"*"/"1." lists, **bold** and `code`. No raw HTML. */
function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={blocks.length} className={`pl-4 space-y-0.5 ${list.ordered ? 'list-decimal' : 'list-disc'}`}>
        {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>,
    )
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    if (bullet || numbered) {
      const ordered = !!numbered
      if (list && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
      continue
    }
    flush()
    if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#{1,6}\s+/, ''))}</p>)
  }
  flush()
  return <>{blocks}</>
}

function inline(s: string): ReactNode {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <b key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</b>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={i} className="font-mono text-[11px] bg-white/70 px-1 rounded">{part.slice(1, -1)}</code>
    return <Fragment key={i}>{part}</Fragment>
  })
}
