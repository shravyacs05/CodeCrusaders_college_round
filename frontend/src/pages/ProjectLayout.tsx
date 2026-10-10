import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useOutletContext, useParams, Link } from 'react-router-dom'
import {
  FileText,
  Layers,
  Play,
  ShieldCheck,
  GitCompare,
  FileDown,
  AlertTriangle,
  ChevronRight,
  GitBranch,
  Columns,
  Sparkles,
  Code2
} from 'lucide-react'
import { api, errMsg } from '../api/client'
import PaperViewer, { EvidenceItem } from '../components/PaperViewer'

export type Ctx = {
  pid: string
  proj: any
  eid: string
  setEid: (e: string) => void
  reload: () => Promise<void>
  openPaperViewer: (item?: EvidenceItem) => void
  splitView: boolean
  setSplitView: (s: boolean) => void
}
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
  const [splitView, setSplitView] = useState(false)
  const [activeItem, setActiveItem] = useState<EvidenceItem | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')

  const reload = useCallback(async () => {
    try {
      const p = await api.project(pid)
      setProj(p)
      setEid(cur => cur && p.experiments.some((e: any) => e.id === cur) ? cur
        : p.experiments.length ? p.experiments[p.experiments.length - 1].id : '')
    } catch (e) { setErr(errMsg(e)) }
  }, [pid])

  const handleRunAnalysis = async () => {
    setAnalyzing(true)
    setAnalysisError('')
    try {
      await api.analyze(pid)
      await reload()
    } catch (e) {
      setAnalysisError(errMsg(e))
    } finally {
      setAnalyzing(false)
    }
  }

  const openPaperViewer = useCallback((item?: EvidenceItem) => {
    if (item) setActiveItem(item)
    setSplitView(true)
  }, [])

  const evidenceItems: EvidenceItem[] = useMemo(() => {
    if (!proj?.paper?.fields) return []
    const items: EvidenceItem[] = []
    const claim = proj.paper.fields._claim
    if (claim && claim.quote) {
      items.push({
        id: 'claim',
        param: `CLAIM: ${(claim.metric || 'ACCURACY').toUpperCase()}`,
        value: claim.value != null ? `${claim.value}${claim.percent ? '%' : ''}` : 'None',
        page: claim.page || 1,
        bbox: claim.bbox,
        quote: claim.quote,
      })
    }
    for (const [k, f] of Object.entries<any>(proj.paper.fields)) {
      if (k.startsWith('_')) continue
      if (f.quote) {
        items.push({
          id: k,
          param: k,
          value: f.value,
          page: f.page || 1,
          bbox: f.bbox,
          quote: f.quote,
        })
      }
    }
    return items
  }, [proj])

  useEffect(() => { reload() }, [reload])

  if (err) return (
    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-800 text-sm font-semibold">
      <b className="font-extrabold">Error loading project: </b>{err}
    </div>
  )

  if (!proj) return (
    <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-500">
      <div className="inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm font-bold">Loading project specification...</p>
    </div>
  )

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'reproduced':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            REPRODUCED
          </span>
        )
      case 'not_reproduced':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            NOT_REPRODUCED
          </span>
        )
      case 'analyzed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-brand-700 border border-brand-200">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            ANALYZED
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            {status || 'PENDING'}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
        <Link to="/dashboard" className="hover:text-brand-600 transition-colors">Projects</Link>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-900 font-extrabold">{proj.name}</span>
      </div>

      {/* Project Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {proj.name}
              </h1>
              {getStatusBadge(proj.status)}
              {proj.is_demo && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Demo Fixture
                </span>
              )}
              {proj.is_paper_only && (
                <span className="text-[10px] uppercase font-black tracking-wider px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-600" />
                  Paper-Only Reconstructed
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 mt-2 font-mono">
              <span>Project ID: <b className="text-slate-800">{proj.id}</b></span>
              {proj.commit && <span>• Commit: <b className="text-slate-800">{proj.commit.slice(0, 10)}</b></span>}
            </div>
          </div>

          {/* Actions: Export Jupyter, Split View, Version Switcher, and Self-Healing Indicator */}
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href={api.notebookUrl(pid, eid)}
              download
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-xs transition-all hover:scale-105"
              title="Download executable Jupyter Notebook (.ipynb) for local or Google Colab execution"
            >
              <Code2 className="w-4 h-4 text-emerald-600" />
              <span>Export Jupyter (.ipynb)</span>
            </a>

            <button
              onClick={() => {
                setActiveItem(evidenceItems[0] || null)
                setSplitView(!splitView)
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-semibold shadow-sm transition-all border ${splitView
                ? 'bg-brand-500 text-white border-brand-500 shadow-glow'
                : 'bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-brand-700 border-blue-200/80 hover:shadow'
                }`}
              title="Toggle side-by-side split screen view with Paper PDF viewer"
            >
              <Columns className="w-4 h-4" />
              <span>{splitView ? 'Exit Split View' : 'Split View Paper'}</span>
              {evidenceItems.length > 0 && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${splitView ? 'bg-white/20 text-white' : 'bg-brand-500 text-white'
                  }`}>
                  {evidenceItems.length} citations
                </span>
              )}
            </button>


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

            {/* Self Healing Indicator if current experiment is failed */}
            {proj.runs?.[eid]?.status?.state === 'failed' && (
              <Link
                to={`/p/${pid}/run`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold hover:bg-purple-100 transition-all shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>🤖 Self-Healing Auto-Repair Ready</span>
              </Link>
            )}
          </div>
        </div>

        {/* Demo Warning Banner */}
        {proj.is_demo && (
          <div className="mt-4 text-xs bg-amber-50/80 border border-amber-200 text-amber-900 rounded-2xl p-3.5 flex items-center gap-2.5 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <b className="font-bold">Synthetic Demo Fixture:</b> Evaluated on synthetic research papers and test repositories.
            </span>
          </div>
        )}

        {/* Analysis Error Alert */}
        {proj.error && (
          <div className="mt-4 text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3.5 flex items-center gap-2.5 font-medium">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span><b className="font-bold">Analysis failed:</b> {proj.error}</span>
          </div>
        )}
      </div>

      {/* Bold, Prominent, Attractive Navigation Tab Bar */}
      <nav className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 border-b-2 border-slate-200">
        {TABS.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === ''}
            className={({ isActive }) =>
              `inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-extrabold whitespace-nowrap transition-all duration-200 ${isActive
                ? 'bg-brand-500 text-white shadow-glow scale-105 border border-brand-400'
                : 'bg-white border border-slate-200 text-slate-700 hover:text-brand-600 hover:border-brand-300 hover:shadow-sm'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Tab Content & Side-by-Side Split View */}
      <div className="pt-2">
        {proj.experiments.length === 0 && !proj.error ? (
          <div className="bg-white border border-slate-200/90 rounded-3xl p-10 sm:p-14 text-center max-w-lg mx-auto shadow-card space-y-5 my-6">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center mx-auto shadow-inner">
              <Sparkles className="w-7 h-7 animate-pulse text-brand-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Project Ready for Analysis</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-sm mx-auto">
                Scan repository code, extract claims from the research PDF, and generate parameter reconciliation.
              </p>
            </div>
            {analysisError && (
              <div className="text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-3 text-left">
                <b>Analysis error:</b> {analysisError}
              </div>
            )}
            <div>
              <button
                onClick={handleRunAnalysis}
                disabled={analyzing}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-semibold bg-brand-500 hover:bg-brand-600 active:scale-95 text-white shadow-glow disabled:opacity-50 transition-all cursor-pointer"
              >
                {analyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing Paper & Repository...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Run Analysis Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : splitView ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Pane: Tab Content (Analysis, Graph, etc.) */}
            <div className="lg:col-span-7 space-y-6">
              <Outlet context={{ pid, proj, eid, setEid, reload, openPaperViewer, splitView, setSplitView } satisfies Ctx} />
            </div>

            {/* Right Pane: Live Embedded PaperViewer Sticky */}
            <div className="lg:col-span-5 sticky top-4">
              <PaperViewer
                pid={pid}
                items={evidenceItems}
                activeItem={activeItem}
                onSelectItem={(it) => setActiveItem(it)}
                onClose={() => setSplitView(false)}
                isModal={false}
              />
            </div>
          </div>
        ) : (
          <Outlet context={{ pid, proj, eid, setEid, reload, openPaperViewer, splitView, setSplitView } satisfies Ctx} />
        )}
      </div>
    </div>
  )
}
