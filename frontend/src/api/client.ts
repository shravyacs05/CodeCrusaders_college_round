import axios from 'axios'

const http = axios.create({ baseURL: '' })

export function errMsg(e: any): string {
  return e?.response?.data?.detail || e?.message || 'Request failed'
}

export type AskMessage = { role: 'user' | 'assistant'; content: string }
/** The KPI card an (i) question is about. */
export type AskFocus = { title: string; definition: string; value?: string }

export const api = {
  health: () => http.get('/health').then(r => r.data),
  projects: () => http.get('/projects').then(r => r.data),
  project: (pid: string) => http.get(`/projects/${pid}`).then(r => r.data),
  createProject: (name: string, repo: string, file: File, isDemo: boolean, isPaperOnly: boolean = false) => {
    const f = new FormData()
    f.append('name', name); f.append('repo_url', repo); f.append('paper', file)
    f.append('is_demo', String(isDemo))
    f.append('is_paper_only', String(isPaperOnly))
    return http.post('/projects', f).then(r => r.data)
  },
  inspectPaper: (file: File) => {
    const f = new FormData()
    f.append('paper', file)
    return http.post('/inspect-paper', f).then(r => r.data)
  },
  analyze: (pid: string) => http.post(`/projects/${pid}/analyze`).then(r => r.data),
  analyzeStream: async (
    pid: string,
    onEvent: (ev: { stage: string; pct: number; message: string; experiment_id?: string }) => void
  ) => {
    const response = await fetch(`/projects/${pid}/analyze-stream`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error(`Analysis stream failed: ${response.statusText}`)
    }
    const reader = response.body?.getReader()
    if (!reader) {
      return api.analyze(pid)
    }
    const decoder = new TextDecoder()
    let buffer = ''
    let lastData: any = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            lastData = data
            onEvent(data)
          } catch {}
        }
      }
    }
    return lastData
  },
  findings: (pid: string) => http.get(`/projects/${pid}/findings`).then(r => r.data),
  graph: (pid: string, eid?: string) =>
    http.get(`/projects/${pid}/graph`, { params: { experiment_id: eid } }).then(r => r.data),
  editNode: (eid: string, node: string, edits: Record<string, any>) =>
    http.patch(`/experiments/${eid}/nodes/${node}`, edits).then(r => r.data),
  run: (eid: string, seeds: number) =>
    http.post(`/experiments/${eid}/run`, { seeds }).then(r => r.data),
  status: (eid: string) => http.get(`/experiments/${eid}/status`).then(r => r.data),
  verification: (eid: string) => http.get(`/experiments/${eid}/verification`).then(r => r.data),
  compare: (a: string, b: string) => http.get(`/experiments/${a}/compare/${b}`).then(r => r.data),
  reportUrl: (pid: string, eid?: string) =>
    `/projects/${pid}/report${eid ? `?experiment_id=${eid}` : ''}`,
  reportPdfUrl: (pid: string, eid?: string) =>
    `/projects/${pid}/report.pdf${eid ? `?experiment_id=${eid}` : ''}`,
  notebookUrl: (pid: string, eid?: string) =>
    `/projects/${pid}/notebook${eid ? `?experiment_id=${eid}` : ''}`,
  checklist: (pid: string, eid?: string) =>
    http.get(`/projects/${pid}/checklist`, { params: { experiment_id: eid } }).then(r => r.data),
  leakage: (pid: string) =>
    http.get(`/projects/${pid}/leakage`).then(r => r.data),
  diagnoseHeal: (eid: string) =>
    http.get(`/experiments/${eid}/diagnose-heal`).then(r => r.data),
  autoHeal: (eid: string) =>
    http.post(`/experiments/${eid}/auto-heal`).then(r => r.data),
  xaiAttribution: (eid: string) =>
    http.get(`/experiments/${eid}/xai-attribution`).then(r => r.data),
  paperPdfUrl: (pid: string) => `/projects/${pid}/paper.pdf`,
  paperPageUrl: (pid: string, page: number) => `/projects/${pid}/paper/pages/${page}`,
  paperMetadata: (pid: string) => http.get(`/projects/${pid}/paper/metadata`).then(r => r.data),
  leaderboard: () => http.get('/leaderboard').then(r => r.data),
  radar: (eid: string) => http.get(`/experiments/${eid}/radar`).then(r => r.data),
  askStatus: () => http.get('/ask/status').then(r => r.data as { enabled: boolean }),
  askAboutKpi: (pid: string, messages: AskMessage[], focus: AskFocus, eid?: string, cardData?: unknown) =>
    http.post(`/projects/${pid}/ask`, { messages, focus, experiment_id: eid, card_data: cardData })
      .then(r => r.data.answer as string),
  stressTestRadar: (eid: string, payload: { lr_drift: number; batch_scale: number; seed_noise: number }) =>
    http.post(`/experiments/${eid}/radar/stress-test`, payload).then(r => r.data),
}

