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
            className="animate-toast-in flex w-[calc(100vw-2rem)] items-start gap-2 rounded-lg bg-white px-4 py-2.5 shadow-lg border sm:w-auto"
            style={{ borderColor: 'var(--aic-border-solid)', minWidth: '280px', maxWidth: '420px' }}
          >
            <Icon size={18} className="mt-0.5 shrink-0" style={{ color }} />
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm" style={{ color: 'var(--aic-foreground)' }}>{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
