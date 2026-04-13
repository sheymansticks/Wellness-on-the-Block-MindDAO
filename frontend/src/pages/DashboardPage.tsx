import React from 'react'

const DashboardPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Upcoming Sessions</h3>
          </div>
          <div className="card-content">
            <p className="text-2xl font-bold text-primary-600">3</p>
            <p className="text-sm text-gray-600">This week</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Completed Sessions</h3>
          </div>
          <div className="card-content">
            <p className="text-2xl font-bold text-success-600">12</p>
            <p className="text-sm text-gray-600">Total</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Wallet Balance</h3>
          </div>
          <div className="card-content">
            <p className="text-2xl font-bold text-secondary-600">250 XLM</p>
            <p className="text-sm text-gray-600">Available</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Privacy Score</h3>
          </div>
          <div className="card-content">
            <p className="text-2xl font-bold text-warning-600">95%</p>
            <p className="text-sm text-gray-600">Protected</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
