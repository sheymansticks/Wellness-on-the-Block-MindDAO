import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { RootState } from './store'
import Layout from './components/common/Layout'
import HomePage from './pages/HomePage'
import DashboardPage from './pages/DashboardPage'
import ProvidersPage from './pages/ProvidersPage'
import SessionsPage from './pages/SessionsPage'
import ProfilePage from './pages/ProfilePage'
import AuthPage from './pages/AuthPage'
import LoadingSpinner from './components/common/LoadingSpinner'

function App() {
  const { isAuthenticated, isLoading } = useSelector((state: RootState) => state.auth)

  if (isLoading) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          {isAuthenticated && (
            <>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="providers" element={<ProvidersPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </>
          )}
        </Route>
      </Routes>
    </div>
  )
}

export default App
