<template>
  <div class="home">
    <div class="header">
      <h1>我的PDF文件</h1>
      <div class="upload-container">
        <input
          type="file"
          ref="fileInput"
          accept=".pdf"
          @change="handleFileUpload"
          style="display: none"
        />
        <button class="upload-btn" @click="triggerFileInput" :disabled="isUploading">
          <i class="fas fa-upload"></i>
          {{ isUploading ? '上传中...' : '上传文件' }}
        </button>
      </div>
    </div>
    
    <div v-if="isLoading" class="loading">
      <i class="fas fa-spinner fa-spin"></i>
      加载中...
    </div>
    
    <div v-else-if="pdfFiles.length === 0" class="empty-state">
      <i class="fas fa-file-pdf"></i>
      <p>还没有PDF文件，点击上方按钮上传</p>
    </div>
    
    <div v-else class="file-grid">
      <div v-for="file in pdfFiles" :key="file.id" class="file-card">
        <div class="file-icon">
          <i class="fas fa-file-pdf"></i>
        </div>
        <div class="file-info">
          <h3>{{ file.name }}</h3>
          <p>{{ formatFileSize(file.size) }}</p>
          <p>{{ formatDate(file.lastModified) }}</p>
        </div>
        <div class="file-actions">
          <button class="action-btn" @click="openPDF(file)">
            <i class="fas fa-eye"></i>
          </button>
          <button class="action-btn" @click="editPDF(file)">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn" @click="deletePDF(file)" :disabled="isDeleting === file.id">
            <i class="fas" :class="isDeleting === file.id ? 'fa-spinner fa-spin' : 'fa-trash'"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { PDFService } from '../services/PDFService'
import type { PDFMetadata } from '../types/pdf'
import { sendNotification } from '@tauri-apps/plugin-notification'

const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const pdfFiles = ref<PDFMetadata[]>([])
const pdfService = PDFService.getInstance()
const isLoading = ref(true)
const isUploading = ref(false)
const isDeleting = ref<string | null>(null)

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
  if (confirm('确定要删除这个文件吗？')) {
    try {
      isDeleting.value = file.id
      await pdfService.deletePDF(file.id)
      await loadPDFs()
      // 使用现代化提示
      await sendNotification({
        title: '删除成功',
        body: `文件 "${file.name}" 已成功删除`,
        icon: '✅'
      })
    } catch (error) {
      console.error('删除PDF失败:', error)
      // 使用现代化错误提示
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
</script>

<style lang="scss">
.home {
  padding: 2rem;
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    
    h1 {
      font-size: 1.8rem;
      color: #333;
    }
    
    .upload-container {
      position: relative;
    }
    
    .upload-btn {
      background-color: #4CAF50;
      color: white;
      border: none;
      padding: 0.8rem 1.5rem;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.3s;
      
      &:hover:not(:disabled) {
        background-color: #45a049;
      }
      
      &:disabled {
        background-color: #cccccc;
        cursor: not-allowed;
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
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
    
    .file-card {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s;
      
      &:hover {
        transform: translateY(-2px);
      }
      
      .file-icon {
        font-size: 2.5rem;
        color: #e74c3c;
        margin-bottom: 1rem;
      }
      
      .file-info {
        h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.1rem;
          color: #333;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        p {
          margin: 0.2rem 0;
          color: #666;
          font-size: 0.9rem;
        }
      }
      
      .file-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
        
        .action-btn {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 4px;
          transition: all 0.2s;
          
          &:hover:not(:disabled) {
            background-color: #f5f5f5;
            color: #333;
          }
          
          &:disabled {
            cursor: not-allowed;
            opacity: 0.7;
          }
        }
      }
    }
  }
}
</style>
