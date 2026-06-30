/**
 * Root layout — loads fonts, wraps the app in SessionProvider. Expo Router
 * file-based routing: this file is the shell around every route.
 */
import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk'
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter'
import * as SplashScreen from 'expo-splash-screen'
import { SessionProvider } from '../viewmodels/useSession'
import { GlassStyleInjector } from '../theme/glass'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { font } from '../theme/tokens'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    [font.display]: SpaceGrotesk_500Medium,
    [font.displayBold]: SpaceGrotesk_700Bold,
    [font.body]: Inter_400Regular,
    [font.bodyMedium]: Inter_500Medium,
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (fontsLoaded) {
      setReady(true)
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  if (!ready) return null

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <GlassStyleInjector />
        <ErrorBoundary>
          <Stack screenOptions={{ headerShown: false }} />
        </ErrorBoundary>
      </SessionProvider>
    </SafeAreaProvider>
  )
}