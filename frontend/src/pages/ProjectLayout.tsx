import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { api, errMsg } from '../api/client'

export type Ctx = { pid: string; proj: any; eid: string; setEid: (e: string) => void; reload: () => Promise<void> }
export const useProject = () => useOutletContext<Ctx>()

const TABS = [['', 'Analysis'], ['graph', 'Graph'], ['run', 'Run'], ['verify', 'Verification'],
  ['compare', 'Compare'], ['report', 'Report']]

export default function ProjectLayout() {
  const { pid } = useParams() as { pid: string }
  const [proj, setProj] = useState<any>(null)
  const [eid, setEid] = useState('')
  const [err, setErr] = useState('')

  const reload = useCallback(async () => {
    try {
      const p = await api.project(pid)
      setProj(p)
      setEid(cur => cur && p.experiments.some((e: any) => e.id === cur) ? cur
        : p.experiments.length ? p.experiments[p.experiments.length - 1].id : '')
    } catch (e) { setErr(errMsg(e)) }
  }, [pid])
  useEffect(() => { reload() }, [reload])

  if (err) return <p className="text-red-700">{err}</p>
  if (!proj) return <p>Loading…</p>
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="text-xl font-bold">{proj.name}</h1>
        <span className="text-xs bg-slate-200 rounded px-2 py-0.5">{proj.status}</span>
        {proj.experiments.length > 0 && (
          <label className="text-sm ml-auto">Version{' '}
            <select className="border rounded px-1 py-0.5" value={eid} onChange={e => setEid(e.target.value)}>
              {proj.experiments.map((e: any) => (
                <option key={e.id} value={e.id}>v{e.version} · {e.config_hash}{e.parent_id ? ` (from ${proj.experiments.find((x: any) => x.id === e.parent_id)?.version ? 'v' + proj.experiments.find((x: any) => x.id === e.parent_id).version : '?'})` : ''}</option>
              ))}
            </select></label>)}
      </div>
      {proj.is_demo && <p className="mb-3 text-sm bg-amber-50 border-l-4 border-amber-400 p-2">
        <b>DEMO FIXTURE</b> — synthetic paper and repo. Results are not an independent reproduction of a published paper.</p>}
      {proj.error && <p className="mb-3 text-sm bg-red-50 border-l-4 border-red-500 p-2">Analysis failed: {proj.error}</p>}
      <nav className="flex gap-1 border-b mb-4">
        {TABS.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === ''}
            className={({ isActive }) => `px-3 py-2 text-sm -mb-px border-b-2 ${isActive ? 'border-indigo-600 font-semibold' : 'border-transparent text-slate-500'}`}>
            {label}</NavLink>))}
      </nav>
      {proj.experiments.length === 0 && !proj.error
        ? <p className="text-slate-500">Not analyzed yet.</p>
        : <Outlet context={{ pid, proj, eid, setEid, reload } satisfies Ctx} />}
    </div>
  )
}
