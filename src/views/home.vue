<template>
  <div class="home">
    <div class="header">
      <h1>我的PDF文件</h1>
      <button class="upload-btn">
        <i class="fas fa-upload"></i>
        上传文件
      </button>
    </div>
    
    <div class="file-grid">
      <div v-for="file in files" :key="file.id" class="file-card">
        <div class="file-icon">
          <i class="fas fa-file-pdf"></i>
        </div>
        <div class="file-info">
          <h3>{{ file.name }}</h3>
          <p>{{ file.size }}</p>
          <p>{{ file.lastModified }}</p>
        </div>
        <div class="file-actions">
          <button class="action-btn">
            <i class="fas fa-eye"></i>
          </button>
          <button class="action-btn">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface File {
  id: number
  name: string
  size: string
  lastModified: string
}

const files = ref<File[]>([
  {
    id: 1,
    name: '示例文档.pdf',
    size: '2.5 MB',
    lastModified: '2024-03-20'
  },
  {
    id: 2,
    name: '研究报告.pdf',
    size: '4.8 MB',
    lastModified: '2024-03-19'
  }
])
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
      transition: background-color 0.3s;
      
      &:hover {
        background-color: #45a049;
      }
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
          
          &:hover {
            background-color: #f5f5f5;
            color: #333;
          }
        }
      }
    }
  }
}
</style>
