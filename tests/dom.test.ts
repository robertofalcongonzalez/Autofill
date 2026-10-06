import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectMatches, eligibility, fillItems, fingerprint, selectValue } from '../src/content/dom'
import { emptyValues } from '../src/shared/storage'

describe('DOM matching and filling', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('skips ineligible and unrelated controls', () => {
    document.body.innerHTML = `
      <input id="password" type="password" autocomplete="current-password">
      <input id="hidden" type="hidden" name="email">
      <input id="disabled" disabled autocomplete="email">
      <input id="readonly" readonly autocomplete="email">
      <input id="search" type="search" name="email">
      <input id="checkbox" type="checkbox" name="email">
      <input id="card" type="text" name="card_number">
      <input id="otp" type="text" aria-label="OTP">
      <input id="ok" type="email" autocomplete="email">
    `
    for (const id of ['password', 'hidden', 'disabled', 'readonly', 'search', 'checkbox', 'card', 'otp']) {
      expect(eligibility(document.getElementById(id)! as HTMLInputElement).eligible).toBe(false)
    }
    expect(eligibility(document.getElementById('ok')!).eligible).toBe(true)
  })

  it('uses a custom mapping before autocomplete and preserves existing values by default', () => {
    document.body.innerHTML = '<label for="target">Email</label><input id="target" autocomplete="email" value="kept">'
    const values = emptyValues(); values.phone = '+55 (11) 99999-0000'; values.email = 'new@example.com'
    const records = collectMatches(values, [{ selector: '#target', profileKey: 'phone' }], false, () => 'one')
    expect(records[0]).toMatchObject({ profileKey: 'phone', proposedValue: '+55 (11) 99999-0000', eligible: false, skipReason: 'Existing value is preserved', source: 'mapping' })
  })

  it('preserves supplied phone and postal formatting', () => {
    document.body.innerHTML = '<input id="phone" autocomplete="tel"><input id="zip" autocomplete="postal-code">'
    const values = emptyValues(); values.phone = '+55 (11) 99999-0000'; values.postalCode = '01.234-567'
    const records = collectMatches(values, [], false, (element) => element.id)
    const results = fillItems(records.map((record) => ({ fieldId: record.fieldId, profileKey: record.profileKey, value: record.proposedValue, fingerprint: record.fingerprint })), false, (id) => document.getElementById(id) as HTMLInputElement)
    expect(results.every((result) => result.filled)).toBe(true)
    expect((document.getElementById('phone') as HTMLInputElement).value).toBe('+55 (11) 99999-0000')
    expect((document.getElementById('zip') as HTMLInputElement).value).toBe('01.234-567')
  })

  it('dispatches bubbling input and change events through the native setter', () => {
    document.body.innerHTML = '<input id="email" autocomplete="email">'
    const input = document.querySelector('input')!
    const inputListener = vi.fn(); const changeListener = vi.fn()
    document.body.addEventListener('input', inputListener); document.body.addEventListener('change', changeListener)
    const item = { fieldId: 'email', profileKey: 'email' as const, value: 'a@b.test', fingerprint: fingerprint(input) }
    expect(fillItems([item], false, () => input)[0]?.filled).toBe(true)
    expect(inputListener).toHaveBeenCalledOnce(); expect(changeListener).toHaveBeenCalledOnce()
  })

  it('matches selects exactly and never chooses an ambiguous option', () => {
    document.body.innerHTML = '<select><option value="">Choose</option><option value="BR">Brazil</option></select>'
    const select = document.querySelector('select')!
    expect(selectValue(select, 'brazil')).toBe(true)
    expect(select.value).toBe('BR')
    document.body.innerHTML = '<select><option value="one">Springfield</option><option value="two">Springfield</option></select>'
    expect(selectValue(document.querySelector('select')!, 'Springfield')).toBe(false)
  })

  it('conservatively re-identifies a replaced field', () => {
    document.body.innerHTML = '<label for="city">City</label><input id="city" name="city">'
    const old = document.querySelector('input')!
    const item = { fieldId: 'x', profileKey: 'city' as const, value: 'Recife', fingerprint: fingerprint(old) }
    old.remove()
    document.body.insertAdjacentHTML('beforeend', '<input id="city" name="city">')
    expect(fillItems([item], false, () => old)[0]).toMatchObject({ filled: true })
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('Recife')
  })

  it('skips removed fields when replacement is ambiguous', () => {
    document.body.innerHTML = '<input name="city" aria-label="City">'
    const old = document.querySelector('input')!
    const item = { fieldId: 'x', profileKey: 'city' as const, value: 'Recife', fingerprint: fingerprint(old) }
    old.remove()
    document.body.innerHTML = '<input name="city" aria-label="City"><input name="city" aria-label="City">'
    expect(fillItems([item], false, () => old)[0]).toMatchObject({ filled: false, reason: expect.stringContaining('could not be identified') })
  })
})
