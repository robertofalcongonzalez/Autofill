import type { ProfileKey } from '../shared/types'

export interface MatchCandidate {
  profileKey: ProfileKey
  confidence: number
  reason: string
  source: 'autocomplete' | 'label' | 'attribute'
}

const AUTOCOMPLETE_MAP: Partial<Record<string, ProfileKey>> = {
  name: 'fullName', 'given-name': 'firstName', 'family-name': 'lastName', email: 'email',
  tel: 'phone', organization: 'company', 'street-address': 'streetAddress',
  'address-line1': 'streetAddress', 'address-line2': 'addressComplement',
  'address-level2': 'city', 'address-level1': 'state', 'postal-code': 'postalCode',
  country: 'country', 'country-name': 'country',
}

const SENSITIVE_AUTOCOMPLETE = new Set([
  'current-password', 'new-password', 'one-time-code', 'cc-name', 'cc-given-name',
  'cc-family-name', 'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc', 'cc-type',
])

const aliases: Record<ProfileKey, string[]> = {
  fullName: ['full name', 'complete name', 'nombre completo', 'nome completo', 'contact name'],
  firstName: ['first name', 'given name', 'nombre', 'primer nombre', 'nome', 'primeiro nome'],
  lastName: ['last name', 'family name', 'surname', 'apellido', 'apellidos', 'sobrenome'],
  email: ['email', 'email address', 'e mail', 'correo electronico', 'correo', 'endereco de email'],
  phone: ['phone', 'phone number', 'telephone', 'mobile', 'telefono', 'numero de telefono', 'telefone', 'celular'],
  company: ['company', 'company name', 'organization', 'business', 'empresa', 'companhia', 'organizacao'],
  streetAddress: ['street address', 'address line 1', 'address', 'direccion', 'direccion postal', 'calle', 'endereco', 'logradouro', 'rua'],
  addressComplement: ['address line 2', 'apartment', 'apt suite', 'suite', 'unit', 'complemento', 'complemento de endereco', 'apartamento'],
  city: ['city', 'town', 'ciudad', 'localidad', 'cidade', 'municipio'],
  state: ['state', 'state province', 'province', 'region', 'estado', 'provincia', 'uf'],
  postalCode: ['postal code', 'zip code', 'zip', 'codigo postal', 'cep'],
  country: ['country', 'country region', 'pais'],
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function normalizeHint(value: string): string {
  return stripAccents(value)
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_\-.:[\](){}\/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseAutocomplete(value: string): { field: ProfileKey | null; token: string | null; sensitive: boolean } {
  const tokens = value.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!tokens.length || tokens.includes('off') || tokens.includes('on')) return { field: null, token: null, sensitive: false }
  let semantic: string | null = null
  for (let index = tokens.length - 1; index >= 0; index--) {
    const token = tokens[index]!
    if (AUTOCOMPLETE_MAP[token] || SENSITIVE_AUTOCOMPLETE.has(token)) { semantic = token; break }
  }
  return {
    field: semantic ? AUTOCOMPLETE_MAP[semantic] ?? null : null,
    token: semantic,
    sensitive: semantic ? SENSITIVE_AUTOCOMPLETE.has(semantic) : false,
  }
}

function exactAlias(value: string): ProfileKey[] {
  const normalized = normalizeHint(value)
  return (Object.entries(aliases) as [ProfileKey, string[]][])
    .filter(([, choices]) => choices.includes(normalized))
    .map(([key]) => key)
}

export function matchHints(autocomplete: string, label: string, attributes: string[]): MatchCandidate | null {
  const auto = parseAutocomplete(autocomplete)
  if (auto.field) return { profileKey: auto.field, confidence: 1, reason: `autocomplete=\"${auto.token}\"`, source: 'autocomplete' }
  if (auto.sensitive) return null

  const labelMatches = exactAlias(label)
  if (labelMatches.length === 1) {
    const key = labelMatches[0]!
    const genericName = normalizeHint(label) === 'name'
    return { profileKey: key, confidence: genericName ? 0.45 : 0.9, reason: genericName ? 'generic name label' : `label \"${label.trim()}\"`, source: 'label' }
  }
  if (normalizeHint(label) === 'name') return { profileKey: 'fullName', confidence: 0.45, reason: 'generic name label', source: 'label' }

  for (const attribute of attributes) {
    const matches = exactAlias(attribute)
    if (matches.length === 1) return { profileKey: matches[0]!, confidence: 0.76, reason: `field attribute \"${attribute.trim()}\"`, source: 'attribute' }
  }
  return null
}

export function isSensitiveAutocomplete(value: string): boolean {
  return parseAutocomplete(value).sensitive
}
