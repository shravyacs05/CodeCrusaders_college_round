import { useEffect, useState } from 'react'
import { api } from '../api/client'
import DiffTable from '../components/DiffTable'
import ProvenanceBadge from '../components/ProvenanceBadge'
import { useProject } from './ProjectLayout'

export default function Analysis() {
  const { pid, proj } = useProject()
  const [findings, setFindings] = useState<any[]>([])
  useEffect(() => { api.findings(pid).then(setFindings) }, [pid])
  const paper = proj.paper
  const fields = Object.entries<any>(paper?.fields || {}).filter(([k]) => !k.startsWith('_'))
  const claim = paper?.fields?._claim
  const warnings = proj.scan?.warnings || []

  return (
    <div className="space-y-6">
      {proj.scan?.blocked && <p className="bg-red-50 border-l-4 border-red-500 p-2 text-sm">
        Execution BLOCKED: {proj.scan.blocked}</p>}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-3 text-sm">
          <b className="text-amber-900 block mb-1">Scanner warnings</b>
          <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
            {warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      <section>
        <h2 className="font-bold mb-1">Claim to verify</h2>
        <div className="bg-white border rounded p-3 text-sm">
          {claim?.value != null ? <><b>{claim.metric} = {claim.value}{claim.percent ? '%' : ''}</b>
            <div className="text-xs text-slate-600">p.{claim.page}: “{claim.quote}”</div></>
            : <span className="text-red-700">No verified claim found. Verification will be BLOCKED.</span>}
        </div>
      </section>
      <section>
        <h2 className="font-bold mb-1">Extracted from paper <span className="text-xs font-normal text-slate-500">
          (method: {paper?.method}{paper?.note ? ` · ${paper.note}` : ''})</span></h2>
        <table className="w-full text-sm bg-white border rounded">
          <thead className="bg-slate-100 text-left"><tr><th className="p-2">Field</th><th className="p-2">Value</th>
            <th className="p-2">Source</th><th className="p-2">Page / quote</th></tr></thead>
          <tbody>{fields.map(([k, f]) => (
            <tr key={k} className="border-t align-top">
              <td className="p-2 font-mono">{k}</td>
              <td className="p-2">{f.value ?? <i className="text-slate-400">{f.claimed_value != null ? `rejected (${f.claimed_value})` : 'missing'}</i>}</td>
              <td className="p-2"><ProvenanceBadge source={f.source} /></td>
              <td className="p-2 text-xs text-slate-600">{f.quote ? `p.${f.page}: “${f.quote}”` : '—'}
                {paper.flags?.[k] && <div className="text-orange-600 font-semibold">unverified extraction: quote not found on page</div>}</td>
            </tr>))}</tbody>
        </table>
      </section>
      <section>
        <h2 className="font-bold mb-1">Paper vs. code</h2>
        <DiffTable findings={findings} />
      </section>
    </div>
  )
}
