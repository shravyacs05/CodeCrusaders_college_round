const COLORS: Record<string, string> = {
  paper: 'bg-blue-500', code: 'bg-violet-500', inferred: 'bg-slate-500',
  missing: 'bg-red-600', user: 'bg-green-600', unverified: 'bg-orange-500',
}

export default function ProvenanceBadge({ source }: { source: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${COLORS[source] || 'bg-slate-400'}`}>
      {source}
    </span>
  )
}

export const STATUS_STYLE: Record<string, string> = {
  MATCH: 'bg-green-100 text-green-800', MISMATCH: 'bg-red-100 text-red-800',
  MISSING: 'bg-red-100 text-red-800', ONLY_IN_PAPER: 'bg-amber-100 text-amber-800',
  ONLY_IN_CODE: 'bg-slate-100 text-slate-700', REPRODUCED: 'bg-green-100 text-green-800',
  PARTIALLY_REPRODUCED: 'bg-amber-100 text-amber-800', NOT_REPRODUCED: 'bg-red-100 text-red-800',
  BLOCKED: 'bg-slate-200 text-slate-800',
}

export function StatusPill({ s }: { s: string }) {
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[s] || 'bg-slate-100'}`}>{s}</span>
}
