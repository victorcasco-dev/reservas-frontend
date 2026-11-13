import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  /** Página actual (base 0, como la API). */
  page: number
  totalPages: number
  totalElements?: number
  loading?: boolean
  onChange: (page: number) => void
}

const navButton =
  'inline-flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink shadow-sm transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'

/** Controles de paginación de servidor: Anterior / Siguiente + resumen. */
export function Pagination({ page, totalPages, totalElements, loading, onChange }: PaginationProps) {
  const pages = Math.max(totalPages, 1)
  return (
    <nav
      className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-4 py-3 text-sm text-muted"
      aria-label="Paginación"
    >
      <span>
        Página <strong className="text-ink">{page + 1}</strong> de {pages}
        {typeof totalElements === 'number' && (
          <span className="ml-2 text-xs">({totalElements} resultados)</span>
        )}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className={navButton}
          disabled={loading || page === 0}
          onClick={() => onChange(Math.max(0, page - 1))}
        >
          <ChevronLeft size={16} aria-hidden />
          Anterior
        </button>
        <button
          type="button"
          className={navButton}
          disabled={loading || page + 1 >= pages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </nav>
  )
}
