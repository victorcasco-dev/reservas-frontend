import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext'
import { AppRouter } from './app/router'
import { ApiEventsBridge } from './app/ApiEventsBridge'
import { AppToaster } from './shared/ui/Toaster'
import { ErrorBoundary } from './shared/ui/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ApiEventsBridge />
          <AppRouter />
          <AppToaster />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
