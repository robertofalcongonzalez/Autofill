import { collectMatches, fillItems, type SupportedControl } from './dom'
import type { ContentMessage, ContentResponse, FillItemResult, MatchRecord } from '../shared/types'

declare global { interface Window { __myFormAutofillInstalled?: boolean } }

if (!window.__myFormAutofillInstalled) {
  window.__myFormAutofillInstalled = true
  const elements = new Map<string, SupportedControl>()
  let nextId = 1
  const ids = new WeakMap<SupportedControl, string>()

  const register = (element: SupportedControl): string => {
    let id = ids.get(element)
    if (!id) { id = `maf-${nextId++}`; ids.set(element, id) }
    elements.set(id, element)
    return id
  }

  chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
    const reply = <T>(response: Omit<ContentResponse<T>, 'pageUrl'>) => sendResponse({ ...response, pageUrl: location.href })
    try {
      if (!message || (message.type !== 'MAF_PREVIEW' && message.type !== 'MAF_FILL')) return false
      if (location.origin !== message.origin) {
        reply({ ok: false, error: 'The page navigated to a different origin. Preview again.' })
        return false
      }
      if (message.type === 'MAF_PREVIEW') {
        elements.clear()
        const records = collectMatches(message.profileValues, message.mappings, message.overwriteExisting, register)
        reply<MatchRecord[]>({ ok: true, data: records })
      } else {
        const results = fillItems(message.items, message.overwriteExisting, (id) => elements.get(id) ?? null)
        reply<FillItemResult[]>({ ok: true, data: results })
      }
    } catch (error) {
      reply({ ok: false, error: error instanceof Error ? error.message : 'Unexpected page error' })
    }
    return false
  })
}
