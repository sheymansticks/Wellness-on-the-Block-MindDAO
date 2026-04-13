import React from 'react'

const AuthPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to Wellness on the Block
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Connect your wallet to get started
          </p>
        </div>
        <div className="card">
          <div className="card-content space-y-4">
            <button className="btn btn-primary w-full">
              Connect with Stellar Wallet
            </button>
            <button className="btn btn-outline w-full">
              Connect with MetaMask
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthPage
