import { StatusPill } from './ProvenanceBadge'

export default function DiffTable({ findings }: { findings: any[] }) {
  return (
    <table className="w-full text-sm bg-white border rounded">
      <thead className="bg-slate-100 text-left">
        <tr>
          <th className="p-2">Parameter</th>
          <th className="p-2">Paper</th>
          <th className="p-2">Code</th>
          <th className="p-2">Status</th>
          <th className="p-2">Evidence & Explanation</th>
        </tr>
      </thead>
      <tbody>
        {findings.map(f => (
          <tr key={f.param} className="border-t align-top">
            <td className="p-2 font-mono font-medium">{f.param}</td>
            <td className="p-2">{f.paper_value ?? <i className="text-slate-400">none</i>}</td>
            <td className="p-2">{f.code_value ?? <i className="text-slate-400">none</i>}</td>
            <td className="p-2">
              <StatusPill s={f.status} />
              <div className="text-[11px] text-slate-500 uppercase mt-0.5">{f.severity} severity</div>
            </td>
            <td className="p-2 text-xs text-slate-600 space-y-1">
              {f.explanation && <div className="text-slate-800 font-medium">{f.explanation}</div>}
              {f.paper_ref && <div><span className="font-semibold text-slate-500">paper:</span> {f.paper_ref}</div>}
              {f.code_ref && <div><span className="font-semibold text-slate-500">code:</span> {f.code_ref}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
