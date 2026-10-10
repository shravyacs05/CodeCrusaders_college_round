import { Link, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Wizard from './pages/Wizard'
import ProjectLayout from './pages/ProjectLayout'
import Analysis from './pages/Analysis'
import Graph from './pages/Graph'
import Run from './pages/Run'
import Verify from './pages/Verify'
import Compare from './pages/Compare'
import Report from './pages/Report'

export default function App() {
  return (
    <div className="min-h-screen text-slate-800">
      <header className="bg-slate-900 text-white px-6 py-3 flex items-center gap-4">
        <Link to="/" className="font-bold text-lg">CrisisGrid</Link>
        <span className="text-slate-400 text-sm">AI interprets · code measures</span>
      </header>
      <main className="p-6 max-w-7xl mx-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<Wizard />} />
          <Route path="/p/:pid" element={<ProjectLayout />}>
            <Route index element={<Analysis />} />
            <Route path="graph" element={<Graph />} />
            <Route path="run" element={<Run />} />
            <Route path="verify" element={<Verify />} />
            <Route path="compare" element={<Compare />} />
            <Route path="report" element={<Report />} />
          </Route>
        </Routes>
      </main>
    </div>
  )
}
