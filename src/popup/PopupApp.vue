<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createProfile, loadStorage, parseStorage, saveStorage, STORAGE_KEY } from '../shared/storage'
import { PROFILE_LABELS, type ContentResponse, type FillItemResult, type MatchRecord, type Profile, type StorageData } from '../shared/types'

const storage = ref<StorageData | null>(null)
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const status = ref('')
const preview = ref<MatchRecord[]>([])
const selected = ref(new Set<string>())
const previewUrl = ref('')

const currentProfile = computed<Profile | null>(() => storage.value?.profiles.find((profile) => profile.id === storage.value?.selectedProfileId) ?? null)
const canFill = computed(() => preview.value.some((field) => selected.value.has(field.fieldId) && field.eligible))

const storageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
  if (area !== 'local' || !changes[STORAGE_KEY]?.newValue) return
  storage.value = parseStorage(changes[STORAGE_KEY].newValue)
  invalidatePreview()
}

onMounted(async () => {
  try { storage.value = await loadStorage() }
  catch (reason) { error.value = readableError(reason, 'Could not load saved profiles.') }
  finally { loading.value = false }
  chrome.storage.onChanged.addListener(storageChanged)
})

onBeforeUnmount(() => chrome.storage.onChanged.removeListener(storageChanged))

watch(() => storage.value?.selectedProfileId, async (next, previous) => {
  if (!storage.value || next === previous) return
  invalidatePreview()
  await persist()
})

watch(() => storage.value?.settings.overwriteExisting, async (next, previous) => {
  if (!storage.value || next === previous) return
  invalidatePreview()
  await persist()
})

function readableError(reason: unknown, fallback: string): string {
  const message = reason instanceof Error ? reason.message : String(reason ?? '')
  if (/Cannot access|chrome:\/\/|edge:\/\/|extensions gallery/i.test(message)) return 'Chrome does not allow extensions to run on this page. Open a regular http(s) page.'
  if (/Receiving end does not exist/i.test(message)) return 'The page helper is unavailable. Reload the page and try again.'
  return message || fallback
}

function invalidatePreview(): void {
  preview.value = []
  selected.value = new Set()
  previewUrl.value = ''
  status.value = ''
}

async function persist(): Promise<void> {
  if (!storage.value) return
  try { await saveStorage(storage.value) }
  catch (reason) { error.value = readableError(reason, 'Could not save settings.') }
}

async function addProfile(): Promise<void> {
  if (!storage.value) return
  const profile = createProfile(`Profile ${storage.value.profiles.length + 1}`)
  storage.value.profiles.push(profile)
  storage.value.selectedProfileId = profile.id
  await persist()
  await chrome.runtime.openOptionsPage()
}

async function openOptions(): Promise<void> {
  await chrome.runtime.openOptionsPage()
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) throw new Error('No active browser tab is available.')
  const url = new URL(tab.url)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Chrome does not allow extensions to run on this page. Open a regular http(s) page.')
  return tab
}

async function send<T>(tabId: number, message: unknown): Promise<ContentResponse<T>> {
  return await chrome.tabs.sendMessage(tabId, message) as ContentResponse<T>
}

async function previewFields(): Promise<void> {
  if (!storage.value || !currentProfile.value) return
  busy.value = true; error.value = ''; status.value = ''; invalidatePreview()
  try {
    const tab = await activeTab()
    const url = new URL(tab.url!)
    await chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ['content.js'] })
    const mappings = storage.value.siteMappings.find((mapping) => mapping.origin === url.origin)?.mappings ?? []
    const response = await send<MatchRecord[]>(tab.id!, {
      type: 'MAF_PREVIEW', profileValues: currentProfile.value.values,
      overwriteExisting: storage.value.settings.overwriteExisting, origin: url.origin, mappings,
    })
    if (!response.ok) throw new Error(response.error || 'Preview failed.')
    preview.value = response.data ?? []
    previewUrl.value = response.pageUrl
    selected.value = new Set(preview.value.filter((field) => field.selectedByDefault).map((field) => field.fieldId))
    status.value = preview.value.length ? `${preview.value.length} matching field${preview.value.length === 1 ? '' : 's'} found.` : 'No supported matching fields were found.'
  } catch (reason) { error.value = readableError(reason, 'Could not inspect this page.') }
  finally { busy.value = false }
}

function toggle(id: string, checked: boolean): void {
  const next = new Set(selected.value)
  if (checked) next.add(id); else next.delete(id)
  selected.value = next
}

async function fillSelected(): Promise<void> {
  if (!storage.value || !canFill.value) return
  busy.value = true; error.value = ''; status.value = ''
  try {
    const tab = await activeTab()
    if (tab.url !== previewUrl.value) throw new Error('The page changed after preview. Preview fields again.')
    const url = new URL(tab.url!)
    const items = preview.value.filter((field) => selected.value.has(field.fieldId) && field.eligible).map((field) => ({
      fieldId: field.fieldId, profileKey: field.profileKey, value: field.proposedValue, fingerprint: field.fingerprint,
    }))
    const response = await send<FillItemResult[]>(tab.id!, {
      type: 'MAF_FILL', items, overwriteExisting: storage.value.settings.overwriteExisting, origin: url.origin,
    })
    if (!response.ok) throw new Error(response.error || 'Fill failed.')
    const results = response.data ?? []
    const filled = results.filter((item) => item.filled).length
    const skipped = results.length - filled
    const reasons = [...new Set(results.filter((item) => !item.filled).map((item) => item.reason))]
    status.value = `Filled ${filled}; skipped ${skipped}.${reasons.length ? ` ${reasons.join('; ')}.` : ''} Review the form before submitting.`
    preview.value = []
    selected.value = new Set()
  } catch (reason) { error.value = readableError(reason, 'Could not fill this page.') }
  finally { busy.value = false }
}
</script>

<template>
  <main class="popup">
    <header class="popup-header">
      <h1>My Form Autofill</h1>
      <p class="muted">Preview first, then choose exactly what to fill.</p>
    </header>

    <div v-if="loading" class="status" role="status">Loading profiles…</div>
    <template v-else-if="storage">
      <section class="stack">
        <div class="row spread">
          <label for="profile">Profile</label>
          <button class="text-link" type="button" @click="addProfile">+ New profile</button>
        </div>
        <select id="profile" v-model="storage.selectedProfileId" :disabled="busy || !storage.profiles.length">
          <option v-if="!storage.profiles.length" :value="null">No profiles yet</option>
          <option v-for="profile in storage.profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
        </select>
        <label class="switch">
          <span>Overwrite existing values <span class="muted">(off by default)</span></span>
          <input v-model="storage.settings.overwriteExisting" type="checkbox" role="switch" :disabled="busy" />
        </label>
      </section>

      <div class="actions">
        <button type="button" :disabled="busy || !currentProfile" @click="previewFields">{{ busy ? 'Working…' : 'Preview fields' }}</button>
        <button class="primary" type="button" :disabled="busy || !canFill" @click="fillSelected">Fill selected fields</button>
      </div>

      <div v-if="error" class="status error" role="alert">{{ error }}</div>
      <div v-else-if="status" class="status" :class="{ success: status.startsWith('Filled') }" role="status">{{ status }}</div>

      <section v-if="preview.length" class="preview-list" aria-label="Matched fields">
        <label v-for="field in preview" :key="field.fieldId" class="preview-item">
          <input type="checkbox" :checked="selected.has(field.fieldId)" :disabled="!field.eligible || busy" @change="toggle(field.fieldId, ($event.target as HTMLInputElement).checked)" />
          <span>
            <span class="preview-title">{{ field.displayLabel }} · {{ PROFILE_LABELS[field.profileKey] }}</span>
            <span class="preview-value">{{ field.proposedValue || '(blank in profile)' }}</span>
            <span class="preview-reason" :class="{ warning: !field.eligible || field.confidence < .7 }">{{ field.skipReason || `${Math.round(field.confidence * 100)}% · ${field.reason}` }}</span>
          </span>
        </label>
      </section>
      <div v-else-if="!currentProfile" class="empty card">Create a profile, add your details in settings, then return here.</div>

      <button class="text-link" type="button" @click="openOptions">Profiles and website mappings</button>
    </template>
  </main>
</template>
