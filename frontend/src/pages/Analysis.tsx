import { useEffect, useState } from 'react'
import { api } from '../api/client'
import DiffTable from '../components/DiffTable'
import ProvenanceBadge from '../components/ProvenanceBadge'
import { useProject } from './ProjectLayout'
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Quote,
  ShieldAlert,
  HelpCircle,
  FileSearch
} from 'lucide-react'

export default function Analysis() {
  const { pid, proj, openPaperViewer } = useProject()
  const [findings, setFindings] = useState<any[]>([])

  useEffect(() => {
    api.findings(pid).then(setFindings).catch(() => setFindings([]))
  }, [pid])

  const paper = proj.paper
  const fields = Object.entries<any>(paper?.fields || {}).filter(([k]) => !k.startsWith('_'))
  const claim = paper?.fields?._claim
  const warnings = proj.scan?.warnings || []

  const handleInspectParam = (param: string) => {
    const f = paper?.fields?.[param]
    const finding = findings.find(x => x.param === param)
    if (f && f.quote) {
      openPaperViewer?.({
        id: param,
        param,
        value: f.value,
        codeValue: finding?.code_value,
        status: finding?.status,
        page: f.page || 1,
        bbox: f.bbox,
        quote: f.quote,
      })
    } else {
      openPaperViewer?.()
    }
  }

  return (
    <div className="space-y-8">
      {/* Execution Blocked Banner */}
      {proj.scan?.blocked && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Execution Blocked: </span>
            {proj.scan.blocked}
          </div>
        </div>
      )}

      {/* Scanner Warnings Banner */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4">
          <div className="flex items-center gap-2 font-bold mb-2 text-sm text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Repository Scanner Warnings ({warnings.length})</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
            {warnings.map((w: string, i: number) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Target Claim To Verify */}
      <section className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
            Target Ground Truth
          </span>
          {claim?.value != null && claim.quote && (
            <button
              onClick={() =>
                openPaperViewer?.({
                  id: 'claim',
                  param: `CLAIM: ${(claim.metric || 'ACCURACY').toUpperCase()}`,
                  value: `${claim.value}${claim.percent ? '%' : ''}`,
                  page: claim.page || 1,
                  bbox: claim.bbox,
                  quote: claim.quote,
                })
              }
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition-colors shadow-sm"
              title="Inspect exact bounding box in Paper PDF"
            >
              <FileText className="w-3.5 h-3.5 text-brand-600" />
              <span>Locate Quote in PDF (Page {claim.page})</span>
            </button>
          )}
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 tracking-tight mb-4">
          Published Paper Claim to Verify
        </h2>

        {claim?.value != null ? (
          <div className="bg-gradient-to-r from-blue-50/80 to-slate-50 border border-blue-100 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-3">
              <div className="text-2xl sm:text-3xl font-extrabold text-brand-700 font-mono tracking-tight">
                {claim.metric.toUpperCase()} = {claim.value}
                {claim.percent ? '%' : ''}
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-brand-800 border border-blue-200">
                Verified from PDF Page {claim.page}
              </span>
            </div>

            <div className="flex items-start gap-2.5 text-xs text-slate-600 italic bg-white/70 border border-slate-200/60 rounded-xl p-3">
              <Quote className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
              <span>"{claim.quote}"</span>
            </div>
          </div>
        ) : (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs font-medium">
            No verified claim found in PDF. Verification will be BLOCKED until a valid claim metric is extracted.
          </div>
        )}
      </section>

      {/* Extracted From Paper */}
      <section className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Extracted Hyperparameters from Paper
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              PyMuPDF deterministic extraction • Method: <span className="font-semibold">{paper?.method || 'regex'}</span>
              {paper?.note && <span> • {paper.note}</span>}
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500 font-mono">
            {fields.length} parameters inspected
          </span>
        </div>

        <div className="overflow-hidden border border-slate-200/90 rounded-2xl">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="p-3.5">Parameter Field</th>
                <th className="p-3.5">Extracted Value</th>
                <th className="p-3.5">Provenance</th>
                <th className="p-3.5">Citing Page & Quote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.map(([k, f]) => {
                const finding = findings.find(x => x.param === k)
                return (
                  <tr key={k} className="hover:bg-slate-50/50 transition-colors align-top">
                    <td className="p-3.5 font-mono font-semibold text-xs text-slate-900">
                      {k}
                    </td>
                    <td className="p-3.5 font-mono text-xs text-slate-800">
                      {f.value ?? (
                        <i className="text-slate-400 font-sans">
                          {f.claimed_value != null ? `rejected (${f.claimed_value})` : 'missing'}
                        </i>
                      )}
                    </td>
                    <td className="p-3.5">
                      <ProvenanceBadge source={f.source} />
                    </td>
                    <td className="p-3.5 text-xs text-slate-600">
                      {f.quote ? (
                        <div className="space-y-1">
                          <div>
                            <span className="font-medium text-slate-700">p.{f.page}:</span> “{f.quote}”
                          </div>
                          <button
                            onClick={() =>
                              openPaperViewer?.({
                                id: k,
                                param: k,
                                value: f.value,
                                codeValue: finding?.code_value,
                                status: finding?.status,
                                page: f.page || 1,
                                bbox: f.bbox,
                                quote: f.quote,
                              })
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded border border-brand-200 transition-colors"
                            title="Highlight in Paper PDF"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Locate in PDF (p.{f.page})</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {paper?.flags?.[k] && (
                        <div className="text-amber-600 font-semibold text-[11px] mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Unverified extraction: quote not found verbatim on page</span>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Paper vs. Code Findings */}
      <section className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
            Parameter Reconciliation (Paper vs. Code)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Normalized aliases (lr, num_epochs, bs, wd) classified into MATCH, MISMATCH, ONLY_IN_PAPER, or ONLY_IN_CODE.
          </p>
        </div>
        <DiffTable findings={findings} onInspectPaper={handleInspectParam} />
      </section>
    </div>
  )
}
