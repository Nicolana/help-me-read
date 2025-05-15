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
        <div 
          class="upload-btn" 
          @click="triggerFileInput" 
          :class="{ 'is-uploading': isUploading }"
        >
          <div class="upload-content">
            <i class="fas fa-folder-open"></i>
            <div class="upload-text">
              <span>{{ isUploading ? '打开中...' : '打开文件' }}</span>
              <div class="upload-tip">支持拖拽文件到此处打开</div>
            </div>
            <i class="fas fa-chevron-right"></i>
          </div>
        </div>
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
      <div 
        v-for="file in pdfFiles" 
        :key="file.id" 
        class="file-card"
        @click="openPDF(file)"
      >
        <div class="file-preview">
          <img 
            :src="file.coverUrl || '/default-pdf-cover.svg'" 
            alt="PDF封面"
            @error="handleImageError"
            loading="lazy"
          />
        </div>
        <div class="file-info">
          <h3>{{ formatName(file.name) }}</h3>
          <div class="file-meta">
            <span>{{ formatFileSize(file.size) }}</span>
            <FileMenu @action="handleMenuAction($event, file)" @click.stop />
          </div>
        </div>
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
import { PDFService } from '../services/pdf'
import type { PDFMetadata } from '../types/pdf'
import { sendNotification } from '@tauri-apps/plugin-notification'
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
      const uploadedFile = await pdfService.loadPDF(file)
      console.log('PDF 加载完成，重新加载列表...')
      await loadPDFs()
      // 添加上传成功提示
      await sendNotification({
        title: '上传成功',
        body: `文件 "${file.name}" 已成功上传`,
        icon: '✅'
      })
      // 上传成功后自动跳转到阅读器
      if (uploadedFile) {
        openPDF(uploadedFile)
      }
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

const formatName = (name: string): string => {
  return name.split('.pdf')[0]
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
  width: 100%;
  
  .header {
    display: flex;
    margin-bottom: 2rem;
    width: 100%;
    
    .upload-container {
      position: relative;
    }
    
    .upload-btn {
      background-color: #f7f7f7;
      color: #666666;
      border: 1px dashed #e0e0e0;
      padding: 1.4rem 2rem;
      border-radius: 8px;
      cursor: pointer;
      min-width: 280px;
      transition: all 0.3s ease;
      
      .upload-content {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      
      &:hover:not(.is-uploading) {
        background-color: #f0f0f0;
        border-color: #d0d0d0;
      }
      
      &.is-uploading {
        background-color: #f7f7f7;
        cursor: not-allowed;
        opacity: 0.7;
      }
      
      i:first-child {
        font-size: 1.4rem;
        color: #1976D2;
      }
      
      i:last-child {
        font-size: 1.2rem;
        color: #1976D2;
        margin-left: auto;
      }

      .upload-text {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }

      .upload-tip {
        font-size: 0.9rem;
        color: #999;
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
    width: 100%;
    
    i {
      font-size: 3rem;
      margin-bottom: 1rem;
      color: #e74c3c;
    }
  }
  
  .file-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 1rem;
    width: 100%;
    
    .file-card {
      background: #f7f7f7;
      border-radius: 8px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
      position: relative;
      width: 100%;
      min-width: 0;
      cursor: pointer;
      transition: all 0.2s ease;
      overflow: visible;

      
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        background: #ffffff;
      }
      
      &:active {
        transform: translateY(0);
      }
      
      .file-preview {
        width: 100%;
        aspect-ratio: 3/4;
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
          display: -webkit-box;
          line-clamp: 2;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          line-height: 1.3;
          white-space: inherit;
        }
        
        .file-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #b8b8b8;
          font-size: 0.8rem;
        }
      }
      
      :deep(.file-menu) {
        position: absolute;
        right: 1rem;
        bottom: 1rem;
      }
    }
  }
}
</style>
