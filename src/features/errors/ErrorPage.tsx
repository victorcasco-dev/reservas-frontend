import { Home, RefreshCw, SearchX, ServerCrash, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

interface ErrorPageProps {
  code: string
  title: string
  message: string
  icon: ReactNode
  actions?: ReactNode
}

const primaryAction =
  'inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 font-medium text-white shadow hover:bg-accent-hover'
const secondaryAction =
  'inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 font-medium text-ink hover:border-accent'

/** Vista amigable para errores (404, 403, 500). La app nunca queda en blanco. */
export function ErrorPage({ code, title, message, icon, actions }: ErrorPageProps) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <section className="w-full max-w-lg rounded-2xl border border-line bg-surface p-10 text-center shadow-xl shadow-ink/5">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
          {icon}
        </div>
        <p className="font-display text-6xl font-semibold tracking-tight text-accent">{code}</p>
        <h1 className="mt-3 font-display text-2xl text-ink">{title}</h1>
        <p className="mt-3 text-muted">{message}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {actions ?? (
            <Link to="/" className={primaryAction}>
              <Home size={16} aria-hidden />
              Ir al inicio
            </Link>
          )}
        </div>
      </section>
    </main>
  )
}

export function NotFoundPage() {
  const location = useLocation()
  return (
    <ErrorPage
      code="404"
      title="Página no encontrada"
      message={`La ruta ${location.pathname} no existe o fue movida.`}
      icon={<SearchX size={30} aria-hidden />}
    />
  )
}

export function ForbiddenPage() {
  return (
    <ErrorPage
      code="403"
      title="Acceso restringido"
      message="Tu perfil no tiene permiso para ver esta sección. Si creés que es un error, pedile acceso a un administrador."
      icon={<ShieldAlert size={30} aria-hidden />}
    />
  )
}

export function ServerErrorPage() {
  const location = useLocation()
  const state = location.state as { status?: number; from?: string } | null
  const status = state?.status && state.status >= 500 ? String(state.status) : '500'
  return (
    <ErrorPage
      code={status}
      title="Algo falló en el servidor"
      message="No pudimos completar la operación. El servicio puede estar reiniciándose; probá de nuevo en unos segundos."
      icon={<ServerCrash size={30} aria-hidden />}
      actions={
        <>
          <Link to={state?.from ?? '/'} className={primaryAction}>
            <RefreshCw size={16} aria-hidden />
            Reintentar
          </Link>
          <Link to="/" className={secondaryAction}>
            <Home size={16} aria-hidden />
            Ir al inicio
          </Link>
        </>
      }
    />
  )
}
