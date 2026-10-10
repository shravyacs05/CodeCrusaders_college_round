import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function SeedChart({ seeds, published, unit }: { seeds: any[]; published: number | null; unit: string }) {
  const data = seeds.filter(s => s.value != null).map(s => ({ seed: `seed ${s.seed}`, value: s.value }))
  const vals = data.map(d => d.value).concat(published != null ? [published] : [])
  const lo = vals.length ? Math.floor(Math.min(...vals) - 2) : 0
  const hi = vals.length ? Math.min(100, Math.ceil(Math.max(...vals) + 1)) : 100
  return (
    <div className="h-64 bg-white border rounded p-2">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="seed" /><YAxis domain={[lo, hi]} unit={unit} />
          <Tooltip formatter={(v: any) => `${Number(v).toFixed(2)}${unit}`} />
          <Bar dataKey="value" fill="#6366f1" isAnimationActive={false} />
          {published != null && <ReferenceLine y={published} stroke="#dc2626" strokeDasharray="5 3"
            label={{ value: `published ${published}${unit}`, fill: '#dc2626', position: 'insideTopRight' }} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
