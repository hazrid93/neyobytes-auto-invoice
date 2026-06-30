/**
 * Auth token storage — the single seam services/http use for the auth token.
 *
 * Platform-aware: expo-secure-store is the right choice on native (encrypted
 * Keychain/Keystore), but its web module is an empty stub (`export default {}`)
 * in SDK 52, so `SecureStore.getItemAsync` is `undefined` → TypeError at
 * runtime. On web we fall back to localStorage. The isWeb guard is evaluated
 * once at module load.
 */
import * as SecureStore from 'expo-secure-store'

const KEY = 'auth_token'

const isWeb =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

export async function getToken(): Promise<string | null> {
  if (isWeb) return localStorage.getItem(KEY)
  return SecureStore.getItemAsync(KEY)
}

export async function setToken(token: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(KEY, token)
    return
  }
  await SecureStore.setItemAsync(KEY, token)
}

export async function clearToken(): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(KEY)
    return
  }
  await SecureStore.deleteItemAsync(KEY)
}