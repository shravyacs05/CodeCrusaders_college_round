import { StatusPill } from './ProvenanceBadge'
import { FileText } from 'lucide-react'

export default function DiffTable({
  findings,
  onInspectPaper,
}: {
  findings: any[]
  onInspectPaper?: (param: string) => void
}) {
  return (
    <div className="overflow-hidden border border-slate-200/90 rounded-2xl bg-white shadow-sm">
      <table className="w-full text-sm text-left border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-extrabold uppercase tracking-wider text-slate-600">
          <tr>
            <th className="p-3.5">Parameter</th>
            <th className="p-3.5">Paper Claim</th>
            <th className="p-3.5">Code Setting</th>
            <th className="p-3.5">Reconciliation</th>
            <th className="p-3.5">Evidence & Context</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {findings.map(f => (
            <tr key={f.param} className="hover:bg-slate-50/60 transition-colors align-top">
              <td className="p-3.5 font-mono font-extrabold text-slate-900 text-xs">
                {f.param}
              </td>
              <td className="p-3.5 font-mono font-bold text-slate-900 text-xs">
                {f.paper_value ?? <i className="text-slate-400 font-sans font-normal">none</i>}
              </td>
              <td className="p-3.5 font-mono font-bold text-slate-900 text-xs">
                {f.code_value ?? <i className="text-slate-400 font-sans font-normal">none</i>}
              </td>
              <td className="p-3.5">
                <StatusPill s={f.status} />
                <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mt-1.5">
                  {f.severity} severity
                </div>
              </td>
              <td className="p-3.5 text-xs text-slate-700 space-y-1">
                {f.explanation && (
                  <div className="text-slate-900 font-bold leading-snug">{f.explanation}</div>
                )}
                {f.paper_ref && (
                  <div className="text-slate-500 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-semibold text-slate-700">paper:</span> {f.paper_ref}
                    </div>
                    {onInspectPaper && (
                      <button
                        onClick={() => onInspectPaper(f.param)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded border border-brand-200 transition-colors"
                        title="Locate exact quote in Paper PDF"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Locate in PDF</span>
                      </button>
                    )}
                  </div>
                )}
                {f.code_ref && (
                  <div className="text-slate-600 font-semibold">
                    <span className="font-extrabold text-slate-800">code:</span> {f.code_ref}
                  </div>
                )}
              </td>
            </tr>

          ))}
        </tbody>
      </table>
    </div>
  )
}
