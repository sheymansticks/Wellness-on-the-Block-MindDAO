import React from 'react'

const ProvidersPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Find Providers</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Filters</h3>
            </div>
            <div className="card-content">
              <p className="text-gray-600">Filter options will be here</p>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Dr. Sarah Johnson</h3>
              </div>
              <div className="card-content">
                <p className="text-gray-600">Clinical Psychologist</p>
                <p className="text-sm text-gray-500">Specializing in anxiety and depression</p>
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">John Smith</h3>
              </div>
              <div className="card-content">
                <p className="text-gray-600">Peer Counselor</p>
                <p className="text-sm text-gray-500">Trained in active listening and support</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProvidersPage
