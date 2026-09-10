import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { RunsView } from './views/RunsView'
import { RunDetailView } from './views/RunDetailView'
import { NewRunView } from './views/NewRunView'
import { TargetsView } from './views/TargetsView'
import { TargetDetailView } from './views/TargetDetailView'
import { WorkloadsView } from './views/WorkloadsView'

export function App() {
  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <strong>Simlab</strong>
          <span>autoscaling</span>
        </div>
        <NavLink to="/runs" className={navClass}>Runs</NavLink>
        <NavLink to="/runs/new" className={navClass} end>New run</NavLink>
        <NavLink to="/workloads" className={navClass}>Workloads</NavLink>
        <NavLink to="/targets" className={navClass}>Targets</NavLink>
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/runs" replace />} />
          <Route path="/runs" element={<RunsView />} />
          <Route path="/runs/new" element={<NewRunView />} />
          <Route path="/runs/:id" element={<RunDetailView />} />
          <Route path="/workloads" element={<WorkloadsView />} />
          <Route path="/targets" element={<TargetsView />} />
          <Route path="/targets/:id" element={<TargetDetailView />} />
          <Route path="*" element={<Navigate to="/runs" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'nav-link active' : 'nav-link'
}
