export const PROFILE_KEYS = [
  'fullName', 'firstName', 'lastName', 'email', 'phone', 'company',
  'streetAddress', 'addressComplement', 'city', 'state', 'postalCode', 'country',
] as const

export type ProfileKey = (typeof PROFILE_KEYS)[number]

export interface Profile {
  id: string
  name: string
  values: Record<ProfileKey, string>
}

export interface SiteMappingEntry {
  selector: string
  profileKey: ProfileKey
}

export interface SiteMapping {
  origin: string
  mappings: SiteMappingEntry[]
}

export interface Settings {
  overwriteExisting: boolean
}

export interface StorageData {
  version: 1
  profiles: Profile[]
  selectedProfileId: string | null
  settings: Settings
  siteMappings: SiteMapping[]
}

export type MatchSource = 'mapping' | 'autocomplete' | 'label' | 'attribute'

export interface FieldFingerprint {
  tag: 'input' | 'textarea' | 'select'
  type: string
  id: string
  name: string
  autocomplete: string
  label: string
}

export interface MatchRecord {
  fieldId: string
  displayLabel: string
  profileKey: ProfileKey
  proposedValue: string
  confidence: number
  reason: string
  source: MatchSource
  currentValue: string
  isEmpty: boolean
  eligible: boolean
  skipReason?: string
  selectedByDefault: boolean
  fingerprint: FieldFingerprint
}

export interface FillRequestItem {
  fieldId: string
  profileKey: ProfileKey
  value: string
  fingerprint: FieldFingerprint
}

export interface FillItemResult {
  fieldId: string
  filled: boolean
  reason: string
}

export interface PreviewMessage {
  type: 'MAF_PREVIEW'
  profileValues: Record<ProfileKey, string>
  overwriteExisting: boolean
  origin: string
  mappings: SiteMappingEntry[]
}

export interface FillMessage {
  type: 'MAF_FILL'
  items: FillRequestItem[]
  overwriteExisting: boolean
  origin: string
}

export type ContentMessage = PreviewMessage | FillMessage

export interface ContentResponse<T> {
  ok: boolean
  data?: T
  error?: string
  pageUrl: string
}

export const PROFILE_LABELS: Record<ProfileKey, string> = {
  fullName: 'Full name', firstName: 'First name', lastName: 'Last name', email: 'Email',
  phone: 'Phone', company: 'Company', streetAddress: 'Street address',
  addressComplement: 'Address complement', city: 'City', state: 'State / province',
  postalCode: 'Postal code', country: 'Country',
}
