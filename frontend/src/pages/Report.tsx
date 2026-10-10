import { useRef } from 'react'
import { api } from '../api/client'
import { useProject } from './ProjectLayout'

export default function Report() {
  const { pid, eid } = useProject()
  const frame = useRef<HTMLIFrameElement>(null)
  const url = api.reportUrl(pid, eid)
  const pdfUrl = api.reportPdfUrl(pid, eid)
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <a className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700"
          href={pdfUrl} download>Download PDF report</a>
        <button className="border border-slate-300 px-3 py-1.5 rounded text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => frame.current?.contentWindow?.print()}>Print view</button>
        <a className="border border-slate-300 px-3 py-1.5 rounded text-sm text-slate-700 hover:bg-slate-50"
          href={url} target="_blank" rel="noreferrer">Open HTML in new tab</a>
      </div>
      <iframe ref={frame} key={url} src={url} title="report" className="w-full h-[700px] bg-white border rounded shadow-sm" />
    </div>
  )
}
