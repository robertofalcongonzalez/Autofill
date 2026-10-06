<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { createProfile, loadStorage, saveStorage, validateSiteMapping } from '../shared/storage'
import { PROFILE_KEYS, PROFILE_LABELS, type Profile, type SiteMapping, type StorageData } from '../shared/types'

const storage = ref<StorageData | null>(null)
const activeId = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const status = ref('')
const error = ref('')
const mappingErrors = ref<Record<string, string[]>>({})

const activeProfile = computed<Profile | null>(() => storage.value?.profiles.find((profile) => profile.id === activeId.value) ?? null)

onMounted(async () => {
  try {
    storage.value = await loadStorage()
    activeId.value = storage.value.selectedProfileId ?? storage.value.profiles[0]?.id ?? null
  } catch (reason) { error.value = message(reason, 'Could not load settings.') }
  finally { loading.value = false }
})

function message(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

function addProfile(): void {
  if (!storage.value) return
  const profile = createProfile(`Profile ${storage.value.profiles.length + 1}`)
  storage.value.profiles.push(profile)
  storage.value.selectedProfileId = profile.id
  activeId.value = profile.id
}

function selectProfile(id: string): void {
  activeId.value = id
  if (storage.value) storage.value.selectedProfileId = id
}

function deleteProfile(): void {
  if (!storage.value || !activeProfile.value) return
  if (!confirm(`Delete “${activeProfile.value.name}”? This cannot be undone.`)) return
  storage.value.profiles = storage.value.profiles.filter((profile) => profile.id !== activeId.value)
  activeId.value = storage.value.profiles[0]?.id ?? null
  storage.value.selectedProfileId = activeId.value
}

function addSite(): void {
  storage.value?.siteMappings.push({ origin: '', mappings: [{ selector: '', profileKey: 'fullName' }] })
}

function addMapping(site: SiteMapping): void {
  site.mappings.push({ selector: '', profileKey: 'fullName' })
}

function removeSite(index: number): void { storage.value?.siteMappings.splice(index, 1) }
function removeMapping(site: SiteMapping, index: number): void { site.mappings.splice(index, 1) }

function validateMappings(): boolean {
  if (!storage.value) return false
  const next: Record<string, string[]> = {}
  const origins = new Set<string>()
  storage.value.siteMappings.forEach((site, siteIndex) => {
    const key = String(siteIndex)
    next[key] = validateSiteMapping(site).map((issue) => issue.index === undefined ? issue.message : `Mapping ${issue.index + 1}: ${issue.message}`)
    if (origins.has(site.origin)) next[key]!.push('This origin appears more than once. Keep its selectors in one site entry.')
    origins.add(site.origin)
    if (!site.mappings.length) next[key]!.push('Add at least one selector mapping.')
  })
  mappingErrors.value = next
  return Object.values(next).every((items) => items.length === 0)
}

async function save(): Promise<void> {
  if (!storage.value) return
  status.value = ''; error.value = ''
  if (storage.value.profiles.some((profile) => !profile.name.trim())) {
    error.value = 'Every profile needs a name.'
    return
  }
  if (!validateMappings()) {
    error.value = 'Fix the website mapping errors before saving.'
    return
  }
  saving.value = true
  try {
    await saveStorage(storage.value)
    status.value = 'Settings saved locally.'
  } catch (reason) { error.value = message(reason, 'Could not save settings.') }
  finally { saving.value = false }
}
</script>

<template>
  <main class="options">
    <header class="options-header">
      <h1>My Form Autofill settings</h1>
      <p class="muted">Profiles stay in this browser’s local extension storage.</p>
    </header>

    <div v-if="loading" class="status" role="status">Loading settings…</div>
    <template v-else-if="storage">
      <section class="card stack">
        <div class="row spread">
          <div><h2>Profiles</h2><span class="muted">Create, rename, and edit your saved details.</span></div>
          <button class="primary" type="button" @click="addProfile">Add profile</button>
        </div>
        <div class="profile-layout">
          <nav class="profile-list" aria-label="Profiles">
            <button v-for="profile in storage.profiles" :key="profile.id" type="button" :class="{ active: activeId === profile.id }" @click="selectProfile(profile.id)">{{ profile.name }}</button>
            <div v-if="!storage.profiles.length" class="muted">No profiles yet.</div>
          </nav>
          <div v-if="activeProfile" class="editor">
            <div class="control">
              <label for="profile-name">Profile name</label>
              <input id="profile-name" v-model="activeProfile.name" autocomplete="off" />
            </div>
            <div class="field-grid">
              <div v-for="key in PROFILE_KEYS" :key="key" class="control">
                <label :for="`profile-${key}`">{{ PROFILE_LABELS[key] }}</label>
                <input :id="`profile-${key}`" v-model="activeProfile.values[key]" autocomplete="off" />
              </div>
            </div>
            <div><button class="danger" type="button" @click="deleteProfile">Delete profile</button></div>
          </div>
          <div v-else class="empty muted">Add a profile to enter your information.</div>
        </div>
      </section>

      <section class="card stack">
        <div class="row spread">
          <div><h2>Website-specific mappings</h2><span class="muted">Exact origins and CSS selectors only. No JavaScript is evaluated.</span></div>
          <button type="button" @click="addSite">Add website</button>
        </div>
        <article v-for="(site, siteIndex) in storage.siteMappings" :key="siteIndex" class="mapping">
          <div class="row spread">
            <div class="control" style="flex: 1">
              <label :for="`origin-${siteIndex}`">Website origin</label>
              <input :id="`origin-${siteIndex}`" v-model.trim="site.origin" placeholder="https://example.com" />
            </div>
            <button class="danger" type="button" @click="removeSite(siteIndex)">Remove website</button>
          </div>
          <div v-for="(entry, entryIndex) in site.mappings" :key="entryIndex" class="mapping-row">
            <div class="control">
              <label :for="`selector-${siteIndex}-${entryIndex}`">CSS selector</label>
              <input :id="`selector-${siteIndex}-${entryIndex}`" v-model="entry.selector" placeholder="input[name='contact_phone']" />
            </div>
            <div class="control">
              <label :for="`key-${siteIndex}-${entryIndex}`">Profile field</label>
              <select :id="`key-${siteIndex}-${entryIndex}`" v-model="entry.profileKey">
                <option v-for="key in PROFILE_KEYS" :key="key" :value="key">{{ PROFILE_LABELS[key] }}</option>
              </select>
            </div>
            <button class="danger" type="button" @click="removeMapping(site, entryIndex)">Remove</button>
          </div>
          <button type="button" @click="addMapping(site)">Add selector</button>
          <div v-for="issue in mappingErrors[String(siteIndex)]" :key="issue" class="mapping-error" role="alert">{{ issue }}</div>
        </article>
        <div v-if="!storage.siteMappings.length" class="muted">No custom mappings. Built-in detection will be used.</div>
      </section>

      <aside class="notice muted">Data is stored with <code>chrome.storage.local</code> and is not encrypted. Anyone with access to this browser profile may be able to read it.</aside>
      <div v-if="error" class="status error" role="alert">{{ error }}</div>
      <div v-if="status" class="status success" role="status">{{ status }}</div>
      <div><button class="primary" type="button" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save settings' }}</button></div>
    </template>
  </main>
</template>
