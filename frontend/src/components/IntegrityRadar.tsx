import React, { useState, useEffect } from 'react'
import {
  Sliders,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Info
} from 'lucide-react'
import { api } from '../api/client'

interface AxisData {
  dimension: string
  score: number
  baseline: number
  description: string
}

interface RadarResponse {
  axes: AxisData[]
  composite_score: number
  baseline_composite: number
  robustness_index: number
  fragility_index: number
  basin_type: string
  basin_description: string
  projected_delta_pp: number
  stress_inputs: {
    lr_drift_pct: number
    batch_scale: number
    seed_noise: number
  }
  sensitivity_curve: Array<{
    drift_pct: number
    projected_acc: number
    fidelity: number
  }>
}

interface Props {
  eid: string
}

export default function IntegrityRadar({ eid }: Props) {
  const [data, setData] = useState<RadarResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [lrDrift, setLrDrift] = useState<number>(0)
  const [batchScale, setBatchScale] = useState<number>(1.0)
  const [seedNoise, setSeedNoise] = useState<number>(0)
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null)

  // Load baseline radar
  useEffect(() => {
    if (!eid) return
    setLoading(true)
    api.radar(eid)
      .then(res => {
        setData(res)
        setLrDrift(0)
        setBatchScale(1.0)
        setSeedNoise(0)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [eid])

  // Trigger perturbation stress test
  const triggerStressTest = (lr: number, bs: number, noise: number) => {
    setLrDrift(lr)
    setBatchScale(bs)
    setSeedNoise(noise)

    api.stressTestRadar(eid, {
      lr_drift: lr / 100,
      batch_scale: bs,
      seed_noise: noise / 100,
    })
      .then(setData)
      .catch(console.error)
  }

  const handleReset = () => {
    triggerStressTest(0, 1.0, 0)
  }

  if (loading && !data) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-3xl p-8 text-center text-slate-500 shadow-sm">
        <div className="inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold">Generating 6-Axis Scientific Integrity Radar…</p>
      </div>
    )
  }

  if (!data || !data.axes) return null

  // Radar geometry calculations
  const size = 380
  const cx = size / 2
  const cy = size / 2
  const radius = 135
  const numAxes = data.axes.length

  const getCoordinates = (index: number, valuePct: number) => {
    const angle = (Math.PI * 2 / numAxes) * index - Math.PI / 2
    const r = (valuePct / 100) * radius
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    }
  }

  // Polygon points
  const currentPolygonPoints = data.axes
    .map((axis, i) => {
      const { x, y } = getCoordinates(i, axis.score)
      return `${x},${y}`
    })
    .join(' ')

  const idealPolygonPoints = data.axes
    .map((_, i) => {
      const { x, y } = getCoordinates(i, 100)
      return `${x},${y}`
    })
    .join(' ')

  const baselinePolygonPoints = data.axes
    .map((axis, i) => {
      const { x, y } = getCoordinates(i, axis.baseline)
      return `${x},${y}`
    })
    .join(' ')

  const isPerturbed = lrDrift !== 0 || batchScale !== 1.0 || seedNoise !== 0

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-indigo-800/40 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-indigo-800/50">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-300 bg-indigo-900/80 px-3 py-1 rounded-full border border-indigo-700/60 flex items-center gap-1.5 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Scientific Integrity Radar & Robustness Scanner
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span>Hyperparameter Cherry-Picking Radar</span>
          </h2>
          <p className="text-xs text-indigo-200/80 mt-1 max-w-xl leading-relaxed">
            Multidimensional verification envelope comparing ideal published fidelity vs empirical execution under parameter perturbation.
          </p>
        </div>

        {/* Dynamic Composite Score Badge */}
        <div className="flex items-center gap-4 bg-slate-800/80 border border-indigo-700/50 rounded-2xl p-4 shadow-lg shrink-0">
          <div>
            <div className="text-[10px] text-indigo-300 font-extrabold uppercase tracking-wider">Integrity Index</div>
            <div className="text-3xl font-black font-mono tracking-tight text-indigo-400">
              {data.composite_score}%
            </div>
            {isPerturbed && (
              <div className="text-[10px] text-amber-400 font-mono mt-0.5 flex items-center gap-1">
                <span>Baseline: {data.baseline_composite}%</span>
              </div>
            )}
          </div>
          <div className="h-10 w-px bg-indigo-800/80" />
          <div>
            <div className="text-[10px] text-indigo-300 font-extrabold uppercase tracking-wider">Fragility Status</div>
            <div className={`text-xs font-black uppercase px-2.5 py-1 rounded-full border mt-1 ${
              data.fragility_index < 20
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : data.fragility_index < 45
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
            }`}>
              {data.basin_type.replace('_', ' ')}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Radar SVG on left, Interactive Controls on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Radar SVG Visualizer */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center relative">
          <div className="relative w-full max-w-[390px] aspect-square flex items-center justify-center">
            <svg
              viewBox={`0 0 ${size} ${size}`}
              className="w-full h-full filter drop-shadow-[0_0_20px_rgba(79,70,229,0.3)]"
            >
              <defs>
                {/* Glowing Gradients */}
                <radialGradient id="radarCenterGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="polyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
                  <stop offset="50%" stopColor="#6366f1" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.4" />
                </linearGradient>
              </defs>

              {/* Background Glow */}
              <circle cx={cx} cy={cy} r={radius} fill="url(#radarCenterGlow)" />

              {/* Concentric Web Rings (20%, 40%, 60%, 80%, 100%) */}
              {[0.2, 0.4, 0.6, 0.8, 1.0].map((level, ringIdx) => {
                const ringPoints = Array.from({ length: numAxes })
                  .map((_, i) => {
                    const { x, y } = getCoordinates(i, level * 100)
                    return `${x},${y}`
                  })
                  .join(' ')
                return (
                  <polygon
                    key={ringIdx}
                    points={ringPoints}
                    fill="none"
                    stroke="#334155"
                    strokeWidth="1"
                    strokeDasharray={level === 1.0 ? 'none' : '3 3'}
                  />
                )
              })}

              {/* Radial Axis Spokes */}
              {data.axes.map((_, i) => {
                const { x, y } = getCoordinates(i, 100)
                return (
                  <line
                    key={i}
                    x1={cx}
                    y1={cy}
                    x2={x}
                    y2={y}
                    stroke="#475569"
                    strokeWidth="1"
                  />
                )
              })}

              {/* Ideal Envelope Polygon (100% boundary) */}
              <polygon
                points={idealPolygonPoints}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.5"
              />

              {/* Baseline Polygon (if perturbed) */}
              {isPerturbed && (
                <polygon
                  points={baselinePolygonPoints}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                  opacity="0.6"
                />
              )}

              {/* Current Empirical Verification Polygon */}
              <polygon
                points={currentPolygonPoints}
                fill="url(#polyGrad)"
                stroke="#60a5fa"
                strokeWidth="2.5"
                className="transition-all duration-300"
              />

              {/* Axis Vertices (Interactive Dots) */}
              {data.axes.map((axis, i) => {
                const { x, y } = getCoordinates(i, axis.score)
                const isHovered = hoveredAxis === i
                return (
                  <g key={i}>
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 6 : 4}
                      fill={isHovered ? '#38bdf8' : '#60a5fa'}
                      stroke="#ffffff"
                      strokeWidth="2"
                      className="cursor-pointer transition-all duration-200"
                      onMouseEnter={() => setHoveredAxis(i)}
                      onMouseLeave={() => setHoveredAxis(null)}
                    />
                  </g>
                )
              })}

              {/* Dimension Labels around perimeter */}
              {data.axes.map((axis, i) => {
                const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2
                const labelRadius = radius + 22
                const lx = cx + labelRadius * Math.cos(angle)
                const ly = cy + labelRadius * Math.sin(angle)

                const isHovered = hoveredAxis === i
                return (
                  <text
                    key={i}
                    x={lx}
                    y={ly}
                    fill={isHovered ? '#38bdf8' : '#94a3b8'}
                    fontSize="10"
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="cursor-pointer select-none transition-colors"
                    onMouseEnter={() => setHoveredAxis(i)}
                    onMouseLeave={() => setHoveredAxis(null)}
                  >
                    {axis.dimension}
                  </text>
                )
              })}
            </svg>
          </div>

          {/* Active Hover Dimension Tooltip */}
          <div className="h-10 mt-2 text-center">
            {hoveredAxis !== null ? (
              <div className="text-xs bg-slate-800/90 border border-indigo-700/60 rounded-xl px-4 py-1.5 inline-flex items-center gap-2">
                <span className="font-extrabold text-indigo-300">{data.axes[hoveredAxis].dimension}:</span>
                <span className="font-mono font-black text-white">{data.axes[hoveredAxis].score}%</span>
                <span className="text-slate-400 text-[11px]">— {data.axes[hoveredAxis].description}</span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400 font-mono italic">
                Hover any vertex or spoke to inspect dimension score
              </span>
            )}
          </div>
        </div>

        {/* Interactive Perturbation Stress Controls & Sensitivity Landscape */}
        <div className="lg:col-span-6 space-y-5">
          <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-extrabold text-white tracking-wide uppercase">
                  Hyperparameter Stress Simulator
                </h3>
              </div>
              {isPerturbed && (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white bg-indigo-900/60 hover:bg-indigo-900 px-3 py-1 rounded-full border border-indigo-700/60 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset to Ground Truth</span>
                </button>
              )}
            </div>

            {/* Slider 1: Learning Rate Drift */}
            <div className="space-y-1.5 mb-4">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Learning Rate Shift (ΔLR)</span>
                <span className="font-mono text-indigo-400 font-bold">
                  {lrDrift > 0 ? `+${lrDrift}%` : `${lrDrift}%`}
                </span>
              </div>
              <input
                type="range"
                min="-30"
                max="30"
                step="5"
                value={lrDrift}
                onChange={e => triggerStressTest(Number(e.target.value), batchScale, seedNoise)}
                className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>-30% (Under-tuned)</span>
                <span>0% (Paper Baseline)</span>
                <span>+30% (Over-tuned)</span>
              </div>
            </div>

            {/* Slider 2: Batch Size Perturbation */}
            <div className="space-y-1.5 mb-4">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Batch Size Scaling Factor</span>
                <span className="font-mono text-indigo-400 font-bold">{batchScale}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.25"
                value={batchScale}
                onChange={e => triggerStressTest(lrDrift, Number(e.target.value), seedNoise)}
                className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0.5x (Smaller)</span>
                <span>1.0x (Original)</span>
                <span>2.0x (Doubled)</span>
              </div>
            </div>

            {/* Slider 3: Seed Variance Noise */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Seed Stochasticity Stress</span>
                <span className="font-mono text-indigo-400 font-bold">+{seedNoise}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={seedNoise}
                onChange={e => triggerStressTest(lrDrift, batchScale, Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Deterministic</span>
                <span>Moderate Dispersion</span>
                <span>High Variance</span>
              </div>
            </div>
          </div>

          {/* Fragility Diagnostics Box */}
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Cherry-Picking Fragility Score
              </span>
              <span className="font-mono text-sm font-black text-rose-400">
                {data.fragility_index}% Fragility
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden flex">
              <div
                style={{ width: `${Math.min(100, data.fragility_index)}%` }}
                className={`h-full transition-all duration-300 ${
                  data.fragility_index < 20
                    ? 'bg-emerald-500'
                    : data.fragility_index < 45
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                }`}
              />
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              {data.basin_description}
            </p>

            {isPerturbed && (
              <div className="bg-slate-900/90 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono border border-slate-700/60">
                <span className="text-slate-400">Projected Discrepancy (Δ):</span>
                <span className="font-extrabold text-amber-400">
                  +{data.projected_delta_pp} pp drift
                </span>
              </div>
            )}
          </div>

          {/* Sensitivity Neighborhood Spline */}
          {data.sensitivity_curve && data.sensitivity_curve.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-3.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Learning Rate Sensitivity Neighborhood</span>
                <span className="text-[10px] text-indigo-300 font-mono">±30% Range</span>
              </div>
              <div className="flex items-end justify-between gap-1.5 h-12 pt-2">
                {data.sensitivity_curve.map((pt, idx) => {
                  const barHeight = Math.max(15, (pt.fidelity / 100) * 100)
                  const isCenter = pt.drift_pct === 0
                  const isCurrent = pt.drift_pct === lrDrift
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        style={{ height: `${barHeight}%` }}
                        className={`w-full rounded-t transition-all ${
                          isCurrent
                            ? 'bg-brand-400 shadow-glow'
                            : isCenter
                              ? 'bg-indigo-400'
                              : 'bg-slate-700'
                        }`}
                        title={`LR ${pt.drift_pct}% -> Est Acc: ${pt.projected_acc}% (Fidelity: ${pt.fidelity}%)`}
                      />
                      <span className="text-[9px] font-mono text-slate-500">
                        {pt.drift_pct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
