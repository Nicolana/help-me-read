<template>
  <div class="file-menu">
    <button class="menu-trigger" @click="toggleMenu">
      <i class="fas fa-ellipsis-v"></i>
    </button>
    
    <div v-if="isOpen" class="menu-content">
      <button class="menu-item" @click="handleAction('view')">
        <i class="fas fa-eye"></i>
        <span>查看</span>
      </button>
      <button class="menu-item" @click="handleAction('edit')">
        <i class="fas fa-edit"></i>
        <span>编辑</span>
      </button>
      <button class="menu-item" @click="handleAction('delete')">
        <i class="fas fa-trash"></i>
        <span>删除</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const isOpen = ref(false)

const emit = defineEmits(['action'])

const toggleMenu = () => {
  isOpen.value = !isOpen.value
}

const handleAction = (action: string) => {
  emit('action', action)
  isOpen.value = false
}
</script>

<style lang="scss" scoped>
.file-menu {
  position: relative;
  
  .menu-trigger {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 4px;
    
    &:hover {
      background-color: #f5f5f5;
    }
  }
  
  .menu-content {
    position: absolute;
    right: 0;
    top: 100%;
    background: white;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    z-index: 100;
    min-width: 120px;
    
    .menu-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.75rem 1rem;
      border: none;
      background: none;
      cursor: pointer;
      color: #353535;
      text-align: left;
      
      &:hover {
        background-color: #f5f5f5;
      }
      
      i {
        width: 16px;
      }
    }
  }
}
</style> 