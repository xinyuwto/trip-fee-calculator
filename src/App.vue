<script setup>
import { ref, watch } from 'vue'
import { RouterView } from 'vue-router'
import { useTripStore } from './stores/trip'

const { toast } = useTripStore()
const localToast = ref({ message: '', id: 0 })

watch(() => toast.value.id, (id) => {
  if (id > 0) {
    localToast.value = { ...toast.value }
    setTimeout(() => { localToast.value = { message: '', id: 0 } }, 2000)
  }
})
</script>

<template>
  <div id="app-container">
    <RouterView />
    <Transition name="toast">
      <div v-if="localToast.id > 0" class="toast">{{ localToast.message }}</div>
    </Transition>
  </div>
</template>

<style>
@import './styles/theme.css';

.toast {
  position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
  background: var(--ink); color: #fbf6e8; padding: 12px 24px;
  border-radius: 8px; font-size: 15px; font-family: var(--font-title);
  z-index: 2000; box-shadow: 0 4px 16px rgba(28,25,23,0.3);
  pointer-events: none;
}
.toast-enter-active { transition: all 0.3s ease; }
.toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
.toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-10px); }
</style>
