/**
 * Root HTML document for Expo Web (static export). Controls the <head> so we
 * can set the viewport meta — specifically disabling pinch-zoom + the iOS
 * Safari auto-zoom-on-input-focus, which the default Expo viewport didn't.
 *
 * IMPORTANT #1 — `children` is the route's own server-rendered `<div id="root">…`.
 * Do NOT add another `#root` wrapper or any extra View/ScrollView around it —
 * the client bundle calls `hydrateRoot(getElementById('root'), <App/>)`, so the
 * DOM inside `#root` must match exactly. Wrapping it breaks hydration (white
 * screen).
 *
 * IMPORTANT #2 — the default Expo HTML injects a `<style id="expo-reset">` that
 * sets `#root,body,html{height:100%}` + `#root{display:flex}`. Without it, the
 * app's `flex:1`/`absoluteFill` root views collapse to 0 height → content is
 * invisible (white screen, though effects still fire). Overriding +html.tsx
 * drops that style, so we MUST include it ourselves here.
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
        {/* expo-reset — reproduced from Expo's default HTML. Gives #root full
            height + flex so the app's root views (flex:1 / absoluteFill) are
            actually visible. Removing this is what caused the white screen. */}
        <style id="expo-reset">{`#root,body,html{height:100%}#root{display:flex}body{overflow:hidden}body{margin:0;}html{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:rgba(0,0,0,0);}`}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}