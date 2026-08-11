import { type ReactNode } from 'react'
import Header from './Header'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-[var(--max-content)] mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-16">
        {children}
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground" style={{ borderColor: 'var(--aic-border)' }}>
        AI 社区平台 · 企业内部 AI 作品展示与交流社区
      </footer>
    </div>
  )
}
