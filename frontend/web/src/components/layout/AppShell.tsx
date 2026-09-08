import { Outlet } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { FooterStatus } from './FooterStatus'
import { CommandPalette } from './CommandPalette'
import { NotificationDrawer } from './NotificationDrawer'
import { DemoOverlay } from './DemoOverlay'

export function AppShell() {
  const location = useLocation()

  return (
    <div className="flex h-full flex-col overflow-x-hidden">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex min-h-0 flex-1 flex-col overflow-auto"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
          <DemoOverlay />
        </main>
      </div>
      <FooterStatus />
      <CommandPalette />
      <NotificationDrawer />
    </div>
  )
}
