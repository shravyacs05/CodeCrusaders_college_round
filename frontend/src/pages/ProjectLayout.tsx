import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useOutletContext, useParams, Link } from 'react-router-dom'
import {
  FileText,
  Layers,
  Play,
  ShieldCheck,
  GitCompare,
  FileDown,
  Sparkles,
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  GitBranch
} from 'lucide-react'
import { api, errMsg } from '../api/client'

export type Ctx = { pid: string; proj: any; eid: string; setEid: (e: string) => void; reload: () => Promise<void> }
export const useProject = () => useOutletContext<Ctx>()

const TABS = [
  ['', 'Analysis', FileText],
  ['graph', 'Graph', Layers],
  ['run', 'Run', Play],
  ['verify', 'Verification', ShieldCheck],
  ['compare', 'Compare', GitCompare],
  ['report', 'Report', FileDown],
] as const

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

  if (err) return (
    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-800 text-sm">
      <b className="font-bold">Error loading project: </b>{err}
    </div>
  )

  if (!proj) return (
    <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-500">
      <div className="inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm">Loading project specification...</p>
    </div>
  )

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'reproduced':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            REPRODUCED
          </span>
        )
      case 'not_reproduced':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            NOT_REPRODUCED
          </span>
        )
      case 'analyzed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-brand-700 border border-brand-200">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            ANALYZED
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            {status || 'PENDING'}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Link to="/dashboard" className="hover:text-slate-800 transition-colors">Projects</Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-900 font-semibold">{proj.name}</span>
      </div>

      {/* Project Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {proj.name}
              </h1>
              {getStatusBadge(proj.status)}
              {proj.is_demo && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Demo Fixture
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 font-mono">
              <span>Project: {proj.id}</span>
              {proj.commit && <span>• Commit: {proj.commit.slice(0, 10)}</span>}
            </div>
          </div>

          {/* Version Switcher */}
          {proj.experiments.length > 0 && (
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-2xl">
              <GitBranch className="w-4 h-4 text-brand-600" />
              <label htmlFor="version-select" className="text-xs font-semibold text-slate-700">Version:</label>
              <select
                id="version-select"
                className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:border-brand-500"
                value={eid}
                onChange={e => setEid(e.target.value)}
              >
                {proj.experiments.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    v{e.version} • {e.config_hash}
                    {e.parent_id
                      ? ` (from v${proj.experiments.find((x: any) => x.id === e.parent_id)?.version || '?'})`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Demo Warning Banner */}
        {proj.is_demo && (
          <div className="mt-4 text-xs bg-amber-50/70 border border-amber-200 text-amber-900 rounded-2xl p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <b>Synthetic Demo Fixture:</b> Evaluated on synthetic papers and local test code. Used for verification validation.
            </span>
          </div>
        )}

        {/* Analysis Error Alert */}
        {proj.error && (
          <div className="mt-4 text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span><b>Analysis failed:</b> {proj.error}</span>
          </div>
        )}
      </div>

      {/* Modern Tabs Navigation Bar */}
      <nav className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
        {TABS.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === ''}
            className={({ isActive }) =>
              `inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-brand-500 text-white shadow-glow'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`
            }
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Tab Content */}
      <div className="pt-2">
        {proj.experiments.length === 0 && !proj.error ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-500">
            <p className="text-sm">Not analyzed yet. Run analysis to construct the experiment specification.</p>
          </div>
        ) : (
          <Outlet context={{ pid, proj, eid, setEid, reload } satisfies Ctx} />
        )}
      </div>
    </div>
  )
}
