import { useState } from 'react'
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
  Layers,
  Sparkles,
  AlertTriangle,
  RotateCw
} from 'lucide-react'

const NODE_STYLE: Record<string, string> = {
  pending: 'bg-slate-50 text-slate-600 border-slate-200',
  running: 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  failed: 'bg-rose-50 text-rose-700 border-rose-300',
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
    <div className="space-y-6">
      {/* Controls Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
              Sandboxed Execution
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1">
              Multi-Seed Experiment Runner
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Execute reproducible runs in isolated Docker or virtualenv sandboxes with dispersion measurement.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-2xl">
              <label htmlFor="seeds-input" className="text-xs font-semibold text-slate-700">Seeds:</label>
              <input
                id="seeds-input"
                type="number"
                min={1}
                max={20}
                value={seeds}
                onChange={e => setSeeds(Number(e.target.value))}
                className="w-14 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs font-mono font-bold text-center text-slate-800 focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              onClick={go}
              disabled={running || !!blocked}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold px-6 py-2.5 rounded-full shadow-glow text-xs flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
            >
              {running ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Running Experiment…</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Experiment</span>
                </>
              )}
            </button>
          </div>
        </div>

        {blocked && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span><b>Execution Blocked:</b> {blocked}</span>
          </div>
        )}

        {err && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </div>

      {status && status.state !== 'not_started' && (
        <>
          {/* Progress & Stage Status */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-5">
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-slate-800 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand-600" />
                  <span>Execution Status: <b className="uppercase text-brand-600">{status.state}</b></span>
                </span>
                <span className="font-mono text-slate-500">
                  {status.seeds_done} of {status.seeds_total} seeds completed ({progressPercent}%)
                </span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                <div
                  className="h-full bg-gradient-to-r from-brand-500 to-cyan-400 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Stage Nodes Badges */}
            <div className="flex gap-2 flex-wrap pt-2">
              {Object.entries<string>(status.nodes || {}).map(([n, s]) => (
                <span
                  key={n}
                  className={`border rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${NODE_STYLE[s] || NODE_STYLE.pending}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  <span>{n}: {s}</span>
                </span>
              ))}
            </div>

            {status.metric_error && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3.5 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span><b>Metric Problem:</b> {status.metric_error}</span>
              </div>
            )}

            {isIdentical && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3.5 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <b>Seed Variance Warning:</b> All seeds executed identically. No variance could be measured because code does not expose a <code>--seed</code> CLI argument.
                </span>
              </div>
            )}

            {status.state === 'failed' && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span><b>Failed at stage {status.failed_stage}:</b> {status.error}</span>
              </div>
            )}
          </div>

          {/* Seeds Results Table */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
            <h3 className="text-base font-extrabold text-slate-900 mb-4 tracking-tight">
              Seed Multi-Run Outputs
            </h3>
            <div className="overflow-hidden border border-slate-200/90 rounded-2xl">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="p-3.5">Seed Index</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">{status.metric ? status.metric.toUpperCase() : 'Measured Metric'}</th>
                    <th className="p-3.5">Isolation Environment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(status.seeds || []).map((s: any) => (
                    <tr key={s.seed} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3.5 font-mono text-xs font-semibold text-slate-900">
                        Seed #{s.seed}
                      </td>
                      <td className="p-3.5">
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {s.status}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono font-bold text-xs text-slate-900">
                        {s.value != null ? s.value.toFixed(2) + (status.percent ? '%' : '') : '—'}
                      </td>
                      <td className="p-3.5 text-xs">
                        {s.isolation === 'docker' ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> Docker Non-Root Container
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium flex items-center gap-1">
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

          {/* Terminal Log Viewer */}
          <div className="rounded-3xl border border-navy-900 bg-navy-950 overflow-hidden shadow-2xl text-slate-200">
            <div className="bg-navy-900/90 px-4 py-3 border-b border-white/10 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-brand-400" />
                <span className="font-semibold text-white">Execution Log Stream</span>
              </div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Live stdout/stderr</span>
            </div>
            <pre className="p-4 text-xs font-mono text-emerald-400/90 overflow-x-auto max-h-64 leading-relaxed scrollbar-thin">
              {status.log_tail || '(Awaiting process execution logs…)'}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
