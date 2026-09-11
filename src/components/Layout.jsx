import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'

function Layout({ children }) {
  const location = useLocation()
  // Approvals keeps a mobile-first phone layout on small screens, but on desktop
  // it expands to a full-width workspace while still using the main sidebar.
  const isImmersive = location.pathname.startsWith('/approvals')
  const isEmployee = ['/bang-cong', '/cham-cong-online'].includes(location.pathname)

  return (
    <div>
      <Header />
      <div className={`container${isImmersive ? ' container--immersive container--approvals' : ''}${isEmployee ? ' container--employee' : ''}`}>
        <Sidebar />
        <main className="main">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
