import React from 'react'

const ProfilePage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Profile</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Profile Information</h3>
            </div>
            <div className="card-content">
              <p className="text-gray-600">Profile settings will be here</p>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Privacy Settings</h3>
            </div>
            <div className="card-content">
              <p className="text-gray-600">Privacy and ZK-proof settings will be here</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage
