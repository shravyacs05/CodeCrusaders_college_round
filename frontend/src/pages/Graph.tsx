import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, Edge, Node } from 'reactflow'
import 'reactflow/dist/style.css'
import { api, errMsg } from '../api/client'
import EvidencePanel from '../components/EvidencePanel'
import GraphNode from '../components/GraphNode'
import ProvenanceBadge from '../components/ProvenanceBadge'
import { useStatus } from '../useStatus'
import { useProject } from './ProjectLayout'
import { GitBranch, Layers, Info, AlertCircle } from 'lucide-react'

const nodeTypes = { stage: GraphNode }

export default function Graph() {
  const { pid, eid, setEid, reload } = useProject()
  const [graph, setGraph] = useState<any>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const { status } = useStatus(eid)

  useEffect(() => {
    api.graph(pid, eid).then(setGraph).catch(e => setErr(errMsg(e)))
  }, [pid, eid])

  const nodes: Node[] = useMemo(
    () =>
      (graph?.nodes || []).map((n: any, i: number) => ({
        id: n.id,
        type: 'stage',
        position: { x: i * 250 + 40, y: 80 + (i % 2) * 40 },
        data: { label: n.id, params: n.params, state: status?.nodes?.[n.id] },
        selected: n.id === sel,
      })),
    [graph, status, sel]
  )

  const edges: Edge[] = useMemo(
    () =>
      (graph?.edges || []).map((e: any) => ({
        id: `${e.from}-${e.to}`,
        source: e.from,
        target: e.to,
        animated: status?.state === 'running',
        style: { stroke: '#2b66ff', strokeWidth: 2 },
      })),
    [graph, status]
  )

  const onEdit = useCallback(
    async (node: string, edits: Record<string, any>) => {
      try {
        const child = await api.editNode(eid, node, edits)
        await reload()
        setEid(child.id)
      } catch (e) {
        setErr(errMsg(e))
      }
    },
    [eid, reload, setEid]
  )

  if (!graph) return (
    <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center text-slate-500">
      <div className="inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm">{err || 'Rendering experiment execution DAG…'}</p>
    </div>
  )

  const selected = graph.nodes.find((n: any) => n.id === sel)

  return (
    <div className="space-y-4">
      {err && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
            Version {graph.version}
          </span>
          <span className="text-xs text-slate-500">
            Click any stage node to inspect verified evidence citations or edit injectable parameters.
          </span>
        </div>
      </div>

      {/* Flow Canvas Container */}
      <div className="flex h-[520px] bg-slate-50/50 border border-slate-200/90 rounded-3xl overflow-hidden shadow-card relative">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            onNodeClick={(_, n) => setSel(n.id)}
            onPaneClick={() => setSel(null)}
            nodesDraggable={false}
          >
            <Background color="#cbd5e1" gap={20} size={1} />
            <Controls showInteractive={false} className="!bg-white !border-slate-200 !rounded-xl !shadow-sm" />
          </ReactFlow>
        </div>

        {selected && (
          <EvidencePanel
            key={`${eid}-${sel}`}
            node={selected}
            onEdit={onEdit}
            onClose={() => setSel(null)}
          />
        )}
      </div>

      {/* Legend strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-white border border-slate-200/80 rounded-2xl text-xs text-slate-600 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-700 text-[11px] uppercase tracking-wider">Provenance:</span>
          {['paper', 'code', 'inferred', 'missing', 'user', 'unverified'].map(s => (
            <ProvenanceBadge key={s} source={s} />
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border border-slate-300 bg-white" /> Pending</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border border-amber-400 bg-amber-100" /> Running</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border border-emerald-500 bg-emerald-100" /> Done</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border border-rose-500 bg-rose-100" /> Failed</span>
        </div>
      </div>
    </div>
  )
}
