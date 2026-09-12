import { ref } from 'vue'
import { useTripStore } from '../stores/trip'
import { mergeSync } from '../utils/sync'

let singleton = null

export function useSyncEngine() {
  if (singleton) return singleton

  const status = ref('idle')
  const errorMessage = ref(null)
  const pendingDuplicates = ref([])

  let inFlight = false
  let queued = false

  async function runSync(decisions) {
    const store = useTripStore()
    if (!store.sync.value.code || !store.trip.value) return
    inFlight = true
    status.value = 'syncing'
    errorMessage.value = null
    try {
      const result = await mergeSync({
        code: store.sync.value.code,
        payload: store.trip.value,
        myMemberId: store.sync.value.myMemberId,
        dedupDecisions: decisions
      })
      if (!result.success) {
        status.value = 'error'
        errorMessage.value = result.message
        return
      }
      if (result.status === 'duplicates_found') {
        pendingDuplicates.value = result.duplicates
        status.value = 'pending'
        return
      }
      const applied = store.importData(JSON.stringify(result.payload))
      if (!applied.success) {
        status.value = 'error'
        errorMessage.value = '合并结果校验失败：' + applied.error
        return
      }
      pendingDuplicates.value = []
      store.setSyncState({ lastSyncedAt: new Date().toISOString() })
      status.value = 'success'
    } catch {
      status.value = 'error'
      errorMessage.value = '同步异常，请稍后重试'
    } finally {
      inFlight = false
      if (queued) {
        queued = false
        runSync()
      }
    }
  }

  function triggerSync() {
    const store = useTripStore()
    if (!store.sync.value.code || !store.trip.value) return
    if (inFlight) {
      queued = true
      return
    }
    return runSync()
  }

  async function resolveDuplicates(decisions) {
    pendingDuplicates.value = []
    await runSync(decisions)
  }

  function dismissDuplicates() {
    pendingDuplicates.value = []
    status.value = 'idle'
  }

  singleton = { status, errorMessage, pendingDuplicates, triggerSync, resolveDuplicates, dismissDuplicates }
  return singleton
}
