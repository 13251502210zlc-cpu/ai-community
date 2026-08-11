import { useApp } from '../store/AppStore'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

export default function ToastContainer() {
  const { toasts, removeToast } = useApp()
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center">
      {toasts.map((t) => {
        const Icon = t.type === 'success' ? CheckCircle : t.type === 'error' ? XCircle : Info
        const color = t.type === 'success' ? 'var(--state-success)' : t.type === 'error' ? 'var(--state-danger)' : 'var(--aic-primary)'
        return (
          <div
            key={t.id}
            className="animate-toast-in flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 shadow-lg border"
            style={{ borderColor: 'var(--aic-border-solid)', minWidth: '280px', maxWidth: '420px' }}
          >
            <Icon size={18} style={{ color }} />
            <span className="text-sm flex-1" style={{ color: 'var(--aic-foreground)' }}>{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
