/**
 * Expo app config. Reads build-time env to keep native + web builds in sync;
 * the frontend's HTTP client reads `process.env.EXPO_PUBLIC_API_BASE_URL`
 * directly (inlined at bundle time), so this `extra` field is a convenience
 * for native inspection via Constants, not the source of truth for the URL.
 */
export default {
  name: 'neyobytes-auto-invoice',
  slug: 'neyobytes-auto-invoice',
  version: '0.1.0',
  scheme: 'neyobytes-auto-invoice',
  userInterfaceStyle: 'light',
  web: {
    bundler: 'metro',
    output: 'static',
  },
  experiments: {
    tsconfigPaths: true,
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4001',
    eas: {
      projectId: '',
    },
  },
}