/**
 * Login screen — minimal two-field form. Maps session error → inline message.
 * On success, the session context flips to 'authenticated' and the auth gate
 * redirects to /dashboard.
 */
import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { Link } from 'expo-router'
import { useAsync } from '../viewmodels/useAsync'
import { useSession } from '../viewmodels/useSession'
import { colors, font, space, radius } from '../theme/tokens'

export default function LoginScreen() {
  const session = useSession()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const async = useAsync<void>()

  const submit = async () => {
    if (mode === 'login') await session.login(email, password)
    else await session.register(email, password, name)
  }

  // Surface session errors (the view model owns the error string).
  const error = session.error

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>auto-invoice</Text>
        <Text style={styles.subtitle}>
          {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
        </Text>

        {mode === 'register' && (
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={colors.arang}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.arang}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.arang}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => async.run(submit)}
          disabled={session.loading}
        >
          <Text style={styles.buttonText}>
            {session.loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
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
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center' },
  card: { paddingHorizontal: space.xl, gap: space.md },
  title: { fontFamily: font.displayBold, fontSize: 32, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.body, fontSize: 15, color: colors.arang, marginTop: -space.xs, marginBottom: space.lg },
  input: {
    fontFamily: font.body, fontSize: 16, color: colors.ink,
    borderWidth: 1, borderColor: colors.arang + '40', borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.md,
  },
  button: {
    backgroundColor: colors.kuning, borderRadius: radius.md,
    paddingVertical: space.md, alignItems: 'center', marginTop: space.sm,
  },
  buttonPressed: { opacity: 0.88 },
  buttonText: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink },
  error: { fontFamily: font.body, fontSize: 14, color: colors.merah, marginTop: -space.xs },
  toggle: { fontFamily: font.body, fontSize: 14, color: colors.ink, textAlign: 'center', marginTop: space.md, textDecorationLine: 'underline' },
})