import { describe, expect, it } from 'vitest'
import { defaultStorage, parseStorage, validateSiteMapping } from '../src/shared/storage'

describe('storage validation', () => {
  it('recovers from missing or corrupted storage', () => {
    expect(parseStorage(null)).toEqual(defaultStorage())
    expect(parseStorage({ version: 99, profiles: 'bad' })).toEqual(defaultStorage())
  })

  it('cleans malformed nested values and selection', () => {
    const parsed = parseStorage({
      version: 1,
      profiles: [{ id: 'one', name: '', values: { email: 123, phone: '+55' } }, { nope: true }],
      selectedProfileId: 'missing', settings: { overwriteExisting: 'yes' }, siteMappings: [{ origin: 'javascript:bad', mappings: [] }],
    })
    expect(parsed.profiles).toHaveLength(1)
    expect(parsed.profiles[0]?.name).toBe('Unnamed profile')
    expect(parsed.profiles[0]?.values.email).toBe('')
    expect(parsed.selectedProfileId).toBe('one')
    expect(parsed.siteMappings).toEqual([])
    expect(parsed.settings.overwriteExisting).toBe(false)
  })

  it('reports invalid origins, selectors, and conflicts', () => {
    const errors = validateSiteMapping({ origin: 'https://example.com/path', mappings: [
      { selector: '[', profileKey: 'email' },
      { selector: '#same', profileKey: 'email' },
      { selector: '#same', profileKey: 'phone' },
    ] })
    expect(errors.map((error) => error.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('exact http(s) origin'), expect.stringContaining('valid CSS'), expect.stringContaining('conflicting'),
    ]))
  })
})
