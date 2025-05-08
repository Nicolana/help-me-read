<template>
  <div v-if="modelValue" class="confirm-dialog-overlay">
    <div class="confirm-dialog">
      <div class="confirm-dialog-header">
        <h3>{{ title }}</h3>
      </div>
      <div class="confirm-dialog-body">
        <p>{{ message }}</p>
      </div>
      <div class="confirm-dialog-footer">
        <button class="btn btn-cancel" @click="onCancel">
          {{ cancelText }}
        </button>
        <button class="btn btn-confirm" @click="onConfirm">
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const onConfirm = () => {
  emit('confirm')
  emit('update:modelValue', false)
}

const onCancel = () => {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<style lang="scss" scoped>
.confirm-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.confirm-dialog {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  min-width: 320px;
  max-width: 90%;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  
  .confirm-dialog-header {
    margin-bottom: 1rem;
    
    h3 {
      margin: 0;
      font-size: 1.2rem;
      color: #333;
    }
  }
  
  .confirm-dialog-body {
    margin-bottom: 1.5rem;
    
    p {
      margin: 0;
      color: #666;
      line-height: 1.5;
    }
  }
  
  .confirm-dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.8rem;
    
    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.2s;
      
      &.btn-cancel {
        background-color: #f5f5f5;
        color: #666;
        
        &:hover {
          background-color: #e8e8e8;
        }
      }
      
      &.btn-confirm {
        background-color: #e74c3c;
        color: white;
        
        &:hover {
          background-color: #c0392b;
        }
      }
    }
  }
}
</style> 