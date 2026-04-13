import React from 'react'

const SessionsPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">My Sessions</h1>
      <div className="space-y-6">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Upcoming Sessions</h3>
          </div>
          <div className="card-content">
            <p className="text-gray-600">No upcoming sessions scheduled</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Past Sessions</h3>
          </div>
          <div className="card-content">
            <p className="text-gray-600">Your session history will appear here</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SessionsPage
