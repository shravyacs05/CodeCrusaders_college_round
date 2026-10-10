import { Link, useLocation } from 'react-router-dom'
import { Sparkles, Plus, FolderKanban, ShieldCheck, ArrowRight } from 'lucide-react'

export default function Navbar() {
  const location = useLocation()
  const isLanding = location.pathname === '/'

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-navy-950/80 border-b border-white/10 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-400 p-0.5 flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-navy-950 rounded-[10px] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-brand-400 group-hover:rotate-12 transition-transform" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-lg tracking-tight text-white flex items-center gap-1">
              CrisisGrid<span className="text-brand-400">.AI</span>
            </span>
            <span className="text-[10px] font-medium tracking-wider uppercase text-slate-400 -mt-1">
              Research Reproducibility
            </span>
          </div>
        </Link>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-300">
          <Link
            to="/"
            className={`px-3.5 py-1.5 rounded-full transition-colors ${
              location.pathname === '/'
                ? 'text-white bg-white/10'
                : 'hover:text-white hover:bg-white/5'
            }`}
          >
            Home
          </Link>
          <a
            href="/#features"
            className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Features
          </a>
          <a
            href="/#architecture"
            className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            Architecture
          </a>
          <a
            href="/#faq"
            className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-white/5 transition-colors"
          >
            FAQ
          </a>
          <Link
            to="/dashboard"
            className={`px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-colors ${
              location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/p/')
                ? 'text-white bg-white/10'
                : 'hover:text-white hover:bg-white/5'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5 text-brand-400" />
            Projects
          </Link>
        </nav>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="hidden sm:inline-flex text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-full hover:bg-white/10 transition-colors"
          >
            View Projects
          </Link>
          <Link
            to="/new"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 px-4 py-2 rounded-full shadow-glow transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Reproduction</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
