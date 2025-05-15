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
    <div class="pdf-content-wrapper">
      <div class="pdf-content" ref="pdfContent" @scroll="handleScroll">
        <div class="pages-container" ref="pagesContainer"></div>
      </div>
      <CustomScrollbar
        :container-ref="pdfContent"
        :content-height="contentHeight"
        :viewport-height="viewportHeight"
        v-model:scrollTop="scrollTop"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { PDFService } from '../services/PDFService';
import { useRoute, useRouter } from 'vue-router';
import CustomScrollbar from '../components/CustomScrollbar.vue';

export default defineComponent({
  components: {
    CustomScrollbar
  },

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
    const visiblePages = ref(5);
    const isLoading = ref(false);
    const scrollTop = ref(0);

    // 计算内容高度和视口高度
    const contentHeight = computed(() => {
      return pagesContainer.value?.scrollHeight || 0;
    });

    const viewportHeight = computed(() => {
      return pdfContent.value?.clientHeight || 0;
    });

    // 监听滚动位置变化
    watch(scrollTop, (newScrollTop) => {
      if (pdfContent.value && pdfContent.value.scrollTop !== newScrollTop) {
        pdfContent.value.scrollTop = newScrollTop;
      }
    });

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

    const handleScroll = async (e: Event) => {
      if (!pdfContent.value || isLoading.value) return;

      // 更新滚动位置
      scrollTop.value = pdfContent.value.scrollTop;

      const { scrollTop: currentScrollTop, scrollHeight, clientHeight } = pdfContent.value;
      const scrollBottom = currentScrollTop + clientHeight;
      const threshold = scrollHeight - clientHeight * 1.5;

      // 计算当前页面
      const pageHeight = clientHeight / visiblePages.value;
      currentPage.value = Math.ceil(currentScrollTop / pageHeight) + 1;

      if (scrollBottom > threshold) {
        isLoading.value = true;
        const startPage = currentPage.value + 1;
        const endPage = Math.min(startPage + visiblePages.value - 1, totalPages.value);
        
        if (startPage <= totalPages.value) {
          await pdfService.renderPages(fileId.value, startPage, endPage, pagesContainer.value!, zoom.value);
        }
        isLoading.value = false;
      }
    };

    const handleZoom = async (newZoom: number) => {
      if (newZoom >= 0.5 && newZoom <= 2) {
        zoom.value = newZoom;
        if (pagesContainer.value) {
          const startPage = Math.max(1, currentPage.value - 2);
          const endPage = Math.min(startPage + visiblePages.value + 2, totalPages.value);
          await pdfService.renderPages(fileId.value, startPage, endPage, pagesContainer.value, zoom.value);
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
      contentHeight,
      viewportHeight,
      scrollTop,
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

.pdf-content-wrapper {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden !important;
}

.pdf-content {
  flex: 1;
  overflow-y: scroll;
  padding: 20px;
  /* 隐藏默认滚动条 - 所有浏览器 */
  scrollbar-width: none !important; /* Firefox */
  -ms-overflow-style: none !important; /* IE and Edge */
  -webkit-overflow-scrolling: touch;
}

/* Chrome, Safari, Opera */
.pdf-content::-webkit-scrollbar,
.pdf-content::-webkit-scrollbar-thumb,
.pdf-content::-webkit-scrollbar-track {
  width: 0 !important;
  height: 0 !important;
  background-color: transparent !important;
  display: none !important;
}

.pages-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  overflow: visible !important;
}

.pages-container canvas {
  background-color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 保留其他已有样式 */
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
  