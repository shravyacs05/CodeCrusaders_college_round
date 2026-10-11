import { useEffect, useState } from 'react'
import { api } from '../api/client'
import DiffTable from '../components/DiffTable'
import KpiInfo from '../components/KpiInfo'
import ProvenanceBadge from '../components/ProvenanceBadge'
import { useProject } from './ProjectLayout'
import {
  FileText,
  AlertTriangle,
  Quote,
  ShieldAlert,
  Search,
  CheckCircle2,
  Sparkles,
  FolderGit2,
  ExternalLink,
  Zap
} from 'lucide-react'

export default function Analysis() {
  const { pid, proj, openPaperViewer } = useProject()
  const [findings, setFindings] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [checklistData, setChecklistData] = useState<any>(null)
  const [leakageData, setLeakageData] = useState<any>(null)

  useEffect(() => {
    api.findings(pid).then(setFindings).catch(() => setFindings([]))
    api.checklist(pid).then(setChecklistData).catch(() => setChecklistData(null))
    api.leakage(pid).then(setLeakageData).catch(() => setLeakageData(null))
  }, [pid])
  const paper = proj.paper
  const fields = Object.entries<any>(paper?.fields || {}).filter(([k]) => !k.startsWith('_'))
  const claim = paper?.fields?._claim
  const warnings = proj.scan?.warnings || []
  const filteredWarnings = warnings.filter(
    (w: string) => !w.includes('Auto-Detected Repository') && !w.includes('Paper-Only Autonomous Reconstruction')
  )

  const filteredFields = fields.filter(([k, f]) =>
    k.toLowerCase().includes(search.toLowerCase()) ||
    (f.value != null && String(f.value).toLowerCase().includes(search.toLowerCase())) ||
    (f.quote && f.quote.toLowerCase().includes(search.toLowerCase()))
  )

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
    <div className="space-y-8 pb-8">
      {/* NeurIPS / ICLR Reproducibility Checklist Scorecard */}
        {checklistData && (
          <section className="bg-gradient-to-br from-blue-50/80 via-white to-slate-50 border border-blue-200/90 rounded-3xl p-6 sm:p-7 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200/80">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand-700 bg-blue-100/90 px-3 py-1 rounded-full border border-blue-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                    Conference Audit Standard
                  </span>
                  <span className="text-xs text-slate-500 font-mono font-medium">NeurIPS / ICLR Protocol</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
                  Reproducibility Scorecard & Checklist
                </h2>
              </div>
              <div className="flex items-center gap-4 bg-white border border-slate-200/90 rounded-2xl p-3.5 px-5 shadow-xs">
                <div className="text-right">
                  <div className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wider flex items-center justify-end gap-1">
                    Compliance Index
                    <KpiInfo term="compliance_index" value={`${checklistData.score_pct}% · grade ${checklistData.grade}`}
                      data={checklistData.checklist?.map((c: any) => ({ question: c.question, status: c.status, evidence: c.evidence }))} />
                  </div>
                  <div className="text-2xl font-black text-brand-600 font-mono">{checklistData.score_pct}%</div>
                </div>
                <div className="h-9 w-px bg-slate-200" />
                <div>
                  <div className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wider">Grade</div>
                  <div className="text-sm font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">{checklistData.grade}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {checklistData.checklist?.map((item: any, idx: number) => (
                <div key={idx} className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between hover:border-brand-300 hover:shadow-xs transition-all">
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="text-xs font-extrabold text-slate-900 leading-snug">
                      {item.question}
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shrink-0 border ${item.status === 'PASS'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : item.status === 'WARN'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono bg-slate-50 border border-slate-200/70 p-2.5 rounded-xl truncate" title={item.evidence}>
                    {item.evidence}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}


        {/* Interactive Data Leakage & Contamination Visualizer */}
        <section className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                  Methodological Integrity
                </span>
              </div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                Data Leakage & Preprocessing Isolation Visualizer
                <KpiInfo term="leakage_status"
                  value={leakageData ? (leakageData.clean ? 'no leakage pattern found' : `${leakageData.findings?.length ?? 0} leakage finding(s)`) : undefined}
                  data={leakageData?.findings} />
              </h2>
            </div>
            {leakageData?.clean ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Verified Shielded (0 Leaks Detected)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Contamination Risks Detected
              </span>
            )}
          </div>

          {/* Visual Pipeline Flow */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 mb-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex-1 w-full">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 1: Ingestion</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">Raw Dataset (X, y)</div>
              </div>

              <div className="text-slate-400 font-bold hidden md:block">→</div>

              <div className={`p-3 rounded-xl border flex-1 w-full ${leakageData?.findings?.some((f: any) => f.rule === 'preprocessing_fit_before_split')
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-white border-slate-200'
                }`}>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 2: Train/Test Split</div>
                <div className="text-xs font-bold mt-0.5">
                  {leakageData?.findings?.some((f: any) => f.rule === 'preprocessing_fit_before_split') ? (
                    <span className="text-rose-700 font-extrabold">Split Delayed! (Leaked)</span>
                  ) : (
                    <span className="text-emerald-700 font-bold">Isolated Partition</span>
                  )}
                </div>
              </div>

              <div className="text-slate-400 font-bold hidden md:block">→</div>

              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex-1 w-full">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 3: Feature Scaling</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">Fit on X_train only</div>
              </div>

              <div className="text-slate-400 font-bold hidden md:block">→</div>

              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex-1 w-full">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Step 4: Evaluation</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">Uncontaminated Test Set</div>
              </div>
            </div>
          </div>

          {leakageData?.findings && leakageData.findings.length > 0 && (
            <div className="space-y-2.5">
              {leakageData.findings.map((f: any, idx: number) => (
                <div key={idx} className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-900">
                    <div className="font-bold text-rose-950 mb-0.5">
                      {f.rule === 'preprocessing_fit_before_split' ? 'Data Leakage: Preprocessor Fit Before Split' : 'Data Leakage: Fit on Entire Dataset'}
                    </div>
                    <div>{f.message}</div>
                    <div className="font-mono text-[11px] text-rose-700 mt-1">Source file: {f.file}:{f.line}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        {/* Execution Blocked Banner */}
        {proj.scan?.blocked && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 flex items-start gap-3 shadow-sm font-semibold">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold">Execution Blocked: </span>
              {proj.scan.blocked}
            </div>
          </div>
        )}

        {/* Auto-Detected Repository Banner */}
        {proj.auto_detected_repo && (
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 text-emerald-950 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-white border border-emerald-200 flex items-center justify-center shrink-0 shadow-xs text-emerald-600">
                <FolderGit2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-slate-900">Auto-Discovered Author Repository</span>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    ✨ Citations Scanned
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  CrisisGrid automatically parsed the paper's footnotes & abstract, detected the author's official GitHub repository (<code className="text-emerald-700 font-mono font-bold">{proj.repo_url}</code>), and initialized AST scanning.
                </p>
              </div>
            </div>
            {proj.repo_url && (
              <a
                href={proj.repo_url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-xs font-bold text-slate-700 hover:text-slate-900 shadow-xs transition-colors"
              >
                <span>View on GitHub</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}
          </div>
        )}

        {/* Paper-Only Autonomous Reconstruction Banner */}
        {proj.is_paper_only && (
          <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-200 text-indigo-950 rounded-2xl p-4 sm:p-5 shadow-xs flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white border border-indigo-200 flex items-center justify-center shrink-0 shadow-xs text-indigo-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-slate-900">Paper-Only Autonomous Benchmark Scaffold</span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-indigo-600" /> Autonomous Synthesis
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 font-medium">
                Author source code was omitted. CrisisGrid extracted the methodology, loss formulation, and hyperparameters directly from the PDF to autonomously generate a reproducible benchmark repository.
              </p>
            </div>
          </div>
        )}

        {/* Scanner Warnings Banner */}
        {filteredWarnings.length > 0 && (
          <div className="bg-amber-50/90 border border-amber-200 text-amber-900 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 font-extrabold mb-2 text-sm text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Repository Scanner Warnings ({filteredWarnings.length})</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-xs font-semibold text-amber-800">
              {filteredWarnings.map((w: string, i: number) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Decent, Cohesive, Elegant Ground Truth Claim Card (No weird dark box!) */}
        <section className="bg-gradient-to-br from-blue-50/80 via-white to-slate-50 border border-blue-200/80 rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <span className="text-xs font-extrabold uppercase tracking-wider text-brand-700 bg-blue-100/80 px-3 py-1 rounded-full border border-blue-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-600" />
              Target Ground Truth
            </span>
            {claim?.page && (
              <span className="text-xs font-mono font-bold text-slate-700 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                PDF Page {claim.page}
              </span>
            )}
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

          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mb-4 flex items-center gap-1.5">
            Published Paper Claim to Verify
            <KpiInfo term="claim_target"
              value={claim?.value != null ? `${claim.metric} = ${claim.value}${claim.percent ? '%' : ''} (p.${claim.page ?? '?'})` : 'no verified claim'} />
          </h2>

          {claim?.value != null ? (
            <div className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    Target Metric & Value
                  </div>
                  <div className="text-3xl sm:text-4xl font-extrabold text-brand-600 font-mono tracking-tight">
                    {claim.metric.toUpperCase()} = {claim.value}
                    {claim.percent ? '%' : ''}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Verbatim PDF Citation Verified
                </span>
              </div>

              {claim.quote && (
                <div className="flex items-start gap-3 text-xs text-slate-700 font-semibold italic bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                  <Quote className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">"{claim.quote}"</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>No verified claim found in PDF text. Metric verification will remain blocked.</span>
            </div>
          )}
        </section>


        {/* Extracted Hyperparameters Table */}
        <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Extracted Paper Hyperparameters
              </h2>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                PyMuPDF deterministic extraction • Method: <span className="font-extrabold text-slate-800">{paper?.method || 'regex'}</span>
                {paper?.note && <span> • {paper.note}</span>}
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter parameters..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full pl-8 pr-3 py-1.5 text-xs text-slate-800 font-semibold placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="overflow-hidden border border-slate-200/90 rounded-2xl">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-extrabold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="p-3.5">Parameter</th>
                  <th className="p-3.5">Extracted Value</th>
                  <th className="p-3.5">Provenance</th>
                  <th className="p-3.5">Citation & Verbatim Quote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredFields.map(([k, f]) => {
                  const finding = findings.find(x => x.param === k)
                  return (
                    <tr key={k} className="hover:bg-slate-50/60 transition-colors align-top">
                      <td className="p-3.5 font-mono font-extrabold text-xs text-slate-900">
                        {k}
                      </td>
                      <td className="p-3.5 font-mono font-bold text-xs text-slate-900">
                        {f.value ?? (
                          <i className="text-slate-400 font-sans font-normal">
                            {f.claimed_value != null ? `rejected (${f.claimed_value})` : 'missing'}
                          </i>
                        )}
                      </td>
                      <td className="p-3.5">
                        <ProvenanceBadge source={f.source} />
                      </td>
                      <td className="p-3.5 text-xs text-slate-700">
                        {f.quote ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-brand-700 bg-brand-50 px-2 py-0.5 rounded text-[10px] border border-brand-200">
                                Page {f.page}
                              </span>
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
                            <p className="font-semibold italic text-slate-800">“{f.quote}”</p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {paper?.flags?.[k] && (
                          <div className="text-amber-800 font-bold text-[11px] mt-1.5 flex items-center gap-1 bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Unverified extraction: quote missing on cited page</span>
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

        {/* Parameter Reconciliation Section */}
        <section className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-brand-700 bg-blue-50 px-3 py-1 rounded-full border border-brand-200">
                Reconciler Matrix
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
              Parameter Reconciliation (Paper vs. Repository Code)
              <KpiInfo term="reconciliation"
                value={Object.entries(findings.reduce((acc: Record<string, number>, f: any) => ({ ...acc, [f.status]: (acc[f.status] || 0) + 1 }), {}))
                  .map(([k, n]) => `${n} ${k}`).join(', ')} />
            </h2>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              Normalized aliases (lr, num_epochs, bs, seed, test_size) classified into MATCH, MISMATCH, ONLY_IN_PAPER, or ONLY_IN_CODE.
            </p>
          </div>
          <DiffTable findings={findings} onInspectPaper={handleInspectParam} />
        </section>
    </div>
  )
}

