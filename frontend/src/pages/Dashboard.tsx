import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  ShieldCheck,
  AlertTriangle,
  FolderKanban,
  FileText,
  GitBranch,
  ArrowRight,
  Sparkles,
  Layers,
  Search,
  Trophy
} from 'lucide-react'
import { api } from '../api/client'
import LeaderboardView from '../components/LeaderboardView'

interface DashboardProps {
  initialTab?: 'leaderboard' | 'projects'
}

export default function Dashboard({ initialTab = 'projects' }: DashboardProps) {
  const [projects, setProjects] = useState<any[] | null>(null)
  const [docker, setDocker] = useState<boolean | null>(null)
  const [search, setSearch] = useState('')

  const isLeaderboard = initialTab === 'leaderboard'

  useEffect(() => {
    api.projects().then(setProjects).catch(() => setProjects([]))
    api.health().then(h => setDocker(h.docker)).catch(() => setDocker(false))
  }, [])

  const filtered = projects?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'reproduced':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            REPRODUCED
          </span>
        )
      case 'not_reproduced':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            NOT_REPRODUCED
          </span>
        )
      case 'analyzed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-brand-700 border border-brand-200">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            ANALYZED
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            {status || 'PENDING'}
          </span>
        )
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Top Banner / Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
              {isLeaderboard ? 'Field-Wide Benchmark' : 'CrisisGrid Workspace'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {isLeaderboard ? 'Macro Reproducibility Leaderboard' : 'All Reproduction Projects'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isLeaderboard
              ? 'Multi-paper cohort evaluation comparing published claims against deterministic empirical reproduction.'
              : 'Evidence-backed ML reproducibility, multi-seed verification, and execution DAGs.'}
          </p>
        </div>
      </div>

      {/* Metrics Summary Strip (Shown on Projects View) */}
      {!isLeaderboard && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Projects</div>
              <div className="text-2xl font-extrabold text-slate-900 font-mono mt-0.5">
                {projects ? projects.length : '...'}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-brand-600 flex items-center justify-center">
              <FolderKanban className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Verified Reproductions</div>
              <div className="text-2xl font-extrabold text-emerald-600 font-mono mt-0.5">
                {projects ? projects.filter(p => p.status?.toLowerCase() === 'reproduced').length : '...'}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Isolation Engine</div>
              <div className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                {docker ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Docker Non-Root Sandbox</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-cyan-500" />
                    <span>Sandboxed Virtualenv</span>
                  </>
                )}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Render Leaderboard or Projects List exclusively */}
      {isLeaderboard ? (
        <LeaderboardView />
      ) : (

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-full pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          {projects === null && (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
              <div className="inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm">Loading reproduction projects...</p>
            </div>
          )}

          {projects?.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-brand-600 flex items-center justify-center mx-auto mb-4">
                <FolderKanban className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">No Projects Found</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
                Create your first reproduction project to extract paper claims and execute sandboxed experiments.
              </p>
              <Link
                to="/new"
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-6 py-2.5 rounded-full shadow-glow transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Project</span>
              </Link>
            </div>
          )}

          {filtered && filtered.length > 0 && (
            <div className="grid gap-3">
              {filtered.map(p => (
                <Link
                  key={p.id}
                  to={`/p/${p.id}`}
                  className="bg-white border border-slate-200/90 hover:border-brand-400 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-base text-slate-900 group-hover:text-brand-600 transition-colors">
                        {p.name}
                      </span>
                      {p.is_demo && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          Demo
                        </span>
                      )}
                      {getStatusBadge(p.status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="font-mono">ID: {p.id}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        {p.experiments?.length || 1} version{(p.experiments?.length || 1) === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span className="text-xs font-semibold text-brand-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                      <span>Inspect</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
