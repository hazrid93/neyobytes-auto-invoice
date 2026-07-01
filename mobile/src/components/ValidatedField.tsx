/**
 * ValidatedField — a labelled text input with inline validation + an error
 * message underneath. The workhorse for every form in the app.
 *
 * Validation runs:
 *   - on blur (first time the user leaves the field), and
 *   - on every change AFTER the first blur (so the error clears as soon as the
 *     user starts fixing it, but we don't yell at them mid-typing before that).
 *
 * The parent owns the value (controlled); this component owns only the
 * touched + error state. Exposes `validate()` imperatively via a ref so the
 * parent can run the full form validation on submit (and block submit while
 * errors remain). Use `useValidatedForm` for the common multi-field case.
 */
import { forwardRef, useCallback, useImperativeHandle, useState, type ReactNode } from 'react'
import { View, Text, TextInput, StyleSheet, Platform, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, font, space, radius } from '../theme/tokens'
import type { Validator } from '../lib/validation'

export interface ValidatedFieldHandle {
  /** Force a re-validation (used by the form on submit). Returns true if valid. */
  validate: () => boolean
}

interface ValidatedFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  validate: Validator
  placeholder?: string
  icon?: keyof typeof Ionicons.glyphMap
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad' | 'visible-password'
  autoCap?: 'none' | 'characters' | 'words' | 'sentences'
  autoCorrect?: boolean
  secure?: boolean
  multiline?: boolean
  prefix?: string
  /** Optional trailing element inside the input row (e.g. an eye toggle). */
  trailing?: ReactNode
  hint?: string
  disabled?: boolean
  style?: ViewStyle
}

export const ValidatedField = forwardRef<ValidatedFieldHandle, ValidatedFieldProps>(
  function ValidatedField(
    {
      label, value, onChange, validate, placeholder, icon, keyboardType, autoCap,
      autoCorrect, secure, multiline, prefix, trailing, hint, disabled, style,
    },
    ref,
  ) {
    const [touched, setTouched] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const run = useCallback(
      (v: string) => {
        const e = validate(v)
        setErr(e)
        return !e
      },
      [validate],
    )

    useImperativeHandle(ref, () => ({
      validate: () => {
        setTouched(true)
        return run(value)
      },
    }))

    const webClass = (Platform.OS === 'web' ? { className: 'field-input' } : {}) as Record<string, string>
    const showError = touched && err
    return (
      <View style={[styles.field, style]}>
        <Text style={styles.label}>{label}</Text>
        <View
          {...webClass}
          style={[
            styles.inputWrap,
            showError && styles.inputWrapError,
            disabled && styles.inputWrapDisabled,
          ]}
        >
          {icon ? <Ionicons name={icon} size={18} color={showError ? colors.danger : colors.slate} style={styles.fieldIcon} /> : null}
          {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
          <TextInput
            style={[styles.input, multiline && styles.inputMultiline]}
            value={value}
            onChangeText={(v) => {
              onChange(v)
              if (touched) run(v)
            }}
            onBlur={() => {
              setTouched(true)
              run(value)
            }}
            placeholder={placeholder}
            placeholderTextColor={colors.slate}
            keyboardType={keyboardType ?? 'default'}
            autoCapitalize={autoCap ?? 'none'}
            autoCorrect={autoCorrect ?? false}
            secureTextEntry={secure}
            multiline={multiline}
            editable={!disabled}
          />
          {trailing}
        </View>
        {showError ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={13} color={colors.danger} />
            <Text style={styles.error}>{err}</Text>
          </View>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null}
      </View>
    )
  },
)

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.snow + 'CC', borderColor: colors.silver, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: space.md,
  },
  inputWrapError: { borderColor: colors.danger },
  inputWrapDisabled: { opacity: 0.55 },
  fieldIcon: { marginRight: space.sm },
  prefix: { fontFamily: font.body, fontSize: 15, color: colors.slate, marginRight: 4 },
  input: { flex: 1, fontFamily: font.body, fontSize: 16, color: colors.ink, paddingVertical: space.md },
  inputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  error: { fontFamily: font.body, fontSize: 12, color: colors.danger, flex: 1 },
  hint: { fontFamily: font.body, fontSize: 12, color: colors.silver, marginTop: 2, lineHeight: 16 },
})