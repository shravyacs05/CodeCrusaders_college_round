import { useRef } from 'react'
import { api } from '../api/client'
import { useProject } from './ProjectLayout'
import { FileDown, Printer, ExternalLink, Code2 } from 'lucide-react'

export default function Report() {
  const { pid, eid } = useProject()
  const frame = useRef<HTMLIFrameElement>(null)
  const url = api.reportUrl(pid, eid)
  const pdfUrl = api.reportPdfUrl(pid, eid)
  const notebookUrl = api.notebookUrl(pid, eid)

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
            Audit Documentation
          </span>
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight mt-0.5">
            Publication-Grade Reproducibility Report
          </h2>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <a
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-glow transition-all hover:scale-105"
            href={pdfUrl}
            download
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Download PDF Report</span>
          </a>

          <a
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-glow transition-all hover:scale-105"
            href={notebookUrl}
            download
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Export Jupyter (.ipynb)</span>
          </a>

          <button
            className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-full transition-colors"
            onClick={() => frame.current?.contentWindow?.print()}
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print View</span>
          </button>

          <a
            className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-full transition-colors"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            <span>Open HTML</span>
          </a>
        </div>
      </div>


      {/* Embedded Report Frame */}
      <div className="overflow-hidden bg-white border border-slate-200/90 rounded-3xl shadow-card">
        <iframe
          ref={frame}
          key={url}
          src={url}
          title="Reproducibility Report"
          className="w-full h-[760px] border-0"
        />
      </div>
    </div>
  )
}
