import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext'
import { AppRouter } from './app/router'
import { AppToaster } from './shared/ui/Toaster'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <AppToaster />
      </AuthProvider>
    </BrowserRouter>
  )
}
