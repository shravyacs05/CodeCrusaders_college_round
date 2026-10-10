import { useEffect, useState } from 'react'
import { api, errMsg } from '../api/client'
import { useProject } from './ProjectLayout'

export default function Compare() {
  const { proj, eid } = useProject()
  const exps: any[] = proj.experiments
  const [a, setA] = useState(eid), [b, setB] = useState(eid)
  const [res, setRes] = useState<any>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const cur = exps.find(e => e.id === eid)
    setB(eid); setA(cur?.parent_id || exps[0]?.id || eid)
  }, [eid])
  useEffect(() => {
    if (!a || !b) return
    setErr(''); setRes(null)
    api.compare(a, b).then(setRes).catch(e => setErr(errMsg(e)))
  }, [a, b])
  const sel = (v: string, set: (s: string) => void) => (
    <select className="border rounded px-2 py-1" value={v} onChange={e => set(e.target.value)}>
      {exps.map(e => <option key={e.id} value={e.id}>v{e.version} · {e.config_hash}</option>)}</select>)
  if (exps.length < 2) return <p className="text-slate-500">Only one version exists. Edit a node in the Graph tab to create a second version, run both, then compare.</p>
  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center text-sm">Compare {sel(a, setA)} with {sel(b, setB)}</div>
      {err && <p className="text-red-700 text-sm">{err}</p>}
      {res && (<>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border rounded p-3"><h3 className="font-bold mb-2 text-sm">Config changes</h3>
            {res.changes.length === 0 ? <p className="text-sm text-slate-500">None</p> :
              <table className="text-sm w-full"><thead className="text-left"><tr><th>Param</th><th>From</th><th>To</th></tr></thead>
                <tbody>{res.changes.map((c: any) => <tr key={c.param} className="border-t"><td className="font-mono">{c.param}</td>
                  <td>{String(c.from ?? 'MISSING')}</td><td>{String(c.to ?? 'MISSING')}</td></tr>)}</tbody></table>}</div>
          <div className="bg-white border rounded p-3"><h3 className="font-bold mb-2 text-sm">Metric difference</h3>
            {res.metric_delta_pp != null ? (
              <p className="text-2xl font-mono">
                {(typeof res.metric_delta_pp === 'number' ? res.metric_delta_pp : res.metric_delta_pp.accuracy_pp) >= 0 ? '+' : ''}
                {(typeof res.metric_delta_pp === 'number' ? res.metric_delta_pp : res.metric_delta_pp.accuracy_pp).toFixed(2)} pp
              </p>
            ) : <p className="text-sm text-slate-500">Run both versions to compare metrics.</p>}</div>
        </div>
        <p className="text-sm bg-slate-100 rounded p-2">{res.note}
          {res.single_factor && ' Only one field changed, so this is a single-factor comparison.'}</p>
      </>)}
    </div>
  )
}
