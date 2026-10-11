import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Landing from './pages/Landing'
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
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      <Navbar />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/dashboard"
            element={
              <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
                <Dashboard />
              </main>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
                <Dashboard initialTab="leaderboard" />
              </main>
            }
          />
          <Route
            path="/my-projects"
            element={
              <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
                <Dashboard initialTab="projects" />
              </main>
            }
          />
          <Route
            path="/new"
            element={
              <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
                <Wizard />
              </main>
            }
          />
          <Route
            path="/p/:pid"
            element={
              <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
                <ProjectLayout />
              </main>
            }
          >
            <Route index element={<Analysis />} />
            <Route path="graph" element={<Graph />} />
            <Route path="run" element={<Run />} />
            <Route path="verify" element={<Verify />} />
            <Route path="compare" element={<Compare />} />
            <Route path="report" element={<Report />} />
          </Route>
        </Routes>
      </div>
    </div>
  )
}
