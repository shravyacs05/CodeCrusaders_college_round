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
  FileSearch,
  Zap,
  Target,
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

function AttributionRow({
  attr,
  maxShare,
  onInspectParam,
}: {
  attr: XAIAttribution
  maxShare: number
  onInspectParam?: (param: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isDrag = attr.direction === 'drag'
  const isPositive = attr.direction === 'positive' || attr.direction === 'surplus'
  const barColor = isDrag
    ? 'from-rose-500 to-orange-400'
    : isPositive
    ? 'from-emerald-500 to-teal-400'
    : 'from-violet-500 to-indigo-400'
  const impactColor = isDrag ? 'text-rose-600 bg-rose-50 border-rose-200' : isPositive ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'
  const statusColor =
    attr.status === 'MISMATCH'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : attr.status === 'MISSING'
      ? 'bg-rose-100 text-rose-700 border-rose-200'
      : attr.status === 'VARIANCE'
      ? 'bg-slate-100 text-slate-500 border-slate-200'
      : 'bg-emerald-100 text-emerald-700 border-emerald-200'

  const barWidth = maxShare > 0 ? (attr.share_pct / maxShare) * 100 : attr.share_pct

  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white hover:border-violet-200 hover:shadow-sm transition-all duration-200">
      <div className="p-4">
        {/* Row header */}
        <div className="flex items-center gap-3">
          {/* Rank + bar column */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm font-bold text-slate-800">{attr.label}</span>
              {attr.status && (
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
                  {attr.status}
                </span>
              )}
              {attr.paper_value !== undefined && attr.code_value !== undefined && attr.status !== 'VARIANCE' && (
                <div className="flex items-center gap-1 text-[11px] font-mono ml-1">
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{String(attr.code_value ?? '—')}</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <span className="bg-violet-100 px-1.5 py-0.5 rounded text-violet-700">{String(attr.paper_value ?? '—')}</span>
                </div>
              )}
            </div>

            {/* Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
                  style={{ width: `${Math.max(barWidth, 5)}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-500 tabular-nums w-10 text-right shrink-0">
                {attr.share_pct}%
              </span>
            </div>
          </div>

          {/* Impact badge */}
          <div className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold ${impactColor}`}>
            {isDrag ? <TrendingDown className="w-3.5 h-3.5" /> : isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
            {attr.impact_pp >= 0 ? '+' : ''}{attr.impact_pp.toFixed(2)} pp
          </div>

          {/* Expand toggle */}
          {(attr.ai_insight || attr.explanation) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Expandable detail */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 animate-in slide-in-from-top-1 duration-200">
            {attr.ai_insight && (
              <div className="flex items-start gap-2 bg-violet-50 rounded-xl px-3 py-2.5 border border-violet-100">
                <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-violet-900 leading-relaxed">{attr.ai_insight}</p>
              </div>
            )}
            {attr.explanation && (
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">{attr.explanation}</p>
                {onInspectParam && attr.paper_ref && (
                  <button
                    onClick={() => onInspectParam(attr.param)}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded-lg border border-violet-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <FileSearch className="w-3 h-3" />
                    View in PDF
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
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

  if (!xai || !xai.available) return null

  const attributions = xai.attributions || []
  const cf = xai.counterfactual
  const isReproduced = xai.status === 'REPRODUCED'
  const visibleAttributions = showAll ? attributions : attributions.slice(0, 4)
  const maxShare = attributions[0]?.share_pct ?? 100

  const gapNum = xai.gap_pp ?? 0
  const gapPositive = gapNum >= 0

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">

      {/* ─── Header ─── */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5 sm:px-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                Explainable AI · Root-Cause Analysis
              </span>
              {xai.ai_enriched && (
                <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-400/20 text-amber-200 border border-amber-300/30 px-2 py-0.5 rounded-full">
                  <Sparkles className="w-3 h-3" />
                  AI Enriched
                </span>
              )}
            </div>
            <h3 className="text-xl font-extrabold text-white tracking-tight">
              Discrepancy Attribution
            </h3>
            <p className="text-white/60 text-xs mt-1 max-w-lg">
              Parameter-level causal breakdown of why the published claim diverges from your reproduction.
            </p>
          </div>

          {/* Gap stat */}
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-3 text-center shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
              {isReproduced ? 'Within Tolerance' : 'Attributable Gap'}
            </div>
            <div className={`text-3xl font-black font-mono mt-0.5 ${gapPositive ? 'text-emerald-300' : 'text-rose-300'}`}>
              {gapPositive ? '+' : ''}{gapNum.toFixed(2)}
              <span className="text-base font-semibold text-white/70 ml-1">pp</span>
            </div>
            {!isReproduced && (
              <div className="text-[10px] text-white/50 mt-0.5">vs published claim</div>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-7 space-y-5">

        {/* ─── Attribution bars ─── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Parameter Blame Share
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Click <ChevronDown className="w-3 h-3 inline" /> to inspect mechanism
            </span>
          </div>

          <div className="space-y-2">
            {visibleAttributions.map((attr, idx) => (
              <AttributionRow
                key={attr.param + idx}
                attr={attr}
                maxShare={maxShare}
                onInspectParam={onInspectParam}
              />
            ))}
          </div>

          {attributions.length > 4 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-3 w-full py-2 text-xs font-semibold text-violet-600 hover:text-violet-800 hover:bg-violet-50 rounded-xl border border-violet-100 hover:border-violet-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {showAll ? (
                <><ChevronUp className="w-3.5 h-3.5" /> Show fewer</>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5" /> Show all {attributions.length} factors</>
              )}
            </button>
          )}
        </div>

        {/* ─── Counterfactual ─── */}
        {cf && cf.actionable && (
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 overflow-hidden">
            {/* CF header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-violet-100 bg-white/50">
              <div className="w-7 h-7 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
                <Lightbulb className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-800">Counterfactual Recommendation</div>
                <div className="text-[10px] text-slate-400">Minimum change to recover parity</div>
              </div>
            </div>

            {/* CF stats row */}
            <div className="grid grid-cols-3 divide-x divide-violet-100 border-b border-violet-100">
              <div className="px-4 py-3 text-center">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Change</div>
                <div className="text-sm font-bold text-slate-800 font-mono flex items-center justify-center gap-1">
                  <span className="text-slate-500">{String(cf.current_code_value)}</span>
                  <ArrowRight className="w-3 h-3 text-violet-400" />
                  <span className="text-violet-700">{String(cf.target_paper_value)}</span>
                </div>
                <div className="text-[10px] text-slate-400">{cf.top_label}</div>
              </div>
              <div className="px-4 py-3 text-center">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Gap Closed</div>
                <div className="text-lg font-black font-mono text-violet-700">+{cf.closes_gap_pct}%</div>
              </div>
              <div className="px-4 py-3 text-center">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Projected</div>
                <div className="text-lg font-black font-mono text-slate-800">
                  {cf.projected_metric}{unit}
                </div>
                {cf.reaches_reproduced && (
                  <div className="text-[10px] font-bold text-emerald-600 flex items-center justify-center gap-1 mt-0.5">
                    <Target className="w-3 h-3" /> Reproduced
                  </div>
                )}
              </div>
            </div>

            {/* CF message */}
            {(cf.message || cf.ai_insight) && (
              <div className="px-4 py-3 space-y-2">
                {cf.message && (
                  <p className="text-xs text-slate-600 leading-relaxed">{cf.message}</p>
                )}
                {cf.ai_insight && (
                  <div className="flex items-start gap-2 bg-white/70 rounded-xl px-3 py-2 border border-violet-100">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-violet-900 leading-relaxed">{cf.ai_insight}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
