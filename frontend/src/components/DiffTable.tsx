import { StatusPill } from './ProvenanceBadge'

export default function DiffTable({ findings }: { findings: any[] }) {
  return (
    <div className="overflow-hidden border border-slate-200/90 rounded-2xl bg-white shadow-sm">
      <table className="w-full text-sm text-left border-collapse">
        <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
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
            <tr key={f.param} className="hover:bg-slate-50/50 transition-colors align-top">
              <td className="p-3.5 font-mono font-semibold text-slate-900 text-xs">
                {f.param}
              </td>
              <td className="p-3.5 font-mono text-slate-800 text-xs">
                {f.paper_value ?? <i className="text-slate-400 font-sans">none</i>}
              </td>
              <td className="p-3.5 font-mono text-slate-800 text-xs">
                {f.code_value ?? <i className="text-slate-400 font-sans">none</i>}
              </td>
              <td className="p-3.5">
                <StatusPill s={f.status} />
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                  {f.severity} severity
                </div>
              </td>
              <td className="p-3.5 text-xs text-slate-600 space-y-1">
                {f.explanation && (
                  <div className="text-slate-900 font-medium">{f.explanation}</div>
                )}
                {f.paper_ref && (
                  <div className="text-slate-500">
                    <span className="font-semibold text-slate-700">paper:</span> {f.paper_ref}
                  </div>
                )}
                {f.code_ref && (
                  <div className="text-slate-500">
                    <span className="font-semibold text-slate-700">code:</span> {f.code_ref}
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
