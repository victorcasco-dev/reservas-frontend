import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Info, Plus, RefreshCw, UserX } from 'lucide-react'
import { toast } from 'sonner'
import type { Role, UserDto, UserType } from '../../types/api'
import { parseApiError } from '../../shared/api/client'
import { createUser, deleteUser, getUserRoles, listUsers, updateUser } from '../../shared/api/users'
import { listProfessors } from '../../shared/api/professors'
import { roleLabel } from '../../shared/roleLabels'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Pagination } from '../../shared/ui/Pagination'
import { SearchInput } from '../../shared/ui/SearchInput'

const PAGE_SIZE = 10
const USER_TYPES: UserType[] = ['STUDENT', 'PROFESSOR', 'ADMINISTRATOR']
const ALL_ROLES: Role[] = ['STUDENT', 'PROFESSOR', 'ADMINISTRATOR']

const TYPE_HINT: Record<UserType, string> = {
  STUDENT: 'Necesita un código de estudiante y puede tener un profesor tutor.',
  PROFESSOR: 'Puede publicar turnos de disponibilidad.',
  ADMINISTRATOR: 'Administra usuarios, catálogos y notificaciones.',
}

interface FormState {
  type: UserType
  email: string
  password: string
  firstName: string
  lastName: string
  studentCode: string
  tutorProfessorId: string
  academicTitle: string
  position: string
  roles: Role[]
}

const emptyForm = (): FormState => ({
  type: 'STUDENT',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  studentCode: '',
  tutorProfessorId: '',
  academicTitle: '',
  position: '',
  roles: ['STUDENT'],
})

function initials(user: UserDto): string {
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
}

export function UsersPage() {
  const [users, setUsers] = useState<UserDto[]>([])
  const [professors, setProfessors] = useState<UserDto[]>([])
  const [selected, setSelected] = useState<UserDto | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState<number | undefined>()
  const [loadingList, setLoadingList] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const isEdit = selected !== null
  const typeChanged = isEdit && selected.type !== form.type

  const loadList = useCallback(async () => {
    setLoadingList(true)
    try {
      const result = await listUsers({ page, size: PAGE_SIZE, q: query || undefined })
      setUsers(result.content ?? [])
      setTotalPages(result.page?.totalPages ?? 0)
      setTotalElements(result.page?.totalElements)
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setLoadingList(false)
    }
  }, [page, query])

  const loadProfessors = useCallback(async () => {
    try {
      const result = await listProfessors()
      setProfessors(result.content ?? [])
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void loadProfessors()
  }, [loadProfessors])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function startCreate() {
    setSelected(null)
    setForm(emptyForm())
  }

  async function selectUser(user: UserDto) {
    setSelected(user)
    setForm({
      type: user.type,
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      studentCode: user.studentCode ?? '',
      tutorProfessorId: user.tutorProfessorId ?? '',
      academicTitle: user.academicTitle ?? '',
      position: user.position ?? '',
      roles: [user.type],
    })
    try {
      const roles = (await getUserRoles(user.id)) as Role[]
      setForm((current) => ({ ...current, roles: roles.length ? roles : [user.type] }))
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  /** Al cambiar el tipo, el rol del tipo anterior se reemplaza por el del nuevo. */
  function changeType(type: UserType) {
    setForm((current) => {
      const roles = current.roles.filter((role) => role !== current.type)
      return { ...current, type, roles: roles.includes(type) ? roles : [type, ...roles] }
    })
  }

  function toggleRole(role: Role) {
    setForm((current) => {
      const has = current.roles.includes(role)
      const next = has ? current.roles.filter((r) => r !== role) : [...current.roles, role]
      return { ...current, roles: next.length ? next : [role] }
    })
  }

  /** Solo se envían los campos del tipo elegido. */
  function profileFields() {
    return {
      studentCode: form.type === 'STUDENT' ? form.studentCode.trim() : undefined,
      tutorProfessorId:
        form.type === 'STUDENT' && form.tutorProfessorId ? form.tutorProfessorId : undefined,
      academicTitle: form.type === 'PROFESSOR' ? form.academicTitle.trim() || undefined : undefined,
      position: form.type === 'ADMINISTRATOR' ? form.position.trim() || undefined : undefined,
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      if (!selected) {
        const created = await createUser({
          email: form.email.trim(),
          password: form.password,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          type: form.type,
          ...profileFields(),
          roles: form.roles,
        })
        toast.success('Usuario creado')
        setPage(0)
        await loadList()
        await selectUser(created)
      } else {
        const updated = await updateUser(selected.id, {
          email: form.email.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          password: form.password || undefined,
          type: form.type,
          ...profileFields(),
          roles: form.roles,
        })
        toast.success(typeChanged ? 'Tipo de usuario y datos actualizados' : 'Cambios guardados')
        await Promise.all([loadList(), typeChanged ? loadProfessors() : Promise.resolve()])
        await selectUser(updated)
      }
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function onDeactivate() {
    if (!selected) return
    setSaving(true)
    try {
      await deleteUser(selected.id)
      toast.success('Usuario desactivado')
      setConfirmDeactivate(false)
      startCreate()
      await loadList()
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const tutorOptions = professors.filter((p) => p.id !== selected?.id)

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Usuarios</h1>
          <p className="page-lead">
            Alta y edición de estudiantes, profesores y administradores. Los cambios de rol aplican
            en el próximo inicio de sesión.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void loadList()}>
          <RefreshCw size={16} aria-hidden />
          Actualizar lista
        </button>
      </header>

      <div className="master-detail">
        <section
          className="panel flex min-h-[420px] flex-col lg:h-[calc(100vh-11rem)]"
          aria-label="Listado de usuarios"
        >
          <div className="flex items-center gap-2 border-b border-line bg-white/65 p-3">
            <SearchInput
              value={query}
              placeholder="Buscar por nombre o correo…"
              label="Buscar usuarios"
              onChange={(value) => {
                setQuery(value)
                setPage(0)
              }}
            />
            <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={startCreate}>
              <Plus size={16} aria-hidden />
              Nuevo
            </button>
          </div>
          <ul className="m-0 min-h-0 flex-1 list-none divide-y divide-line/60 overflow-y-auto p-0">
            {loadingList && <li className="entity-list-empty">Cargando…</li>}
            {!loadingList && users.length === 0 && (
              <li className="entity-list-empty">No hay usuarios con esa búsqueda.</li>
            )}
            {!loadingList &&
              users.map((user) => {
                const active = selected?.id === user.id
                const detail =
                  user.type === 'STUDENT'
                    ? user.studentCode
                      ? `Código ${user.studentCode}`
                      : null
                    : user.type === 'PROFESSOR'
                      ? user.academicTitle
                      : user.position
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => void selectUser(user)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                        active
                          ? 'bg-accent-soft shadow-[inset_3px_0_0_var(--color-accent)]'
                          : 'hover:bg-white/80'
                      } ${user.active ? '' : 'opacity-55'}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                        {initials(user)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {user.firstName} {user.lastName}
                          {!user.active && (
                            <span className="ml-2 text-xs font-normal text-muted">(inactivo)</span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {user.email}
                          {detail ? ` · ${detail}` : ''}
                        </span>
                      </span>
                      <span className={`badge badge-${user.type.toLowerCase()} shrink-0`}>
                        {roleLabel(user.type)}
                      </span>
                    </button>
                  </li>
                )
              })}
          </ul>
          <Pagination
            page={page}
            totalPages={totalPages}
            totalElements={totalElements}
            loading={loadingList}
            onChange={setPage}
          />
        </section>

        <section className="panel panel-form" aria-label="Formulario de usuario">
          <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
            <div className="form-section">
              <div className="section-head">
                <h2>{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h2>
                {isEdit && selected.active && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={saving}
                    onClick={() => setConfirmDeactivate(true)}
                  >
                    <UserX size={15} aria-hidden />
                    Desactivar
                  </button>
                )}
              </div>
              <div className="field-grid">
                <label className="field field-span-2">
                  <span>Tipo de usuario</span>
                  <select value={form.type} onChange={(e) => changeType(e.target.value as UserType)}>
                    {USER_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {roleLabel(type)}
                      </option>
                    ))}
                  </select>
                  <small className="field-hint">{TYPE_HINT[form.type]}</small>
                </label>
                {typeChanged && (
                  <p className="field-span-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                    Vas a cambiar este usuario de {roleLabel(selected.type).toLowerCase()} a{' '}
                    {roleLabel(form.type).toLowerCase()}. Se reemplazan sus datos de perfil por los
                    del nuevo tipo. No se puede si tiene turnos o reservas registrados.
                  </p>
                )}
                <label className="field">
                  <span>Nombre</span>
                  <input
                    required
                    value={form.firstName}
                    onChange={(e) => set('firstName', e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Apellido</span>
                  <input
                    required
                    value={form.lastName}
                    onChange={(e) => set('lastName', e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Correo</span>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña'}</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={isEdit ? undefined : 8}
                    required={!isEdit}
                    placeholder={isEdit ? 'Dejar vacío para no cambiarla' : 'Mínimo 8 caracteres'}
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="form-section">
              <h2>Datos de {roleLabel(form.type).toLowerCase()}</h2>
              <div className="field-grid">
                {form.type === 'STUDENT' && (
                  <>
                    <label className="field">
                      <span>Código de estudiante</span>
                      <input
                        required
                        maxLength={32}
                        placeholder="Ej.: EST-2026-001"
                        value={form.studentCode}
                        onChange={(e) => set('studentCode', e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Profesor tutor (opcional)</span>
                      <select
                        value={form.tutorProfessorId}
                        onChange={(e) => set('tutorProfessorId', e.target.value)}
                      >
                        <option value="">Sin tutor</option>
                        {tutorOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.firstName} {p.lastName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {form.type === 'PROFESSOR' && (
                  <label className="field field-span-2">
                    <span>Título académico</span>
                    <input
                      maxLength={150}
                      placeholder="Ej.: Doctor en Ciencias de la Computación"
                      value={form.academicTitle}
                      onChange={(e) => set('academicTitle', e.target.value)}
                    />
                  </label>
                )}
                {form.type === 'ADMINISTRATOR' && (
                  <label className="field field-span-2">
                    <span>Cargo</span>
                    <input
                      maxLength={150}
                      placeholder="Ej.: Coordinación académica"
                      value={form.position}
                      onChange={(e) => set('position', e.target.value)}
                    />
                  </label>
                )}
              </div>

              <fieldset className="roles-fieldset">
                <legend>Roles de acceso</legend>
                <div className="role-chips">
                  {ALL_ROLES.map((role) => (
                    <label key={role} className="role-chip">
                      <input
                        type="checkbox"
                        checked={form.roles.includes(role)}
                        onChange={() => toggleRole(role)}
                      />
                      {roleLabel(role)}
                    </label>
                  ))}
                </div>
                <small className="field-hint">
                  Un usuario puede tener más de un rol (por ejemplo, profesor y administrador).
                </small>
              </fieldset>
            </div>

            <div className="form-actions">
              {isEdit && (
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={startCreate}>
                  Cancelar edición
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </section>
      </div>

      <ConfirmDialog
        open={confirmDeactivate}
        title="¿Desactivar este usuario?"
        description={
          selected
            ? `${selected.firstName} ${selected.lastName} (${selected.email}) no podrá iniciar sesión hasta que se reactive.`
            : ''
        }
        confirmLabel="Sí, desactivar"
        cancelLabel="Volver"
        confirming={saving}
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={() => void onDeactivate()}
      />
    </div>
  )
}
