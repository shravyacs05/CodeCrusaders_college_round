import { useEffect, useState } from 'react'
import { api } from '../api/client'
import SeedChart from '../components/SeedChart'
import { StatusPill } from '../components/ProvenanceBadge'
import { useProject } from './ProjectLayout'
import { ShieldCheck, AlertCircle, Info, CheckCircle2, TrendingUp, HelpCircle } from 'lucide-react'

export default function Verify() {
  const { eid } = useProject()
  const [ver, setVer] = useState<any>(null)
  const [seeds, setSeeds] = useState<any[]>([])

  useEffect(() => {
    setVer(null)
    api.verification(eid).then(setVer)
    api.status(eid).then(s => setSeeds(s.seeds || []))
  }, [eid])

  if (!ver) return (
    <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-500">
      <div className="inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm">Calculating empirical statistical verification verdict…</p>
    </div>
  )

  if (ver.status === 'BLOCKED') {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center max-w-xl mx-auto shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-600 flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="mb-2">
          <StatusPill s="BLOCKED" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">Verification Blocked</h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          {ver.reason}. Execute the experiment in the Run tab first and ensure a verified ground truth claim was extracted from the paper.
        </p>
      </div>
    )
  }

  const unit = ver.percent ?? true ? '%' : ''

  return (
    <div className="space-y-6">
      {/* Verdict Summary Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
              Deterministic Verdict
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1 flex items-center gap-3">
              <span>Reproducibility Verdict</span>
              <StatusPill s={ver.status} />
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict deterministic comparison between published claim and empirical sandboxed runs.
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tolerance Rule</div>
            <div className="text-xs font-mono font-medium text-slate-700 mt-0.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              {ver.rule}
            </div>
          </div>
        </div>

        {/* 4 Key Metrics Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Published Claim</div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono mt-1">
              {ver.published}{unit}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Extracted from paper</div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Reproduced Mean</div>
            <div className="text-2xl font-extrabold text-brand-600 font-mono mt-1">
              {ver.reproduced_mean.toFixed(2)}{unit}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">n={ver.n} seeds</div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Metric Delta</div>
            <div className={`text-2xl font-extrabold font-mono mt-1 ${
              Math.abs(ver.diff_pp) <= ver.tolerance_pp ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              {ver.diff_pp >= 0 ? '+' : ''}{ver.diff_pp.toFixed(2)} pp
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Threshold: ±{ver.tolerance_pp} pp</div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Dispersion (Std)</div>
            <div className="text-2xl font-extrabold text-slate-800 font-mono mt-1">
              {ver.std.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Range: {ver.min.toFixed(2)}–{ver.max.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Seed Dispersion Chart */}
      <SeedChart seeds={seeds} published={ver.published} unit={unit} />

      {/* Methodology note */}
      <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 text-xs text-slate-600 flex items-start gap-3">
        <Info className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Matching a headline metric does not conclusively prove the entire methodology was reproduced; seeds, compiler optimizations, GPU hardware architectures, and underlying dependency library versions can shift empirical values.
        </p>
      </div>
    </div>
  )
}
