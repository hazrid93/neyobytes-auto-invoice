/**
 * Login screen — minimal two-field form over the silver→blue gradient. Glass
 * card holds the fields; azure is the single primary action. On success the
 * session flips to 'authenticated' and the auth gate / this effect routes to
 * the home tab.
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { Link, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAsync } from '../viewmodels/useAsync'
import { useSession } from '../viewmodels/useSession'
import { useValidatedForm } from '../viewmodels/useValidatedForm'
import { GradientBackground, GlassCard } from '../theme/glass'
import { pageContentStyle } from '../theme/page'
import { ValidatedField, type ValidatedFieldHandle } from '../components/ValidatedField'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import { compose, required, minLength, email as emailV } from '../lib/validation'

export default function LoginScreen() {
  const session = useSession()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const async = useAsync<void>()

  const emailRef = useRef<ValidatedFieldHandle>(null)
  const passwordRef = useRef<ValidatedFieldHandle>(null)
  const nameRef = useRef<ValidatedFieldHandle>(null)
  const { formError, runValidation, clearFormError } = useValidatedForm([emailRef, passwordRef, nameRef])

  // Sign-in happens while the user is on /login, so the auth gate at / never
  // re-runs — navigate to the home tab ourselves on success.
  useEffect(() => {
    if (session.status === 'authenticated') router.replace('/home')
  }, [session.status])

  const submit = async () => {
    // Validate before sending; block submit while any field fails.
    if (!runValidation()) return
    clearFormError()
    if (mode === 'login') await session.login(email, password)
    else await session.register(email, password, name)
  }

  const error = session.error

  return (
    <GradientBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrap}
      >
        <View style={styles.brand}>
          <View style={styles.logoBadge}>
            <Ionicons name="receipt" size={26} color={colors.snow} />
          </View>
          <Text style={styles.brandName}>auto-invoice</Text>
        </View>

        <GlassCard strong style={styles.card}>
          <Text style={styles.title}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </Text>
          <Text style={styles.subtitle}>
            {mode === 'login' ? 'Sign in to manage your e-invoices' : 'Start capturing and submitting invoices'}
          </Text>

          {mode === 'register' && (
            <ValidatedField ref={nameRef} label="Full name" value={name} onChange={setName}
              validate={compose(required('Full name'), minLength('Full name', 2))}
              placeholder="Full name" autoCap="words" />
          )}
          <ValidatedField ref={emailRef} label="Email" value={email} onChange={setEmail}
            validate={compose(required('Email'), emailV())} placeholder="you@company.com" keyboardType="email-address" />
          <ValidatedField ref={passwordRef} label="Password" value={password} onChange={setPassword}
            validate={compose(required('Password'), minLength('Password', 8))} placeholder="At least 8 characters" secure />

          {formError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={15} color={colors.danger} />
              <Text style={styles.error}>{formError}</Text>
            </View>
          ) : null}
          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={15} color={colors.danger} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => async.run(submit)}
            disabled={session.loading}
          >
            <Text style={styles.buttonText}>
              {session.loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Text>
          </Pressable>

          <Link
            href="#"
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              async.reset()
            }}
            style={styles.toggle}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </Link>
        </GlassCard>
      </KeyboardAvoidingView>
    </GradientBackground>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', ...pageContentStyle, paddingVertical: space.xxxl },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginBottom: space.xl },
  logoBadge: {
    width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.azure,
    alignItems: 'center', justifyContent: 'center', ...shadow.card,
  },
  brandName: { fontFamily: font.displayBold, fontSize: 24, color: colors.ink, letterSpacing: -0.5 },
  card: { padding: space.xxl, gap: space.md },
  title: { fontFamily: font.displayBold, fontSize: 24, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 14, color: colors.slate, marginTop: -space.xs, marginBottom: space.sm },
  fieldWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.snow + 'CC', borderColor: colors.silver, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: space.md,
  },
  fieldIcon: { marginRight: space.sm },
  input: { flex: 1, fontFamily: font.body, fontSize: 16, color: colors.ink, paddingVertical: space.md },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  error: { fontFamily: font.body, fontSize: 13, color: colors.danger },
  button: {
    backgroundColor: colors.azure, borderRadius: radius.md,
    paddingVertical: space.md + 2, alignItems: 'center', marginTop: space.xs, ...shadow.card,
  },
  buttonPressed: { opacity: 0.9 },
  buttonText: { fontFamily: font.displayBold, fontSize: 16, color: colors.snow },
  toggle: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.azure, textAlign: 'center', marginTop: space.md, textDecorationLine: 'underline' },
})