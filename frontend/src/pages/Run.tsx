import { useState } from 'react'
import { api, errMsg } from '../api/client'
import { useStatus } from '../useStatus'
import { useProject } from './ProjectLayout'

const NODE_STYLE: Record<string, string> = {
  pending: 'bg-slate-100', running: 'bg-amber-100 border-amber-400', done: 'bg-green-100 border-green-500', failed: 'bg-red-100 border-red-500',
}

export default function Run() {
  const { eid, proj } = useProject()
  const { status, start, poll } = useStatus(eid)
  const [seeds, setSeeds] = useState(3)
  const [err, setErr] = useState('')
  const blocked = proj.scan?.blocked
  const running = status?.state === 'running'

  async function go() {
    setErr('')
    try { await api.run(eid, seeds); await poll(); start() } catch (e) { setErr(errMsg(e)) }
  }

  const isIdentical = Boolean(
    status?.seeds && status.seeds.length > 1 &&
    status.seeds.every((s: any) => s.value != null && s.value === status.seeds[0].value)
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm">Seeds{' '}
          <input type="number" min={1} max={20} value={seeds} onChange={e => setSeeds(Number(e.target.value))}
            className="border rounded w-16 px-1 py-0.5" /></label>
        <button onClick={go} disabled={running || !!blocked}
          className="bg-indigo-600 text-white px-4 py-1.5 rounded disabled:opacity-50">{running ? 'Running…' : 'Run experiment'}</button>
        {blocked && <span className="text-sm text-red-700">BLOCKED: {blocked}</span>}
      </div>
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}
      {status && status.state !== 'not_started' && (<>
        <div className="flex gap-2 flex-wrap">
          {Object.entries<string>(status.nodes || {}).map(([n, s]) => (
            <span key={n} className={`border rounded px-3 py-1 text-sm ${NODE_STYLE[s]}`}>{n}: {s}</span>))}
        </div>
        <p className="text-sm">State: <b>{status.state}</b> · seeds {status.seeds_done}/{status.seeds_total}
          <span className="block h-2 bg-slate-200 rounded mt-1"><span className="block h-2 bg-indigo-500 rounded"
            style={{ width: `${(status.seeds_done / Math.max(1, status.seeds_total)) * 100}%` }} /></span></p>
        {status.metric_error && <p className="bg-amber-50 border-l-4 border-amber-400 p-2 text-sm">Metric problem: {status.metric_error}</p>}
        {isIdentical && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-2 text-sm text-amber-900">
            All seeds ran identically; no seed variance could be measured because the code does not expose a --seed flag.
          </div>
        )}
        {status.state === 'failed' && <p className="bg-red-50 border-l-4 border-red-500 p-2 text-sm">
          Failed at stage <b>{status.failed_stage}</b>: {status.error}</p>}
        <table className="text-sm bg-white border rounded w-full">
          <thead className="bg-slate-100 text-left"><tr><th className="p-2">Seed</th><th className="p-2">Status</th>
            <th className="p-2">{status.metric ?? 'Metric'}</th><th className="p-2">Isolation</th></tr></thead>
          <tbody>{(status.seeds || []).map((s: any) => (
            <tr key={s.seed} className="border-t"><td className="p-2">{s.seed}</td><td className="p-2">{s.status}</td>
              <td className="p-2">{s.value != null ? s.value.toFixed(2) + (status.percent ? '%' : '') : '—'}</td>
              <td className="p-2">{s.isolation === 'docker' ? 'docker' : <span className="text-amber-700">reduced isolation</span>}</td></tr>))}</tbody>
        </table>
        <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded max-h-56 overflow-auto">{status.log_tail || '(no logs yet)'}</pre>
      </>)}
    </div>
  )
}
