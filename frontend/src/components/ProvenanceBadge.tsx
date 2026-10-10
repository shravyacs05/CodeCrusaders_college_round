const COLORS: Record<string, string> = {
  paper: 'bg-blue-100 text-brand-800 border-blue-200',
  code: 'bg-purple-100 text-purple-800 border-purple-200',
  inferred: 'bg-slate-100 text-slate-800 border-slate-200',
  missing: 'bg-rose-100 text-rose-800 border-rose-200',
  user: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  unverified: 'bg-amber-100 text-amber-800 border-amber-200',
}

export default function ProvenanceBadge({ source }: { source: string }) {
  return (
    <span className={`text-[10px] uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full border inline-block ${COLORS[source] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {source}
    </span>
  )
}

export const STATUS_STYLE: Record<string, string> = {
  MATCH: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold',
  MISMATCH: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold',
  MISSING: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold',
  ONLY_IN_PAPER: 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold',
  ONLY_IN_CODE: 'bg-slate-100 text-slate-800 border-slate-300 font-extrabold',
  REPRODUCED: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold',
  PARTIALLY_REPRODUCED: 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold',
  NOT_REPRODUCED: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold',
  BLOCKED: 'bg-slate-100 text-slate-800 border-slate-300 font-extrabold',
}

export function StatusPill({ s }: { s: string }) {
  return (
    <span className={`text-xs font-extrabold px-3 py-1 rounded-full border inline-flex items-center gap-1 shadow-sm ${STATUS_STYLE[s] || 'bg-slate-100 text-slate-800 border-slate-200'}`}>
      {s}
    </span>
  )
}
