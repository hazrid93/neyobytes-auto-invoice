/**
 * Root HTML document for Expo Web (static export). Controls the <head> so we
 * can set the viewport meta — specifically disabling pinch-zoom + the iOS
 * Safari auto-zoom-on-input-focus, which the default Expo viewport didn't.
 *
 * IMPORTANT: `children` is the route's own server-rendered `<div id="root">…`
 * Do NOT add another `#root` wrapper or any extra View/ScrollView around it —
 * the client bundle calls `hydrateRoot(getElementById('root'), <App/>)`, so
 * the DOM inside `#root` must match exactly. Wrapping it breaks hydration
 * (white screen). Just render <html><head>…</head><body>{children}</body>.
 *
 * (Expo Router way to override the default <html>; must be named `+html.tsx`
 * at the app root and default-export a component receiving `children`.)
 */
export default function RootHTML({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* Disable zoom: maximum-scale=1 + user-scalable=no kills pinch-zoom AND
            the iOS auto-zoom-on-input-focus (font-size<16px triggers it; we also
            bump inputs to 16px, but this meta is the belt-and-suspenders fix
            that holds even if a font ever dips below 16). */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}