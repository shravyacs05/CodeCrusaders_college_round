import { useState } from 'react'
import ProvenanceBadge from './ProvenanceBadge'

export const EDITABLE = ['Dataset', 'Model', 'Training']

export default function EvidencePanel({ node, onEdit, onClose }:
  { node: any; onEdit: (node: string, edits: Record<string, any>) => Promise<void>; onClose: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const entries = Object.entries<any>(node.params || {})
  const canEdit = EDITABLE.includes(node.id)

  async function submit() {
    const edits: Record<string, any> = {}
    for (const [k, v] of Object.entries(vals)) {
      if (v === '') continue
      edits[k] = isNaN(Number(v)) ? v : Number(v)
    }
    if (!Object.keys(edits).length) return
    setBusy(true)
    try { await onEdit(node.id, edits); setVals({}) } finally { setBusy(false) }
  }

  const hasEditableField = entries.some(([_, v]) => v.injectable !== false)

  return (
    <aside className="w-80 bg-white border-l p-4 overflow-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold">{node.id}</h3>
        <button className="text-slate-500" onClick={onClose}>✕</button>
      </div>
      {entries.length === 0 && <p className="text-sm text-slate-500">This node has no tracked parameters.</p>}
      {entries.map(([k, v]) => (
        <div key={k} className="mb-4 text-sm">
          <div className="flex items-center gap-2"><span className="font-mono font-semibold">{k}</span>
            <ProvenanceBadge source={v.source} />
            {v.source !== 'missing' && (v.verified
              ? <span className="text-[10px] text-green-700">verified</span>
              : <span className="text-[10px] text-orange-600">unverified</span>)}
          </div>
          <div>Value: <b>{v.value ?? 'MISSING'}</b></div>
          <div className="text-xs text-slate-600 break-words">Evidence: {v.ref || 'none (never guessed)'}</div>
          {v.injectable === false ? (
            <div className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-1 inline-block">
              Read-only (not injectable via CLI flag)
            </div>
          ) : (
            canEdit && (
              <input className="mt-1 w-full border rounded px-2 py-1 text-sm" placeholder={`new ${k}`}
                value={vals[k] ?? ''} onChange={e => setVals({ ...vals, [k]: e.target.value })} />
            )
          )}
        </div>
      ))}
      {canEdit && hasEditableField && (
        <button disabled={busy} onClick={submit}
          className="w-full bg-indigo-600 text-white rounded py-1.5 text-sm disabled:opacity-50">
          {busy ? 'Saving…' : 'Save as new version'}
        </button>
      )}
      {canEdit && <p className="text-[11px] text-slate-500 mt-2">Edits never change this version; they create a child version.</p>}
    </aside>
  )
}
