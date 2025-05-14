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
        <zoom-control :zoom="zoom" @zoom="handleZoom" />
        <progress-bar :progress="progress" @seek="handleSeek" />
      </div>
      <div class="toolbar-right">
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
      </div>
    </div>
    <div class="pdf-content" ref="pdfContent" @scroll="handleScroll">
      <div v-for="page in renderedPages" :key="page.pageNumber" class="page-container">
        <canvas :ref="el => { if (el) pageRefs[page.pageNumber] = el as HTMLCanvasElement }"></canvas>
      </div>
    </div>
    <thumbnails :pages="pages" @select-page="selectPage" />
    <bookmarks :bookmarks="bookmarks" @go-to-bookmark="goToBookmark" />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted, reactive } from 'vue';
import ZoomControl from '../components/ZoomControl.vue';
import ProgressBar from '../components/ProgressBar.vue';
import Thumbnails from '../components/Thumbnails.vue';
import Bookmarks from '../components/Bookmarks.vue';
import { PDFService } from '../services/PDFService';
import { useRoute, useRouter } from 'vue-router';

export default defineComponent({
  components: { ZoomControl, ProgressBar, Thumbnails, Bookmarks },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const pdfContent = ref<HTMLElement | null>(null);
    const zoom = ref(1);
    const progress = ref(0);
    const pages = ref<any[]>([]);
    const bookmarks = ref<any[]>([]);
    const pdfService = PDFService.getInstance();
    const pageRefs = reactive<{ [key: number]: HTMLCanvasElement }>({});
    const renderedPages = ref<{ pageNumber: number }[]>([]);
    const currentPage = ref(1);
    const totalPages = ref(0);
    const fileId = ref<string>('');

    onMounted(async () => {
      fileId.value = route.query.id as string;
      if (!fileId.value) {
        console.error('未提供文件ID');
        return;
      }

      try {
        await pdfService.openPDF(fileId.value);
        totalPages.value = await pdfService.getPageCount(fileId.value);
        
        // 初始化页面数组
        renderedPages.value = Array.from({ length: totalPages.value }, (_, i) => ({
          pageNumber: i + 1
        }));

        // 渲染可见页面
        await renderVisiblePages();
      } catch (error) {
        console.error('加载PDF文件失败:', error);
      }
    });

    onUnmounted(async () => {
      if (fileId.value) {
        await pdfService.closePDF(fileId.value);
      }
    });

    const renderPage = async (pageNum: number) => {
      if (pageNum < 1 || pageNum > totalPages.value) return;

      const canvas = pageRefs[pageNum];
      if (!canvas) return;

      try {
        await pdfService.renderPage(fileId.value, pageNum, canvas, zoom.value);
      } catch (error) {
        console.error(`渲染第${pageNum}页失败:`, error);
      }
    };

    const renderVisiblePages = async () => {
      const container = pdfContent.value;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const pageHeight = containerRect.height;
      const scrollTop = container.scrollTop;

      const startPage = Math.floor(scrollTop / pageHeight) + 1;
      const endPage = Math.min(startPage + 2, totalPages.value);

      for (let i = startPage; i <= endPage; i++) {
        await renderPage(i);
      }

      currentPage.value = startPage;
      progress.value = (currentPage.value / totalPages.value) * 100;
    };

    const handleZoom = (newZoom: number) => {
      zoom.value = newZoom;
      renderVisiblePages();
    };

    const handleScroll = () => {
      renderVisiblePages();
    };

    const handleSeek = (newProgress: number) => {
      const pageNum = Math.ceil((newProgress / 100) * totalPages.value);
      if (pdfContent.value) {
        const pageHeight = pdfContent.value.clientHeight;
        pdfContent.value.scrollTop = (pageNum - 1) * pageHeight;
      }
    };

    const selectPage = (pageNum: number) => {
      if (pdfContent.value) {
        const pageHeight = pdfContent.value.clientHeight;
        pdfContent.value.scrollTop = (pageNum - 1) * pageHeight;
      }
    };

    const goToBookmark = (bookmarkId: string) => {
      const pageNum = bookmarks.value.find(b => b.id === bookmarkId)?.page || 1;
      selectPage(pageNum);
    };

    const handleClose = async () => {
      if (fileId.value) {
        await pdfService.closePDF(fileId.value);
      }
      router.push('/');
    };

    return {
      zoom,
      progress,
      pages,
      bookmarks,
      renderedPages,
      pageRefs,
      currentPage,
      totalPages,
      handleZoom,
      handleScroll,
      handleSeek,
      selectPage,
      goToBookmark,
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
  overflow-y: scroll;
  max-height: 80vh;
  position: relative;
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

.page-info {
  font-size: 14px;
  color: #666;
  margin-left: 10px;
}

.page-container {
  margin: 0 auto;
  padding: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  background-color: white;
}

.page-container canvas {
  display: block;
  margin: 0 auto;
}
</style>
  