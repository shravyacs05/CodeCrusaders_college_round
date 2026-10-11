import KpiInfo from './KpiInfo'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function SeedChart({
  seeds,
  published,
  unit,
}: {
  seeds: any[]
  published: number | null
  unit: string
}) {
  const data = seeds.filter(s => s.value != null).map(s => ({ seed: `Seed ${s.seed}`, value: s.value }))
  const vals = data.map(d => d.value).concat(published != null ? [published] : [])
  const lo = vals.length ? Math.floor(Math.min(...vals) - 2) : 0
  const hi = vals.length ? Math.min(100, Math.ceil(Math.max(...vals) + 1)) : 100

  return (
    <div className="h-72 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm">
      <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1">
          Seed Dispersion Chart
          <KpiInfo term="seed_chart" value={data.map(d => `${d.seed}: ${d.value.toFixed(2)}${unit}`).join(', ')}
            data={{ published, unit }} />
        </span>
        {published != null && (
          <span className="text-[11px] font-mono text-rose-600 flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-rose-500 inline-block" /> Published Benchmark: {published}{unit}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height="88%">
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="seed"
            tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Plus Jakarta Sans' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            domain={[lo, hi]}
            unit={unit}
            tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'Plus Jakarta Sans' }}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#09122c',
              borderColor: '#1e293b',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '12px',
              fontFamily: 'JetBrains Mono',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            }}
            formatter={(v: any) => [`${Number(v).toFixed(2)}${unit}`, 'Reproduced Value']}
          />
          <Bar dataKey="value" fill="#2b66ff" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          {published != null && (
            <ReferenceLine
              y={published}
              stroke="#e11d48"
              strokeDasharray="4 4"
              strokeWidth={2}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
