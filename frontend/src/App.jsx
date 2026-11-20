import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import DashboardLayout from './components/layout/DashboardLayout'
import { ToastProvider } from './components/ui/toast/ToastProvider'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import FamilyPage from './features/family/FamilyPage'
import KidProfilePage from './features/family/KidProfilePage'
import PointsPage from './features/points/PointsPage'
import ProfilePage from './features/profile/ProfilePage'
import TasksPage from './features/tasks/TasksPage'
import DashboardPage from './pages/DashboardPage'
import HomePage from './pages/HomePage'
import MorePage from './pages/MorePage'
import { RedirectIfAuthenticated, RequireAuth, RequireRole } from './routes/guards'

/** Every page in the app. Pages under <RequireAuth> need a session and share the app layout. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated>} />
      <Route path="/register" element={<RedirectIfAuthenticated><RegisterPage /></RedirectIfAuthenticated>} />
      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="family" element={<FamilyPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route element={<RequireRole roles={['parent']} />}>
            <Route path="family/kids/:kidId" element={<KidProfilePage />} />
          </Route>
          <Route element={<RequireRole roles={['child']} />}>
            <Route path="points" element={<PointsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
