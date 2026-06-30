/* eslint-disable react/no-danger */
/**
 * Root HTML document for Expo Web (static export). Controls the <head> so we
 * can set the viewport meta — specifically disabling pinch-zoom + the iOS
 * Safari auto-zoom-on-input-focus, which the default Expo viewport didn't.
 *
 * Keep the script bootstrap EXACTLY: it loads the static bundle + hydrates
 * Expo Router. Don't add blocking scripts or reorder.
 *
 * (This is the Expo Router way to override the default <html>; it must be
 * named `+html.tsx` at the app root and export a default component receiving
 * `props.children` — the server-rendered route shell.)
 */
import { ScrollView, StyleSheet } from 'react-native'

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
      <body>
        {/* Wrap in a no-scroll outer view; the app manages its own scrolling per
            screen (ScrollViews/FlatLists). Mirrors Expo's default #root layout. */}
        <div id="root">
          <ScrollView
            style={styles.htmlScroll}
            contentContainerStyle={styles.htmlScrollContent}
            scrollEnabled={false}
          >
            {children}
          </ScrollView>
        </div>
      </body>
    </html>
  )
}

const styles = StyleSheet.create({
  htmlScroll: { flex: 1, height: '100%' },
  htmlScrollContent: { flex: 1, minHeight: '100%' },
})