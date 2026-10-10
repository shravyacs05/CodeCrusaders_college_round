import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api/client'

/** Polls run status for an experiment; polls every 1.5 s while a run is in progress. */
export function useStatus(eid: string | undefined) {
  const [status, setStatus] = useState<any>(null)
  const timer = useRef<number>()
  const poll = useCallback(async () => {
    if (!eid) return null
    try { const s = await api.status(eid); setStatus(s); return s } catch { return null }
  }, [eid])
  const start = useCallback(() => {
    window.clearInterval(timer.current)
    timer.current = window.setInterval(async () => {
      const s = await poll()
      if (s && s.state !== 'running') window.clearInterval(timer.current)
    }, 1500)
  }, [poll])
  useEffect(() => {
    setStatus(null)
    poll().then(s => { if (s?.state === 'running') start() })
    return () => window.clearInterval(timer.current)
  }, [eid, poll, start])
  return { status, start, poll }
}
