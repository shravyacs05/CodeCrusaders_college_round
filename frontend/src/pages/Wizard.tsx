import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errMsg } from '../api/client'

export default function Wizard() {
  const nav = useNavigate()
  const [name, setName] = useState('My reproduction')
  const [repo, setRepo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [demo, setDemo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setErr('Choose a paper PDF'); return }
    setBusy(true); setErr('')
    let pid = ''
    try {
      pid = (await api.createProject(name, repo, file, demo)).id
      await api.analyze(pid)
      nav(`/p/${pid}`)
    } catch (e) {
      setErr(errMsg(e))
      if (pid) nav(`/p/${pid}`)   // project exists but analysis failed: show its state
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="max-w-xl bg-white border rounded p-5 space-y-4">
      <h1 className="text-xl font-bold">New Reproduction Project</h1>
      <label className="block text-sm">Project name
        <input className="mt-1 w-full border rounded px-2 py-1" value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm">Paper (PDF)
        <input className="mt-1 w-full" type="file" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
      <label className="block text-sm">Repository (public git URL, or a local path on the server)
        <input className="mt-1 w-full border rounded px-2 py-1" required value={repo} onChange={e => setRepo(e.target.value)}
          placeholder="https://github.com/org/repo  or  /path/to/crisisgrid/fixtures/demo_repo" /></label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} />
        This is the synthetic demo fixture</label>
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}
      <button disabled={busy} className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50">
        {busy ? 'Analyzing paper and repo…' : 'Create and analyze'}</button>
    </form>
  )
}
