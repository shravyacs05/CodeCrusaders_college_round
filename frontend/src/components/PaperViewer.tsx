import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ExternalLink,
  Download,
  X,
  FileText,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Bookmark
} from 'lucide-react'
import { api, errMsg } from '../api/client'

export interface BoundingBox {
  x: number // percentage 0..100
  y: number // percentage 0..100
  w: number // percentage 0..100
  h: number // percentage 0..100
}

export interface EvidenceItem {
  id: string
  param: string
  value?: any
  codeValue?: any
  status?: string
  page: number
  bbox?: BoundingBox | null
  quote?: string
}

interface PaperViewerProps {
  pid: string
  activeItem?: EvidenceItem | null
  onSelectItem?: (item: EvidenceItem) => void
  items?: EvidenceItem[]
  onClose?: () => void
  isModal?: boolean
}

export default function PaperViewer({
  pid,
  activeItem,
  onSelectItem,
  items = [],
  onClose,
  isModal = false,
}: PaperViewerProps) {
  const [currentPage, setCurrentPage] = useState<number>(activeItem?.page || 1)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [zoom, setZoom] = useState<number>(100)
  const [loading, setLoading] = useState<boolean>(true)
  const [hoveredItem, setHoveredItem] = useState<EvidenceItem | null>(null)
  const [error, setError] = useState<string>('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch paper metadata (total pages)
  useEffect(() => {
    api.paperMetadata(pid)
      .then((meta: any) => {
        setTotalPages(meta.n_pages || 1)
      })
      .catch((e: any) => {
        // Fallback default
        setTotalPages(items.length ? Math.max(...items.map(i => i.page || 1), 1) : 1)
      })
  }, [pid, items])

  // Synchronize current page whenever activeItem changes
  useEffect(() => {
    if (activeItem?.page && activeItem.page !== currentPage) {
      setCurrentPage(activeItem.page)
    }
  }, [activeItem])

  const currentPageItems = items.filter(it => it.page === currentPage && it.bbox)

  const handlePrev = () => setCurrentPage(p => Math.max(1, p - 1))
  const handleNext = () => setCurrentPage(p => Math.min(totalPages, p + 1))
  const handleZoomIn = () => setZoom(z => Math.min(200, z + 20))
  const handleZoomOut = () => setZoom(z => Math.max(60, z - 20))
  const handleZoomReset = () => setZoom(100)

  return (
    <div className={`flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl text-slate-100 ${
      isModal ? 'fixed inset-4 sm:inset-10 z-50' : 'h-[720px] w-full'
    }`}>
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-tight">Interactive Paper Viewer</span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
                PyMuPDF OCR-Free
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Verbatim quote coordinates verified against document canvas</p>
          </div>
        </div>

        {/* Center Page Controls */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl px-2 py-1">
          <button
            onClick={handlePrev}
            disabled={currentPage <= 1}
            className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 disabled:hover:bg-transparent transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs font-mono font-medium px-2 text-slate-200">
            Page <b className="text-brand-400">{currentPage}</b> of {totalPages}
          </span>

          <button
            onClick={handleNext}
            disabled={currentPage >= totalPages}
            className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 disabled:hover:bg-transparent transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right Zoom and Action Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-2xl px-2 py-1">
            <button
              onClick={handleZoomOut}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomReset}
              className="text-[11px] font-mono px-1.5 text-slate-300 hover:text-white"
              title="Reset Zoom"
            >
              {zoom}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* External links */}
          <a
            href={api.paperPdfUrl(pid)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 hover:text-white transition-colors border border-slate-700"
            title="Open original PDF in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Raw PDF</span>
          </a>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Close Viewer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Document Canvas Viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-slate-950/70 p-6 flex justify-center items-start relative select-none"
      >
        <div
          className="relative transition-all duration-150 origin-top shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-white"
          style={{ width: `${Math.round(750 * (zoom / 100))}px` }}
        >
          {/* Rendered High-Res Page Image */}
          <img
            key={`${pid}-${currentPage}`}
            src={api.paperPageUrl(pid, currentPage)}
            alt={`Paper Page ${currentPage}`}
            className="w-full h-auto block"
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false)
              setError('Failed to render paper page canvas.')
            }}
          />

          {/* Bounding Box Coordinate Overlay Layer */}
          <div className="absolute inset-0 pointer-events-auto">
            {currentPageItems.map((item) => {
              if (!item.bbox) return null
              const isFocused = activeItem?.id === item.id || activeItem?.param === item.param
              const isHovered = hoveredItem?.id === item.id || hoveredItem?.param === item.param

              return (
                <div
                  key={`${item.param}-${item.page}`}
                  onClick={() => onSelectItem?.(item)}
                  onMouseEnter={() => setHoveredItem(item)}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={{
                    left: `${item.bbox.x}%`,
                    top: `${item.bbox.y}%`,
                    width: `${item.bbox.w}%`,
                    height: `${item.bbox.h}%`,
                  }}
                  className={`absolute rounded cursor-pointer transition-all duration-200 ${
                    isFocused
                      ? 'border-2 border-amber-400 bg-amber-400/30 shadow-[0_0_20px_rgba(251,191,36,0.7)] z-20 ring-4 ring-amber-400/20'
                      : isHovered
                      ? 'border-2 border-blue-400 bg-blue-400/25 shadow-[0_0_12px_rgba(96,165,250,0.5)] z-10'
                      : 'border border-blue-500/50 bg-blue-500/10 hover:border-blue-400 hover:bg-blue-400/20 z-0'
                  }`}
                >
                  {/* Active Beacon Pulse on Focused Item */}
                  {isFocused && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                    </span>
                  )}

                  {/* Tooltip on Focus or Hover */}
                  {(isFocused || isHovered) && (
                    <div
                      className={`absolute left-0 z-30 min-w-[220px] max-w-[320px] bg-slate-900/95 backdrop-blur-md border border-slate-700/80 text-white rounded-xl p-3 shadow-2xl pointer-events-none transform ${
                        item.bbox.y > 60 ? 'bottom-full mb-2' : 'top-full mt-2'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[11px] font-mono font-bold text-amber-400">
                          {item.param}
                        </span>
                        {item.status && (
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              item.status === 'MATCH'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : item.status === 'MISMATCH'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {item.status}
                          </span>
                        )}
                      </div>

                      <div className="text-xs space-y-1 text-slate-200">
                        <div>
                          <span className="text-slate-400">Extracted:</span>{' '}
                          <b className="font-mono text-white">{String(item.value ?? 'None')}</b>
                        </div>
                        {item.codeValue !== undefined && (
                          <div>
                            <span className="text-slate-400">Codebase uses:</span>{' '}
                            <b className="font-mono text-slate-300">{String(item.codeValue)}</b>
                          </div>
                        )}
                      </div>

                      {item.quote && (
                        <div className="mt-2 text-[10px] text-slate-300 italic border-t border-slate-800 pt-1.5 bg-slate-950/40 p-1.5 rounded">
                          "{item.quote}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom Evidence Navigator Shelf */}
      <div className="px-5 py-3 bg-slate-950/90 border-t border-slate-800/80">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Bookmark className="w-3.5 h-3.5 text-brand-400" />
            <span className="text-xs font-bold text-slate-200">Extracted Ground-Truth Citations</span>
            <span className="text-[10px] text-slate-400">({items.length} citations mapped)</span>
          </div>
          <span className="text-[11px] text-slate-400">Click any citation to jump to that page and highlight it</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {items.map((it) => {
            const isSelected = activeItem?.id === it.id || activeItem?.param === it.param
            return (
              <button
                key={`${it.param}-${it.page}`}
                onClick={() => {
                  setCurrentPage(it.page)
                  onSelectItem?.(it)
                }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-amber-400/20 text-amber-200 border-amber-400/50 shadow-glow'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                }`}
              >
                <span className="font-mono font-semibold">{it.param}</span>
                <span className="text-slate-400 text-[10px] font-mono">p.{it.page}</span>
                {it.status && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      it.status === 'MATCH'
                        ? 'bg-emerald-400'
                        : it.status === 'MISMATCH'
                        ? 'bg-rose-400'
                        : 'bg-slate-400'
                    }`}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
