/**
 * IntermediaryAutoAppoint — Option B (native only).
 *
 * Opens the taxpayer's MyInvois profile portal in an in-app WebView. The user
 * logs in themselves (their password never touches our server). Once a session
 * token appears in the portal's localStorage, injected JavaScript calls the
 * portal's internal `PUT /iapi/v1.0/taxpayers/current/intermediaries` to add
 * OUR company as their intermediary (by our TIN, with View + Submit perms),
 * then posts the result back to RN.
 *
 * WHY THIS IS NATIVE-ONLY + BETA:
 *  - The portal sends X-Frame-Options: SAMEORIGIN + CSP frame-ancestors, so it
 *    cannot be iframed on our web app. A native WebView isn't bound by that.
 *  - The /iapi endpoint is the portal's INTERNAL API (not the public
 *    /api/v1.0 e-invoicing API) and needs the taxpayer's live session token.
 *    We find it by scanning localStorage for a JWT (oidc-client stores the
 *    access_token there). If LHDN changes how the token is held (e.g.
 *    HTTP-only cookie + server-side BFF), this will fail → the manual path
 *    in the appointment screen is the supported fallback.
 *
 * This component renders null on web; the screen shows the manual steps there.
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import { WebView } from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import { colors, font, space, radius } from '../theme/tokens'

export interface AppointResult {
  ok: boolean
  status: number
  body: string
}

interface Props {
  open: boolean
  portalUrl: string
  iapiBase: string
  intermediaryTin: string
  intermediaryRob: string | null
  onClose: () => void
  onResult: (r: AppointResult) => void
}

// Build the injected JS. It polls localStorage for a JWT access token, then
// PUTs the intermediary appointment, posting the result back via postMessage.
// Placeholders are string-replaced (NOT templated) to avoid quoting hell.
function buildInjectScript(iapiBase: string, tin: string, rob: string): string {
  const tinLit = JSON.stringify(tin)
  const robLit = JSON.stringify(rob ?? '')
  const iapiLit = JSON.stringify(`${iapiBase}/iapi/v1.0/taxpayers/current/intermediaries`)
  return `
(function(){
  var IAPI = ${iapiLit};
  var TIN = ${tinLit};
  var ROB = ${robLit};
  function isJwt(s){ return typeof s === 'string' && s.split('.').length === 3 && s.indexOf('ey') === 0; }
  function findToken(){
    try {
      for (var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i); var v = localStorage.getItem(k);
        if (!v) continue;
        try { var j = JSON.parse(v); if (j && typeof j.access_token === 'string') return j.access_token; } catch(e){}
        if (isJwt(v)) return v;
      }
    } catch(e){}
    return null;
  }
  var tries = 0;
  var MAX = 180; // ~3 min of polling before giving up
  var timer = setInterval(function(){
    tries++;
    var t = findToken();
    if (t){
      clearInterval(timer);
      var now = new Date().toISOString();
      var later = new Date(Date.now() + 1000*60*60*24*365*3).toISOString(); // +3yr
      fetch(IAPI, {
        method: 'PUT',
        headers: { 'accept': 'text/plain', 'content-type': 'application/json-patch+json', 'authorization': 'Bearer ' + t },
        body: JSON.stringify({ IntermediaryTIN: TIN, IntermediaryROB: ROB, ActiveFrom: now, ActiveTo: later, CanViewDocument: true, CanSubmitDocument: true, CanCancelDocument: false, CanRejectDocument: false, CanViewNotifications: false })
      }).then(function(r){ return r.text().then(function(tx){ return { ok: r.ok, status: r.status, body: tx }; }); })
        .then(function(res){ window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'appointResult', ok: res.ok, status: res.status, body: res.body })); })
        .catch(function(e){ window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'appointError', message: String(e) })); });
    } else if (tries > MAX){
      clearInterval(timer);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tokenNotFound' }));
    }
  }, 1000);
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
})();
`
}

export function IntermediaryAutoAppoint({
  open, portalUrl, iapiBase, intermediaryTin, intermediaryRob, onClose, onResult,
}: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'done' | 'error'>('loading')
  const [message, setMessage] = useState('Opening the MyInvois portal… sign in to continue.')
  const webviewRef = useRef<WebView>(null)
  const inject = buildInjectScript(iapiBase, intermediaryTin, intermediaryRob ?? '')

  // Reset state each time the modal opens.
  useEffect(() => {
    if (open) {
      setStatus('loading')
      setMessage('Opening the MyInvois portal… sign in to continue.')
    }
  }, [open])

  if (Platform.OS === 'web' || !open) return null

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Auto-appoint (beta)</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          {status === 'done' ? (
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          ) : status === 'error' ? (
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
          ) : (
            <ActivityIndicator size="small" color={colors.azure} />
          )}
          <Text style={[styles.statusText, status === 'error' && { color: colors.danger }, status === 'done' && { color: colors.success }]}>
            {message}
          </Text>
        </View>

        {status !== 'done' && (
          <View style={styles.webviewWrap}>
            <WebView
              ref={webviewRef}
              source={{ uri: portalUrl }}
              injectedJavaScript={inject}
              onMessage={(e) => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data)
                  if (msg.type === 'ready') {
                    setStatus('ready')
                    setMessage("Sign in to the portal — we'll add ourselves once you're in.")
                  } else if (msg.type === 'appointResult') {
                    if (msg.ok) {
                      setStatus('done')
                      setMessage('Appointed! You can close this.')
                      onResult({ ok: true, status: msg.status, body: msg.body })
                    } else {
                      setStatus('error')
                      setMessage(`LHDN rejected the auto-appoint (HTTP ${msg.status}). Follow the manual steps below.`)
                    }
                  } else if (msg.type === 'appointError') {
                    setStatus('error')
                    setMessage(`Auto-appoint failed: ${msg.message}. Use the manual steps.`)
                  } else if (msg.type === 'tokenNotFound') {
                    setStatus('error')
                    setMessage('Could not find your portal session token. Please add us manually using the steps on this screen.')
                  }
                } catch {
                  /* ignore non-JSON messages from the page */
                }
              }}
              // The portal's own cookies carry the session; the injected token
              // scan handles the Bearer. Don't share our app's cookies.
              sharedCookiesEnabled={false}
              style={styles.webview}
            />
          </View>
        )}

        <Pressable style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneText}>{status === 'done' ? 'Done' : 'Cancel'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(10,37,64,0.5)', justifyContent: 'center', alignItems: 'center',
    zIndex: 100,
  },
  sheet: {
    width: '92%', maxWidth: 520, maxHeight: '88%',
    backgroundColor: colors.snow, borderRadius: radius.lg, overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.silver + '55',
  },
  sheetTitle: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink },
  closeBtn: { padding: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  statusText: { flex: 1, fontFamily: font.body, fontSize: 13, color: colors.slate, lineHeight: 18 },
  webviewWrap: { flex: 1, minHeight: 360, backgroundColor: colors.snow },
  webview: { flex: 1 },
  doneBtn: {
    paddingVertical: space.md, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.silver + '55',
  },
  doneText: { fontFamily: font.bodyMedium, fontSize: 15, color: colors.azure },
})