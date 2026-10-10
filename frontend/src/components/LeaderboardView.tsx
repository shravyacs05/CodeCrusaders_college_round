import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Trophy,
  Activity,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Filter,
  CheckCircle2,
  ExternalLink,
  Wand2,
  TrendingUp,
  BarChart3
} from 'lucide-react'
import { api } from '../api/client'

interface LeaderboardItem {
  id: string
  name: string
  repo_url: string
  status: string
  venue: string
  domain: string
  claim_metric: string
  published: number | null
  reproduced_mean: number | null
  diff_pp: number | null
  seed_std: number
  seeds_count: number
  verification_status: string
  compliance_pct: number
  grade: string
  leakage_clean: boolean
  heals_applied: number
  versions_count: number
  rank: number
}

interface LeaderboardResponse {
  leaderboard: LeaderboardItem[]
  summary: {
    total_papers: number
    reproduced_count: number
    reproduced_pct: number
    mean_compliance: number
    clean_pipeline_pct: number
    avg_delta_pp: number
  }
}

export default function LeaderboardView() {
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedVenue, setSelectedVenue] = useState<string>('ALL')
  const [viewMode, setViewMode] = useState<'matrix' | 'scatter'>('matrix')
  const [hoveredPoint, setHoveredPoint] = useState<LeaderboardItem | null>(null)

  useEffect(() => {
    api.leaderboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-3xl p-12 text-center text-slate-500 shadow-sm">
        <div className="inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold">Aggregating Field-Wide Reproducibility Cohort…</p>
      </div>
    )
  }

  if (!data || !data.leaderboard || data.leaderboard.length === 0) {
    return null
  }

  const venues = ['ALL', ...Array.from(new Set(data.leaderboard.map(i => i.venue)))]

  const filtered = selectedVenue === 'ALL'
    ? data.leaderboard
    : data.leaderboard.filter(i => i.venue === selectedVenue)

  // Scatter plot geometry
  const plotWidth = 620
  const plotHeight = 360
  const padding = 50

  const toScreenX = (val: number) => padding + ((val / 100) * (plotWidth - padding * 2))
  const toScreenY = (val: number) => (plotHeight - padding) - ((val / 100) * (plotHeight - padding * 2))

  return (
    <div className="space-y-6">
      {/* Cohort Summary Metrics Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50/80 to-white border border-blue-200/80 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700">
            Cohort Audited
          </div>
          <div className="text-3xl font-black text-slate-900 font-mono mt-1">
            {data.summary.total_papers}
            <span className="text-xs text-slate-400 font-normal ml-1.5">papers</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Across NLP, CV & Optimization</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50/80 to-white border border-emerald-200/80 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
            Replication Rate
          </div>
          <div className="text-3xl font-black text-emerald-600 font-mono mt-1">
            {data.summary.reproduced_pct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {data.summary.reproduced_count} of {data.summary.total_papers} verified in tolerance
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-50/80 to-white border border-indigo-200/80 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">
            Conference Compliance
          </div>
          <div className="text-3xl font-black text-indigo-600 font-mono mt-1">
            {data.summary.mean_compliance}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">NeurIPS/ICLR Checklist Index</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50/80 to-white border border-purple-200/80 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-purple-700">
            Average Empirical Gap
          </div>
          <div className="text-3xl font-black text-purple-600 font-mono mt-1">
            ±{data.summary.avg_delta_pp}
            <span className="text-xs text-purple-400 font-normal ml-1">pp</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Mean absolute claim delta</div>
        </div>
      </div>

      {/* Control Bar: Sub-views (Matrix vs Scatter) & Venue Filter */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* View Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('matrix')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'matrix'
                ? 'bg-white text-brand-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-brand-600" />
            <span>Leaderboard Matrix</span>
          </button>
          <button
            onClick={() => setViewMode('scatter')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'scatter'
                ? 'bg-white text-brand-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-brand-600" />
            <span>Empirical Scatter Plot (y = x)</span>
          </button>
        </div>

        {/* Venue Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Venue:
          </span>
          {venues.map(v => (
            <button
              key={v}
              onClick={() => setSelectedVenue(v)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${
                selectedVenue === v
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* VIEW 1: Leaderboard Matrix Table */}
      {viewMode === 'matrix' && (
        <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4 w-16 text-center">Rank</th>
                  <th className="py-3.5 px-4">Research Paper & Domain</th>
                  <th className="py-3.5 px-4">Venue</th>
                  <th className="py-3.5 px-4 text-right">Published Claim</th>
                  <th className="py-3.5 px-4 text-right">Empirical Mean</th>
                  <th className="py-3.5 px-4 text-center">Discrepancy (Δ)</th>
                  <th className="py-3.5 px-4 text-center">Audit Grade</th>
                  <th className="py-3.5 px-4 text-center">Integrity Shield</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map(item => {
                  const medal = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : null
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Rank */}
                      <td className="py-4 px-4 text-center font-mono font-black text-slate-700">
                        {medal ? (
                          <span className="text-lg" title={`Rank #${item.rank}`}>{medal}</span>
                        ) : (
                          <span className="text-slate-400">#{item.rank}</span>
                        )}
                      </td>

                      {/* Paper Name & Domain */}
                      <td className="py-4 px-4">
                        <Link
                          to={`/p/${item.id}`}
                          className="font-extrabold text-slate-900 hover:text-brand-600 transition-colors block text-sm"
                        >
                          {item.name}
                        </Link>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                          {item.domain} • <span className="font-mono text-slate-400">ID: {item.id}</span>
                        </div>
                      </td>

                      {/* Venue */}
                      <td className="py-4 px-4">
                        <span className="inline-block bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded text-[10px] border border-slate-200">
                          {item.venue}
                        </span>
                      </td>

                      {/* Published Claim */}
                      <td className="py-4 px-4 text-right font-mono font-bold text-slate-800">
                        {item.published != null ? `${item.published}%` : '—'}
                      </td>

                      {/* Empirical Mean */}
                      <td className="py-4 px-4 text-right font-mono font-bold text-slate-800">
                        {item.reproduced_mean != null ? (
                          <span className="text-brand-700">
                            {item.reproduced_mean}%
                            {item.seeds_count > 1 && (
                              <span className="text-[10px] text-slate-400 block font-normal">
                                σ = {item.seed_std} (n={item.seeds_count})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Pending</span>
                        )}
                      </td>

                      {/* Discrepancy (Delta) */}
                      <td className="py-4 px-4 text-center">
                        {item.diff_pp != null ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                            Math.abs(item.diff_pp) <= 1.0
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : Math.abs(item.diff_pp) <= 5.0
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {item.diff_pp >= 0 ? '+' : ''}{item.diff_pp} pp
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Checklist Grade */}
                      <td className="py-4 px-4 text-center">
                        <span className={`font-mono font-black text-xs px-2.5 py-1 rounded-xl border ${
                          item.compliance_pct >= 85
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : item.compliance_pct >= 70
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {item.grade} ({item.compliance_pct}%)
                        </span>
                      </td>

                      {/* Integrity Shield (Leakage & Auto-heal) */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {item.leakage_clean ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full" title="Zero data leakage detected in pipeline">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Shielded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full" title="Data leakage or fit-before-split detected">
                              <AlertTriangle className="w-3 h-3 text-rose-600" /> Leaked
                            </span>
                          )}

                          {item.heals_applied > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full" title={`${item.heals_applied} self-healing patches applied`}>
                              <Sparkles className="w-2.5 h-2.5 text-purple-600" /> Healed
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-4 px-4 text-right">
                        <Link
                          to={`/p/${item.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-800 transition-colors"
                        >
                          <span>Audit</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: Empirical Cartesian Scatter Plot (y = x Identity Chart) */}
      {viewMode === 'scatter' && (
        <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-800/60">
                  Cartesian Verification Space
                </span>
              </div>
              <h3 className="text-lg font-black text-white">
                Empirical Replication Scatter Plot (y = x)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Points landing on the golden diagonal line represent 100% exact empirical replication.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-3 h-0.5 bg-amber-400 border-dashed" /> Perfect Replication (y = x)
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Reproduced Point
              </span>
            </div>
          </div>

          {/* SVG Plot */}
          <div className="relative w-full overflow-x-auto flex justify-center py-2">
            <svg
              viewBox={`0 0 ${plotWidth} ${plotHeight}`}
              className="w-full max-w-[650px] aspect-[620/360] overflow-visible"
            >
              {/* Grid Background */}
              <rect
                x={padding}
                y={padding}
                width={plotWidth - padding * 2}
                height={plotHeight - padding * 2}
                fill="#0f172a"
                stroke="#334155"
                strokeWidth="1"
              />

              {/* Grid Lines */}
              {[20, 40, 60, 80].map(v => (
                <React.Fragment key={v}>
                  <line
                    x1={toScreenX(v)}
                    y1={padding}
                    x2={toScreenX(v)}
                    y2={plotHeight - padding}
                    stroke="#1e293b"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <line
                    x1={padding}
                    y1={toScreenY(v)}
                    x2={plotWidth - padding}
                    y2={toScreenY(v)}
                    stroke="#1e293b"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                </React.Fragment>
              ))}

              {/* Shaded Corridor: ±2 pp corridor around y = x */}
              <polygon
                points={`
                  ${toScreenX(0)},${toScreenY(2)}
                  ${toScreenX(98)},${toScreenY(100)}
                  ${toScreenX(100)},${toScreenY(98)}
                  ${toScreenX(2)},${toScreenY(0)}
                `}
                fill="#10b981"
                fillOpacity="0.08"
              />

              {/* The Golden Identity Line (y = x) */}
              <line
                x1={toScreenX(0)}
                y1={toScreenY(0)}
                x2={toScreenX(100)}
                y2={toScreenY(100)}
                stroke="#f59e0b"
                strokeWidth="2"
                strokeDasharray="5 4"
              />

              {/* Axes Labels */}
              <text
                x={plotWidth / 2}
                y={plotHeight - 12}
                fill="#94a3b8"
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
              >
                Published Claim in Paper (%) →
              </text>
              <text
                x={15}
                y={plotHeight / 2}
                fill="#94a3b8"
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                transform={`rotate(-90, 15, ${plotHeight / 2})`}
              >
                ← Empirical Reproduced Mean (%)
              </text>

              {/* Scale Ticks */}
              {[0, 20, 40, 60, 80, 100].map(v => (
                <React.Fragment key={v}>
                  <text
                    x={toScreenX(v)}
                    y={plotHeight - padding + 16}
                    fill="#64748b"
                    fontSize="10"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    {v}%
                  </text>
                  <text
                    x={padding - 10}
                    y={toScreenY(v) + 3}
                    fill="#64748b"
                    fontSize="10"
                    textAnchor="end"
                    fontFamily="monospace"
                  >
                    {v}%
                  </text>
                </React.Fragment>
              ))}

              {/* Plotted Research Paper Nodes */}
              {filtered
                .filter(p => p.published != null && p.reproduced_mean != null)
                .map(p => {
                  const x = toScreenX(p.published!)
                  const y = toScreenY(p.reproduced_mean!)
                  const deltaAbs = Math.abs(p.diff_pp || 0)
                  const isHovered = hoveredPoint?.id === p.id

                  const fillColor = deltaAbs <= 1.0
                    ? '#10b981'
                    : deltaAbs <= 5.0
                      ? '#38bdf8'
                      : '#f43f5e'

                  return (
                    <g
                      key={p.id}
                      className="cursor-pointer transition-all duration-200"
                      onMouseEnter={() => setHoveredPoint(p)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    >
                      {/* Pulse Halo */}
                      <circle
                        cx={x}
                        cy={y}
                        r={isHovered ? 14 : 9}
                        fill={fillColor}
                        fillOpacity="0.25"
                      />
                      {/* Core Node */}
                      <circle
                        cx={x}
                        cy={y}
                        r={isHovered ? 7 : 5}
                        fill={fillColor}
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                      {/* Label if hovered */}
                      {isHovered && (
                        <text
                          x={x}
                          y={y - 16}
                          fill="#ffffff"
                          fontSize="11"
                          fontWeight="bold"
                          textAnchor="middle"
                          className="filter drop-shadow"
                        >
                          {p.name} ({p.venue})
                        </text>
                      )}
                    </g>
                  )
                })}
            </svg>
          </div>

          {/* Interactive Tooltip Card */}
          {hoveredPoint ? (
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-extrabold text-sm text-white">{hoveredPoint.name}</span>
                  <span className="text-[10px] font-bold bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                    {hoveredPoint.venue}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  Claimed: <b className="text-white">{hoveredPoint.published}%</b> • Reproduced: <b className="text-brand-400">{hoveredPoint.reproduced_mean}%</b> (Δ: {hoveredPoint.diff_pp} pp)
                </div>
              </div>
              <Link
                to={`/p/${hoveredPoint.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold bg-brand-500 hover:bg-brand-600 text-white px-3.5 py-1.5 rounded-full transition-all self-start sm:self-center"
              >
                <span>Audit Experiment</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-500 font-mono italic">
              Hover over any point to inspect published claim vs measured empirical reproduction.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
