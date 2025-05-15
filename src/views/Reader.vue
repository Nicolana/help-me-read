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
          <button @click="handleZoom(zoom - 0.1)"><i class="fas fa-minus"></i></button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <button @click="handleZoom(zoom + 0.1)"><i class="fas fa-plus"></i></button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="page-control">
          <span class="page-control-span">
            <span class="page-control-span-current">{{ currentPage }}</span>
            <span class="page-control-span-divider"> / </span>
            <span class="page-control-span-total">{{ totalPages }}</span>
          </span>
        </div>
      </div>
    </div>
    <div class="pdf-content" ref="pdfContent" @scroll="handleScroll">
      <div class="pages-container" ref="pagesContainer"></div>
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
    const pagesContainer = ref<HTMLElement | null>(null);
    const zoom = ref(1);
    const pdfService = PDFService.getInstance();
    const fileId = ref<string>('');
    const currentPage = ref(1);
    const totalPages = ref(0);
    const visiblePages = ref(5); // 每次渲染的页面数量
    const isLoading = ref(false);
    const lastScrollTop = ref(0);

    onMounted(async () => {
      fileId.value = route.query.id as string;
      if (!fileId.value) {
        console.error('未提供文件ID');
        return;
      }

      try {
        await pdfService.openPDF(fileId.value);
        totalPages.value = await pdfService.getPageCount(fileId.value);
        await renderInitialPages();
      } catch (error) {
        console.error('加载PDF文件失败:', error);
      }
    });

    onUnmounted(async () => {
      if (fileId.value) {
        await pdfService.closePDF(fileId.value);
      }
    });

    const renderInitialPages = async () => {
      if (!pagesContainer.value) return;
      const endPage = Math.min(visiblePages.value, totalPages.value);
      await pdfService.renderPages(fileId.value, 1, endPage, pagesContainer.value, zoom.value);
    };

    const handleScroll = async () => {
      if (!pdfContent.value || isLoading.value) return;

      const { scrollTop, scrollHeight, clientHeight } = pdfContent.value;
      const scrollBottom = scrollTop + clientHeight;
      const threshold = scrollHeight - clientHeight * 1.5;

      // 保存当前滚动位置
      lastScrollTop.value = scrollTop;

      if (scrollBottom > threshold) {
        isLoading.value = true;
        const startPage = currentPage.value + 1;
        const endPage = Math.min(startPage + visiblePages.value - 1, totalPages.value);
        
        if (startPage <= totalPages.value) {
          await pdfService.renderPages(fileId.value, startPage, endPage, pagesContainer.value!, zoom.value);
          currentPage.value = endPage;
          
          // 恢复滚动位置
          if (pdfContent.value) {
            pdfContent.value.scrollTop = lastScrollTop.value;
          }
        }
        isLoading.value = false;
      }
    };

    const handleZoom = async (newZoom: number) => {
      if (newZoom >= 0.5 && newZoom <= 2) {
        const oldZoom = zoom.value;
        zoom.value = newZoom;
        
        if (pagesContainer.value) {
          // 保存当前滚动位置和可见页面范围
          const scrollTop = pdfContent.value?.scrollTop || 0;
          const visibleHeight = pdfContent.value?.clientHeight || 0;
          const pageHeight = pagesContainer.value.children[0]?.clientHeight || 0;
          const currentVisiblePage = Math.floor(scrollTop / (pageHeight + 20)) + 1;
          
          // 重新渲染所有页面
          const startPage = Math.max(1, currentVisiblePage - 2);
          const endPage = Math.min(startPage + visiblePages.value + 2, totalPages.value);
          
          await pdfService.renderPages(fileId.value, startPage, endPage, pagesContainer.value, zoom.value);
          
          // 调整滚动位置以保持相对位置
          if (pdfContent.value) {
            const newPageHeight = pagesContainer.value.children[0]?.clientHeight || 0;
            const scale = newPageHeight / pageHeight;
            pdfContent.value.scrollTop = scrollTop * scale;
          }
        }
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
      currentPage,
      totalPages,
      pdfContent,
      pagesContainer,
      handleZoom,
      handleScroll,
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
  background-color: #3a3a3a;
}

.pdf-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  scroll-behavior: smooth;
}

.pages-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  min-height: 100%;
}

.pages-container canvas {
  background-color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s ease;
}

.pdf-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-center {
  flex: 1;
  justify-content: center;
}

.toolbar-divider {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.2);
}

.zoom-control,
.page-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-control button {
  border: none;
  background: transparent;
  color: white;
  cursor: pointer;
  font-size: 12px;
  padding: 4px;
}

.page-control button:hover {
  background: #353535;
}

.page-control .page-control-span {
  color: white;
  background: #4d4d4d;
  font-size: 12px;
  border-radius: 4px;
  padding: 2px 8px;
  position: relative;
  display: block;
  display: flex;
  align-items: center;
}

.page-control .page-control-span-current {
  margin: 0 4px;
  width: 20px;
  display: block;
  text-align: center;
}

.zoom-control button {
  width: 16px;
  height: 16px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: white;
  cursor: pointer;
  font-size: 12px;
  padding: 4px;
}

.zoom-control button:hover {
  background: #353535;
}

.zoom-control button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: transparent;
}

.zoom-control span {
  color: white;
  margin: 0 12px;
  min-width: 48px;
  text-align: center;
  font-size: 12px;
  background: #4d4d4d;
  border-radius: 2px;
  font-weight: 500;
  padding: 2px 4px;
}

.close-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 14px;
  background: transparent;
}

.close-btn:hover {
  background-color: #353535;
}
</style>
  