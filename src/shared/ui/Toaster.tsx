import { Toaster as SonnerToaster } from 'sonner'

export function AppToaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'app-toast',
          title: 'app-toast-title',
          description: 'app-toast-desc',
        },
      }}
    />
  )
}
