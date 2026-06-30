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
  // ── Native (iOS / Android) — required so `expo prebuild` / `eas build` can
  // generate native projects + request the camera/photo permissions the
  // Capture flow needs. The web config below is untouched (web deploy keeps
  // serving from mobile/dist via nginx, same as today).
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.neyobytes.autoinvoice',
    infoPlist: {
      NSCameraUsageDescription:
        'auto-invoice uses the camera to photograph invoices for e-invoicing.',
      NSPhotoLibraryUsageDescription:
        'auto-invoice accesses your photo library to select invoice images.',
      NSPhotoLibraryAddUsageDescription:
        'auto-invoice may save invoice images to your photo library.',
    },
  },
  android: {
    package: 'com.neyobytes.autoinvoice',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
    ],
  },
  plugins: [
    [
      'expo-image-picker',
      {
        photosPermission:
          'auto-invoice accesses your photos to select invoice images.',
        cameraPermission:
          'auto-invoice uses the camera to photograph invoices for e-invoicing.',
      },
    ],
  ],
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