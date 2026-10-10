import { Handle, Position } from 'reactflow'
import ProvenanceBadge from './ProvenanceBadge'

const RING: Record<string, string> = {
  pending: 'border-slate-300 bg-white', running: 'border-amber-400 bg-amber-50',
  done: 'border-green-500 bg-green-50', failed: 'border-red-500 bg-red-50',
}

export default function GraphNode({ data, selected }: any) {
  const entries = Object.entries<any>(data.params || {})
  return (
    <div className={`rounded-lg border-2 px-3 py-2 min-w-[170px] text-xs shadow-sm cursor-pointer
      ${RING[data.state || 'pending']} ${selected ? 'ring-2 ring-indigo-400' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="font-bold text-sm mb-1 flex justify-between"><span>{data.label}</span>
        {data.state && data.state !== 'pending' && <span className="text-[10px] uppercase">{data.state}</span>}
      </div>
      {entries.length === 0 && <div className="text-slate-400">no parameters</div>}
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-2 py-0.5">
          <span className="font-mono">
            {k}: {v.value ?? 'MISSING'}
            {v.injectable === false && <span className="text-slate-400 font-mono"> ro</span>}
          </span>
          <ProvenanceBadge source={v.source} />
        </div>
      ))}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
