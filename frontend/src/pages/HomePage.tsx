import React from 'react'

const HomePage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Wellness on the Block
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Decentralized mental health support with privacy and security
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Privacy First</h3>
            </div>
            <div className="card-content">
              <p className="text-gray-600">
                Zero-knowledge proofs ensure your identity and sessions remain completely private.
              </p>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Instant Payments</h3>
            </div>
            <div className="card-content">
              <p className="text-gray-600">
                Secure crypto payments through the Stellar network with instant settlement.
              </p>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Verified Providers</h3>
            </div>
            <div className="card-content">
              <p className="text-gray-600">
                Connect with certified therapists and trained peer counselors.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomePage
