import { AppProvider } from './app/AppContext'
import { AppShell } from './app/AppShell'

export function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
