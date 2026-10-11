import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  UploadCloud,
  FileText,
  GitBranch,
  ArrowRight,
  Sparkles,
  AlertCircle,
  FolderGit2,
  CheckCircle2,
  ArrowLeft,
  Zap,
  Cpu,
  Terminal,
  Activity,
  Check,
  SearchCheck,
  Layers,
  Loader2
} from 'lucide-react'
import { api, errMsg } from '../api/client'

interface StreamLog {
  time: string
  message: string
  stage: string
}

const PIPELINE_STEPS = [
  { key: 'ingest', label: 'PDF Layout & Provenance', desc: 'PyMuPDF text extraction & citation scanner' },
  { key: 'methodology', label: 'Gemini Architecture Intelligence', desc: 'Model family & domain classification' },
  { key: 'claims', label: 'Ground Truth Claims', desc: 'Verbatim quotes & physical PDF bounding boxes' },
  { key: 'code', label: 'Codebase AST Analysis', desc: 'CLI args, constants, configs & leakage checks' },
  { key: 'reconcile', label: 'DAG Spec Synthesis', desc: 'Cross-reconciliation & experiment DAG building' },
]

export default function Wizard() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [repo, setRepo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [demo, setDemo] = useState(false)
  const [paperOnly, setPaperOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Real-time autodetection & streaming progress states
  const [detectingPdf, setDetectingPdf] = useState(false)
  const [detectedTitle, setDetectedTitle] = useState<string | null>(null)
  const [detectedRepo, setDetectedRepo] = useState<string | null>(null)
  const [streamStage, setStreamStage] = useState('init')
  const [streamPct, setStreamPct] = useState(0)
  const [streamLogs, setStreamLogs] = useState<StreamLog[]>([])

  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [streamLogs])

  async function handleFileSelect(f: File | null) {
    setFile(f)
    setDetectedTitle(null)
    setDetectedRepo(null)
    if (!f) return

    setDetectingPdf(true)
    try {
      const res = await api.inspectPaper(f)
      if (res.title && res.title !== 'Research Paper Reproduction') {
        setName(res.title)
        setDetectedTitle(res.title)
      }
      if (res.discovered_repo && !repo.trim()) {
        setRepo(res.discovered_repo)
        setDetectedRepo(res.discovered_repo)
      }
    } catch (e) {
      // Non-fatal: if pre-inspection fails, user can type manually or backend will extract title
    } finally {
      setDetectingPdf(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      setErr('Please select a paper PDF to extract claims and hyperparameters.')
      return
    }
    if (!paperOnly && !repo.trim()) {
      setErr('Please provide a repository URL or enable "Paper-Only Mode" to autonomously reconstruct code.')
      return
    }

    setBusy(true)
    setErr('')
    setStreamStage('ingest')
    setStreamPct(5)
    setStreamLogs([
      { time: new Date().toLocaleTimeString(), message: 'Initializing CrisisGrid analysis pipeline...', stage: 'init' }
    ])

    let pid = ''
    try {
      const effectiveName = name.trim() || detectedTitle || ''
      const proj = await api.createProject(effectiveName, paperOnly ? '' : repo, file, demo, paperOnly)
      pid = proj.id

      // Stream live progress events from the backend engine
      await api.analyzeStream(pid, (ev) => {
        setStreamStage(ev.stage)
        setStreamPct(ev.pct)
        setStreamLogs(prev => [
          ...prev,
          { time: new Date().toLocaleTimeString(), message: ev.message, stage: ev.stage }
        ])
      })

      // Brief transition delay so user sees the 100% completion checkmark
      setTimeout(() => {
        nav(`/p/${pid}`)
      }, 700)
    } catch (e) {
      setErr(errMsg(e))
      if (pid) nav(`/p/${pid}`) // Project created but analysis hit an error: show state
    } finally {
      setBusy(false)
    }
  }

  const getStepStatus = (stepKey: string) => {
    const stageOrder = ['ingest', 'methodology', 'claims', 'code', 'reconcile', 'complete']
    const currentIndex = stageOrder.indexOf(streamStage)
    const stepIndex = stageOrder.indexOf(stepKey)

    if (streamStage === 'complete' || currentIndex > stepIndex) return 'completed'
    if (currentIndex === stepIndex) return 'active'
    return 'pending'
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Projects</span>
      </Link>

      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-card">
        {/* Header */}
        <div className="mb-6 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200">
              New Reproduction
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Configure Experiment
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Provide the published paper PDF. CrisisGrid auto-detects paper titles, extracts claims, and reconciles hyperparameters.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Paper PDF Upload Box */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Research Paper (PDF)
              </label>
              {detectingPdf && (
                <span className="text-[11px] font-semibold text-brand-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  Auto-detecting paper title & repo…
                </span>
              )}
            </div>

            <div className="relative border-2 border-dashed border-slate-200 hover:border-brand-400 rounded-2xl p-6 text-center bg-slate-50/60 hover:bg-blue-50/20 transition-colors cursor-pointer group">
              <input
                type="file"
                accept=".pdf"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                disabled={busy}
                onChange={e => handleFileSelect(e.target.files?.[0] || null)}
              />
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center mx-auto mb-3 text-brand-500 group-hover:scale-105 transition-transform">
                {file ? <FileText className="w-6 h-6 text-emerald-600" /> : <UploadCloud className="w-6 h-6" />}
              </div>
              {file ? (
                <div className="space-y-1.5">
                  <div className="font-semibold text-sm text-slate-900 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>{file.name}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • Click to change PDF
                  </div>
                  {detectedTitle && (
                    <div className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 mt-1">
                      <Sparkles className="w-3 h-3 text-emerald-500" />
                      <span>Title auto-detected from PDF layout</span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <span className="font-semibold text-sm text-brand-600 group-hover:text-brand-700">
                    Click to select research paper PDF
                  </span>
                  <p className="text-xs text-slate-400 mt-1">Paper title and cited code repositories will be auto-detected.</p>
                </div>
              )}
            </div>
          </div>

          {/* Project Name (Auto-populated with visual badge) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Project Name
              </label>
              {detectingPdf ? (
                <span className="text-[11px] font-semibold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-brand-500" />
                  <span>Extracting paper title...</span>
                </span>
              ) : detectedTitle ? (
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Academic Title Auto-Detected
                </span>
              ) : null}
            </div>
            <div className="relative">
              <input
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all font-medium"
                value={name}
                onChange={e => {
                  setName(e.target.value)
                  setDetectedTitle(null)
                }}
                disabled={busy}
                placeholder={detectingPdf ? "Analyzing PDF layout for paper title..." : "Auto-extracted from academic paper title, or enter custom name"}
              />
            </div>
          </div>

          {/* Paper-Only Reconstruction Toggle */}
          <div className={`p-4 rounded-2xl border transition-all ${
            paperOnly
              ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 text-indigo-950 shadow-xs'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={paperOnly}
                disabled={busy}
                onChange={e => setPaperOnly(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <div className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 block text-sm">
                    Paper-Only Reproduction Mode (No Source Code Available)
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-indigo-600" /> Autonomous Synthesis
                  </span>
                </div>
                <p className="text-slate-600 mt-1 leading-relaxed">
                  Enable this if the paper did not publish source code. CrisisGrid will classify the methodology with Gemini AI and autonomously synthesize an executable PyTorch benchmark repository & Colab notebook.
                </p>
              </div>
            </label>
          </div>

          {/* Repository URL */}
          {!paperOnly && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Repository (Public Git URL or Local Server Path)
                </label>
                {detectedRepo ? (
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Auto-detected from paper
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                    Optional • Auto-Detected
                  </span>
                )}
              </div>
              <div className="relative">
                <FolderGit2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 font-mono transition-all"
                  value={repo}
                  disabled={busy}
                  onChange={e => {
                    setRepo(e.target.value)
                    setDetectedRepo(null)
                  }}
                  placeholder="https://github.com/org/repo (Leave blank to auto-detect from paper)"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                If left blank, CrisisGrid automatically searches paper footnotes & text for GitHub/GitLab links. If none exist, it synthesizes a clean benchmark scaffold.
              </p>
            </div>
          )}

          {/* Synthetic Demo Checkbox */}
          <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
            <input
              type="checkbox"
              checked={demo}
              disabled={busy}
              onChange={e => setDemo(e.target.checked)}
              className="mt-0.5 rounded text-brand-600 focus:ring-brand-500 w-4 h-4"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800 block">Mark as Synthetic Demo Fixture</span>
              <span className="text-slate-500">
                Check this if evaluating synthetic demo fixtures from the crisisgrid test suite.
              </span>
            </div>
          </label>

          {/* Error Message */}
          {err && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-2.5 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          )}

          {/* ============================================================ */}
          {/* REAL-TIME PIPELINE EXECUTION CARD (Shown during processing)  */}
          {/* ============================================================ */}
          {busy && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-xl space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Live Reproduction Pipeline
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-brand-400">
                  {streamPct}% Complete
                </span>
              </div>

              {/* Glowing Progress Bar */}
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(streamPct, 8)}%` }}
                />
              </div>

              {/* Stage Stepper Checklist */}
              <div className="space-y-2 pt-1">
                {PIPELINE_STEPS.map((step) => {
                  const status = getStepStatus(step.key)
                  return (
                    <div
                      key={step.key}
                      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        status === 'active'
                          ? 'bg-slate-800/80 text-white font-semibold'
                          : status === 'completed'
                          ? 'text-slate-400'
                          : 'text-slate-600'
                      }`}
                    >
                      <div className="shrink-0">
                        {status === 'completed' ? (
                          <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </div>
                        ) : status === 'active' ? (
                          <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-700 bg-slate-800" />
                        )}
                      </div>
                      <div className="flex-1 truncate">
                        <span className={status === 'active' ? 'text-white' : ''}>{step.label}</span>
                        <span className="text-[11px] text-slate-500 ml-2 hidden sm:inline">— {step.desc}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Live Terminal Stream Log */}
              <div className="pt-2">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">
                  <Terminal className="w-3 h-3 text-slate-400" />
                  <span>Real-Time Processing Stream</span>
                </div>
                <div
                  ref={terminalRef}
                  className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 h-28 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800"
                >
                  {streamLogs.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-slate-500 shrink-0 text-[10px]">{log.time}</span>
                      <span className={i === streamLogs.length - 1 ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          {!busy && (
            <div className="pt-2">
              <button
                disabled={busy}
                type="submit"
                className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-full shadow-glow flex items-center justify-center gap-2 text-sm transition-all hover:scale-[1.01] active:scale-95"
              >
                <span>Create and Analyze Project</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
