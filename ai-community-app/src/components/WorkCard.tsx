import { Link } from 'react-router-dom'
import { ThumbsUp, Star, Download } from 'lucide-react'
import type { Work } from '../types'
import { TYPE_CONFIG } from '../types'
import { TypeTag } from './Tags'
import { assetUrl } from '../lib/api'

export default function WorkCard({ work, trackView = false }: { work: Work; trackView?: boolean }) {
  const cfg = TYPE_CONFIG[work.type]
  return (
    <Link
      to={`/works/${work.id}`}
      state={trackView ? { trackView: true } : undefined}
      className="group block overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-lg hover:-translate-y-0.5"
      style={{ borderColor: 'var(--aic-border-solid)' }}
    >
      {work.coverUrl ? (
        <img
          src={assetUrl(work.coverUrl)}
          alt={work.title}
          className="block h-32 w-full bg-muted object-cover object-center transition group-hover:scale-[1.02]"
        />
      ) : (
        <div
          className={`flex h-32 items-center justify-center text-4xl font-bold text-white ${cfg.coverClass}`}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {cfg.label.charAt(0)}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <TypeTag type={work.type} size="sm" />
          {work.recommended && (
            <span className="text-xs font-medium" style={{ color: 'var(--state-warning)' }}>★ 推荐</span>
          )}
        </div>
        <h3 className="mt-2 text-base font-semibold text-foreground line-clamp-1">{work.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{work.authorName} · {work.department}</p>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ThumbsUp size={13} /> {work.likes}
          </span>
          <span className="flex items-center gap-1">
            <Star size={13} /> {work.favorites}
          </span>
          <span className="flex items-center gap-1">
            <Download size={13} /> {work.downloads}
          </span>
        </div>
      </div>
    </Link>
  )
}
