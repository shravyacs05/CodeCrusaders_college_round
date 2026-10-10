import { useState } from 'react'
import { Brain, Sparkles, ArrowRight, FileSearch, Wrench, ChevronDown, ChevronUp } from 'lucide-react'

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

function FactorRow({
  attr,
  rank,
  onInspectParam,
}: {
  attr: XAIAttribution
  rank: number
  onInspectParam?: (param: string) => void
}) {
  const isDrag = attr.direction === 'drag'
  const isMatch = attr.status === 'MATCH' || attr.direction === 'positive'
  const hasValues = attr.paper_value !== undefined && attr.code_value !== undefined && attr.status !== 'VARIANCE'
  const hasMismatch = attr.status === 'MISMATCH' || attr.status === 'MISSING'

  // Human-readable impact sentence
  const impactSentence = hasMismatch
    ? `This setting is ${Math.abs(attr.impact_pp).toFixed(2)} accuracy points off from what the paper reports.`
    : attr.direction === 'neutral'
    ? `Natural variation across training runs contributes ${Math.abs(attr.impact_pp).toFixed(2)} accuracy points of spread.`
    : `This setting aligns with the paper and contributes positively.`

  return (
    <div className={`border rounded-xl overflow-hidden bg-white transition-colors ${
      hasMismatch ? 'border-rose-200' : 'border-slate-200'
    }`}>
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          {/* Rank */}
          <span className="text-sm font-bold text-slate-300 w-5 shrink-0 text-center mt-0.5">{rank}</span>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Label + status */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-800">{attr.label}</span>
              {hasMismatch && (
                <span className="text-[10px] font-semibold text-rose-500 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                  differs from paper
                </span>
              )}
              {isMatch && !hasMismatch && (
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                  matches paper
                </span>
              )}
            </div>

            {/* Paper vs code values — plain English */}
            {hasValues && (
              <p className="text-xs text-slate-500">
                Paper uses{' '}
                <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                  hasMismatch ? 'text-blue-700 bg-blue-50' : 'text-slate-700 bg-slate-100'
                }`}>{String(attr.paper_value)}</span>
                , your code has{' '}
                <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                  hasMismatch ? 'text-rose-700 bg-rose-50' : 'text-slate-700 bg-slate-100'
                }`}>{String(attr.code_value)}</span>
              </p>
            )}

            {/* Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    hasMismatch ? 'bg-rose-400' : isMatch ? 'bg-emerald-400' : 'bg-slate-300'
                  }`}
                  style={{ width: `${Math.max(attr.share_pct, 3)}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-400 shrink-0">
                <span className="font-semibold text-slate-600">{attr.share_pct}%</span> of total gap
              </span>
            </div>

            {/* Impact in plain English */}
            <p className="text-[11px] text-slate-400 leading-relaxed">{impactSentence}</p>

            {/* AI explanation — always visible if present */}
            {attr.ai_insight && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Why this matters</div>
                <p className="text-xs text-slate-600 leading-relaxed">{attr.ai_insight}</p>
              </div>
            )}

            {/* Link to paper */}
            {onInspectParam && attr.paper_ref && (
              <button
                onClick={() => onInspectParam(attr.param)}
                className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors cursor-pointer"
              >
                <FileSearch className="w-3.5 h-3.5" />
                Find this in the paper
              </button>
            )}
          </div>
        </div>
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
  const visible = showAll ? attributions : attributions.slice(0, 4)
  const gapNum = xai.gap_pp ?? 0
  const mismatches = attributions.filter(a => a.status === 'MISMATCH' || a.status === 'MISSING')

  // Build a plain-English one-liner
  const topFactor = attributions[0]
  const summaryLine = isReproduced
    ? 'Your result falls within the paper\'s tolerance range. The small differences below are within normal variation.'
    : mismatches.length > 0 && topFactor
    ? `Your result differs by ${Math.abs(gapNum).toFixed(2)} accuracy points from the published claim. The main cause is ${topFactor.label.toLowerCase()}${topFactor.paper_value !== undefined ? ` — the paper used ${topFactor.paper_value}, your code uses ${topFactor.code_value}` : ''}.`
    : `Your result differs by ${Math.abs(gapNum).toFixed(2)} accuracy points. The difference appears to come from natural variation across training runs.`

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm">

      {/* Header */}
      <div className="px-6 py-5 sm:px-7 border-b border-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0 mt-0.5">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
                  Reproducibility Analysis
                </span>
                {xai.ai_enriched && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <Sparkles className="w-2.5 h-2.5" />
                    AI analysis
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">{summaryLine}</p>
            </div>
          </div>

          {/* Gap number */}
          {!isReproduced && (
            <div className="shrink-0 text-right pt-1">
              <div className="text-2xl font-black font-mono text-slate-800 tabular-nums">
                {gapNum >= 0 ? '+' : ''}{gapNum.toFixed(2)}
                <span className="text-sm font-semibold text-slate-400 ml-1">{unit}</span>
              </div>
              <div className="text-[10px] text-slate-400">from published</div>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-5 sm:px-7 space-y-4">

        {/* Contributing factors */}
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Contributing factors
          </div>

          <div className="space-y-2">
            {visible.map((attr, i) => (
              <FactorRow
                key={attr.param + i}
                attr={attr}
                rank={i + 1}
                onInspectParam={onInspectParam}
              />
            ))}
          </div>

          {attributions.length > 4 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-2 w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {showAll
                ? <><ChevronUp className="w-3.5 h-3.5" /> Show fewer</>
                : <><ChevronDown className="w-3.5 h-3.5" /> Show {attributions.length - 4} more</>
              }
            </button>
          )}
        </div>

        {/* Recommendation */}
        {cf && cf.actionable && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200 bg-white">
              <Wrench className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">Suggested fix</span>
            </div>
            <div className="px-4 py-3.5 space-y-2">
              <p className="text-sm text-slate-700 leading-relaxed">
                Change <span className="font-semibold text-slate-900">{cf.top_label}</span> from{' '}
                <span className="font-mono font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">{String(cf.current_code_value)}</span>
                {' '}to{' '}
                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{String(cf.target_paper_value)}</span>
                {' '}to close approximately <span className="font-semibold">{cf.closes_gap_pct}%</span> of the gap.
              </p>

              {cf.reaches_reproduced && (
                <p className="text-xs text-emerald-700 font-medium">
                  This should bring your result to {cf.projected_metric}{unit} — within the paper's tolerance.
                </p>
              )}

              {cf.ai_insight && (
                <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-200 pt-2 mt-2">
                  {cf.ai_insight}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
