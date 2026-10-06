import { isSensitiveAutocomplete, matchHints, normalizeHint } from './matching'
import type {
  FieldFingerprint, FillItemResult, FillRequestItem, MatchRecord, ProfileKey, SiteMappingEntry,
} from '../shared/types'

export type SupportedControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const inputTypes = new Set(['text', 'email', 'tel', 'url'])
const blockedSemanticHints = new Set([
  'card number', 'cardnumber', 'credit card', 'creditcard', 'cc number', 'cvc', 'cvv',
  'security code', 'one time code', 'otp', 'password', 'search',
])

function hasBlockedMeaning(element: SupportedControl): boolean {
  const hints = [
    element.getAttribute('name') ?? '', element.id, element.getAttribute('aria-label') ?? '',
    element.getAttribute('placeholder') ?? '', getLabel(element),
  ]
  return hints.some((hint) => blockedSemanticHints.has(normalizeHint(hint)))
}

export function isVisible(element: HTMLElement): boolean {
  if (element.hidden || element.closest('[hidden], [aria-hidden="true"]')) return false
  const style = getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return element.getClientRects().length > 0 || style.position === 'fixed'
}

export function eligibility(element: Element): { eligible: boolean; reason?: string } {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return { eligible: false, reason: 'Unsupported control' }
  if (!isVisible(element)) return { eligible: false, reason: 'Field is hidden' }
  if (element.disabled) return { eligible: false, reason: 'Field is disabled' }
  if (element instanceof HTMLInputElement && !inputTypes.has(element.type.toLowerCase())) return { eligible: false, reason: `Input type ${element.type} is not supported` }
  if ('readOnly' in element && element.readOnly) return { eligible: false, reason: 'Field is read-only' }
  if (element instanceof HTMLInputElement && isSensitiveAutocomplete(element.autocomplete)) return { eligible: false, reason: 'Sensitive fields are not supported' }
  if (hasBlockedMeaning(element)) return { eligible: false, reason: 'Sensitive or unrelated field is not supported' }
  return { eligible: true }
}

export function getLabel(element: SupportedControl): string {
  const labels = 'labels' in element && element.labels ? Array.from(element.labels).map((item) => item.textContent?.trim()).filter(Boolean) : []
  if (labels.length) return labels.join(' ')
  const labelledBy = element.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ')
  const placeholder = element instanceof HTMLSelectElement ? '' : element.placeholder.trim()
  return labelledBy || element.getAttribute('aria-label')?.trim() || placeholder || element.name || element.id || 'Unlabeled field'
}

function attributesFor(element: SupportedControl): string[] {
  const labelledBy = element.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') ?? ''
  return [element.name, element.id, element.getAttribute('aria-label') ?? '', labelledBy, element.getAttribute('placeholder') ?? ''].filter(Boolean)
}

export function fingerprint(element: SupportedControl): FieldFingerprint {
  return {
    tag: element.tagName.toLowerCase() as FieldFingerprint['tag'],
    type: element instanceof HTMLInputElement ? element.type.toLowerCase() : '',
    id: element.id,
    name: element.getAttribute('name') ?? '',
    autocomplete: element.getAttribute('autocomplete') ?? '',
    label: getLabel(element),
  }
}

function findMappedFields(mappings: SiteMappingEntry[]): Map<SupportedControl, ProfileKey> {
  const result = new Map<SupportedControl, ProfileKey>()
  for (const mapping of mappings) {
    let matches: NodeListOf<Element>
    try { matches = document.querySelectorAll(mapping.selector) } catch { continue }
    for (const match of matches) {
      if (match instanceof HTMLInputElement || match instanceof HTMLTextAreaElement || match instanceof HTMLSelectElement) {
        if (!result.has(match)) result.set(match, mapping.profileKey)
      }
    }
  }
  return result
}

export function collectMatches(
  profileValues: Record<ProfileKey, string>, mappings: SiteMappingEntry[], overwriteExisting: boolean,
  register: (element: SupportedControl) => string,
): MatchRecord[] {
  const mapped = findMappedFields(mappings)
  const controls = Array.from(document.querySelectorAll('input, textarea, select')) as SupportedControl[]
  return controls.flatMap((element) => {
    const baseEligibility = eligibility(element)
    if (!baseEligibility.eligible) return []
    const mappedKey = mapped.get(element)
    const detected = mappedKey
      ? { profileKey: mappedKey, confidence: 1, reason: 'website-specific selector mapping', source: 'mapping' as const }
      : matchHints(element.getAttribute('autocomplete') ?? '', getLabel(element), attributesFor(element))
    if (!detected) return []
    const proposedValue = profileValues[detected.profileKey]
    const currentValue = element.value
    let eligible = true
    let skipReason: string | undefined
    if (!proposedValue) { eligible = false; skipReason = 'Profile value is blank' }
    else if (currentValue && !overwriteExisting) { eligible = false; skipReason = 'Existing value is preserved' }
    const record: MatchRecord = {
      fieldId: register(element), displayLabel: getLabel(element), profileKey: detected.profileKey,
      proposedValue, confidence: detected.confidence, reason: detected.reason, source: detected.source,
      currentValue, isEmpty: currentValue.length === 0, eligible,
      selectedByDefault: eligible && detected.confidence >= 0.7,
      fingerprint: fingerprint(element),
    }
    if (skipReason) record.skipReason = skipReason
    return [record]
  })
}

function resolveByFingerprint(target: FieldFingerprint): SupportedControl | null {
  const candidates = (Array.from(document.querySelectorAll(target.tag)) as SupportedControl[]).filter((element) => {
    const current = fingerprint(element)
    return (!target.id || current.id === target.id)
      && (!target.name || current.name === target.name)
      && current.type === target.type
      && current.autocomplete === target.autocomplete
      && normalizeHint(current.label) === normalizeHint(target.label)
  })
  return candidates.length === 1 ? candidates[0]! : null
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter) setter.call(element, value)
  else element.value = value
}

export function selectValue(element: HTMLSelectElement, value: string): boolean {
  const wanted = normalizeHint(value)
  const matches = Array.from(element.options).filter((option) => !option.disabled && (normalizeHint(option.value) === wanted || normalizeHint(option.text) === wanted))
  const distinct = new Set(matches.map((option) => option.value))
  if (matches.length === 0 || distinct.size !== 1) return false
  element.value = matches[0]!.value
  return true
}

export function fillItems(
  items: FillRequestItem[], overwriteExisting: boolean, lookup: (id: string) => SupportedControl | null,
): FillItemResult[] {
  return items.map((item) => {
    let element = lookup(item.fieldId)
    if (!element?.isConnected) element = resolveByFingerprint(item.fingerprint)
    if (!element) return { fieldId: item.fieldId, filled: false, reason: 'Field was removed or replaced and could not be identified safely' }
    const status = eligibility(element)
    if (!status.eligible) return { fieldId: item.fieldId, filled: false, reason: status.reason ?? 'Field is no longer eligible' }
    if (element.value && !overwriteExisting) return { fieldId: item.fieldId, filled: false, reason: 'Existing value is preserved' }
    if (!item.value) return { fieldId: item.fieldId, filled: false, reason: 'Profile value is blank' }
    if (element instanceof HTMLSelectElement) {
      if (!selectValue(element, item.value)) return { fieldId: item.fieldId, filled: false, reason: 'No unambiguous select option matched' }
    } else setNativeValue(element, item.value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return { fieldId: item.fieldId, filled: true, reason: 'Filled' }
  })
}
