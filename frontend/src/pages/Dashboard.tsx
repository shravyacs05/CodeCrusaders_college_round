import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function Dashboard() {
  const [projects, setProjects] = useState<any[] | null>(null)
  const [docker, setDocker] = useState<boolean | null>(null)
  useEffect(() => { api.projects().then(setProjects); api.health().then(h => setDocker(h.docker)) }, [])
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link to="/new" className="bg-indigo-600 text-white px-4 py-2 rounded">New Reproduction Project</Link>
      </div>
      {docker === false && <p className="mb-3 text-sm bg-amber-50 border-l-4 border-amber-400 p-2">
        Docker is not available: runs will use a virtualenv and be labelled “reduced isolation”.</p>}
      {projects === null && <p>Loading…</p>}
      {projects?.length === 0 && <p className="text-slate-500">No projects yet. Create one to get started.</p>}
      <div className="grid gap-3">
        {projects?.map(p => (
          <Link key={p.id} to={`/p/${p.id}`} className="bg-white border rounded p-3 hover:border-indigo-400 flex justify-between">
            <span className="font-semibold">{p.name}</span><span className="text-sm text-slate-500">{p.status}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
