import { Link, useLocation } from 'react-router-dom'
import { Sparkles, Plus, FolderKanban, Trophy } from 'lucide-react'

export default function Navbar() {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-[100] backdrop-blur-2xl bg-navy-950/90 border-b border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3.5 group">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-600 via-cyan-400 to-indigo-500 p-0.5 flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform shrink-0">
            <div className="w-full h-full bg-navy-950 rounded-[14px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-brand-400 group-hover:rotate-12 transition-transform" />
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center leading-none">
              <span className="font-black text-2xl sm:text-[26px] tracking-tight text-white drop-shadow-sm">
                CrisisGrid
              </span>
              <span className="bg-gradient-to-r from-brand-500 to-cyan-400 text-navy-950 font-black text-xs px-2 py-0.5 rounded-lg uppercase tracking-wider ml-1.5 shadow-sm">
                .AI
              </span>
            </div>
            <span className="text-[10px] font-extrabold tracking-widest uppercase text-slate-400 mt-1">
              Research Reproducibility Engine
            </span>
          </div>
        </Link>

        {/* Floating Glass Navigation Links */}
        <nav className="flex items-center gap-1.5 p-1 bg-white/[0.05] border border-white/[0.1] rounded-full backdrop-blur-md shadow-inner">
          <Link
            to="/"
            className={`px-4 py-2 rounded-full text-xs font-extrabold transition-all ${
              location.pathname === '/'
                ? 'text-white bg-brand-500/80 shadow-glow'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            Home
          </Link>
          <Link
            to="/leaderboard"
            className={`px-4 py-2 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition-all ${
              location.pathname.startsWith('/leaderboard')
                ? 'text-white bg-brand-500/80 shadow-glow'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Leaderboard</span>
          </Link>
          <Link
            to="/dashboard"
            className={`px-4 py-2 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition-all ${
              location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/p/')
                ? 'text-white bg-brand-500/80 shadow-glow'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5 text-brand-300" />
            <span>Projects</span>
          </Link>
          <a
            href="/#faq"
            className="px-4 py-2 rounded-full text-xs font-extrabold text-slate-300 hover:text-white hover:bg-white/10 transition-all hidden sm:inline-block"
          >
            FAQ
          </a>
        </nav>

        {/* Right CTA Button */}
        <div className="flex items-center gap-3">
          <Link
            to="/new"
            className="inline-flex items-center gap-2 text-xs font-extrabold text-white bg-gradient-to-r from-brand-500 via-blue-600 to-indigo-600 hover:from-brand-400 hover:to-blue-500 px-5 py-2.5 rounded-full shadow-glow transition-all hover:scale-105 active:scale-95 border border-white/20"
          >
            <Plus className="w-4 h-4" />
            <span>New Reproduction</span>
          </Link>
        </div>
      </div>
    </header>
  )
}

