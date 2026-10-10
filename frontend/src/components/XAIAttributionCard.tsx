import { useState } from 'react'
import {
  Brain,
  Sparkles,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  FileSearch,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Zap,
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

function FactorCard({
  attr,
  rank,
  onInspectParam,
}: {
  attr: XAIAttribution
  rank: number
  onInspectParam?: (param: string) => void
}) {
  const [open, setOpen] = useState(false)
  const isDrag = attr.direction === 'drag'
  const isPositive = attr.direction === 'positive' || attr.direction === 'surplus'
  const isNeutral = attr.direction === 'neutral'

  // Plain English severity label
  const severity =
    attr.share_pct >= 50
      ? { label: 'Big impact', color: 'text-rose-600 bg-rose-50 border-rose-200' }
      : attr.share_pct >= 20
      ? { label: 'Moderate impact', color: 'text-amber-600 bg-amber-50 border-amber-200' }
      : { label: 'Minor impact', color: 'text-slate-500 bg-slate-50 border-slate-200' }

  const barColor = isDrag
    ? 'bg-rose-500'
    : isPositive
    ? 'bg-emerald-500'
    : 'bg-violet-400'

  const hasMismatch = attr.status === 'MISMATCH' || attr.status === 'MISSING'

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
      hasMismatch
        ? 'border-rose-200 bg-rose-50/30'
        : isPositive
        ? 'border-emerald-200 bg-emerald-50/20'
        : 'border-slate-200 bg-white'
    }`}>
      {/* Main row */}
      <div className="p-4">
        <div className="flex items-center gap-4">
          {/* Rank badge */}
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${
            rank === 1
              ? 'bg-rose-100 text-rose-700'
              : rank === 2
              ? 'bg-amber-100 text-amber-700'
              : 'bg-slate-100 text-slate-500'
          }`}>
            {rank}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Label + severity */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-bold text-slate-800">{attr.label}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${severity.color}`}>
                {severity.label}
              </span>
            </div>

            {/* Mismatch value diff — the most important info! */}
            {attr.paper_value !== undefined && attr.code_value !== undefined && attr.status !== 'VARIANCE' && (
              <div className="flex items-center gap-1.5 text-xs mb-2">
                <span className="text-slate-400">Paper used</span>
                <span className="font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-lg font-mono">
                  {String(attr.paper_value)}
                </span>
                <span className="text-slate-400">but your code has</span>
                <span className={`font-bold px-2 py-0.5 rounded-lg font-mono border ${
                  hasMismatch
                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                    : 'text-slate-700 bg-white border-slate-200'
                }`}>
                  {String(attr.code_value)}
                </span>
              </div>
            )}

            {/* Bar + % */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor} transition-all duration-700`}
                  style={{ width: `${Math.max(attr.share_pct, 4)}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-500 tabular-nums shrink-0 w-16 text-right">
                {attr.share_pct}% of gap
              </span>
            </div>
          </div>

          {/* Impact */}
          <div className="shrink-0 text-right">
            <div className={`text-lg font-black font-mono ${
              isDrag ? 'text-rose-600' : isPositive ? 'text-emerald-600' : 'text-slate-700'
            }`}>
              {isDrag ? <TrendingDown className="w-4 h-4 inline mr-0.5" /> : isPositive ? <TrendingUp className="w-4 h-4 inline mr-0.5" /> : null}
              {attr.impact_pp >= 0 ? '+' : ''}{attr.impact_pp.toFixed(2)}
              <span className="text-xs font-semibold text-slate-400 ml-0.5">pp</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {isDrag ? 'dragging result down' : isPositive ? 'boosting result' : 'variance'}
            </div>
          </div>

          {/* Expand */}
          {(attr.ai_insight || (onInspectParam && attr.paper_ref)) && (
            <button
              onClick={() => setOpen(!open)}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors cursor-pointer"
            >
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded: plain-English explanation */}
      {open && (
        <div className="px-4 pb-4 pt-0 space-y-2 border-t border-dashed border-slate-200">
          {attr.ai_insight && (
            <div className="mt-3 flex items-start gap-2.5 bg-violet-50 rounded-xl px-3 py-2.5 border border-violet-100">
              <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] font-bold text-violet-500 uppercase tracking-wider mb-0.5">Why this matters</div>
                <p className="text-xs text-violet-900 leading-relaxed">{attr.ai_insight}</p>
              </div>
            </div>
          )}
          {onInspectParam && attr.paper_ref && (
            <button
              onClick={() => onInspectParam(attr.param)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-600 hover:text-violet-800 hover:bg-violet-50 px-3 py-1.5 rounded-lg border border-violet-100 hover:border-violet-200 transition-colors cursor-pointer"
            >
              <FileSearch className="w-3.5 h-3.5" />
              See where the paper specifies this value
            </button>
          )}
        </div>
      )}
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

  const gapNum = xai.gap_pp ?? 0
  const absDiff = Math.abs(gapNum).toFixed(2)
  const mismatches = attributions.filter(a => a.status === 'MISMATCH' || a.status === 'MISSING')

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">

      {/* ─── Header: Plain English Story ─── */}
      <div className="px-6 py-5 sm:px-7 border-b border-slate-100">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-2xl bg-violet-600 flex items-center justify-center shrink-0 shadow-sm">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-500">AI Explanation</span>
              {xai.ai_enriched && (
                <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">
                  <Sparkles className="w-2.5 h-2.5" />
                  Gemini powered
                </span>
              )}
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Why did the results differ?
            </h3>
          </div>
        </div>

        {/* Big plain English summary box */}
        <div className={`rounded-2xl p-4 flex items-start gap-4 ${
          isReproduced
            ? 'bg-emerald-50 border border-emerald-200'
            : 'bg-slate-50 border border-slate-200'
        }`}>
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
            isReproduced ? 'bg-emerald-100' : 'bg-rose-100'
          }`}>
            {isReproduced
              ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              : <AlertCircle className="w-5 h-5 text-rose-500" />
            }
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800 leading-snug">
              {isReproduced
                ? `✅ Your result is within acceptable range of the paper.`
                : `Your result is ${absDiff} percentage points ${gapNum < 0 ? 'below' : 'above'} the paper's claim.`
              }
            </div>
            <div className="text-xs text-slate-500 mt-1 leading-relaxed">
              {isReproduced
                ? 'Small differences exist but fall within normal statistical tolerance.'
                : mismatches.length > 0
                  ? `The AI found ${mismatches.length} setting${mismatches.length > 1 ? 's' : ''} that differ${mismatches.length === 1 ? 's' : ''} from the paper — these are likely causing the gap.`
                  : 'Differences are likely due to random variation across training runs.'
              }
            </div>
          </div>
          {!isReproduced && (
            <div className="ml-auto shrink-0 text-right">
              <div className="text-2xl font-black font-mono text-rose-600">
                {gapNum >= 0 ? '+' : ''}{gapNum.toFixed(2)}pp
              </div>
              <div className="text-[10px] text-slate-400">difference</div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 sm:p-7 space-y-4">

        {/* ─── What's causing it ─── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold text-slate-700">
              What's causing the difference?
            </span>
            <span className="text-xs text-slate-400">Ranked by impact</span>
          </div>

          <div className="space-y-2">
            {visibleAttributions.map((attr, idx) => (
              <FactorCard
                key={attr.param + idx}
                attr={attr}
                rank={idx + 1}
                onInspectParam={onInspectParam}
              />
            ))}
          </div>

          {attributions.length > 4 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-3 w-full py-2.5 text-xs font-semibold text-violet-600 hover:text-violet-800 hover:bg-violet-50 rounded-xl border border-violet-100 hover:border-violet-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {showAll
                ? <><ChevronUp className="w-3.5 h-3.5" /> Show fewer factors</>
                : <><ChevronDown className="w-3.5 h-3.5" /> Show all {attributions.length} factors</>
              }
            </button>
          )}
        </div>

        {/* ─── What to do about it ─── */}
        {cf && cf.actionable && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-emerald-100 bg-white/60">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                <Wrench className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-800">How to fix it</div>
                <div className="text-[10px] text-slate-400">Change this one setting to get much closer to the paper</div>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* The fix — dead simple */}
              <div className="flex items-center gap-3 bg-white rounded-xl p-3.5 border border-emerald-100 shadow-xs">
                <div className="text-xs text-slate-500 font-medium shrink-0">Change</div>
                <div className="font-bold text-sm text-slate-700">{cf.top_label}</div>
                <div className="flex items-center gap-1.5 ml-auto font-mono text-sm">
                  <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-lg font-bold">{String(cf.current_code_value)}</span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-lg font-bold">{String(cf.target_paper_value)}</span>
                </div>
              </div>

              {/* Expected outcome */}
              <div className="flex items-center justify-between gap-4">
                <div className="text-xs text-slate-500">
                  This single change is expected to close <span className="font-bold text-emerald-700">+{cf.closes_gap_pct}%</span> of the gap.
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-slate-400">Expected result after fix:</div>
                  <div className="text-sm font-black font-mono text-slate-800">
                    {cf.projected_metric}{unit}
                    {cf.reaches_reproduced && (
                      <span className="ml-2 text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">✓ Matches paper</span>
                    )}
                  </div>
                </div>
              </div>

              {cf.ai_insight && (
                <div className="flex items-start gap-2 bg-white/70 rounded-xl px-3 py-2.5 border border-violet-100">
                  <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-violet-900 leading-relaxed">{cf.ai_insight}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
