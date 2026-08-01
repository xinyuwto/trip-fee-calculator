<script setup>
defineProps({ show: Boolean, title: String, message: String })
const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <div v-if="show" class="overlay" @click.self="emit('cancel')">
    <div class="dialog">
      <h3>{{ title }}</h3>
      <p>{{ message }}</p>
      <div class="dialog-actions">
        <button class="btn-cancel" @click="emit('cancel')">取消</button>
        <button class="btn-danger" @click="emit('confirm')">确认</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.dialog {
  background: #fff; border-radius: 12px; padding: 24px;
  width: 300px; max-width: 90vw;
}
.dialog h3 { margin-bottom: 8px; }
.dialog p { color: #666; font-size: 14px; margin-bottom: 20px; }
.dialog-actions { display: flex; gap: 12px; justify-content: flex-end; }
.btn-cancel, .btn-danger {
  padding: 10px 20px; font-size: 15px; border: none; border-radius: 8px; cursor: pointer;
}
.btn-cancel { background: #f0f0f0; }
.btn-danger { background: #ff4d4f; color: #fff; }
</style>
