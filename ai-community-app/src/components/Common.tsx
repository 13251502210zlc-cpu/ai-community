import { SearchX } from 'lucide-react'

export function EmptyState({ message = '未找到相关作品，试试调整筛选条件' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <SearchX size={48} className="mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function Pagination({
  current,
  total,
  onChange,
}: {
  current: number
  total: number
  onChange: (page: number) => void
}) {
  if (total <= 1) return null
  const pages = Array.from({ length: total }, (_, i) => i + 1)
  return (
    <div className="flex justify-center gap-2 mt-8">
      <button
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current === 1}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ borderColor: 'var(--aic-border-solid)' }}
      >
        ‹
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition ${
            p === current ? 'text-white' : 'border text-muted-foreground hover:bg-muted'
          }`}
          style={
            p === current
              ? { background: 'linear-gradient(135deg, var(--aic-primary), var(--aic-gradient-violet))' }
              : { borderColor: 'var(--aic-border-solid)' }
          }
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onChange(Math.min(total, current + 1))}
        disabled={current === total}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ borderColor: 'var(--aic-border-solid)' }}
      >
        ›
      </button>
    </div>
  )
}
