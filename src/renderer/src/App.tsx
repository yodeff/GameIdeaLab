import { AiProvider } from './app/AiContext'
import { AppProvider } from './app/AppContext'
import { AppShell } from './app/AppShell'

export function App() {
  return (
    <AppProvider>
      <AiProvider>
        <AppShell />
      </AiProvider>
    </AppProvider>
  )
}
