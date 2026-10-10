import { useEffect, useState } from 'react'
import { api, errMsg } from '../api/client'
import { useProject } from './ProjectLayout'
import { GitCompare, ArrowRight, CheckCircle2, AlertCircle, Sliders } from 'lucide-react'

export default function Compare() {
  const { proj, eid } = useProject()
  const exps: any[] = proj.experiments
  const [a, setA] = useState(eid)
  const [b, setB] = useState(eid)
  const [res, setRes] = useState<any>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const cur = exps.find(e => e.id === eid)
    setB(eid)
    setA(cur?.parent_id || exps[0]?.id || eid)
  }, [eid])

  useEffect(() => {
    if (!a || !b) return
    setErr('')
    setRes(null)
    api.compare(a, b).then(setRes).catch(e => setErr(errMsg(e)))
  }, [a, b])

  const renderSelector = (val: string, onChange: (s: string) => void) => (
    <select
      className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:border-brand-500 shadow-sm"
      value={val}
      onChange={e => onChange(e.target.value)}
    >
      {exps.map(e => (
        <option key={e.id} value={e.id}>
          v{e.version} • {e.config_hash}
        </option>
      ))}
    </select>
  )

  if (exps.length < 2) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
          <Sliders className="w-6 h-6" />
        </div>
        <h3 className="text-base font-extrabold text-slate-900 mb-1">Single Version Detected</h3>
        <p className="text-xs text-slate-500 leading-relaxed mb-4">
          Only version 1 exists for this project. Edit a parameter node in the Graph view to branch a new child spec version, run both versions, and compare causality.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Version Selector Banner */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
            Version Differencing
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-1">
            Compare Experiment Specs
          </h2>
        </div>

        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
          {renderSelector(a, setA)}
          <ArrowRight className="w-4 h-4 text-slate-400" />
          {renderSelector(b, setB)}
        </div>
      </div>

      {err && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {res && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Config Changes Card */}
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-3">
                Configuration Deltas
              </h3>
              {res.changes.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No parameter configuration changes between these versions.</p>
              ) : (
                <div className="overflow-hidden border border-slate-200/90 rounded-2xl">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="p-3">Parameter</th>
                        <th className="p-3">Baseline (From)</th>
                        <th className="p-3">Modified (To)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {res.changes.map((c: any) => (
                        <tr key={c.param} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-900">{c.param}</td>
                          <td className="p-3 text-slate-600">{String(c.from ?? 'MISSING')}</td>
                          <td className="p-3 text-brand-600 font-bold">{String(c.to ?? 'MISSING')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Metric Difference Card */}
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                  Empirical Metric Impact
                </h3>
                {res.metric_delta_pp != null ? (
                  <div className="pt-2">
                    <div className="text-3xl font-extrabold font-mono text-slate-900">
                      {(typeof res.metric_delta_pp === 'number'
                        ? res.metric_delta_pp
                        : res.metric_delta_pp.accuracy_pp) >= 0
                        ? '+'
                        : ''}
                      {(typeof res.metric_delta_pp === 'number'
                        ? res.metric_delta_pp
                        : res.metric_delta_pp.accuracy_pp
                      ).toFixed(2)}{' '}
                      pp
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Percentage point shift observed in execution metrics.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                    Both versions must complete execution runs to calculate the empirical metric delta.
                  </div>
                )}
              </div>

              {/* Causality Note */}
              <div className="mt-4 p-3.5 rounded-2xl bg-blue-50/80 border border-blue-100 text-xs text-slate-700">
                <span className="font-semibold text-brand-900">{res.note}</span>
                {res.single_factor && (
                  <span className="block mt-1 font-bold text-emerald-700">
                    ✓ Verified single-factor causality: exactly one parameter modified.
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
