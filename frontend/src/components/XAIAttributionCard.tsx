import { useState } from 'react'
import {
  Brain,
  Sparkles,
  Lightbulb,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Sliders,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'

export interface XAIAttribution {
  param: string
  label: string
  paper_value?: any
  code_value?: any
  status?: string
  share_pct: number
  impact_pp: number
  direction: 'drag' | 'surplus' | 'positive' | 'neutral'
  paper_ref?: string | null
  code_ref?: string | null
  explanation?: string
  ai_insight?: string
}

export interface XAIReport {
  available: boolean
  ai_enriched?: boolean
  status?: string
  gap_pp?: number
  total_attributable_gap?: number
  scientific_diagnosis?: string
  summary?: string
  attributions?: XAIAttribution[]
  counterfactual?: {
    actionable: boolean
    top_param?: string
    top_label?: string
    current_code_value?: any
    target_paper_value?: any
    closes_gap_pct?: number
    projected_metric?: number
    reaches_reproduced?: boolean
    message?: string
    ai_insight?: string
  }
}

export default function XAIAttributionCard({
  xai,
  unit = '%',
  onInspectParam,
}: {
  xai?: XAIReport | null
  unit?: string
  onInspectParam?: (param: string) => void
}) {
  const [showAll, setShowAll] = useState(false)

  if (!xai || !xai.available) {
    return null
  }

  const attributions = xai.attributions || []
  const cf = xai.counterfactual
  const isReproduced = xai.status === 'REPRODUCED'
  const visibleAttributions = showAll ? attributions : attributions.slice(0, 4)

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm hover:shadow-md transition-shadow space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200 flex items-center gap-1.5 shadow-2xs">
              <Brain className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
              Explainable AI (XAI)
            </span>
            {xai.ai_enriched ? (
              <span className="text-[10px] font-bold tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                AI Research Synthesis
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                Sensitivity Attribution
              </span>
            )}
          </div>

          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Root-Cause Discrepancy Attribution</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            {xai.summary ||
              'Decomposes empirical replication gap into parameter-level causal elasticities to explain why the published claim diverged.'}
          </p>
        </div>

        {/* Gap Stat Pill */}
        <div className="sm:text-right bg-gradient-to-br from-purple-50/70 to-indigo-50/70 p-3.5 rounded-2xl border border-purple-100 shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
            Attributable Gap
          </div>
          <div className="text-2xl font-black font-mono text-purple-900 mt-0.5">
            {xai.gap_pp !== undefined ? (xai.gap_pp >= 0 ? `+${xai.gap_pp.toFixed(2)}` : xai.gap_pp.toFixed(2)) : '0.00'}
            <span className="text-sm font-semibold text-purple-700 ml-0.5">pp</span>
          </div>
          <div className="text-[10px] text-purple-600 font-medium">
            {isReproduced ? 'Within tolerance band' : 'Accounted by XAI model'}
          </div>
        </div>
      </div>

      {/* Attribution Breakdown List / Waterfall Bars */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-brand-600" />
            <span>Parameter Elasticity & Blame Share</span>
          </h4>
          <span className="text-[11px] text-slate-400 font-medium">
            Ranked by impact share
          </span>
        </div>

        <div className="space-y-3">
          {visibleAttributions.map((attr, idx) => {
            const isNegative = attr.direction === 'drag'
            const isNeutral = attr.direction === 'neutral'
            const isPositive = attr.direction === 'positive'

            return (
              <div
                key={attr.param + idx}
                className="bg-slate-50/80 hover:bg-slate-50 rounded-2xl p-4 border border-slate-200/80 transition-colors space-y-2.5"
              >
                {/* Top line: Label, Values, Share Pill */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold font-mono text-slate-900">
                      {attr.label}
                    </span>
                    {attr.status && (
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        attr.status === 'MISMATCH'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : attr.status === 'MISSING'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : attr.status === 'VARIANCE'
                          ? 'bg-slate-100 text-slate-600 border-slate-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {attr.status}
                      </span>
                    )}

                    {attr.paper_value !== undefined && attr.code_value !== undefined && attr.status !== 'VARIANCE' && (
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                        <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                          code: <b>{String(attr.code_value ?? 'none')}</b>
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded border border-purple-200">
                          paper: <b>{String(attr.paper_value ?? 'none')}</b>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Impact & Share Badge */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="text-xs font-mono font-extrabold text-slate-900">
                        {attr.share_pct}%
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold ml-1">
                        share
                      </span>
                    </div>

                    <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-xl flex items-center gap-1 ${
                      isNegative
                        ? 'bg-rose-100 text-rose-800'
                        : isPositive
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {isNegative ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : isPositive ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : null}
                      <span>{attr.impact_pp >= 0 ? `+${attr.impact_pp.toFixed(2)}` : attr.impact_pp.toFixed(2)} pp</span>
                    </span>
                  </div>
                </div>

                {/* Progress bar visualizing causal share */}
                <div className="w-full h-2 bg-slate-200/70 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isNegative
                        ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                        : isPositive
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                    }`}
                    style={{ width: `${Math.max(attr.share_pct, 4)}%` }}
                  />
                </div>

                {/* Theoretical Mechanism callout */}
                {attr.ai_insight && (
                  <div className="bg-purple-50/80 border border-purple-100/90 rounded-xl px-3 py-1.5 text-[11px] text-purple-900 flex items-start gap-2 mt-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                    <span>
                      <b className="font-semibold text-purple-950">Theoretical Mechanism:</b>{' '}
                      {attr.ai_insight}
                    </span>
                  </div>
                )}

                {/* Explanatory sentence & citation buttons */}
                {attr.explanation && (
                  <div className="text-[11px] text-slate-600 flex items-center justify-between gap-2 flex-wrap pt-0.5">
                    <p className="line-clamp-2">{attr.explanation}</p>
                    {onInspectParam && attr.paper_ref && (
                      <button
                        onClick={() => onInspectParam(attr.param)}
                        className="text-[10px] font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded border border-brand-200 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Locate in Paper PDF
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {attributions.length > 4 && (
          <div className="text-center pt-1">
            <button
              onClick={() => setShowAll(!showAll)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 transition-colors"
            >
              {showAll ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Show Top Factors Only</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Show All {attributions.length} Attribution Factors</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Actionable Counterfactual Intervention Card */}
      {cf && cf.actionable && (
        <div className="bg-gradient-to-br from-indigo-500/5 via-purple-500/10 to-pink-500/5 border border-purple-200 rounded-2xl p-5 sm:p-6 space-y-3 relative overflow-hidden">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Counterfactual Intervention Recommendation
              </h4>
              <p className="text-[11px] text-slate-500">
                Minimum parameter intervention mathematically projected to recover parity.
              </p>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-xs rounded-xl p-4 border border-purple-100 text-xs text-slate-700 leading-relaxed shadow-2xs">
            <p className="font-medium text-slate-800">
              {cf.message}
            </p>

            {cf.ai_insight && (
              <div className="mt-2.5 text-purple-900 bg-purple-50/80 p-2.5 rounded-lg border border-purple-100 flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed"><b>Research Mechanism:</b> {cf.ai_insight}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100 text-[11px]">
              <div>
                <span className="text-slate-400 font-semibold block">Target Action:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {cf.top_label} ➔ {String(cf.target_paper_value)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Gap Closed:</span>
                <span className="font-extrabold text-purple-700 font-mono">
                  +{cf.closes_gap_pct}% of total gap
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Projected Outcome:</span>
                <span className="font-extrabold text-slate-900 font-mono">
                  {cf.projected_metric}{unit}{' '}
                  {cf.reaches_reproduced && (
                    <span className="text-emerald-600 font-bold ml-1">
                      [REPRODUCED]
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Methodology Note */}
      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>
          Attribution weights are computed using parameter divergence ratios combined with empirical loss-landscape elasticity priors and observed seed dispersion.
        </span>
      </div>
    </div>
  )
}
