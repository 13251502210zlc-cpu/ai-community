import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { Menu, X, Shield, LogOut } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar } from './Tags'
import { ROLE_CONFIG } from '../types'
import type { UserRole } from '../types'

// 全部导航项定义（v1.3：按角色动态过滤）
const ALL_NAV_ITEMS = [
  { to: '/', label: '作品大厅', roles: ['user', 'creator', 'reviewer', 'operator', 'super_admin'] as UserRole[] },
  { to: '/profile', label: '个人中心', roles: ['user', 'creator', 'reviewer', 'operator', 'super_admin'] as UserRole[] },
  { to: '/admin', label: '后台管理', roles: ['reviewer', 'operator', 'super_admin'] as UserRole[] },
]

export default function Header() {
  const { currentUser, logout, addToast } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    addToast('info', '已退出登录')
    navigate('/login')
  }

  // v1.7：根据多角色过滤可见导航项（任一角色匹配即可见）
  const navItems = useMemo(
    () => ALL_NAV_ITEMS.filter((item) => item.roles.some((r) => currentUser.roles.includes(r))),
    [currentUser.roles]
  )

  // v1.7：主角色配置（roles[0]）用于徽章展示
  const mainRole = currentUser.roles[0] || 'user'
  const roleCfg = ROLE_CONFIG[mainRole]

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        backgroundColor: 'rgba(247, 248, 252, 0.85)',
        borderColor: 'var(--aic-border)',
      }}
    >
      <div className="mx-auto flex h-16 max-w-[var(--max-content)] items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 text-lg font-bold" style={{ color: 'var(--aic-primary)', fontFamily: 'var(--font-display)' }}>
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-white"
            style={{ background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }}
          >
            AI
          </span>
          <span className="hidden sm:inline">社区平台</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
              style={({ isActive }) =>
                isActive ? { backgroundColor: 'var(--aic-primary-light)', color: 'var(--aic-primary)' } : {}
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Right: Role switch + Avatar */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden lg:flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs" style={{ borderColor: 'var(--aic-border-solid)' }}>
            <Shield size={12} style={{ color: 'var(--aic-muted-foreground)' }} />
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: roleCfg.badgeBg, color: 'var(--aic-foreground)' }}>
              {roleCfg.badge}
            </span>
            <span className="text-muted-foreground">{currentUser.roles.map((role) => ROLE_CONFIG[role].label).join('、')}</span>
          </div>
          <Avatar name={currentUser.name} color={currentUser.avatarColor} size={32} />
          <button
            onClick={handleLogout}
            title="退出登录"
            className="hidden md:inline-flex items-center justify-center p-2 rounded-md hover:bg-muted transition"
            style={{ color: 'var(--aic-muted-foreground)' }}
          >
            <LogOut size={16} />
          </button>
          <button
            className="md:hidden p-2 rounded-md hover:bg-muted"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav className="md:hidden border-t animate-fade-in" style={{ borderColor: 'var(--aic-border-solid)' }}>
          {navItems.map((item) => {
            const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 text-sm font-medium border-b"
                style={{
                  borderColor: 'var(--aic-border-solid)',
                  backgroundColor: isActive ? 'var(--aic-primary-light)' : 'transparent',
                  color: isActive ? 'var(--aic-primary)' : 'var(--aic-foreground)',
                }}
              >
                {item.label}
              </Link>
            )
          })}
          <div className="px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Shield size={12} />
            <span>当前角色：</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: roleCfg.badgeBg, color: 'var(--aic-foreground)' }}>
              {roleCfg.label}
            </span>
            <span className="ml-auto">{currentUser.roles.map((role) => ROLE_CONFIG[role].label).join('、')}</span>
          </div>
          <button
            onClick={() => { setMobileOpen(false); handleLogout() }}
            className="block w-full text-left px-4 py-3 text-sm font-medium border-b flex items-center gap-2"
            style={{ borderColor: 'var(--aic-border-solid)', color: 'var(--aic-muted-foreground)' }}
          >
            <LogOut size={14} /> 退出登录
          </button>
        </nav>
      )}
    </header>
  )
}
