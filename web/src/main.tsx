import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { FluentProvider } from '@fluentui/react-components'
import { FileClipboardProvider } from './components/files/FileClipboard'
import { AppToaster } from './components/ui/Toast'
import { appLightTheme } from './styles/fluentTheme'
import { router } from './router'
import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={appLightTheme} applyStylesToPortals>
      <QueryClientProvider client={queryClient}>
        <FileClipboardProvider>
          <RouterProvider router={router} />
          <AppToaster />
        </FileClipboardProvider>
      </QueryClientProvider>
    </FluentProvider>
  </StrictMode>,
)
