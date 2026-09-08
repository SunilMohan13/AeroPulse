import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Map,
  AlertTriangle,
  TrendingUp,
  Users,
  FileSearch,
  Database,
  Bot,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useApp } from '../../context/AppContext'
import { HERO_EVENT_ID } from '../../data/mockEvents'

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/map', label: 'Live Map', icon: Map },
  { to: `/events/${HERO_EVENT_ID}`, label: 'Events', icon: AlertTriangle },
  { to: '/forecast', label: 'Forecast', icon: TrendingUp },
  { to: '/risk', label: 'Risk', icon: Users },
  { to: '/evidence', label: 'Evidence', icon: FileSearch },
  { to: '/sources', label: 'Sources', icon: Database },
  { to: '/copilot', label: 'Copilot', icon: Bot },
  { to: '/citizen', label: 'Citizen', icon: MessageSquare },
]

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useApp()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-intel',
      isActive
        ? 'bg-intel/10 text-intel'
        : 'text-text-secondary hover:bg-bg-panel hover:text-text-primary',
    )

  const nav = (showLabels: boolean) => (
    <nav className="flex-1 space-y-0.5 p-2" aria-label="Primary">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMobileNavOpen(false)}
          className={linkClass}
          title={showLabels ? undefined : label}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {showLabels ? <span>{label}</span> : <span className="sr-only">{label}</span>}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-border bg-bg-elevated/95 transition-all duration-200 md:flex',
          sidebarCollapsed ? 'w-16' : 'w-52',
        )}
      >
        {nav(!sidebarCollapsed)}
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-bg-panel hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-intel"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden />
            )}
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
          <NavLink to="/sources" className={linkClass}>
            <Settings className="h-4 w-4" aria-hidden />
            {!sidebarCollapsed && <span>Settings</span>}
          </NavLink>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="flex h-full w-60 flex-col border-r border-border bg-bg-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-semibold">Navigation</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav(true)}
          </div>
        </div>
      )}
    </>
  )
}
