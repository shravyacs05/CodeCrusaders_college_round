import { useEffect, useState } from 'react'
import { api } from '../api/client'
import SeedChart from '../components/SeedChart'
import { StatusPill } from '../components/ProvenanceBadge'
import { useProject } from './ProjectLayout'

export default function Verify() {
  const { eid } = useProject()
  const [ver, setVer] = useState<any>(null)
  const [seeds, setSeeds] = useState<any[]>([])
  useEffect(() => {
    setVer(null)
    api.verification(eid).then(setVer)
    api.status(eid).then(s => setSeeds(s.seeds || []))
  }, [eid])
  if (!ver) return <p>Loading…</p>
  if (ver.status === 'BLOCKED') return (
    <div className="bg-slate-100 border-l-4 border-slate-500 p-3 text-sm">
      <StatusPill s="BLOCKED" /> {ver.reason}. Run the experiment first, and make sure the paper claim was extracted and verified.</div>)
  const row = (k: string, v: any) => <tr className="border-t"><td className="p-2 text-slate-600">{k}</td><td className="p-2 font-mono">{v}</td></tr>
  const unit = ver.percent ?? true ? '%' : ''
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><h2 className="font-bold">Result</h2><StatusPill s={ver.status} /></div>
      <table className="text-sm bg-white border rounded w-full max-w-xl"><tbody>
        {row('Published', `${ver.published}${unit}`)}
        {row('Reproduced mean', `${ver.reproduced_mean.toFixed(2)}${unit}`)}
        {row('Std / range', `${ver.std.toFixed(2)} / ${ver.min.toFixed(2)}–${ver.max.toFixed(2)} (n=${ver.n})`)}
        {row('Difference', `${ver.diff_pp >= 0 ? '+' : ''}${ver.diff_pp.toFixed(2)} pp`)}
        {row('Tolerance', `${ver.tolerance_pp} pp`)}
        {row('Published within seed range', String(ver.in_range))}
        {row('Within mean ± 2 std', String(ver.within_2std))}
      </tbody></table>
      <p className="text-xs text-slate-600">Rule: {ver.rule}</p>
      <SeedChart seeds={seeds} published={ver.published} unit={unit} />
      <p className="text-xs text-slate-500">Matching a headline metric does not prove the whole experiment was reproduced;
        seeds, hardware and library versions can change results.</p>
    </div>
  )
}
