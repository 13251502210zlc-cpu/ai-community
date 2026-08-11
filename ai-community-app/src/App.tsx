import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { type ReactNode } from 'react'
import { AppProvider, useApp } from './store/AppStore'
import Layout from './components/Layout'
import ToastContainer from './components/Toast'
import Login from './pages/Login'
import Gallery from './pages/Gallery'
import Publish from './pages/Publish'
import Detail from './pages/Detail'
import Profile from './pages/Profile'
import Admin from './pages/Admin'

// v1.4：路由保护组件——未登录时重定向到登录页
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useApp()
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated } = useApp()

  return (
    <Routes>
      {/* 登录页：已登录时重定向到首页 */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      {/* 受保护路由 */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Gallery />} />
                <Route path="/publish" element={<Publish />} />
                <Route path="/works/:id" element={<Detail />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="*" element={<Gallery />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
        <ToastContainer />
      </BrowserRouter>
    </AppProvider>
  )
}
