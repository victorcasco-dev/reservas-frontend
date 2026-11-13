import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ServerCrash } from 'lucide-react'
import { ErrorPage } from '../../features/errors/ErrorPage'

interface State {
  error: Error | null
}

/** Captura errores de render y muestra una pantalla amigable en lugar de una página en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <ErrorPage
        code="500"
        title="La interfaz encontró un error"
        message="Ocurrió un problema inesperado al mostrar esta pantalla."
        icon={<ServerCrash size={30} aria-hidden />}
        actions={
          <button
            type="button"
            className="rounded-lg bg-accent px-4 py-2 font-medium text-white shadow hover:bg-accent-hover"
            onClick={() => window.location.assign('/')}
          >
            Volver al inicio
          </button>
        }
      />
    )
  }
}
