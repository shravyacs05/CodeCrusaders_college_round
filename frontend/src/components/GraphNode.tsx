import { Handle, Position } from 'reactflow'
import ProvenanceBadge from './ProvenanceBadge'
import KpiInfo from './KpiInfo'

const STATE_STYLE: Record<string, { border: string; bg: string; badge: string }> = {
  pending: {
    border: 'border-slate-300',
    bg: 'bg-white',
    badge: 'bg-slate-100 text-slate-600',
  },
  running: {
    border: 'border-amber-400',
    bg: 'bg-amber-50/70',
    badge: 'bg-amber-100 text-amber-700 animate-pulse',
  },
  done: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-50/40',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  failed: {
    border: 'border-rose-500',
    bg: 'bg-rose-50/50',
    badge: 'bg-rose-100 text-rose-700',
  },
}

export default function GraphNode({ data, selected }: any) {
  const entries = Object.entries<any>(data.params || {})
  const st = STATE_STYLE[data.state || 'pending'] || STATE_STYLE.pending

  return (
    <div
      className={`rounded-2xl border-2 px-4 py-3 min-w-[200px] text-xs shadow-card cursor-pointer transition-all ${
        st.border
      } ${st.bg} ${
        selected ? 'ring-4 ring-brand-400/40 scale-105' : 'hover:scale-102 hover:shadow-md'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-brand-500 !border-2 !border-white" />
      
      <div className="flex items-center justify-between mb-2">
        <span className="font-extrabold text-sm text-slate-900 tracking-tight flex items-center gap-1">
          {data.label}
          <KpiInfo term="graph_stage" title={`${data.label} stage`}
            value={entries.length ? entries.map(([k, v]) => `${k}=${v.value ?? 'MISSING'} (${v.source})`).join(', ') : 'no tracked parameters'}
            data={{ stage: data.label, run_state: data.state || 'pending', params: data.params }} />
        </span>
        {data.state && data.state !== 'pending' && (
          <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${st.badge}`}>
            {data.state}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-slate-400 italic text-[11px]">No tracked parameters</div>
      ) : (
        <div className="space-y-1.5 pt-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <span className="font-mono text-slate-800 text-[11px] truncate max-w-[110px]" title={`${k}: ${v.value ?? 'MISSING'}`}>
                {k}: <b className="text-slate-900">{v.value ?? '—'}</b>
                {v.injectable === false && (
                  <span className="text-[9px] text-slate-400 ml-1 font-sans">ro</span>
                )}
              </span>
              <ProvenanceBadge source={v.source} />
            </div>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-brand-500 !border-2 !border-white" />
    </div>
  )
}
