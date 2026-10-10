import { useState, useEffect } from 'react'
import { api, errMsg } from '../api/client'
import { useStatus } from '../useStatus'
import { useProject } from './ProjectLayout'
import {
  Play,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Terminal,
  Activity,
  RotateCw,
  Plus,
  Minus,
  Sparkles,
  AlertTriangle
} from 'lucide-react'

const NODE_STYLE: Record<string, { badge: string; dot: string }> = {
  pending: {
    badge: 'bg-slate-50 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
  running: {
    badge: 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse',
    dot: 'bg-amber-500 animate-ping',
  },
  done: {
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    dot: 'bg-emerald-500',
  },
  failed: {
    badge: 'bg-rose-50 text-rose-800 border-rose-300',
    dot: 'bg-rose-500',
  },
}

export default function Run() {
  const { eid, proj } = useProject()
  const { status, start, poll } = useStatus(eid)
  const [seeds, setSeeds] = useState(3)
  const [err, setErr] = useState('')
  const [healDiagnosis, setHealDiagnosis] = useState<any>(null)
  const [healing, setHealing] = useState(false)
  const blocked = proj.scan?.blocked
  const running = status?.state === 'running'

  const hasFailure = Boolean(
    status?.state === 'failed' ||
    status?.nodes?.Training === 'failed' ||
    status?.nodes?.Dataset === 'failed' ||
    status?.metric_error ||
    (status?.seeds && status.seeds.length > 0 && status.seeds.some((s: any) => s.status === 'failed'))
  )

  // Diagnose failure when experiment encounters any execution or metric issue
  useEffect(() => {
    if (hasFailure) {
      api.diagnoseHeal(eid).then(setHealDiagnosis).catch(() => setHealDiagnosis(null))
    } else {
      setHealDiagnosis(null)
    }
  }, [eid, hasFailure])

  async function handleAutoHeal() {
    setHealing(true)
    setErr('')
    try {
      const res = await api.autoHeal(eid)
      if (res?.ok) {
        window.location.reload()
      }
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setHealing(false)
    }
  }

  async function go() {
    setErr('')
    try {
      await api.run(eid, seeds)
      await poll()
      start()
    } catch (e) {
      setErr(errMsg(e))
    }
  }

  const isIdentical = Boolean(
    status?.seeds &&
      status.seeds.length > 1 &&
      status.seeds.every((s: any) => s.value != null && s.value === status.seeds[0].value)
  )

  const progressPercent = Math.min(
    100,
    Math.round(((status?.seeds_done || 0) / Math.max(1, status?.seeds_total || 1)) * 100)
  )

  return (
    <div className="space-y-8 pb-8">
      {/* Execution Controller Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-200 flex items-center gap-1.5 w-fit mb-2">
              <Activity className="w-3.5 h-3.5 text-brand-500" />
              Sandboxed Execution Center
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Multi-Seed Experiment Runner
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Execute reproducible runs in non-root Docker or virtualenv sandboxes with seed dispersion metrics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Seeds Counter Pill */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-2xl">
              <span className="text-xs font-bold text-slate-700 pl-2">Seeds:</span>
              <button
                type="button"
                onClick={() => setSeeds(s => Math.max(1, s - 1))}
                className="w-7 h-7 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center text-xs font-bold transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-8 text-center font-mono font-extrabold text-sm text-slate-900">
                {seeds}
              </span>
              <button
                type="button"
                onClick={() => setSeeds(s => Math.min(20, s + 1))}
                className="w-7 h-7 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center text-xs font-bold transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <button
              onClick={go}
              disabled={running || !!blocked}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold px-7 py-3 rounded-full shadow-glow text-xs flex items-center gap-2.5 transition-all hover:scale-105 active:scale-95"
            >
              {running ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Running Experiment…</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Run Experiment</span>
                </>
              )}
            </button>
          </div>
        </div>

        {blocked && (
          <div className="mt-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span><b>Execution Blocked:</b> {blocked}</span>
          </div>
        )}

        {err && (
          <div className="mt-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </div>

      {status && status.state !== 'not_started' && (
        <>
          {/* Progress & Stage Nodes */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
            <div>
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="font-extrabold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand-600" />
                  <span>State: <b className="uppercase text-brand-600">{status.state}</b></span>
                </span>
                <span className="font-mono font-semibold text-slate-600">
                  {status.seeds_done} of {status.seeds_total} seeds completed ({progressPercent}%)
                </span>
              </div>

              <div className="h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
                <div
                  className="h-full bg-gradient-to-r from-brand-600 via-brand-500 to-cyan-400 rounded-full transition-all duration-300 shadow-glow"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Stage Nodes Badges */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Execution Stage Graph Status:
              </span>
              <div className="flex gap-2.5 flex-wrap">
                {Object.entries<string>(status.nodes || {}).map(([n, s]) => {
                  const st = NODE_STYLE[s] || NODE_STYLE.pending
                  return (
                    <span
                      key={n}
                      className={`border rounded-2xl px-3.5 py-1.5 text-xs font-semibold flex items-center gap-2 shadow-sm ${st.badge}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                      <span>{n}: {s}</span>
                    </span>
                  )
                })}
              </div>
            </div>

            {status.metric_error && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span><b>Metric Problem:</b> {status.metric_error}</span>
              </div>
            )}

            {isIdentical && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <b>Seed Variance Warning:</b> All seeds executed identically. No variance could be measured because code does not expose a <code>--seed</code> CLI argument.
                </span>
              </div>
            )}

            {status.state === 'failed' && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span><b>Failed at stage {status.failed_stage}:</b> {status.error}</span>
              </div>
            )}

            {healDiagnosis?.can_heal && (
              <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white border border-purple-500/40 rounded-3xl p-6 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-purple-500/20 border border-purple-400/30 rounded-xl">
                      <Sparkles className="w-5 h-5 text-purple-300" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Autonomous Repair Engine</div>
                      <h4 className="text-base font-extrabold text-white tracking-tight">{healDiagnosis.title}</h4>
                    </div>
                  </div>
                  <button
                    onClick={handleAutoHeal}
                    disabled={healing}
                    className="bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-full text-xs shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                  >
                    {healing ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Applying Patch…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>1-Click Auto-Repair & Rerun</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-purple-950/60 border border-purple-800/40 rounded-2xl p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300 mb-1">Diagnosed Root Cause</div>
                    <p className="text-purple-100/90 leading-relaxed">{healDiagnosis.root_cause}</p>
                  </div>
                  <div className="bg-purple-950/60 border border-purple-800/40 rounded-2xl p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300 mb-1">Automated Remedy</div>
                    <p className="text-purple-100/90 leading-relaxed">{healDiagnosis.remedy}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Seeds Results Table */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm">
            <h3 className="text-lg font-extrabold text-slate-900 mb-4 tracking-tight">
              Seed Multi-Run Empirical Outputs
            </h3>
            <div className="overflow-hidden border border-slate-200/90 rounded-2xl">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="p-3.5">Seed Index</th>
                    <th className="p-3.5">Execution Status</th>
                    <th className="p-3.5">{status.metric ? status.metric.toUpperCase() : 'Measured Metric'}</th>
                    <th className="p-3.5">Isolation Sandbox</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(status.seeds || []).map((s: any) => (
                    <tr key={s.seed} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-3.5 font-mono text-xs font-bold text-slate-900">
                        Seed #{s.seed}
                      </td>
                      <td className="p-3.5">
                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          {s.status}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono font-extrabold text-sm text-slate-900">
                        {s.value != null ? s.value.toFixed(2) + (status.percent ? '%' : '') : '—'}
                      </td>
                      <td className="p-3.5 text-xs">
                        {s.isolation === 'docker' ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 w-fit">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Docker Non-Root Container
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 w-fit">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Reduced Isolation (Virtualenv)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Terminal Telemetry Viewer */}
          <div className="rounded-3xl border border-navy-900 bg-navy-950 overflow-hidden shadow-2xl text-slate-200">
            <div className="bg-navy-900/90 px-5 py-3 border-b border-white/10 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-4 h-4 text-brand-400" />
                <span className="font-bold text-white">Live Execution Log Stream</span>
              </div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">stdout / stderr</span>
            </div>
            <pre className="p-5 text-xs font-mono text-emerald-400/90 overflow-x-auto max-h-72 leading-relaxed scrollbar-thin">
              {status.log_tail || '(Awaiting process execution logs…)'}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
