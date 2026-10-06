import { PROFILE_KEYS, type Profile, type ProfileKey, type SiteMapping, type StorageData } from './types'

export const STORAGE_KEY = 'myFormAutofill'
export const STORAGE_VERSION = 1 as const

export function emptyValues(): Record<ProfileKey, string> {
  return Object.fromEntries(PROFILE_KEYS.map((key) => [key, ''])) as Record<ProfileKey, string>
}

export function createProfile(name = 'My profile'): Profile {
  return { id: crypto.randomUUID(), name, values: emptyValues() }
}

export function defaultStorage(): StorageData {
  return {
    version: STORAGE_VERSION,
    profiles: [],
    selectedProfileId: null,
    settings: { overwriteExisting: false },
    siteMappings: [],
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanProfile(value: unknown): Profile | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !isObject(value.values)) return null
  const values = emptyValues()
  for (const key of PROFILE_KEYS) {
    const candidate = value.values[key]
    values[key] = typeof candidate === 'string' ? candidate : ''
  }
  return { id: value.id, name: value.name.trim() || 'Unnamed profile', values }
}

export function isProfileKey(value: unknown): value is ProfileKey {
  return typeof value === 'string' && (PROFILE_KEYS as readonly string[]).includes(value)
}

function cleanSiteMapping(value: unknown): SiteMapping | null {
  if (!isObject(value) || typeof value.origin !== 'string' || !Array.isArray(value.mappings)) return null
  let origin: string
  try {
    const parsed = new URL(value.origin)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value.origin) return null
    origin = parsed.origin
  } catch { return null }
  const mappings = value.mappings.flatMap((entry) => {
    if (!isObject(entry) || typeof entry.selector !== 'string' || !isProfileKey(entry.profileKey)) return []
    return [{ selector: entry.selector, profileKey: entry.profileKey }]
  })
  return { origin, mappings }
}

export function parseStorage(value: unknown): StorageData {
  if (!isObject(value) || value.version !== STORAGE_VERSION) return defaultStorage()
  const profiles = Array.isArray(value.profiles) ? value.profiles.map(cleanProfile).filter((p): p is Profile => p !== null) : []
  const selected = typeof value.selectedProfileId === 'string' && profiles.some((p) => p.id === value.selectedProfileId)
    ? value.selectedProfileId : profiles[0]?.id ?? null
  return {
    version: STORAGE_VERSION,
    profiles,
    selectedProfileId: selected,
    settings: { overwriteExisting: isObject(value.settings) && value.settings.overwriteExisting === true },
    siteMappings: Array.isArray(value.siteMappings)
      ? value.siteMappings.map(cleanSiteMapping).filter((m): m is SiteMapping => m !== null)
      : [],
  }
}

export async function loadStorage(): Promise<StorageData> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return parseStorage(result[STORAGE_KEY])
}

export async function saveStorage(data: StorageData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: parseStorage(data) })
}

export interface MappingValidationError { index?: number; message: string }

export function validateSiteMapping(mapping: SiteMapping): MappingValidationError[] {
  const errors: MappingValidationError[] = []
  try {
    const url = new URL(mapping.origin)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== mapping.origin) {
      errors.push({ message: 'Origin must be only an exact http(s) origin, such as https://example.com.' })
    }
  } catch { errors.push({ message: 'Enter a valid http(s) origin.' }) }

  const selectors = new Map<string, ProfileKey>()
  mapping.mappings.forEach((entry, index) => {
    if (!entry.selector.trim()) errors.push({ index, message: 'Selector cannot be blank.' })
    else {
      try { document.createDocumentFragment().querySelector(entry.selector) }
      catch { errors.push({ index, message: 'Selector is not valid CSS.' }) }
    }
    const existing = selectors.get(entry.selector)
    if (existing && existing !== entry.profileKey) errors.push({ index, message: 'This selector is mapped to conflicting profile fields.' })
    selectors.set(entry.selector, entry.profileKey)
  })
  return errors
}
