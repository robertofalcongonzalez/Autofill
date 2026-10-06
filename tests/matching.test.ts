import { describe, expect, it } from 'vitest'
import { matchHints, normalizeHint, parseAutocomplete } from '../src/content/matching'

describe('autocomplete matching', () => {
  it('parses section and address mode prefixes', () => {
    expect(parseAutocomplete('section-blue shipping address-line1').field).toBe('streetAddress')
    expect(parseAutocomplete('billing postal-code').field).toBe('postalCode')
  })

  it('gives autocomplete precedence over a conflicting label', () => {
    expect(matchHints('given-name', 'Last name', ['surname'])).toMatchObject({ profileKey: 'firstName', source: 'autocomplete', confidence: 1 })
  })

  it('detects sensitive autocomplete fields', () => {
    expect(parseAutocomplete('section-login current-password')).toMatchObject({ field: null, sensitive: true })
  })
})

describe('multilingual aliases', () => {
  it.each([
    ['First name', 'firstName'], ['apellido', 'lastName'], ['telefone', 'phone'],
    ['cidade', 'city'], ['província', 'state'], ['CEP', 'postalCode'], ['código postal', 'postalCode'],
  ])('matches %s', (label, expected) => {
    expect(matchHints('', label, [])?.profileKey).toBe(expected)
  })

  it('normalizes accents, separators, and camelCase', () => {
    expect(normalizeHint('Código_Postal')).toBe('codigo postal')
    expect(normalizeHint('firstName')).toBe('first name')
  })

  it('does not use broad substring matching', () => {
    expect(matchHints('', 'Username', ['username'])).toBeNull()
    expect(matchHints('', 'City tax number', ['city-tax-number'])).toBeNull()
  })

  it('marks generic name as uncertain', () => {
    expect(matchHints('', 'Name', [])).toMatchObject({ profileKey: 'fullName', confidence: 0.45 })
  })
})
