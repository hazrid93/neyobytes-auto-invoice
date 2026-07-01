/**
 * CodePicker — a searchable dropdown for LHDN code tables, with a help (?)
 * button that opens a popup explaining every selectable value.
 *
 * Two modals:
 *   1. The PICKER modal — a search box + a scrollable list of options.
 *      Renders identically on web + native (Modal-based; RN-Web renders the
 *      Modal as a fixed overlay). Searchable so the big tables (MSIC ×1175,
 *      Countries ×253, Units ×2163) stay usable.
 *   2. The HELP modal — opens from the (?) button on the field row; lists every
 *      option's code + description so the user understands each value before /
 *      while picking. Also searchable.
 *
 * The selected value renders as the code's label; if the current code isn't in
 * the table (e.g. a legacy value) it still shows so the user can see + change it.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform, Animated, Easing, Dimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, font, space, radius, shadow } from '../theme/tokens'
import { useSafeInsets } from '../theme/useSafeInsets'
import { codeLabel, findEntry, type CodeEntry } from '../data/codes'

// Full viewport height — the sheet starts translated this far below so only the
// sheet slides up on open, while the scrim (dark overlay) appears instantly via
// the Modal's animationType="none". (Previously animationType="slide" slid the
// scrim up too, which is what made the background look wrong.) The close path
// also animates: closePicker slides the sheet back down before unmounting.
const SCREEN_H = Dimensions.get('window').height

// Shared horizontal inset for the drawer header, search box, and option list
// so their left/right edges line up cleanly. Bumping only one would ragged the
// search field against the rows beneath it.
const sheetPad = space.xl

interface CodePickerProps {
  label: string
  /** The code table to pick from (e.g. E_INVOICE_TYPES). */
  options: CodeEntry[]
  /** Currently selected code (or null/empty). */
  value: string | null | undefined
  /** Called with the chosen code when the user picks one. */
  onChange: (code: string) => void
  /** Icon shown in the field row (left). */
  icon?: keyof typeof Ionicons.glyphMap
  placeholder?: string
  /** Show the code next to the label in the picker list (default true). */
  showCodeInList?: boolean
  /** Required — show a red asterisk + "is required" if empty on blur. */
  required?: boolean
  /** When true, the picker row shows as disabled (greyed). */
  disabled?: boolean
}

export function CodePicker({
  label, options, value, onChange, icon, placeholder = 'Select…', showCodeInList = true, required, disabled,
}: CodePickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [touched, setTouched] = useState(false)

  // Notch / home-indicator inset so the last option row never tucks under the
  // bottom edge on notched iOS. Zero on web + non-notched devices.
  const { bottom: safeBottom } = useSafeInsets()

  // Bottom-sheet slide-up. The scrim appears instantly via the Modal; only the
  // sheet translates. Initialized off-screen (SCREEN_H) so the first painted
  // frame is already below the viewport — no flash before the effect runs.
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current
  useEffect(() => {
    if (pickerOpen) {
      // Read fresh so a window resize between opens doesn't leave the sheet
      // partially visible (sheet max 85% could exceed the stale module height).
      sheetY.setValue(Dimensions.get('window').height)
      Animated.timing(sheetY, {
        toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start()
    }
  }, [pickerOpen, sheetY])

  const selected = findEntry(options, value)
  const showError = required && touched && !value
  const display = selected ? selected.label : value ? value : ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.code.toLowerCase().includes(q) || o.label.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q),
    )
  }, [options, query])

  // Close: slide the sheet back down, then unmount. Shared by the row tap,
  // close button, and back/overlay dismiss so the exit always animates.
  const closePicker = () => {
    Animated.timing(sheetY, {
      toValue: Dimensions.get('window').height, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => { setPickerOpen(false); setQuery('') })
  }

  const pick = (code: string) => {
    onChange(code)
    closePicker()
  }

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}{required ? <Text style={styles.asterisk}> *</Text> : null}
        </Text>
        <Pressable onPress={() => setHelpOpen(true)} hitSlop={10} style={styles.helpBtn} accessibilityRole="button" accessibilityLabel={`What is ${label}?`}>
          <Ionicons name="help-circle-outline" size={16} color={colors.azure} />
        </Pressable>
      </View>

      <Pressable
        disabled={disabled}
        onPress={() => { setTouched(true); setPickerOpen(true) }}
        style={[
          styles.row,
          showError && styles.rowError,
          disabled && styles.rowDisabled,
        ]}
      >
        {icon ? <Ionicons name={icon} size={18} color={showError ? colors.danger : colors.slate} style={styles.rowIcon} /> : null}
        <Text style={[styles.rowValue, !display && styles.rowPlaceholder]} numberOfLines={1}>
          {display || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.slate} />
      </Pressable>

      {showError ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={13} color={colors.danger} />
          <Text style={styles.error}>{label} is required.</Text>
        </View>
      ) : null}

      {/* Picker modal — scrim appears instantly, only the sheet slides up */}
      <Modal transparent visible={pickerOpen} animationType="none" onRequestClose={closePicker}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }], paddingBottom: space.xxl + safeBottom }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{label}</Text>
              <Pressable onPress={closePicker} hitSlop={10} style={styles.sheetClose}>
                <Ionicons name="close" size={22} color={colors.slate} />
              </Pressable>
            </View>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color={colors.slate} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={`Search ${options.length} options…`}
                placeholderTextColor={colors.slate}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={10} style={styles.searchClear}>
                  <Ionicons name="close-circle" size={16} color={colors.silver} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={styles.empty}>No matches for “{query}”.</Text>
              ) : (
                filtered.map((o) => {
                  const active = o.code === value
                  return (
                    <Pressable
                      key={o.code}
                      style={({ pressed }) => [styles.option, pressed && styles.optionPressed, active && styles.optionActive]}
                      onPress={() => pick(o.code)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionLabel} numberOfLines={2}>{o.label}</Text>
                        {o.description ? <Text style={styles.optionDesc} numberOfLines={2}>{o.description}</Text> : null}
                      </View>
                      {showCodeInList ? <Text style={styles.optionCode}>{o.code}</Text> : null}
                      {active ? <Ionicons name="checkmark-circle" size={18} color={colors.azure} style={styles.optionCheck} /> : null}
                    </Pressable>
                  )
                })
              )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Help (?) modal — explains every option */}
      <Modal transparent visible={helpOpen} animationType="fade" onRequestClose={() => setHelpOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setHelpOpen(false)}>
          <View style={styles.helpCard}>
            <View style={styles.helpHead}>
              <Ionicons name="information-circle-outline" size={20} color={colors.azure} />
              <Text style={styles.helpTitle} numberOfLines={1}>{label}</Text>
              <Pressable onPress={() => setHelpOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.slate} />
              </Pressable>
            </View>
            <Text style={styles.helpSub}>
              {options.length} option{options.length === 1 ? '' : 's'} — tap a value in the field to select it.
            </Text>
            <ScrollView style={styles.helpList}>
              {options.map((o) => (
                <View key={o.code} style={styles.helpRow}>
                  <Text style={styles.helpCode}>{o.code}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.helpLabel}>{o.label}</Text>
                    {o.description ? <Text style={styles.helpDesc}>{o.description}</Text> : null}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

export { codeLabel }

const styles = StyleSheet.create({
  field: { gap: space.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate },
  asterisk: { color: colors.danger },
  helpBtn: { padding: 4, marginLeft: 'auto' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.snow + 'CC', borderColor: colors.silver, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48,
  },
  rowError: { borderColor: colors.danger },
  rowDisabled: { opacity: 0.55 },
  rowIcon: { marginRight: space.sm },
  rowValue: { flex: 1, fontFamily: font.body, fontSize: 16, color: colors.ink },
  rowPlaceholder: { color: colors.slate },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 0 },
  error: { fontFamily: font.body, fontSize: 12, color: colors.danger },
  // ── picker modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(10, 37, 64, 0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.snow, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    maxHeight: '85%', paddingBottom: space.xxl, ...shadow.cardHigh,
  },
  // Grab handle — a small centered bar that signals the sheet is dismissible.
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.silver, alignSelf: 'center', marginTop: space.sm, marginBottom: space.xs },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.xs, paddingBottom: space.lg, paddingHorizontal: sheetPad, borderBottomWidth: 1, borderBottomColor: colors.silver + '55' },
  sheetTitle: { flex: 1, fontFamily: font.displayBold, fontSize: 18, color: colors.ink },
  sheetClose: { padding: 6 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, marginHorizontal: sheetPad, marginBottom: space.sm, backgroundColor: colors.mist, borderRadius: radius.md, paddingHorizontal: space.md },
  searchIcon: { marginRight: space.sm },
  searchInput: { flex: 1, fontFamily: font.body, fontSize: 16, color: colors.ink, paddingVertical: space.md },
  searchClear: { padding: 4 },
  list: { paddingHorizontal: sheetPad, paddingBottom: space.lg },
  empty: { fontFamily: font.body, fontSize: 14, color: colors.slate, textAlign: 'center', paddingVertical: space.xxl },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.silver + '33' },
  optionPressed: { backgroundColor: colors.mist },
  optionActive: { backgroundColor: colors.azure + '0F' },
  optionLabel: { fontFamily: font.bodyMedium, fontSize: 15, color: colors.ink },
  optionDesc: { fontFamily: font.body, fontSize: 12, color: colors.slate, marginTop: 2, lineHeight: 17 },
  optionCode: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate, backgroundColor: colors.mist, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, overflow: 'hidden' },
  optionCheck: { marginLeft: 4 },
  // ── help modal ──
  helpCard: {
    backgroundColor: colors.snow, borderRadius: radius.lg,
    width: '100%', maxWidth: 480, maxHeight: '80%', padding: space.xl, ...shadow.cardHigh,
  },
  helpHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  helpTitle: { flex: 1, fontFamily: font.displayBold, fontSize: 17, color: colors.ink },
  helpSub: { fontFamily: font.body, fontSize: 12, color: colors.slate, marginBottom: space.lg, lineHeight: 16 },
  helpList: { },
  helpRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.silver + '33' },
  helpCode: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.azure, backgroundColor: colors.azure + '14', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, overflow: 'hidden', minWidth: 36, textAlign: 'center' },
  helpLabel: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.ink },
  helpDesc: { fontFamily: font.body, fontSize: 12, color: colors.slate, marginTop: 2, lineHeight: 17 },
})