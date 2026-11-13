import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  /** Espera antes de disparar la búsqueda (ms). */
  debounceMs?: number
}

/** Barra de búsqueda con debounce: la búsqueda real la hace el backend a través del API Gateway. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
  label = 'Buscar',
  debounceMs = 350,
}: SearchInputProps) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (draft.trim() === value) return
    const timer = window.setTimeout(() => onChange(draft.trim()), debounceMs)
    return () => window.clearTimeout(timer)
  }, [draft, value, onChange, debounceMs])

  return (
    <label className="relative flex min-w-48 flex-1 items-center">
      <span className="sr-only">{label}</span>
      <Search size={16} className="pointer-events-none absolute left-3 text-muted" aria-hidden />
      <input
        type="search"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        className="w-full rounded-lg border border-line bg-white py-2 pr-8 pl-9 text-sm text-ink shadow-sm outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent-soft"
      />
      {draft && (
        <button
          type="button"
          className="absolute right-2 rounded p-1 text-muted hover:text-ink"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            setDraft('')
            onChange('')
          }}
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </label>
  )
}
