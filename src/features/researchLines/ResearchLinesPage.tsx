import { newLocalId } from '../../shared/id'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CatalogDto, ExperienceLevel, ProfessorResearchLineDto, UserDto } from '../../types/api'
import { parseApiError } from '../../shared/api/client'
import { listProfessors } from '../../shared/api/professors'
import {
  addProfessorResearchLine,
  listActiveResearchLines,
  listProfessorResearchLines,
  removeProfessorResearchLine,
  updateProfessorResearchLine,
} from '../../shared/api/researchLines'
import { SearchInput } from '../../shared/ui/SearchInput'
import { useAuth } from '../auth/AuthContext'

const LEVELS: { value: ExperienceLevel; label: string; pill: string }[] = [
  { value: 'BASIC', label: 'Básico', pill: 'bg-gray-100 text-gray-700' },
  { value: 'INTERMEDIATE', label: 'Intermedio', pill: 'bg-sky-50 text-sky-800' },
  { value: 'EXPERT', label: 'Experto', pill: 'bg-emerald-50 text-emerald-800' },
]

function levelInfo(level: ExperienceLevel) {
  return LEVELS.find((l) => l.value === level) ?? LEVELS[0]
}

/** Fila del formulario: una línea de investigación del profesor con su nivel. */
interface DetailRow {
  rowId: string
  /** Id de la fila en professor_research_line; vacío si todavía no se guardó. */
  detailId?: string
  researchLineId: string
  experienceLevel: ExperienceLevel
}

function newRow(): DetailRow {
  return { rowId: newLocalId(), researchLineId: '', experienceLevel: 'BASIC' }
}

function toRows(details: ProfessorResearchLineDto[]): DetailRow[] {
  return details.map((d) => ({
    rowId: newLocalId(),
    detailId: d.id,
    researchLineId: d.researchLine.id,
    experienceLevel: d.experienceLevel,
  }))
}

export function ResearchLinesPage() {
  const { user, isAdministrator, canManageAvailability } = useAuth()
  const [professors, setProfessors] = useState<UserDto[]>([])
  const [catalog, setCatalog] = useState<CatalogDto[]>([])
  const [associations, setAssociations] = useState<ProfessorResearchLineDto[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [rows, setRows] = useState<DetailRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  /** El administrador edita cualquier profesor; el profesor, solo su propio perfil. */
  const canEdit = (professorId: string) =>
    isAdministrator || (canManageAvailability && professorId === user?.userId)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [profPage, lines, assoc] = await Promise.all([
        listProfessors(),
        listActiveResearchLines(),
        listProfessorResearchLines({ size: 200 }),
      ])
      const list = profPage.content ?? []
      setProfessors(list)
      setCatalog(lines)
      setAssociations(assoc)
      setSelectedId((current) => {
        if (current) return current
        const own = list.find((p) => p.id === user?.userId)
        return own?.id ?? list[0]?.id ?? ''
      })
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setLoading(false)
    }
  }, [user?.userId])

  useEffect(() => {
    void load()
  }, [load])

  const byProfessor = useMemo(() => {
    const map = new Map<string, ProfessorResearchLineDto[]>()
    for (const a of associations) {
      const list = map.get(a.professorId) ?? []
      list.push(a)
      map.set(a.professorId, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.researchLine.name.localeCompare(b.researchLine.name))
    }
    return map
  }, [associations])

  // Al elegir otro profesor (o recargar), el formulario muestra sus filas guardadas.
  useEffect(() => {
    setRows(toRows(byProfessor.get(selectedId) ?? []))
  }, [selectedId, byProfessor])

  const visibleProfessors = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return professors
    return professors.filter((p) => {
      const lines = (byProfessor.get(p.id) ?? []).map((a) => a.researchLine.name).join(' ')
      return `${p.firstName} ${p.lastName} ${lines}`.toLowerCase().includes(q)
    })
  }, [professors, byProfessor, query])

  const selected = professors.find((p) => p.id === selectedId)
  const editable = selected ? canEdit(selected.id) : false
  const original = byProfessor.get(selectedId) ?? []

  function updateRow(rowId: string, patch: Partial<DetailRow>) {
    setRows((r) => r.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)))
  }

  /** Cambios pendientes respecto de lo guardado: altas, cambios de nivel y bajas. */
  const pending = useMemo(() => {
    const kept = new Set(rows.filter((r) => r.detailId).map((r) => r.detailId))
    const toDelete = original.filter((d) => !kept.has(d.id))
    const toUpdate = rows.filter((r) => {
      const before = original.find((d) => d.id === r.detailId)
      return before && before.experienceLevel !== r.experienceLevel
    })
    const toCreate = rows.filter((r) => !r.detailId)
    return { toDelete, toUpdate, toCreate }
  }, [rows, original])
  const pendingCount = pending.toDelete.length + pending.toUpdate.length + pending.toCreate.length

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    if (rows.some((r) => !r.researchLineId)) {
      toast.error('Elegí una línea de investigación en cada fila.')
      return
    }
    const ids = rows.map((r) => r.researchLineId)
    if (new Set(ids).size !== ids.length) {
      toast.error('Hay una línea de investigación repetida.')
      return
    }
    setSaving(true)
    try {
      // Primero las bajas, así una línea quitada y vuelta a agregar no choca con la restricción única.
      for (const d of pending.toDelete) await removeProfessorResearchLine(selected.id, d.id)
      for (const r of pending.toUpdate) await updateProfessorResearchLine(r.detailId!, r.experienceLevel)
      for (const r of pending.toCreate) {
        await addProfessorResearchLine(selected.id, {
          researchLineId: r.researchLineId,
          experienceLevel: r.experienceLevel,
        })
      }
      const parts = [
        pending.toCreate.length && `${pending.toCreate.length} agregada${pending.toCreate.length === 1 ? '' : 's'}`,
        pending.toUpdate.length && `${pending.toUpdate.length} actualizada${pending.toUpdate.length === 1 ? '' : 's'}`,
        pending.toDelete.length && `${pending.toDelete.length} quitada${pending.toDelete.length === 1 ? '' : 's'}`,
      ].filter(Boolean)
      toast.success(`Líneas de ${selected.firstName} guardadas: ${parts.join(', ')}`)
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setSaving(false)
      // Se recarga siempre: si algo falló a mitad de camino, el formulario muestra lo que quedó guardado.
      setAssociations(await listProfessorResearchLines({ size: 200 }).catch(() => associations))
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Líneas de investigación</h1>
          <p className="page-lead">
            Cada profesor trabaja en varias líneas de investigación y cada línea tiene varios profesores (relación
            muchos a muchos). La tabla intermedia guarda además el nivel de experiencia.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          <RefreshCw size={16} aria-hidden />
          Actualizar
        </button>
      </header>

      <div className={`master-detail${canManageAvailability ? '' : ' master-detail--single'}`}>
        <section
          className="panel flex min-h-[420px] flex-col lg:h-[calc(100vh-11rem)]"
          aria-label="Profesores y sus líneas"
        >
          <div className="border-b border-line bg-white/65 p-3">
            <SearchInput
              value={query}
              placeholder="Buscar por profesor o línea…"
              label="Buscar profesores"
              onChange={setQuery}
            />
          </div>
          <ul className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto bg-[#f6f2ea] p-3">
            {loading && <li className="entity-list-empty">Cargando…</li>}
            {!loading && visibleProfessors.length === 0 && (
              <li className="entity-list-empty">No hay profesores con esa búsqueda.</li>
            )}
            {!loading &&
              visibleProfessors.map((p) => {
                const lines = byProfessor.get(p.id) ?? []
                const active = p.id === selectedId
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      aria-pressed={active}
                      className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition ${
                        active ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-accent/50'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-ink">
                          {p.firstName} {p.lastName}
                          {p.id === user?.userId && <span className="ml-2 text-xs font-normal text-muted">(vos)</span>}
                        </p>
                        <span className="shrink-0 text-xs text-muted">
                          {lines.length} {lines.length === 1 ? 'línea' : 'líneas'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {lines.length === 0 && <span className="text-xs text-muted">Sin líneas asignadas</span>}
                        {lines.map((a) => {
                          const info = levelInfo(a.experienceLevel)
                          return (
                            <span
                              key={a.id}
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${info.pill}`}
                              title={`Nivel: ${info.label}`}
                            >
                              {a.researchLine.name} · {info.label}
                            </span>
                          )
                        })}
                      </div>
                    </button>
                  </li>
                )
              })}
          </ul>
        </section>

        {canManageAvailability && (
          <section className="panel panel-form" aria-label="Asignar líneas de investigación">
            <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
              <div className="form-section">
                <h2>Profesor</h2>
                <label className="field">
                  <span>Profesor</span>
                  <select
                    value={selectedId}
                    disabled={!isAdministrator}
                    onChange={(e) => setSelectedId(e.target.value)}
                  >
                    {professors.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                {selected && !editable && (
                  <p className="text-sm text-muted">Solo podés editar tus propias líneas de investigación.</p>
                )}
              </div>

              <div className="form-section">
                <div className="section-head">
                  <h2>Líneas y nivel de experiencia</h2>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!editable || rows.length >= catalog.length}
                    onClick={() => setRows((r) => [...r, newRow()])}
                  >
                    <Plus size={16} aria-hidden />
                    Agregar fila
                  </button>
                </div>
                <div className="detail-table-wrap">
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th>Línea de investigación</th>
                        <th>Nivel</th>
                        <th aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={3} className="text-sm text-muted">
                            Sin líneas. Usá “Agregar fila”.
                          </td>
                        </tr>
                      )}
                      {rows.map((row) => {
                        const usedElsewhere = new Set(
                          rows.filter((r) => r.rowId !== row.rowId).map((r) => r.researchLineId),
                        )
                        return (
                          <tr key={row.rowId}>
                            <td>
                              {/* Una fila ya guardada no cambia de línea: se quita y se agrega otra. */}
                              <select
                                required
                                disabled={!editable || Boolean(row.detailId)}
                                value={row.researchLineId}
                                onChange={(e) => updateRow(row.rowId, { researchLineId: e.target.value })}
                              >
                                <option value="" disabled>
                                  Seleccionar…
                                </option>
                                {catalog.map((c) => (
                                  <option key={c.id} value={c.id} disabled={usedElsewhere.has(c.id)}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                disabled={!editable}
                                value={row.experienceLevel}
                                onChange={(e) =>
                                  updateRow(row.rowId, { experienceLevel: e.target.value as ExperienceLevel })
                                }
                              >
                                {LEVELS.map((l) => (
                                  <option key={l.value} value={l.value}>
                                    {l.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                aria-label="Quitar fila"
                                disabled={!editable}
                                onClick={() => setRows((r) => r.filter((x) => x.rowId !== row.rowId))}
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="form-actions">
                {pendingCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => setRows(toRows(original))}
                  >
                    Descartar cambios
                  </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={!editable || saving || pendingCount === 0}>
                  {saving ? 'Guardando…' : pendingCount > 0 ? `Guardar (${pendingCount} ${pendingCount === 1 ? 'cambio' : 'cambios'})` : 'Sin cambios'}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
