<template>
  <div class="home">
    <div class="header">
      <div class="upload-container">
        <input
          type="file"
          ref="fileInput"
          accept=".pdf"
          @change="handleFileUpload"
          style="display: none"
        />
        <button class="upload-btn" @click="triggerFileInput" :disabled="isUploading">
          <i class="fas fa-folder-open"></i>
          <span>{{ isUploading ? '打开中...' : '打开文件' }}</span>
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
    
    <div v-if="isLoading" class="loading">
      <i class="fas fa-spinner fa-spin"></i>
      加载中...
    </div>
    
    <div v-else-if="pdfFiles.length === 0" class="empty-state">
      <i class="fas fa-file-pdf"></i>
      <p>还没有PDF文件，点击上方按钮打开</p>
    </div>
    
    <div v-else class="file-grid">
      <div v-for="file in pdfFiles" :key="file.id" class="file-card">
        <div class="file-preview">
          <img 
            :src="file.coverUrl || '/default-pdf-cover.svg'" 
            alt="PDF封面"
            @error="handleImageError"
            loading="lazy"
          />
        </div>
        <div class="file-info">
          <h3>{{ file.name }}</h3>
          <p>{{ formatFileSize(file.size) }}</p>
        </div>
        <FileMenu @action="handleMenuAction($event, file)" />
      </div>
    </div>
    
    <ConfirmDialog
      v-model="showConfirmDialog"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-text="confirmText"
      :cancel-text="cancelText"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { PDFService } from '../services/PDFService'
import type { PDFMetadata } from '../types/pdf'
import { sendNotification } from '@tauri-apps/plugin-notification'
import { convertFileSrc } from '@tauri-apps/api/core'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import FileMenu from '../components/FileMenu.vue'
import { useConfirm } from '../hooks/useConfirm'
import { confirm } from '../services/ConfirmService'

const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const pdfFiles = ref<PDFMetadata[]>([])
const pdfService = PDFService.getInstance()
const isLoading = ref(true)
const isUploading = ref(false)
const isDeleting = ref<string | null>(null)

const {
  showConfirmDialog,
  confirmMessage,
  confirmTitle,
  confirmText,
  cancelText,
  show: showConfirm,
  handleConfirm,
  handleCancel
} = useConfirm()

onMounted(async () => {
  await loadPDFs()
})

const loadPDFs = async () => {
  try {
    console.log('开始加载 PDF 列表...')
    isLoading.value = true
    pdfFiles.value = await pdfService.getAllPDFs()
    console.log('PDF 列表加载完成，文件数:', pdfFiles.value.length)
  } catch (error) {
    console.error('加载PDF列表失败:', error)
    // TODO: 添加错误提示
  } finally {
    isLoading.value = false
  }
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    const file = input.files[0]
    console.log('开始处理文件上传:', file.name)
    try {
      isUploading.value = true
      console.log('调用 PDFService.loadPDF...')
      await pdfService.loadPDF(file)
      console.log('PDF 加载完成，重新加载列表...')
      await loadPDFs()
      // 添加上传成功提示
      await sendNotification({
        title: '上传成功',
        body: `文件 "${file.name}" 已成功上传`,
        icon: '✅'
      })
    } catch (error) {
      console.error('上传PDF失败:', error)
      // 添加上传失败提示
      await sendNotification({
        title: '上传失败',
        body: '上传文件时发生错误，请重试',
        icon: '❌'
      })
    } finally {
      isUploading.value = false
      // 清空文件输入，允许重复上传同一文件
      input.value = ''
    }
  }
}

const openPDF = (file: PDFMetadata) => {
  router.push({ 
    path: '/reader',
    query: { id: file.id }
  })
}

const editPDF = (file: PDFMetadata) => {
  // TODO: 实现编辑功能
  console.log('Edit PDF:', file)
}

const deletePDF = async (file: PDFMetadata) => {
  const confirmed = await confirm({
    title: '确认删除',
    message: `确定要删除文件 "${file.name}" 吗？`,
    confirmText: '删除',
    cancelText: '取消'
  })

  if (confirmed) {
    try {
      isDeleting.value = file.id
      await pdfService.deletePDF(file.id)
      await loadPDFs()
      await sendNotification({
        title: '删除成功',
        body: `文件 "${file.name}" 已成功删除`,
        icon: '✅'
      })
    } catch (error) {
      console.error('删除PDF失败:', error)
      await sendNotification({
        title: '删除失败',
        body: '删除文件时发生错误，请重试',
        icon: '❌'
      })
    } finally {
      isDeleting.value = null
    }
  }
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const handleMenuAction = async (action: string, file: PDFMetadata) => {
  switch (action) {
    case 'view':
      openPDF(file)
      break
    case 'edit':
      editPDF(file)
      break
    case 'delete':
      deletePDF(file)
      break
  }
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  console.error('图片加载失败:', img.src)
  img.src = '/default-pdf-cover.svg'
}
</script>

<style lang="scss">
.home {
  padding: 2rem;
  background-color: #fbfbfb;
  min-height: 100vh;
  
  .header {
    display: flex;
    margin-bottom: 2rem;
    
    .upload-container {
      position: relative;
    }
    
    .upload-btn {
      background-color: #f7f7f7;
      color: #666666;
      border: 1px solid #e0e0e0;
      padding: 1.2rem 1.8rem;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 1.1rem;
      min-width: 240px;
      justify-content: flex-start;
      
      &:hover:not(:disabled) {
        background-color: #f0f0f0;
      }
      
      &:disabled {
        background-color: #f7f7f7;
        cursor: not-allowed;
        opacity: 0.7;
      }
      
      i:first-child {
        font-size: 1.2rem;
        color: #4CAF50;
      }
      
      i:last-child {
        font-size: 1rem;
        color: #4CAF50;
        margin-left: auto;
      }
    }
  }
  
  .loading, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: #666;
    font-size: 1.2rem;
    
    i {
      font-size: 3rem;
      margin-bottom: 1rem;
      color: #e74c3c;
    }
  }
  
  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(226px, 1fr));
    gap: 1.5rem;
    
    .file-card {
      background: #f7f7f7;
      border-radius: 8px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
      
      .file-preview {
        width: 100%;
        height: 172px;
        background: #ffffff;
        border-radius: 4px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        
        img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #ffffff;
        }
      }
      
      .file-info {
        h3 {
          margin: 0 0 0.3rem 0;
          font-size: 0.9rem;
          color: #353535;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        p {
          margin: 0;
          color: #b8b8b8;
          font-size: 0.8rem;
        }
      }
    }
  }
}
</style>
