const COLORS: Record<string, string> = {
  paper: 'bg-blue-50 text-brand-700 border-brand-200',
  code: 'bg-purple-50 text-purple-700 border-purple-200',
  inferred: 'bg-slate-100 text-slate-700 border-slate-200',
  missing: 'bg-rose-50 text-rose-700 border-rose-200',
  user: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unverified: 'bg-amber-50 text-amber-700 border-amber-200',
}

export default function ProvenanceBadge({ source }: { source: string }) {
  return (
    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border inline-block ${COLORS[source] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {source}
    </span>
  )
}

export const STATUS_STYLE: Record<string, string> = {
  MATCH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MISMATCH: 'bg-rose-50 text-rose-700 border-rose-200',
  MISSING: 'bg-rose-50 text-rose-700 border-rose-200',
  ONLY_IN_PAPER: 'bg-amber-50 text-amber-800 border-amber-200',
  ONLY_IN_CODE: 'bg-slate-100 text-slate-700 border-slate-200',
  REPRODUCED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIALLY_REPRODUCED: 'bg-amber-50 text-amber-800 border-amber-200',
  NOT_REPRODUCED: 'bg-rose-50 text-rose-700 border-rose-200',
  BLOCKED: 'bg-slate-100 text-slate-700 border-slate-200',
}

export function StatusPill({ s }: { s: string }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${STATUS_STYLE[s] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {s}
    </span>
  )
}
