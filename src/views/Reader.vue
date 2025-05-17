<template>
  <div class="pdf-reader">
    <div class="pdf-toolbar">
      <div class="toolbar-left">
        <button class="close-btn" @click="handleClose">
          <i class="fas fa-times"></i>
          关闭
        </button>
        <button class="thumbnail-btn" @click="toggleThumbnails">
          <i class="fas fa-th-list"></i>
          缩略图
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
      <Thumbnails
        v-if="showThumbnails"
        :total-pages="totalPages"
        :current-page="currentPage"
        @select-page="jumpToPage"
      />
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
import { PDFService } from '../services/pdf';
import { useRoute, useRouter } from 'vue-router';
import CustomScrollbar from '../components/CustomScrollbar.vue';
import Thumbnails from '../components/Thumbnails.vue';

export default defineComponent({
  components: {
    CustomScrollbar,
    Thumbnails
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
    const saveProgressDebounceTimer = ref<number | null>(null);
    const showThumbnails = ref(false);
    const thumbnailsContainer = ref<HTMLElement | null>(null);

    // 计算内容高度和视口高度
    const contentHeight = computed(() => {
      return pagesContainer.value?.scrollHeight || 0;
    });

    const viewportHeight = computed(() => {
      return pdfContent.value?.clientHeight || 0;
    });

    // 监听滚动位置变化
    watch([scrollTop, zoom, currentPage], async ([newScrollTop, newZoom, newPage]) => {
      if (pdfContent.value && pdfContent.value.scrollTop !== newScrollTop) {
        pdfContent.value.scrollTop = newScrollTop;
      }
      
      // 使用防抖保存阅读进度
      if (saveProgressDebounceTimer.value) {
        clearTimeout(saveProgressDebounceTimer.value);
      }
      
      saveProgressDebounceTimer.value = window.setTimeout(async () => {
        if (fileId.value) {
          try {
            console.log('保存阅读进度:', { scrollTop: newScrollTop, zoom: newZoom, currentPage: newPage });
            await pdfService.saveReadingProgress(fileId.value, {
              scrollTop: newScrollTop,
              zoom: newZoom,
              currentPage: newPage
            });
          } catch (error) {
            console.error('保存阅读进度失败:', error);
          }
        }
      }, 500);
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
        
        // 获取阅读进度
        const progress = await pdfService.getReadingProgress(fileId.value);
        
        if (progress) {
          console.log('恢复阅读进度:', progress);
          // 设置缩放比例
          zoom.value = progress.zoom;
          // 设置当前页面
          currentPage.value = progress.currentPage;
          
          // 计算页面范围，以当前页为中心
          const halfVisible = Math.floor(visiblePages.value / 2);
          const startPage = Math.max(1, progress.currentPage - halfVisible);
          const endPage = Math.min(startPage + visiblePages.value - 1, totalPages.value);
          
          // 初始化整个文档结构，并渲染可视区域的页面
          console.log(`初始化文档并渲染页面 ${startPage} 到 ${endPage}`);
          await pdfService.renderPages(
            fileId.value, 
            startPage, 
            endPage, 
            pagesContainer.value!, 
            zoom.value, 
            { isInitialLoad: true, scrollPriority: 'center' }
          );
          
          // 设置滚动位置
          requestAnimationFrame(() => {
            scrollTop.value = progress.scrollTop;
            console.log('滚动位置已设置:', scrollTop.value);
          });
        } else {
          // 没有阅读进度时从头开始
          console.log('没有找到阅读进度，从头开始渲染');
          await initializeDocument();
        }
        
        // 添加滚动监听器，实现虚拟滚动
        if (pdfContent.value) {
          pdfContent.value.addEventListener('scroll', debounceHandleScroll);
        }

        // 在PDF加载完成后渲染缩略图
        if (showThumbnails.value) {
          await renderThumbnails();
        }
      } catch (error) {
        console.error('加载PDF文件失败:', error);
      }
    });

    // 初始化文档结构，并渲染第一组页面
    const initializeDocument = async () => {
      if (!pagesContainer.value) return;
      const endPage = Math.min(visiblePages.value, totalPages.value);
      console.log(`初始化文档并渲染首页`);
      await pdfService.renderPages(
        fileId.value, 
        1, 
        endPage, 
        pagesContainer.value, 
        zoom.value, 
        { isInitialLoad: true, scrollPriority: 'top' }
      );
    };

    const handleScroll = async (e: Event) => {
      if (!pdfContent.value || isLoading.value) return;

      // 更新滚动位置
      scrollTop.value = pdfContent.value.scrollTop;

      const { scrollTop: currentScrollTop, scrollHeight, clientHeight } = pdfContent.value;
      
      // 找出当前可见的页面范围
      const visiblePages = getVisiblePages();
      if (visiblePages.length > 0) {
        // 更新当前页码
        currentPage.value = visiblePages[0];
        
        // 动态渲染可见区域附近的页面
        if (!isLoading.value) {
          isLoading.value = true;
          try {
            const minPage = Math.min(...visiblePages);
            const maxPage = Math.max(...visiblePages);
            console.log(`可见页面范围: ${minPage} - ${maxPage}`);
            
            // 渲染可见区域附近的页面
            await pdfService.renderVisiblePages(
              fileId.value,
              pagesContainer.value!,
              minPage,
              maxPage,
              2, // 缓冲区大小
              zoom.value
            );
          } catch (error) {
            console.error('动态渲染页面失败:', error);
          } finally {
            isLoading.value = false;
          }
        }
      }
    };

    // 创建一个防抖版本的滚动处理函数
    const debounceHandleScroll = debounce(handleScroll, 100);

    // 防抖函数
    function debounce(fn: Function, delay: number) {
      let timer: number | null = null;
      return function(...args: any[]) {
        if (timer) clearTimeout(timer);
        timer = window.setTimeout(() => {
          fn.apply(this, args);
          timer = null;
        }, delay);
      };
    }

    

    // 获取当前可见的页面
    const getVisiblePages = (): number[] => {
      if (!pdfContent.value || !pagesContainer.value) return [];
      
      const result: number[] = [];
      const { scrollTop, clientHeight } = pdfContent.value;
      const pageElements = pagesContainer.value.querySelectorAll('[data-page]');
      
      for (let i = 0; i < pageElements.length; i++) {
        const element = pageElements[i] as HTMLElement;
        const rect = element.getBoundingClientRect();
        const pageNum = parseInt(element.getAttribute('data-page') || '0');
        
        // 判断页面是否在可视区域内
        const elementTop = rect.top;
        const elementBottom = rect.bottom;
        const containerTop = pdfContent.value.getBoundingClientRect().top;
        const containerBottom = containerTop + clientHeight;
        
        // 如果元素与容器可视区域有交叉，则认为是可见的
        if (elementBottom > containerTop && elementTop < containerBottom) {
          result.push(pageNum);
        }
      }
      
      return result.sort((a, b) => a - b);
    };

    onUnmounted(async () => {
      if (fileId.value) {
        try {
          // 保存最后的阅读进度
          console.log('组件卸载，保存最终阅读进度');
          await pdfService.saveReadingProgress(fileId.value, {
            scrollTop: scrollTop.value,
            zoom: zoom.value,
            currentPage: currentPage.value
          });
          await pdfService.closePDF(fileId.value);
        } catch (error) {
          console.error('关闭文档时保存阅读进度失败:', error);
        }
      }
      
      // 移除滚动监听器
      if (pdfContent.value) {
        pdfContent.value.removeEventListener('scroll', debounceHandleScroll);
      }
      
      if (saveProgressDebounceTimer.value) {
        clearTimeout(saveProgressDebounceTimer.value);
      }
    });

    const handleZoom = async (newZoom: number) => {
      if (newZoom >= 0.5 && newZoom <= 2) {
        zoom.value = newZoom;
        if (pagesContainer.value) {
          // 获取当前可见页面
          const visiblePages = getVisiblePages();
          if (visiblePages.length > 0) {
            const minPage = Math.min(...visiblePages);
            const maxPage = Math.max(...visiblePages);
            
            // 重新初始化文档，使用新的缩放比例
            await pdfService.renderPages(
              fileId.value, 
              minPage, 
              maxPage, 
              pagesContainer.value, 
              zoom.value, 
              { isInitialLoad: true, scrollPriority: 'center' }
            );
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

    // 渲染缩略图
    const renderThumbnails = async () => {
      if (!fileId.value || !showThumbnails.value || !thumbnailsContainer.value) return;

      try {
        const thumbnailScale = 0.2; // 缩略图缩放比例
        const canvases = thumbnailsContainer.value.querySelectorAll('canvas');
        
        for (const canvas of canvases) {
          const pageNum = parseInt(canvas.getAttribute('data-page') || '0');
          if (pageNum > 0) {
            await pdfService.renderThumbnail(fileId.value, pageNum, canvas as HTMLCanvasElement, thumbnailScale);
          }
        }
      } catch (error) {
        console.error('渲染缩略图失败:', error);
      }
    };

    // 切换缩略图面板显示状态
    const toggleThumbnails = () => {
      console.log('toggleThumbnails', showThumbnails.value);
      showThumbnails.value = !showThumbnails.value;
      if (showThumbnails.value) {
        renderThumbnails();
      }
    };

    // 跳转到指定页面
    const jumpToPage = async (pageNum: number) => {
      if (!pdfContent.value || !pagesContainer.value) return;
      
      const pageElement = pagesContainer.value.querySelector(`[data-page="${pageNum}"]`);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth' });
        currentPage.value = pageNum;
      }
    };

    // 监听当前页面变化，更新缩略图选中状态
    watch(currentPage, (newPage) => {
      if (showThumbnails.value) {
        const thumbnailElement = thumbnailsContainer.value?.querySelector(`[data-page="${newPage}"]`);
        if (thumbnailElement) {
          thumbnailElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });

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
      handleClose,
      showThumbnails,
      thumbnailsContainer,
      toggleThumbnails,
      jumpToPage,
    };
  }
});
</script>

<style scoped>
.pdf-reader {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #1a1a1a;
  color: #fff;
}

.pdf-content-wrapper {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.pdf-content {
  flex: 1;
  overflow-y: auto;
  position: relative;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.pdf-content::-webkit-scrollbar {
  display: none;
}

.pages-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  gap: 20px;
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

.thumbnails-panel {
  width: 0;
  background-color: #2a2a2a;
  transition: width 0.3s ease;
  overflow: hidden;
  border-right: 1px solid #3a3a3a;
}

.thumbnails-panel-visible {
  width: 200px;
}

.thumbnails-container {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  overflow-y: auto;
}

.thumbnail-item {
  position: relative;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.thumbnail-item:hover {
  border-color: #666;
}

.thumbnail-active {
  border-color: #007bff;
}

.thumbnail-page-number {
  position: absolute;
  top: 5px;
  right: 5px;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.thumbnail-btn {
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

.thumbnail-btn:hover {
  background-color: #353535;
}
</style>
  