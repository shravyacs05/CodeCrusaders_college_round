import { useState } from 'react'
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
  ArrowLeft
} from 'lucide-react'
import { api, errMsg } from '../api/client'

export default function Wizard() {
  const nav = useNavigate()
  const [name, setName] = useState('My Reproduction Project')
  const [repo, setRepo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [demo, setDemo] = useState(false)
  const [paperOnly, setPaperOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

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
    let pid = ''
    try {
      pid = (await api.createProject(name, paperOnly ? '' : repo, file, demo, paperOnly)).id
      await api.analyze(pid)
      nav(`/p/${pid}`)
    } catch (e) {
      setErr(errMsg(e))
      if (pid) nav(`/p/${pid}`) // project exists but analysis failed: show its state
    } finally {
      setBusy(false)
    }
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
            Provide the published paper PDF and public GitHub repository URL to initiate AST scanning and claim extraction.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Project Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Project Name
            </label>
            <input
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Attention Is All You Need (Transformer)"
              required
            />
          </div>

          {/* Paper PDF Upload Box */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Research Paper (PDF)
            </label>
            <div className="relative border-2 border-dashed border-slate-200 hover:border-brand-400 rounded-2xl p-6 text-center bg-slate-50/60 hover:bg-blue-50/20 transition-colors cursor-pointer group">
              <input
                type="file"
                accept=".pdf"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center mx-auto mb-3 text-brand-500 group-hover:scale-105 transition-transform">
                {file ? <FileText className="w-6 h-6 text-emerald-600" /> : <UploadCloud className="w-6 h-6" />}
              </div>
              {file ? (
                <div>
                  <div className="font-semibold text-sm text-slate-900 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>{file.name}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • Click to change PDF
                  </div>
                </div>
              ) : (
                <div>
                  <span className="font-semibold text-sm text-brand-600 group-hover:text-brand-700">
                    Click to select research paper PDF
                  </span>
                  <p className="text-xs text-slate-400 mt-1">PyMuPDF will extract accuracy, F1, and hyperparameter quotes.</p>
                </div>
              )}
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
                onChange={e => setPaperOnly(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <div className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 block text-sm">
                    Paper-Only Reproduction Mode (No Source Code Available)
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                    ⚡ Autonomous Synthesis
                  </span>
                </div>
                <p className="text-slate-600 mt-1 leading-relaxed">
                  Enable this if the paper did not publish source code. CrisisGrid will parse the methodology and parameters from the PDF and autonomously synthesize a runnable benchmark repository.
                </p>
              </div>
            </label>
          </div>

          {/* Repository URL */}
          {!paperOnly && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Repository (Public Git URL or Local Server Path)
              </label>
              <div className="relative">
                <FolderGit2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 font-mono transition-all"
                  required={!paperOnly}
                  value={repo}
                  onChange={e => setRepo(e.target.value)}
                  placeholder="https://github.com/org/repo  or  /path/to/repo"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                The AST scanner will inspect Argparse CLI arguments, YAML/JSON configs, constants, and random seeds.
              </p>
            </div>
          )}

          {/* Synthetic Demo Checkbox */}
          <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/60 transition-colors">
            <input
              type="checkbox"
              checked={demo}
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

          {/* Submit Button */}
          <div className="pt-2">
            <button
              disabled={busy}
              type="submit"
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-full shadow-glow flex items-center justify-center gap-2 text-sm transition-all hover:scale-[1.01] active:scale-95"
            >
              {busy ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Analyzing Paper and Repository...</span>
                </>
              ) : (
                <>
                  <span>Create and Analyze Project</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
