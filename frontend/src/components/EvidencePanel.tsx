import { useState } from 'react'
import ProvenanceBadge from './ProvenanceBadge'
import { X, CheckCircle2, AlertCircle, Save, Lock, Edit3 } from 'lucide-react'

export const EDITABLE = ['Dataset', 'Model', 'Training']

export default function EvidencePanel({
  node,
  onEdit,
  onClose,
}: {
  node: any
  onEdit: (node: string, edits: Record<string, any>) => Promise<void>
  onClose: () => void
}) {
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
    try {
      await onEdit(node.id, edits)
      setVals({})
    } finally {
      setBusy(false)
    }
  }

  const hasEditableField = entries.some(([_, v]) => v.injectable !== false)

  return (
    <aside className="w-84 bg-white border-l border-slate-200 p-5 overflow-auto flex flex-col justify-between shadow-lg">
      <div>
        <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 block">
              Node Evidence Inspector
            </span>
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">{node.id}</h3>
          </div>
          <button
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {entries.length === 0 && (
          <p className="text-xs text-slate-500 italic">This stage has no tracked hyperparameters.</p>
        )}

        <div className="space-y-4">
          {entries.map(([k, v]) => (
            <div key={k} className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span className="font-mono font-bold text-xs text-slate-900">{k}</span>
                <div className="flex items-center gap-1">
                  <ProvenanceBadge source={v.source} />
                  {v.source !== 'missing' && (
                    v.verified ? (
                      <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" /> verified
                      </span>
                    ) : (
                      <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5">
                        <AlertCircle className="w-2.5 h-2.5" /> unverified
                      </span>
                    )
                  )}
                </div>
              </div>

              <div className="text-xs text-slate-700">
                Current: <b className="font-mono text-slate-900">{v.value ?? 'MISSING'}</b>
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed break-words bg-white p-2 rounded-xl border border-slate-100">
                <b className="text-slate-700">Reference:</b> {v.ref || 'None (never guessed)'}
              </div>

              {v.injectable === false ? (
                <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-xl flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                  <span>Read-only: parameter not exposed via CLI flag.</span>
                </div>
              ) : (
                canEdit && (
                  <div className="pt-1">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      New Value (Branch Child Spec):
                    </label>
                    <input
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      placeholder={`Override ${k}`}
                      value={vals[k] ?? ''}
                      onChange={e => setVals({ ...vals, [k]: e.target.value })}
                    />
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      {canEdit && hasEditableField && (
        <div className="pt-5 mt-5 border-t border-slate-100">
          <button
            disabled={busy || !Object.values(vals).some(v => v !== '')}
            onClick={submit}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold py-2.5 px-4 rounded-full shadow-glow text-xs flex items-center justify-center gap-2 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{busy ? 'Branching Spec…' : 'Save as New Child Version'}</span>
          </button>
          <p className="text-[10px] text-slate-400 text-center mt-2">
            Edits never overwrite the parent; they create a new immutable version for causality comparison.
          </p>
        </div>
      )}
    </aside>
  )
}
