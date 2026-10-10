import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, Edge, Node } from 'reactflow'
import 'reactflow/dist/style.css'
import { api, errMsg } from '../api/client'
import EvidencePanel from '../components/EvidencePanel'
import GraphNode from '../components/GraphNode'
import { useStatus } from '../useStatus'
import { useProject } from './ProjectLayout'

const nodeTypes = { stage: GraphNode }

export default function Graph() {
  const { pid, eid, setEid, reload } = useProject()
  const [graph, setGraph] = useState<any>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const { status } = useStatus(eid)

  useEffect(() => { api.graph(pid, eid).then(setGraph).catch(e => setErr(errMsg(e))) }, [pid, eid])

  const nodes: Node[] = useMemo(() => (graph?.nodes || []).map((n: any, i: number) => ({
    id: n.id, type: 'stage', position: { x: i * 230, y: 40 + (i % 2) * 30 },
    data: { label: n.id, params: n.params, state: status?.nodes?.[n.id] }, selected: n.id === sel,
  })), [graph, status, sel])
  const edges: Edge[] = useMemo(() => (graph?.edges || []).map((e: any) => ({
    id: `${e.from}-${e.to}`, source: e.from, target: e.to, animated: status?.state === 'running',
  })), [graph, status])

  const onEdit = useCallback(async (node: string, edits: Record<string, any>) => {
    try {
      const child = await api.editNode(eid, node, edits)
      await reload()
      setEid(child.id)
    } catch (e) { setErr(errMsg(e)) }
  }, [eid, reload, setEid])

  if (!graph) return <p>{err || 'Loading graph…'}</p>
  const selected = graph.nodes.find((n: any) => n.id === sel)
  return (
    <div>
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded mb-2">{err}</p>}
      <p className="text-sm text-slate-600 mb-2">Version {graph.version}. Click a node for evidence; edits create a new version.</p>
      <div className="flex h-[480px] bg-white border rounded overflow-hidden">
        <div className="flex-1">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView
            onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel(null)} nodesDraggable={false}>
            <Background /><Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {selected && <EvidencePanel key={`${eid}-${sel}`} node={selected} onEdit={onEdit} onClose={() => setSel(null)} />}
      </div>
      <div className="flex gap-3 mt-2 text-xs text-slate-600">
        {['paper', 'code', 'inferred', 'missing', 'user', 'unverified'].map(s => <span key={s}>{s}</span>)}
        <span className="ml-auto">node border: grey pending · amber running · green done · red failed</span>
      </div>
    </div>
  )
}
