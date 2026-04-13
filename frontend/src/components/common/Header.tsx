import React from 'react'
import { Link } from 'react-router-dom'

const Header: React.FC = () => {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold text-primary-600">
            Wellness on the Block
          </Link>
          <nav className="flex space-x-6">
            <Link to="/dashboard" className="text-gray-600 hover:text-primary-600">
              Dashboard
            </Link>
            <Link to="/providers" className="text-gray-600 hover:text-primary-600">
              Providers
            </Link>
            <Link to="/sessions" className="text-gray-600 hover:text-primary-600">
              Sessions
            </Link>
            <Link to="/profile" className="text-gray-600 hover:text-primary-600">
              Profile
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}

export default Header
