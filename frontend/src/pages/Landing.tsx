import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  FolderKanban,
  FileText,
  Layers,
  ChevronDown,
  Activity,
  Check,
  Zap,
  Plus,
  Compass,
  Cpu,
  Sliders,
  FileCheck2
} from 'lucide-react'
import { api } from '../api/client'

export default function Landing() {
  const [projects, setProjects] = useState<any[] | null>(null)
  const [docker, setDocker] = useState<boolean | null>(null)
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  useEffect(() => {
    api.projects().then(setProjects).catch(() => setProjects([]))
    api.health().then(h => setDocker(h.docker)).catch(() => setDocker(false))
  }, [])

  const demo1 = projects?.find(p => p.name?.includes('Demo 1') || p.name?.includes('Random Forest'))
  const demo2 = projects?.find(p => p.name?.includes('Demo 2') || p.name?.includes('SGD'))

  const faqs = [
    {
      q: 'How does CrisisGrid eliminate LLM hallucinations during verification?',
      a: 'CrisisGrid operates under a strict core principle: AI interprets and explains, while deterministic code measures, executes, and compares. All empirical metrics are read strictly from actual metrics.json files produced by real runs in the sandbox—never parsed or hallucinated from LLM text.'
    },
    {
      q: 'What is the difference between Docker isolation and reduced isolation?',
      a: 'When Docker is available, execution runs inside an isolated non-root container with network disabled to prevent data leakage and external downloads. If Docker is unavailable on the host machine, CrisisGrid falls back to an ephemeral Python virtual environment labelled "reduced isolation".'
    },
    {
      q: 'How does the AST repository scanner work?',
      a: 'The scanner analyzes repository source code using Python AST to identify Argparse CLI arguments, YAML/JSON configurations, module-level constants, constructor keyword arguments, and random seed initializers without executing arbitrary code.'
    },
    {
      q: 'Can I edit parameters to test sensitivity and causality?',
      a: 'Yes. In the interactive Graph view, you can edit injectable CLI parameters. Each modification creates a new immutable child version with automatic parent diff tracking, enabling single-factor causality comparisons.'
    }
  ]

  const verifiedCount = projects ? projects.filter(p => p.status?.toLowerCase() === 'reproduced').length : 0

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* ============================================================ */}
      {/* HERO SECTION (Deep Royal Navy & Luminous Blue Glow)          */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden bg-navy-950 text-white pt-12 pb-24 lg:pb-32 hero-vertical-lines">
        {/* Ambient lighting glows */}
        <div className="absolute inset-0 hero-radial-glow pointer-events-none" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-brand-500/20 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute top-20 right-10 w-80 h-80 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Top Pill Badge */}
          <div className="flex justify-center mb-6">
            <div className="glass-pill px-4 py-1.5 rounded-full inline-flex items-center gap-2 text-xs font-semibold text-slate-200 border border-white/15 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
              <span>Verified Research with <b className="text-white font-semibold">CrisisGrid.AI</b></span>
              <Sparkles className="w-3.5 h-3.5 text-brand-300" />
            </div>
          </div>

          {/* Main Hero Headline */}
          <div className="max-w-4xl mx-auto mb-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
              Verify, Reproduce & Audit <br className="hidden sm:inline" />
              <span className="inline-flex items-center gap-2.5 flex-wrap justify-center">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-300 via-white to-cyan-300">
                  AI Research Claims
                </span>
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-brand-500/20 border border-brand-400/40 text-brand-300 shadow-glow">
                  <Zap className="w-5 h-5" />
                </span>
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
                  <Cpu className="w-5 h-5" />
                </span>
              </span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
              Analyze ML research papers and GitHub repositories, reconstruct executable experiment graphs, detect methodological data leakage, and verify claims deterministically.
            </p>
          </div>

          {/* Hero CTA Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              to="/new"
              className="inline-flex items-center gap-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-7 py-3 rounded-full shadow-glow-lg transition-all duration-200 hover:scale-105 active:scale-95 text-sm"
            >
              <span>Verify Paper Now</span>
              <div className="w-6 h-6 rounded-full bg-white text-brand-600 flex items-center justify-center text-xs">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>

            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 glass-pill text-white hover:bg-white/15 px-6 py-3 rounded-full text-sm font-semibold transition-colors"
            >
              <FolderKanban className="w-4 h-4 text-brand-300" />
              <span>Explore Projects ({projects ? projects.length : 10})</span>
            </Link>
          </div>

          {/* ============================================================ */}
          {/* THE 3 HIGH-TECH HERO SHOWCASE CARDS (Symmetrically Balanced) */}
          <div className="flex flex-col md:flex-row gap-6 items-stretch max-w-6xl mx-auto text-left">
            {/* Card 1: Left Card - Platform Telemetry */}
            <div className="md:w-1/3 flex flex-col justify-between glass-card rounded-3xl p-6 text-white shadow-2xl relative border border-white/15 backdrop-blur-xl min-h-[320px]">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-3 py-1 rounded-full">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Platform Telemetry
                  </span>
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-200 px-2.5 py-0.5 rounded-full font-bold border border-emerald-400/30">
                    ● Active
                  </span>
                </div>
                
                <div className="text-[11px] font-semibold text-slate-400 mb-1">Tracked Reproductions</div>
                <div className="text-3xl font-extrabold tracking-tight text-white font-mono mb-3">
                  {projects ? projects.length : 10} Projects
                </div>

                {/* Sandbox info pill */}
                <div className="bg-white/10 rounded-2xl p-3 flex items-center justify-between border border-white/10 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-brand-500/40 flex items-center justify-center text-brand-300 shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-300">Sandbox Isolation</div>
                      <div className="text-xs font-extrabold text-white">
                        {docker ? 'Docker Non-Root' : 'Virtualenv Mode'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Visual Preview Image */}
                <div className="relative rounded-2xl overflow-hidden border border-white/10 h-28 bg-slate-950">
                  <img
                    src="/telemetry-preview.jpg"
                    alt="Real-Time Telemetry Pipeline"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-2.5">
                    <div className="flex items-center gap-1.5 text-cyan-300 text-[10px] font-mono">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      <span>AST & Container Telemetry Live</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between text-xs font-medium text-slate-300">
                <span className="text-[11px] text-slate-400 font-mono">Runner: Active</span>
                <Link
                  to="/dashboard"
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all border border-white/15 hover:scale-105"
                  title="View Platform Dashboard"
                >
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Card 2: Center Card - Smart Search & Neural Lab Preview */}
            <div className="md:w-1/3 bg-white rounded-3xl p-6 text-slate-900 shadow-2xl relative border border-slate-100 z-10 flex flex-col justify-between min-h-[320px]">
              <div>
                <div className="text-center mb-3">
                  <span className="inline-block bg-slate-100 text-slate-700 text-[11px] font-extrabold px-3 py-1 rounded-full mb-1.5 border border-slate-200">
                    CrisisGrid Smart Engine
                  </span>
                  <h3 className="text-xl font-extrabold tracking-tight text-slate-900 leading-snug">
                    Scanning Repositories & Papers In Real-Time
                  </h3>
                </div>

                {/* Radial Score Pill */}
                <div className="flex items-center justify-center gap-3 bg-blue-50/70 border border-blue-100 rounded-2xl p-2.5 mb-3">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm border border-brand-200 flex items-center justify-center font-bold text-brand-600 text-xs font-mono shrink-0">
                    94%
                  </div>
                  <div className="text-left text-xs font-medium text-slate-700 leading-tight">
                    Reproducibility match expected within <b className="text-slate-900">±2.0%</b> tolerance
                  </div>
                </div>
              </div>

              {/* Hero Visual Image */}
              <div className="relative rounded-2xl overflow-hidden shadow-inner border border-slate-200 h-28 bg-slate-900">
                <img
                  src="/hero-preview.jpg"
                  alt="High-Tech AI Research Laboratory and Neural Network"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-2.5">
                  <div className="flex items-center gap-1.5 text-white text-[11px] font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Multi-Seed Sandboxed Runner Active</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Right Card - Verified Claim Match */}
            <div className="md:w-1/3 flex flex-col justify-between glass-card rounded-3xl p-6 text-white shadow-2xl relative border border-white/15 backdrop-blur-xl min-h-[320px]">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-3 py-1 rounded-full">
                    <Check className="w-3.5 h-3.5 text-cyan-400" /> Claim Verification
                  </span>
                  <span className="text-[10px] bg-cyan-500/30 text-cyan-200 px-2.5 py-0.5 rounded-full font-bold border border-cyan-400/30">
                    Verified
                  </span>
                </div>

                <div className="text-[11px] font-semibold text-slate-400 mb-1">Empirical Accuracy Result</div>
                <div className="text-3xl font-extrabold text-cyan-300 font-mono tracking-tight mb-1">
                  96.5%
                </div>
                <div className="text-xs text-slate-300 font-medium mb-3 flex items-center gap-1.5">
                  <span className="text-emerald-400 font-bold">Delta: 0.04 points</span>
                  <span>· Deterministic</span>
                </div>

                {/* Visual Preview Image */}
                <div className="relative rounded-2xl overflow-hidden border border-white/10 h-28 bg-slate-950">
                  <img
                    src="/verification-preview.jpg"
                    alt="Empirical Claim Verification Pipeline"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-2.5">
                    <div className="flex items-center gap-1.5 text-emerald-300 text-[10px] font-mono">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>Deterministic Audit Passed</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between text-xs font-medium text-slate-300">
                <span className="text-[11px] text-slate-400 font-mono">Paper → Docker</span>
                <Link
                  to={demo1 ? `/p/${demo1.id}` : '/dashboard'}
                  className="w-8 h-8 rounded-full bg-white text-brand-600 hover:bg-brand-50 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                  title="View Verified Project"
                >
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>

        </div>
      </section>


      {/* ============================================================ */}
      {/* INTERACTIVE DEMO BENCHMARKS SECTION (Single Placement)       */}
      {/* ============================================================ */}
      <section className="py-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
            <div>
              <span className="text-xs font-bold text-brand-600 uppercase tracking-wider bg-blue-50 border border-brand-200 px-3 py-1 rounded-full">
                Live Verification Benchmarks
              </span>
              <h2 className="text-3xl font-extrabold text-slate-900 mt-3">
                Pre-Computed Reproduction Fixtures
              </h2>
              <p className="text-slate-600 text-sm mt-1">
                Explore real paper extraction, AST repository scans, and multi-seed sandboxed runs.
              </p>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              <span>View all projects in dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Demo 1 Card */}
            <div className="bg-white rounded-3xl p-7 border border-slate-200/90 shadow-card hover:shadow-xl transition-all duration-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    REPRODUCED
                  </span>
                  <span className="text-xs text-slate-500 font-mono">Random Forest Classifier</span>
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 mb-2">
                  Demo 1: Random Forest on Breast Cancer
                </h3>
                <p className="text-sm text-slate-600 mb-5 leading-relaxed">
                  Demonstrates hyperparameter mismatch reconciliation (paper claimed 100 trees vs code default of 50). Multi-seed execution verified accuracy of 96.5% within tolerance.
                </p>

                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 mb-6 text-xs grid grid-cols-3 gap-2 text-center font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">Claimed Accuracy</span>
                    <span className="font-bold text-slate-900 text-sm">96.5%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">Reproduced Mean</span>
                    <span className="font-bold text-emerald-600 text-sm">96.54%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">Metric Delta</span>
                    <span className="font-bold text-slate-900 text-sm">+0.04%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Link
                  to={demo1 ? `/p/${demo1.id}` : '/dashboard'}
                  className="flex-1 bg-brand-500 hover:bg-brand-600 text-white text-center font-semibold text-xs py-3 px-5 rounded-full shadow-glow transition-colors"
                >
                  Open Full Audit
                </Link>
                <Link
                  to={demo1 ? `/p/${demo1.id}/graph` : '/dashboard'}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-3 px-5 rounded-full transition-colors"
                >
                  Inspect Graph
                </Link>
              </div>
            </div>

            {/* Demo 2 Card */}
            <div className="bg-white rounded-3xl p-7 border border-slate-200/90 shadow-card hover:shadow-xl transition-all duration-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold px-3.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    NOT_REPRODUCED
                  </span>
                  <span className="text-xs text-slate-500 font-mono">SGD Classifier</span>
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 mb-2">
                  Demo 2: SGD Classifier + YAML Config
                </h3>
                <p className="text-sm text-slate-600 mb-5 leading-relaxed">
                  Demonstrates multi-source extraction across YAML configs, constants, and seed initializers. Highlights non-injectable parameters and parameter mismatch detection.
                </p>

                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 mb-6 text-xs grid grid-cols-3 gap-2 text-center font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">Claimed F1</span>
                    <span className="font-bold text-slate-900 text-sm">95.0%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">Reproduced F1</span>
                    <span className="font-bold text-rose-600 text-sm">89.47%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">Metric Delta</span>
                    <span className="font-bold text-rose-600 text-sm">-5.53%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Link
                  to={demo2 ? `/p/${demo2.id}` : '/dashboard'}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-center font-semibold text-xs py-3 px-5 rounded-full transition-colors"
                >
                  Analyze Discrepancy
                </Link>
                <Link
                  to={demo2 ? `/p/${demo2.id}/verify` : '/dashboard'}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-3 px-5 rounded-full transition-colors"
                >
                  View Tolerance
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SYSTEM FAQ SECTION                                           */}
      {/* ============================================================ */}
      <section id="faq" className="py-20 bg-slate-50 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-brand-600 uppercase tracking-wider bg-blue-50 border border-brand-200 px-3 py-1 rounded-full">
              System Documentation
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 mt-3">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden transition-all duration-200 shadow-sm"
              >
                <button
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="w-full text-left px-6 py-4 flex items-center justify-between text-sm sm:text-base font-semibold text-slate-900 hover:text-brand-600 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                      activeFaq === idx ? 'rotate-180 text-brand-600' : ''
                    }`}
                  />
                </button>
                {activeFaq === idx && (
                  <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* FOOTER                                                       */}
      {/* ============================================================ */}
      <footer className="bg-navy-950 border-t border-white/10 text-slate-400 text-xs py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm">CrisisGrid.AI</span>
            <span>· AI interprets · code measures</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <Link to="/dashboard" className="hover:text-white transition-colors">Projects</Link>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300">Platform Operational</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
