import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Role, UserDto, UserType } from '../../types/api'
import { parseApiError } from '../../shared/api/client'
import {
  createUser,
  deleteUser,
  getUserRoles,
  listUsers,
  replaceUserRoles,
  updateUser,
} from '../../shared/api/users'
import { listProfessors } from '../../shared/api/professors'
import { roleLabel } from '../../shared/roleLabels'

const USER_TYPES: UserType[] = ['STUDENT', 'PROFESSOR', 'ADMINISTRATOR']
const ALL_ROLES: Role[] = ['STUDENT', 'PROFESSOR', 'ADMINISTRATOR']

type Mode = 'create' | 'edit'

interface HeaderForm {
  type: UserType
  email: string
  password: string
  firstName: string
  lastName: string
}

interface DetailForm {
  studentCode: string
  academicTitle: string
  position: string
  tutorProfessorId: string
  roles: Role[]
}

const emptyHeader = (): HeaderForm => ({
  type: 'STUDENT',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
})

const emptyDetail = (): DetailForm => ({
  studentCode: '',
  academicTitle: '',
  position: '',
  tutorProfessorId: '',
  roles: ['STUDENT'],
})

export function UsersPage() {
  const [users, setUsers] = useState<UserDto[]>([])
  const [professors, setProfessors] = useState<UserDto[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('create')
  const [header, setHeader] = useState<HeaderForm>(emptyHeader)
  const [detail, setDetail] = useState<DetailForm>(emptyDetail)
  const [query, setQuery] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoadingList(true)
    try {
      const page = await listUsers({ page: 0, size: 50, q: query || undefined })
      setUsers(page.content ?? [])
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setLoadingList(false)
    }
  }, [query])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void listProfessors().then((p) => setProfessors(p.content ?? []))
  }, [])

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedId) ?? null,
    [users, selectedId],
  )

  function startCreate() {
    setMode('create')
    setSelectedId(null)
    setHeader(emptyHeader())
    setDetail(emptyDetail())
  }

  async function selectUser(user: UserDto) {
    setMode('edit')
    setSelectedId(user.id)
    setHeader({
      type: user.type,
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
    })
    setDetail({
      studentCode: user.studentCode ?? '',
      academicTitle: user.academicTitle ?? '',
      position: user.position ?? '',
      tutorProfessorId: user.tutorProfessorId ?? '',
      roles: ['STUDENT'],
    })
    try {
      const roles = await getUserRoles(user.id)
      setDetail((d) => ({ ...d, roles: roles as Role[] }))
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  function toggleRole(role: Role) {
    setDetail((d) => {
      const has = d.roles.includes(role)
      const next = has ? d.roles.filter((r) => r !== role) : [...d.roles, role]
      return { ...d, roles: next.length ? next : [role] }
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (mode === 'create') {
        const created = await createUser({
          email: header.email.trim(),
          password: header.password,
          firstName: header.firstName.trim(),
          lastName: header.lastName.trim(),
          type: header.type,
          studentCode: detail.studentCode || undefined,
          academicTitle: detail.academicTitle || undefined,
          position: detail.position || undefined,
          tutorProfessorId: detail.tutorProfessorId || undefined,
        })
        await replaceUserRoles(created.id, detail.roles)
        toast.success('Usuario creado')
        await loadList()
        await selectUser(created)
      } else if (selectedId) {
        await updateUser(selectedId, {
          email: header.email.trim(),
          firstName: header.firstName.trim(),
          lastName: header.lastName.trim(),
          password: header.password || undefined,
          studentCode: detail.studentCode || undefined,
          academicTitle: detail.academicTitle || undefined,
          position: detail.position || undefined,
          tutorProfessorId: detail.tutorProfessorId || undefined,
        })
        await replaceUserRoles(selectedId, detail.roles)
        toast.success('Cambios guardados')
        await loadList()
      }
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!selectedId || !selectedUser) {
      return
    }
    if (!window.confirm(`¿Desactivar a ${selectedUser.email}?`)) {
      return
    }
    setSaving(true)
    try {
      await deleteUser(selectedId)
      toast.success('Usuario desactivado')
      startCreate()
      await loadList()
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Usuarios</h1>
          <p className="page-lead">
            Alta y edición en una sola vista. Los cambios de rol aplican en el próximo inicio
            de sesión.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void loadList()}>
          <RefreshCw size={16} aria-hidden />
          Actualizar lista
        </button>
      </header>

      <div className="master-detail">
        <section className="panel panel-list" aria-label="Listado de usuarios">
          <div className="panel-toolbar">
            <input
              type="search"
              placeholder="Buscar por nombre o correo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar usuarios"
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
              <Plus size={16} aria-hidden />
              Nuevo
            </button>
          </div>
          <ul className="entity-list">
            {loadingList && <li className="entity-list-empty">Cargando…</li>}
            {!loadingList && users.length === 0 && (
              <li className="entity-list-empty">No hay usuarios.</li>
            )}
            {users.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className={`entity-row ${selectedId === user.id ? 'selected' : ''}`}
                  onClick={() => void selectUser(user)}
                >
                  <span className="entity-row-title">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="entity-row-meta">{user.email}</span>
                  <span className={`badge badge-${user.type.toLowerCase()}`}>
                    {roleLabel(user.type)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel panel-form" aria-label="Formulario de usuario">
          <form className="stack-form" onSubmit={(e) => void onSubmit(e)}>
            <div className="form-section">
              <h2>Datos generales</h2>
              <div className="field-grid">
                <label className="field">
                  <span>Tipo</span>
                  <select
                    value={header.type}
                    onChange={(e) =>
                      setHeader({ ...header, type: e.target.value as UserType })
                    }
                    disabled={mode === 'edit'}
                  >
                    {USER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {roleLabel(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Correo</span>
                  <input
                    type="email"
                    required
                    value={header.email}
                    onChange={(e) => setHeader({ ...header, email: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Nombre</span>
                  <input
                    required
                    value={header.firstName}
                    onChange={(e) => setHeader({ ...header, firstName: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Apellido</span>
                  <input
                    required
                    value={header.lastName}
                    onChange={(e) => setHeader({ ...header, lastName: e.target.value })}
                  />
                </label>
                <label className="field field-span-2">
                  <span>{mode === 'create' ? 'Contraseña' : 'Nueva contraseña (opcional)'}</span>
                  <input
                    type="password"
                    minLength={mode === 'create' ? 8 : undefined}
                    required={mode === 'create'}
                    value={header.password}
                    onChange={(e) => setHeader({ ...header, password: e.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="form-section">
              <h2>Perfil y acceso</h2>
              <div className="field-grid">
                {(header.type === 'STUDENT' || mode === 'edit') && (
                  <>
                    <label className="field">
                      <span>Código de estudiante</span>
                      <input
                        value={detail.studentCode}
                        onChange={(e) =>
                          setDetail({ ...detail, studentCode: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Tutor (profesor)</span>
                      <select
                        value={detail.tutorProfessorId}
                        onChange={(e) =>
                          setDetail({ ...detail, tutorProfessorId: e.target.value })
                        }
                      >
                        <option value="">Sin tutor</option>
                        {professors.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.firstName} {p.lastName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {header.type === 'PROFESSOR' && (
                  <label className="field field-span-2">
                    <span>Título académico</span>
                    <input
                      value={detail.academicTitle}
                      onChange={(e) =>
                        setDetail({ ...detail, academicTitle: e.target.value })
                      }
                    />
                  </label>
                )}
                {header.type === 'ADMINISTRATOR' && (
                  <label className="field field-span-2">
                    <span>Cargo</span>
                    <input
                      value={detail.position}
                      onChange={(e) => setDetail({ ...detail, position: e.target.value })}
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
                        checked={detail.roles.includes(role)}
                        onChange={() => toggleRole(role)}
                      />
                      {roleLabel(role)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="form-actions">
              {mode === 'edit' && selectedUser?.active && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={saving}
                  onClick={() => void onDelete()}
                >
                  <Trash2 size={16} aria-hidden />
                  Desactivar
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : mode === 'create' ? 'Crear usuario' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
