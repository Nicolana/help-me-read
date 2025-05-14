<template>
  <div class="pdf-reader">
    <div class="pdf-toolbar">
      <div class="toolbar-left">
        <button class="close-btn" @click="handleClose">
          <i class="fas fa-times"></i>
          关闭
        </button>
      </div>
      <div class="toolbar-center">
        <div class="zoom-control">
          <button @click="handleZoom(zoom - 0.1)">-</button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <button @click="handleZoom(zoom + 0.1)">+</button>
        </div>
      </div>
    </div>
    <div class="pdf-content" ref="pdfContent">
      <div class="page-container">
        <canvas ref="pageCanvas"></canvas>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from 'vue';
import { PDFService } from '../services/PDFService';
import { useRoute, useRouter } from 'vue-router';

export default defineComponent({
  setup() {
    const route = useRoute();
    const router = useRouter();
    const pdfContent = ref<HTMLElement | null>(null);
    const pageCanvas = ref<HTMLCanvasElement | null>(null);
    const zoom = ref(1);
    const pdfService = PDFService.getInstance();
    const fileId = ref<string>('');

    onMounted(async () => {
      fileId.value = route.query.id as string;
      if (!fileId.value) {
        console.error('未提供文件ID');
        return;
      }

      try {
        await pdfService.openPDF(fileId.value);
        await renderPage();
      } catch (error) {
        console.error('加载PDF文件失败:', error);
      }
    });

    onUnmounted(async () => {
      if (fileId.value) {
        await pdfService.closePDF(fileId.value);
      }
    });

    const renderPage = async () => {
      if (!pageCanvas.value) return;

      try {
        await pdfService.renderPage(fileId.value, 1, pageCanvas.value, zoom.value);
      } catch (error) {
        console.error('渲染页面失败:', error);
      }
    };

    const handleZoom = async (newZoom: number) => {
      if (newZoom >= 0.5 && newZoom <= 2) {
        zoom.value = newZoom;
        await renderPage();
      }
    };

    const handleClose = async () => {
      if (fileId.value) {
        await pdfService.closePDF(fileId.value);
      }
      router.push('/');
    };

    return {
      zoom,
      pageCanvas,
      handleZoom,
      handleClose
    };
  }
});
</script>

<style scoped>
.pdf-reader {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.pdf-content {
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: 20px;
}

.pdf-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
}

.toolbar-left,
.toolbar-center {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-center {
  flex: 1;
  justify-content: center;
}

.zoom-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.zoom-control button {
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: white;
  cursor: pointer;
}

.close-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background-color: #f44336;
  color: white;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background-color: #d32f2f;
}

.page-container {
  background-color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 10px;
}

.page-container canvas {
  display: block;
}
</style>
  