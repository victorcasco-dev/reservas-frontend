import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CatalogDto } from '../../types/api'
import { parseApiError } from '../../shared/api/client'
import {
  createConsultationType,
  deactivateConsultationType,
  searchConsultationTypes,
  updateConsultationType,
} from '../../shared/api/consultationTypes'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Pagination } from '../../shared/ui/Pagination'
import { SearchInput } from '../../shared/ui/SearchInput'

const PAGE_SIZE = 10

interface FormState {
  name: string
  description: string
  active: boolean
}

const emptyForm = (): FormState => ({ name: '', description: '', active: true })

/** Catálogo de tipos de consulta (detalle de las reservas). Solo administradores. */
export function ConsultationTypesPage() {
  const [items, setItems] = useState<CatalogDto[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState<number | undefined>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<CatalogDto | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await searchConsultationTypes({
        name: query || undefined,
        active: status === 'all' ? undefined : status === 'active',
        page,
        size: PAGE_SIZE,
      })
      setItems(result.content ?? [])
      setTotalPages(result.page?.totalPages ?? 0)
      setTotalElements(result.page?.totalElements)
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setLoading(false)
    }
  }, [page, query, status])

  useEffect(() => {
    void load()
  }, [load])

  function startCreate() {
    setSelected(null)
    setForm(emptyForm())
  }

  function select(item: CatalogDto) {
    setSelected(item)
    setForm({ name: item.name, description: item.description ?? '', active: item.active })
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      active: form.active,
    }
    try {
      if (selected) {
        const updated = await updateConsultationType(selected.id, body)
        toast.success('Tipo de consulta actualizado')
        select(updated)
      } else {
        await createConsultationType(body)
        toast.success('Tipo de consulta creado')
        startCreate()
      }
      await load()
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setSaving(false)
    }
  }

  async function onDeactivate() {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await deactivateConsultationType(selected.id)
      toast.success('Tipo de consulta desactivado')
      setConfirmOpen(false)
      select(updated)
      await load()
    } catch (error) {
      toast.error(parseApiError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Tipos de consulta</h1>
          <p className="page-lead">
            Catálogo que usan las reservas como detalle. Los tipos inactivos dejan de ofrecerse al
            reservar.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          <RefreshCw size={16} aria-hidden />
          Actualizar
        </button>
      </header>

      <div className="master-detail">
        <section className="panel panel-list" aria-label="Listado de tipos de consulta">
          <div className="panel-toolbar flex-wrap">
            <SearchInput
              value={query}
              placeholder="Buscar por nombre…"
              label="Buscar tipos de consulta"
              onChange={(value) => {
                setQuery(value)
                setPage(0)
              }}
            />
            <select
              aria-label="Filtrar por estado"
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status)
                setPage(0)
              }}
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
              <Plus size={16} aria-hidden />
              Nuevo
            </button>
          </div>
          <ul className="entity-list">
            {loading && <li className="entity-list-empty">Cargando…</li>}
            {!loading && items.length === 0 && (
              <li className="entity-list-empty">No hay tipos de consulta con estos filtros.</li>
            )}
            {!loading &&
              items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`entity-row ${selected?.id === item.id ? 'selected' : ''}`}
                    onClick={() => select(item)}
                  >
                    <span className="entity-row-title">{item.name}</span>
                    <span className="entity-row-meta">{item.description || 'Sin descripción'}</span>
                    <span
                      className={`badge ${item.active ? 'badge-status-available' : 'badge-status-cancelled'}`}
                    >
                      {item.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalElements={totalElements}
            loading={loading}
            onChange={setPage}
          />
        </section>

        <section className="panel panel-form" aria-label="Formulario de tipo de consulta">
          <form className="stack-form" onSubmit={(event) => void onSubmit(event)}>
            <div className="form-section">
              <div className="section-head">
                <h2>{selected ? 'Editar tipo de consulta' : 'Nuevo tipo de consulta'}</h2>
                {selected?.active && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={saving}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 size={15} aria-hidden />
                    Desactivar
                  </button>
                )}
              </div>
              <div className="field-grid">
                <label className="field field-span-2">
                  <span>Nombre</span>
                  <input
                    required
                    maxLength={150}
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </label>
                <label className="field field-span-2">
                  <span>Descripción</span>
                  <textarea
                    rows={4}
                    maxLength={500}
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={form.active}
                    onChange={(event) => setForm({ ...form, active: event.target.checked })}
                  />
                  Activo
                </label>
              </div>
            </div>
            <div className="form-actions">
              {selected && (
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={startCreate}>
                  Cancelar edición
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : selected ? 'Guardar cambios' : 'Crear tipo'}
              </button>
            </div>
          </form>
        </section>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="¿Desactivar este tipo de consulta?"
        description={selected ? `"${selected.name}" dejará de ofrecerse en nuevas reservas.` : ''}
        confirmLabel="Sí, desactivar"
        cancelLabel="Volver"
        confirming={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void onDeactivate()}
      />
    </div>
  )
}
