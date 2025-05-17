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
        :total-pages="totalPages"
        :current-page="currentPage"
        :file-id="fileId"
        @select-page="goToPage"
        ref="thumbnailsRef"
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

// 为缩略图组件定义暴露方法的接口
interface ThumbnailsExposed {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  loadThumbnail: (pageNum: number) => Promise<void>;
  updateCurrentPage: (pageNum: number) => void;
  thumbnailsContainer: HTMLElement | null;
}

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
    const showThumbnails = ref(true);
    const thumbnailsRef = ref<ThumbnailsExposed | null>(null);
    // 新增：估计每页高度和总高度
    const estimatedPageHeight = ref(0);
    const totalDocumentHeight = ref(0);
    // 新增：记录已知的页面高度
    const pageHeights = ref<Map<number, number>>(new Map());
    // 新增：记录滚动位置对应的页码
    const scrollPositionMap = ref<Map<number, number>>(new Map());
    // 新增：预计的缓冲区大小，滚动时渲染的额外页数
    const bufferSize = 3;
    // 新增：标记是否正在恢复进度
    const isRestoringProgress = ref(false);
    // 新增：标记是否初始渲染完成
    const initialRenderComplete = ref(false);
    // 新增：标记是否跳过下一次滚动事件处理
    const skipNextScrollEvent = ref(false);

    // 计算内容高度和视口高度
    const contentHeight = computed(() => {
      return totalDocumentHeight.value || (pagesContainer.value?.scrollHeight || 0);
    });

    const viewportHeight = computed(() => {
      return pdfContent.value?.clientHeight || 0;
    });

    // 监听滚动位置变化
    watch([scrollTop, zoom, currentPage], async ([newScrollTop, newZoom, newPage], oldValues) => {
      // 如果正在恢复进度，不触发保存和UI更新
      if (isRestoringProgress.value) {
        return;
      }
      
      // 更新滚动位置，但只在值不同时
      if (pdfContent.value && pdfContent.value.scrollTop !== newScrollTop) {
        skipNextScrollEvent.value = true; // 标记跳过下一次滚动事件
        pdfContent.value.scrollTop = newScrollTop;
      }
      
      // 使用防抖保存阅读进度，但仅在初始渲染后
      if (initialRenderComplete.value) {
        if (saveProgressDebounceTimer.value) {
          clearTimeout(saveProgressDebounceTimer.value);
        }
        
        saveProgressDebounceTimer.value = window.setTimeout(async () => {
          if (fileId.value) {
            try {
              // 确保不保存无效的滚动位置
              if (newScrollTop === 0 && pdfContent.value && pdfContent.value.scrollTop > 0) {
                newScrollTop = pdfContent.value.scrollTop;
              }
              
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
      }
    });

    onMounted(async () => {
      fileId.value = route.query.id as string;
      if (!fileId.value) {
        console.error('未提供文件ID');
        return;
      }

      try {
        // 标记正在恢复进度，防止触发中间状态的保存
        isRestoringProgress.value = true;
        
        await pdfService.openPDF(fileId.value);
        totalPages.value = await pdfService.getPageCount(fileId.value);
        
        // 获取阅读进度
        const progress = await pdfService.getReadingProgress(fileId.value);
        
        if (progress) {
          console.log('恢复阅读进度:', progress);
          
          // 设置缩放比例和当前页面
          zoom.value = progress.zoom;
          currentPage.value = progress.currentPage;
          
          // 计算页面范围，以当前页为中心
          const halfVisible = Math.floor(visiblePages.value / 2);
          const startPage = Math.max(1, progress.currentPage - halfVisible);
          const endPage = Math.min(startPage + visiblePages.value - 1, totalPages.value);
          
          // 初始化并渲染可视区域的页面，但不立即触发滚动
          console.log(`初始化文档并渲染页面 ${startPage} 到 ${endPage}`);
          
          // 关键改进：确保页面渲染完毕后再设置滚动位置
          await initializeDocument(startPage, endPage, 'top');
          
          // 一定要等DOM完全更新后再设置滚动位置
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // 设置滚动位置前先标记跳过滚动事件处理
          skipNextScrollEvent.value = true;
          
          if (pdfContent.value) {
            console.log('设置滚动位置:', progress.scrollTop);
            pdfContent.value.scrollTop = progress.scrollTop;
            scrollTop.value = progress.scrollTop;
          }
          
          // 延迟后标记初始渲染完成
          await new Promise(resolve => setTimeout(resolve, 300));
          initialRenderComplete.value = true;
          
          // 清除恢复进度标记
          isRestoringProgress.value = false;
        } else {
          // 没有阅读进度时从头开始
          console.log('没有找到阅读进度，从头开始渲染');
          await initializeDocument(1, Math.min(visiblePages.value, totalPages.value), 'top');
          
          // 标记初始渲染完成和清除恢复标记
          initialRenderComplete.value = true;
          isRestoringProgress.value = false;
        }
        
        // 添加滚动监听器，实现虚拟滚动
        if (pdfContent.value) {
          pdfContent.value.addEventListener('scroll', debounceHandleScroll);
        }
        
        // 主动预加载前几页的缩略图以提高用户体验
        preloadThumbnails();
        
        // 默认展开缩略图
        initThumbnails();
      } catch (error) {
        console.error('加载PDF文件失败:', error);
        isRestoringProgress.value = false;
        initialRenderComplete.value = true;
      }
    });

    // 初始化文档结构，并渲染指定范围的页面
    const initializeDocument = async (startPage: number, endPage: number, scrollPriority: 'top' | 'center' | 'exact' = 'top') => {
      if (!pagesContainer.value) return;
      
      console.log(`初始化文档并渲染页面 ${startPage} 到 ${endPage}`);
      const result = await pdfService.renderPages(
        fileId.value, 
        startPage, 
        endPage, 
        pagesContainer.value, 
        zoom.value, 
        { isInitialLoad: true, scrollPriority }
      );
      
      // 记录页面高度信息
      result.pageHeights.forEach((height, index) => {
        const pageNum = startPage + index;
        pageHeights.value.set(pageNum, height);
      });
      
      // 计算估计的页面高度
      if (result.pageHeights.length > 0) {
        const avgHeight = result.pageHeights.reduce((sum, h) => sum + h, 0) / result.pageHeights.length;
        estimatedPageHeight.value = avgHeight;
        
        // 估算总文档高度
        updateTotalDocumentHeight();
      }
    };

    // 更新总文档高度估算
    const updateTotalDocumentHeight = () => {
      if (estimatedPageHeight.value === 0 || totalPages.value === 0) return;
      
      let totalHeight = 0;
      
      // 使用已知页面高度和估计高度计算总高度
      for (let i = 1; i <= totalPages.value; i++) {
        if (pageHeights.value.has(i)) {
          totalHeight += pageHeights.value.get(i)!;
        } else {
          totalHeight += estimatedPageHeight.value;
        }
      }
      
      // 添加页面间距
      totalHeight += (totalPages.value - 1) * 4; // 4px是页面间距
      
      totalDocumentHeight.value = totalHeight;
      console.log(`估算总文档高度: ${totalHeight}px, 平均页高: ${estimatedPageHeight.value}px`);
    };

    const handleScroll = async (e: Event) => {
      // 如果标记了跳过本次滚动事件，则跳过处理并重置标记
      if (skipNextScrollEvent.value) {
        skipNextScrollEvent.value = false;
        return;
      }
      
      // 如果正在恢复进度或尚未完成初始渲染，不处理滚动事件
      if (isRestoringProgress.value || !initialRenderComplete.value || !pdfContent.value || isLoading.value) {
        return;
      }

      // 更新滚动位置
      scrollTop.value = pdfContent.value.scrollTop;
      
      // 计算可见页面
      const visiblePageRange = calculateVisiblePageRange();
      if (visiblePageRange.length < 2) return;
      
      const [minVisiblePage, maxVisiblePage] = visiblePageRange;
      
      // 更新当前页码，避免不必要的更新
      if (minVisiblePage > 0 && currentPage.value !== minVisiblePage) {
        currentPage.value = minVisiblePage;
      }
      
      // 动态渲染可见区域附近的页面
      if (!isLoading.value && minVisiblePage > 0 && maxVisiblePage > 0) {
        isLoading.value = true;
        try {
          console.log(`可见页面范围: ${minVisiblePage} - ${maxVisiblePage}`);
          
          // 渲染可见区域附近的页面
          await pdfService.renderVisiblePages(
            fileId.value,
            pagesContainer.value!,
            minVisiblePage,
            maxVisiblePage,
            bufferSize, // 缓冲区大小
            zoom.value
          );
          
          // 更新页面高度信息
          updateVisiblePagesHeight(minVisiblePage - bufferSize, maxVisiblePage + bufferSize);
        } catch (error) {
          console.error('动态渲染页面失败:', error);
        } finally {
          isLoading.value = false;
        }
      }
    };
    
    // 更新可见页面的实际高度
    const updateVisiblePagesHeight = (startPage: number, endPage: number) => {
      if (!pagesContainer.value) return;
      
      let updated = false;
      
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        const pageElement = pagesContainer.value.querySelector(`[data-page="${pageNum}"]`);
        if (pageElement && !pageElement.hasAttribute('data-placeholder')) {
          const height = (pageElement as HTMLElement).clientHeight;
          
          // 只在高度变化时更新
          if (!pageHeights.value.has(pageNum) || pageHeights.value.get(pageNum) !== height) {
            pageHeights.value.set(pageNum, height);
            updated = true;
          }
        }
      }
      
      // 如果有更新，重新计算总高度
      if (updated) {
        updateTotalDocumentHeight();
      }
    };

    // 计算当前可见的页面范围
    const calculateVisiblePageRange = (): number[] => {
      if (!pdfContent.value || !pagesContainer.value) return [];
      
      const visiblePages = getVisiblePages();
      if (visiblePages.length === 0) return [];
      
      const minPage = Math.min(...visiblePages);
      const maxPage = Math.max(...visiblePages);
      return [minPage, maxPage];
    };

    // 创建一个防抖版本的滚动处理函数
    const debounceHandleScroll = debounce(handleScroll, 100);

    // 防抖函数
    function debounce(fn: Function, delay: number) {
      let timer: number | null = null;
      return function(this: any, ...args: any[]) {
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
      const containerRect = pdfContent.value.getBoundingClientRect();
      const containerTop = containerRect.top;
      const containerBottom = containerTop + pdfContent.value.clientHeight;
      const pageElements = pagesContainer.value.querySelectorAll('[data-page]');
      
      for (let i = 0; i < pageElements.length; i++) {
        const element = pageElements[i] as HTMLElement;
        const rect = element.getBoundingClientRect();
        const pageNum = parseInt(element.getAttribute('data-page') || '0');
        
        // 判断页面是否在可视区域内
        const elementTop = rect.top;
        const elementBottom = rect.bottom;
        
        // 如果元素与容器可视区域有交叉，则认为是可见的
        if (elementBottom > containerTop && elementTop < containerBottom) {
          result.push(pageNum);
          
          // 记录滚动位置与页码的映射关系
          const visibleRatio = Math.min(elementBottom, containerBottom) - Math.max(elementTop, containerTop);
          if (visibleRatio > 0) {
            scrollPositionMap.value.set(pageNum, element.offsetTop);
          }
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
    
    // 在组件加载完成后调用此方法，默认展开缩略图
    const initThumbnails = () => {
      // 设置状态为显示
      showThumbnails.value = true;
      // 等待thumbnailsRef可用后展开缩略图面板
      requestAnimationFrame(() => {
        if (thumbnailsRef.value) {
          thumbnailsRef.value.show();
          // 确保当前页面在缩略图中可见
          setTimeout(() => {
            if (thumbnailsRef.value) {
              thumbnailsRef.value.updateCurrentPage(currentPage.value);
            }
          }, 100);
        }
      });
    };

    const handleZoom = async (newZoom: number) => {
      if (newZoom >= 0.5 && newZoom <= 2) {
        // 标记正在操作中，防止触发中间状态保存
        isRestoringProgress.value = true;
        
        // 记录当前页面作为缩放后的锚点
        const currentVisiblePage = currentPage.value;
        const oldZoom = zoom.value;
        
        zoom.value = newZoom;
        if (pagesContainer.value) {
          // 清除页面高度缓存，因为缩放会改变高度
          pageHeights.value.clear();
          estimatedPageHeight.value = 0;
          
          // 获取当前可见页面范围
          const visiblePages = getVisiblePages();
          if (visiblePages.length > 0) {
            const minPage = Math.min(...visiblePages);
            const maxPage = Math.max(...visiblePages);
            
            const startPage = Math.max(1, minPage - 1);
            const endPage = Math.min(totalPages.value, maxPage + 1);
            
            // 重新初始化文档，使用新的缩放比例
            try {
              // 比较旧的缩放值和新的缩放值方向，决定渲染策略
              const zoomingIn = newZoom > oldZoom;
              await initializeDocument(startPage, endPage, zoomingIn ? 'center' : 'top');
              
              // 定位到原来的页面
              await new Promise(resolve => setTimeout(resolve, 50));
              skipNextScrollEvent.value = true;
              goToPage(currentVisiblePage, false); // false表示无需标记isRestoringProgress
            } finally {
              // 无论如何，确保恢复标记被重置
              setTimeout(() => {
                isRestoringProgress.value = false;
              }, 500);
            }
          } else {
            isRestoringProgress.value = false;
          }
        } else {
          isRestoringProgress.value = false;
        }
      }
    };

    const handleClose = async () => {
      if (fileId.value) {
        await pdfService.closePDF(fileId.value);
      }
      router.push('/');
    };
    // 切换缩略图面板显示状态
    const toggleThumbnails = () => {
      showThumbnails.value = !showThumbnails.value;
      console.log('toggleThumbnails', showThumbnails.value);
      if (thumbnailsRef.value) {
        try {
          if (showThumbnails.value) {
            thumbnailsRef.value.show();
            // 短暂延迟后确保当前页面的缩略图可见
            setTimeout(() => {
              if (thumbnailsRef.value) {
                thumbnailsRef.value.updateCurrentPage(currentPage.value);
              }
            }, 100);
          } else {
            thumbnailsRef.value.hide();
          }
        } catch (error) {
          console.error('操作缩略图组件失败:', error);
        }
      }
    };

    // 预加载缩略图
    const preloadThumbnails = async () => {
      if (!fileId.value || totalPages.value === 0) return;
      
      console.log('开始预加载缩略图');
      
      // 不依赖thumbnailsRef，直接通过pdfService加载
      try {
        // 确保第一页和当前页的缩略图被加载
        const pagesToPreload = [1];
        if (currentPage.value > 1) {
          pagesToPreload.push(currentPage.value);
        }
        
        // 添加当前页附近的页面
        const buffer = 2;
        for (let i = Math.max(1, currentPage.value - buffer); i <= Math.min(totalPages.value, currentPage.value + buffer); i++) {
          if (!pagesToPreload.includes(i)) {
            pagesToPreload.push(i);
          }
        }
        
        // 预加载缩略图，但不阻塞UI
        for (const page of pagesToPreload) {
          try {
            await pdfService.renderThumbnail(fileId.value, page, 0.2);
          } catch (error) {
            console.error(`预加载第 ${page} 页缩略图失败:`, error);
          }
        }
        
        console.log(`预加载了 ${pagesToPreload.length} 个缩略图`);
      } catch (error) {
        console.error('预加载缩略图失败:', error);
      }
    };

    // 跳转到指定页面
    const goToPage = async (pageNum: number, markAsRestoring = true) => {
      if (!pdfContent.value || !pagesContainer.value || pageNum < 1 || pageNum > totalPages.value) return;
      
      // 允许调用者决定是否标记为恢复中
      if (markAsRestoring) {
        isRestoringProgress.value = true;
      }
      
      // 先检查页面是否已渲染
      let pageElement = pagesContainer.value.querySelector(`[data-page="${pageNum}"]`);
      
      // 如果页面尚未渲染，先渲染它
      if (!pageElement || pageElement.hasAttribute('data-placeholder')) {
        console.log(`页面 ${pageNum} 尚未渲染，开始渲染`);
        
        // 计算渲染范围，以请求页为中心
        const buffer = Math.floor(visiblePages.value / 2);
        const startPage = Math.max(1, pageNum - buffer);
        const endPage = Math.min(totalPages.value, pageNum + buffer);
        
        try {
          isLoading.value = true;
          await pdfService.renderPages(
            fileId.value,
            startPage,
            endPage,
            pagesContainer.value,
            zoom.value,
            { scrollPriority: 'center' }
          );
          
          // 重新获取元素引用
          pageElement = pagesContainer.value.querySelector(`[data-page="${pageNum}"]`);
        } catch (error) {
          console.error(`渲染页面 ${pageNum} 失败:`, error);
        } finally {
          isLoading.value = false;
        }
      }
      
      if (pageElement) {
        // 在滚动前标记跳过下一次滚动事件处理
        skipNextScrollEvent.value = true;
        
        // 使用平滑滚动
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        currentPage.value = pageNum;
        
        // 确保缩略图面板中的当前页面可见
        if (thumbnailsRef.value) {
          // 使用 requestAnimationFrame 确保在滚动动画开始后更新缩略图位置
          requestAnimationFrame(() => {
            thumbnailsRef.value?.updateCurrentPage(pageNum);
          });
        }
        
        // 延迟恢复保存进度功能，等待滚动动画完成
        if (markAsRestoring) {
          setTimeout(() => {
            isRestoringProgress.value = false;
          }, 600);
        }
      } else {
        console.error(`无法找到页面元素: ${pageNum}`);
        if (markAsRestoring) {
          isRestoringProgress.value = false;
        }
      }
    };

    // 监听当前页面变化，更新缩略图选中状态
    watch(currentPage, (newPage) => {
      if (thumbnailsRef.value) {
        try {
          // 使用 requestAnimationFrame 确保在 DOM 更新后更新缩略图位置
          requestAnimationFrame(() => {
            thumbnailsRef.value?.updateCurrentPage(newPage);
          });
          
          // 如果缩略图面板打开，加载当前页的缩略图
          if (showThumbnails.value) {
            // 直接使用 pdfService 渲染当前页的缩略图，不依赖组件的 loadThumbnail 方法
            pdfService.renderThumbnail(fileId.value, newPage, 0.2)
              .catch(error => console.error(`渲染当前页(${newPage})缩略图失败:`, error));
          }
        } catch (error) {
          console.error('更新缩略图当前页失败:', error);
        }
      }
    });

    return {
      zoom,
      fileId,
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
      thumbnailsRef,
      toggleThumbnails,
      goToPage,
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

.pdf-pages-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: 4px;
}

.pdf-page-container {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: transparent;
}

.pages-container canvas {
  background-color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.virtual-scroller {
  width: 100%;
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
  