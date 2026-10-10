import axios from 'axios'

const http = axios.create({ baseURL: '' })

export function errMsg(e: any): string {
  return e?.response?.data?.detail || e?.message || 'Request failed'
}

export const api = {
  health: () => http.get('/health').then(r => r.data),
  projects: () => http.get('/projects').then(r => r.data),
  project: (pid: string) => http.get(`/projects/${pid}`).then(r => r.data),
  createProject: (name: string, repo: string, file: File, isDemo: boolean) => {
    const f = new FormData()
    f.append('name', name); f.append('repo_url', repo); f.append('paper', file)
    f.append('is_demo', String(isDemo))
    return http.post('/projects', f).then(r => r.data)
  },
  analyze: (pid: string) => http.post(`/projects/${pid}/analyze`).then(r => r.data),
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
  paperPdfUrl: (pid: string) => `/projects/${pid}/paper.pdf`,
  paperPageUrl: (pid: string, page: number) => `/projects/${pid}/paper/pages/${page}`,
  paperMetadata: (pid: string) => http.get(`/projects/${pid}/paper/metadata`).then(r => r.data),
}

