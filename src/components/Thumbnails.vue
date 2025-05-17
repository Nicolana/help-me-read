<template>
  <div class="thumbnails-panel" :class="{ 'thumbnails-panel-visible': visible }">
    <div 
      class="thumbnails-container" 
      ref="thumbnailsContainer"
      @scroll="throttledHandleScroll"
    >
      <div 
        class="thumbnails-content" 
        :style="{ height: `${totalContentHeight}px` }"
      >
        <div 
          v-for="item in visibleItems" 
          :key="item.pageNum" 
          class="thumbnail-item"
          :class="{ 
            'thumbnail-active': item.pageNum === currentPage,
            'thumbnail-loading': loadingPages.includes(item.pageNum),
            'thumbnail-error': errorPages.includes(item.pageNum)
          }"
          :style="{ 
            transform: `translateY(${item.offsetY}px)`,
            height: `${item.height}px` 
          }"
          @click="selectPage(item.pageNum)"
        >
          <div class="thumbnail-page-number">{{ item.pageNum }}</div>
          <div v-if="loadingPages.includes(item.pageNum)" class="thumbnail-loading-indicator">
            <div class="loading-spinner"></div>
          </div>
          <div v-else-if="errorPages.includes(item.pageNum)" class="thumbnail-error-indicator" @click.stop="retryRender(item.pageNum)">
            <span>重试</span>
          </div>
          <canvas :ref="el => registerCanvasRef(el as HTMLCanvasElement, item.pageNum)" :data-page="item.pageNum"></canvas>
        </div>
      </div>
    </div>
    <CustomScrollbar
      :container-ref="thumbnailsContainer"
      :content-height="totalContentHeight"
      :viewport-height="viewportHeight"
      v-model:scrollTop="scrollTop"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, onBeforeUnmount } from 'vue';
import CustomScrollbar from './CustomScrollbar.vue';
import { PDFService } from '../services/pdf';

interface ThumbnailItem {
  pageNum: number;
  offsetY: number;
  height: number;
}

export default defineComponent({
  name: 'Thumbnails',
  components: {
    CustomScrollbar
  },
  
  props: {
    totalPages: {
      type: Number,
      required: true
    },
    currentPage: {
      type: Number,
      required: true
    },
    fileId: {
      type: String,
      required: true
    }
  },

  emits: ['select-page'],

  setup(props, { emit, expose }) {
    const thumbnailsContainer = ref<HTMLElement | null>(null);
    const scrollTop = ref(0);
    const visible = ref(false);
    const pdfService = PDFService.getInstance();
    
    // Canvas引用缓存
    const canvasRefs = ref<Map<number, HTMLCanvasElement>>(new Map());
    
    // 渲染状态管理
    const renderedPages = ref<Set<number>>(new Set());
    const loadingPages = ref<number[]>([]);
    const errorPages = ref<number[]>([]);
    const renderPromises = ref<Map<number, Promise<void>>>(new Map());
    
    // 缩略图大小设置
    const itemHeight = 150;
    const itemGap = 10;
    const bufferSize = 3; // 增加缓冲区大小，提升滚动体验
    const maxConcurrentRenders = 3; // 最大并行渲染数量
    const maxCachedPages = 100; // 最大缓存页数
    
    // 节流相关
    const scrollThrottleDelay = 100; // 滚动节流延迟(ms)
    let throttleTimer: number | null = null;
    let lastScrollTime = 0;
    
    // 注册Canvas引用，用于在DOM创建后立即获取引用
    const registerCanvasRef = (el: HTMLCanvasElement | null, pageNum: number) => {
      if (el) {
        canvasRefs.value.set(pageNum, el);
        // 如果页面已被加入队列但尚未渲染，尝试渲染
        if (!renderedPages.value.has(pageNum) && 
            !loadingPages.value.includes(pageNum) && 
            !renderPromises.value.has(pageNum)) {
          renderThumbnail(pageNum);
        }
      } else {
        // 元素被销毁时从引用中移除
        canvasRefs.value.delete(pageNum);
      }
    };
    
    // 计算所有缩略图的总高度
    const totalContentHeight = computed(() => {
      return props.totalPages * (itemHeight + itemGap);
    });

    // 计算视口高度
    const viewportHeight = computed(() => {
      return thumbnailsContainer.value?.clientHeight || 0;
    });

    // 计算可见项目的数量
    const visibleItemCount = computed(() => {
      return Math.ceil(viewportHeight.value / (itemHeight + itemGap)) + bufferSize * 2;
    });

    // 计算可见项目的索引范围
    const visibleRange = computed(() => {
      if (!thumbnailsContainer.value) return { start: 0, end: 0 };

      const start = Math.floor(scrollTop.value / (itemHeight + itemGap));
      const bufferedStart = Math.max(0, start - bufferSize);
      const bufferedEnd = Math.min(props.totalPages - 1, start + visibleItemCount.value + bufferSize);

      return {
        start: bufferedStart,
        end: bufferedEnd
      };
    });

    // 计算可见项目列表 - 这些是唯一会在DOM中创建的元素
    const visibleItems = computed(() => {
      const { start, end } = visibleRange.value;
      const items: ThumbnailItem[] = [];

      for (let i = start; i <= end; i++) {
        const pageNum = i + 1;
        items.push({
          pageNum,
          offsetY: i * (itemHeight + itemGap),
          height: itemHeight
        });
      }

      return items;
    });

    // 滚动事件节流处理
    const throttledHandleScroll = () => {
      const now = Date.now();
      if (now - lastScrollTime >= scrollThrottleDelay) {
        handleScroll();
        lastScrollTime = now;
      } else if (!throttleTimer) {
        throttleTimer = window.setTimeout(() => {
          handleScroll();
          lastScrollTime = Date.now();
          throttleTimer = null;
        }, scrollThrottleDelay);
      }
    };

    // 处理滚动事件
    const handleScroll = () => {
      if (thumbnailsContainer.value) {
        scrollTop.value = thumbnailsContainer.value.scrollTop;
        queueRenderVisibleThumbnails();
      }
    };

    // 管理渲染队列
    const queueRenderVisibleThumbnails = () => {
      console.log('queueRenderVisibleThumbnails', props.fileId, visible.value);
      if (!props.fileId || !visible.value) return;
      
      // 获取当前可见的项目
      const currentVisiblePageNumbers = visibleItems.value.map(item => item.pageNum);
      const pagesToRender: number[] = [];
      
      // 找出尚未渲染的页面
      for (const pageNum of currentVisiblePageNumbers) {
        if (!renderedPages.value.has(pageNum) && 
            !loadingPages.value.includes(pageNum) && 
            !renderPromises.value.has(pageNum) &&
            canvasRefs.value.has(pageNum)) { // 确保DOM已创建
          pagesToRender.push(pageNum);
        }
      }
      
      // 如果有需要渲染的页面，按顺序优先级排序并渲染
      if (pagesToRender.length > 0) {
        // 优先渲染当前页面附近的缩略图
        pagesToRender.sort((a, b) => {
          return Math.abs(a - props.currentPage) - Math.abs(b - props.currentPage);
        });
        
        // 限制并发渲染数量
        const pagesToProcess = pagesToRender.slice(0, maxConcurrentRenders);
        for (const pageNum of pagesToProcess) {
          renderThumbnail(pageNum);
        }
      }
      
      // 清理不再可见的页面缓存（仅当缓存页数超过最大值时）
      if (renderedPages.value.size > maxCachedPages) {
        cleanupCache(currentVisiblePageNumbers);
      }
    };

    // 清理不再可见的缩略图缓存
    const cleanupCache = (currentVisiblePageNumbers: number[]) => {
      const currentVisible = new Set(currentVisiblePageNumbers);
      const pagesToKeep = new Set<number>();
      
      // 保留当前可见页面
      for (const pageNum of currentVisible) {
        pagesToKeep.add(pageNum);
      }
      
      // 保留当前页面附近的缩略图
      const currentPageIndex = props.currentPage;
      const buffer = 10; // 当前页面前后保留的页数
      
      for (let i = Math.max(1, currentPageIndex - buffer); i <= Math.min(props.totalPages, currentPageIndex + buffer); i++) {
        pagesToKeep.add(i);
      }
      
      // 移除不需要保留的缩略图缓存
      const allRendered = Array.from(renderedPages.value);
      const pagesToRemove = allRendered.filter(pageNum => !pagesToKeep.has(pageNum));
      
      // 仅保留最近渲染的页面，释放多余的缓存
      if (renderedPages.value.size - pagesToRemove.length > maxCachedPages / 2) {
        const pagesToActuallyRemove = pagesToRemove.slice(0, renderedPages.value.size - maxCachedPages / 2);
        
        for (const pageNum of pagesToActuallyRemove) {
          renderedPages.value.delete(pageNum);
          
          // 由于DOM元素已经被移除，不需要手动清理canvas
          // 但从页面渲染状态中移除
          errorPages.value = errorPages.value.filter(p => p !== pageNum);
        }
      }
    };

    // 渲染单个缩略图
    const renderThumbnail = async (pageNum: number) => {
      if (!props.fileId) return;
      if (renderPromises.value.has(pageNum)) return;
      
      // 获取canvas引用
      const canvas = canvasRefs.value.get(pageNum);
      if (!canvas) return; // 如果DOM中没有对应的canvas，跳过渲染
      
      loadingPages.value.push(pageNum);
      
      // 移除错误状态（如果存在）
      const errorIndex = errorPages.value.indexOf(pageNum);
      if (errorIndex !== -1) {
        errorPages.value.splice(errorIndex, 1);
      }
      
      let renderAttempts = 0;
      const maxAttempts = 2;
      
      const renderPromise = (async () => {
        try {
          while (renderAttempts < maxAttempts) {
            renderAttempts++;
            try {
              const thumbnailScale = 0.2;
              
              await pdfService.renderThumbnail(props.fileId, pageNum, canvas, thumbnailScale);
              
              // 记录已成功渲染的页面
              renderedPages.value.add(pageNum);
              
              // 从加载列表中移除
              const index = loadingPages.value.indexOf(pageNum);
              if (index !== -1) {
                loadingPages.value.splice(index, 1);
              }
              
              break; // 成功渲染，退出重试循环
            } catch (err) {
              if (renderAttempts >= maxAttempts) {
                throw err; // 达到最大重试次数，抛出错误
              }
              
              // 等待一段时间后重试
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        } catch (error) {
          console.error(`渲染缩略图失败 (页面 ${pageNum}):`, error);
          
          // 从加载列表中移除
          const loadingIndex = loadingPages.value.indexOf(pageNum);
          if (loadingIndex !== -1) {
            loadingPages.value.splice(loadingIndex, 1);
          }
          
          // 添加到错误列表
          if (!errorPages.value.includes(pageNum)) {
            errorPages.value.push(pageNum);
          }
        } finally {
          // 无论成功失败，都从渲染Promise映射中移除
          renderPromises.value.delete(pageNum);
        }
      })();
      
      // 存储渲染Promise
      renderPromises.value.set(pageNum, renderPromise);
      
      // 等待渲染完成
      await renderPromise;
    };

    // 重试渲染失败的缩略图
    const retryRender = (pageNum: number) => {
      const errorIndex = errorPages.value.indexOf(pageNum);
      if (errorIndex !== -1) {
        errorPages.value.splice(errorIndex, 1);
        renderThumbnail(pageNum);
      }
    };

    const selectPage = (pageNum: number) => {
      emit('select-page', pageNum);
    };

    // 更新当前页面并滚动到该页面
    const updateCurrentPage = (pageNum: number) => {
      const offsetY = (pageNum - 1) * (itemHeight + itemGap);
      scrollTop.value = offsetY - (viewportHeight.value - itemHeight) / 2;
    };

    // 监听 fileId 变化，重新渲染缩略图
    watch(() => props.fileId, (newFileId, oldFileId) => {
      if (newFileId !== oldFileId) {
        // 清空之前的渲染缓存
        renderedPages.value.clear();
        loadingPages.value = [];
        errorPages.value = [];
        renderPromises.value.clear();
        canvasRefs.value.clear();
        
        if (visible.value) {
          // 短暂延迟确保DOM已更新
          setTimeout(() => {
            queueRenderVisibleThumbnails();
          }, 50);
        }
      }
    });

    // 监听 visible 变化，当显示时渲染缩略图
    watch(visible, (newVisible) => {
      if (newVisible) {
        console.log('visible', newVisible);
        // 短暂延迟，确保DOM已更新
        setTimeout(() => {
          queueRenderVisibleThumbnails();
        }, 50);
      }
    });

    // 监听可见范围变化，更新渲染
    watch(visibleRange, () => {
      if (visible.value) {
        // 当可见范围变化时，不需要立即调用queueRenderVisibleThumbnails
        // 因为visibleItems会自动更新，DOM会重新创建
        // 新的canvas元素会通过registerCanvasRef触发渲染
      }
    }, { deep: true });

    // 监听当前页面变化，滚动到该页面
    watch(() => props.currentPage, (newPage) => {
      updateCurrentPage(newPage);
    });

    // 组件挂载后初始化
    // onMounted(() => {
    //   if (visible.value) {
    //     // 短暂延迟，确保DOM已更新
    //     setTimeout(() => {
    //       queueRenderVisibleThumbnails();
    //     }, 50);
    //   }
      
    //   if (props.currentPage > 0) {
    //     updateCurrentPage(props.currentPage);
    //   }
    // });
    
    // 组件销毁前清理资源
    onBeforeUnmount(() => {
      if (throttleTimer) {
        clearTimeout(throttleTimer);
      }
      
      // 清空渲染缓存
      renderedPages.value.clear();
      loadingPages.value = [];
      errorPages.value = [];
      renderPromises.value.clear();
      canvasRefs.value.clear();
    });

    // 暴露给外部的方法
    const show = () => {
      visible.value = true;
    };

    const hide = () => {
      visible.value = false;
    };

    const toggle = () => {
      console.log('toggle', visible.value);
      visible.value = !visible.value;
    };

    // 暴露方法和属性给外部
    expose({
      show,
      hide,
      toggle,
      renderThumbnail,
      updateCurrentPage,
      thumbnailsContainer
    });

    return {
      thumbnailsContainer,
      totalContentHeight,
      viewportHeight,
      scrollTop,
      selectPage,
      visible,
      visibleItems,
      throttledHandleScroll,
      loadingPages,
      errorPages,
      retryRender,
      registerCanvasRef
    };
  }
});
</script>

<style scoped>
.thumbnails-panel {
  width: 0;
  background-color: #2a2a2a;
  border-right: 1px solid #3a3a3a;
  position: relative;
  overflow: hidden;
  transition: width 0.3s ease;
}

.thumbnails-panel-visible {
  width: 200px;
}

.thumbnails-container {
  padding: 10px;
  height: 100%;
  overflow-y: scroll;
  position: relative;
  /* 隐藏默认滚动条 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.thumbnails-container::-webkit-scrollbar {
  display: none;
}

.thumbnails-content {
  position: relative;
  width: 100%;
}

.thumbnail-item {
  position: absolute;
  width: calc(100% - 10px);
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
  overflow: hidden;
}

.thumbnail-item:hover {
  border-color: #666;
}

.thumbnail-active {
  border-color: #007bff;
}

.thumbnail-loading {
  background-color: rgba(0, 0, 0, 0.1);
}

.thumbnail-error {
  background-color: rgba(255, 0, 0, 0.1);
  border-color: rgba(255, 0, 0, 0.3);
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
  z-index: 2;
}

.thumbnail-loading-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.thumbnail-error-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 14px;
  z-index: 1;
  cursor: pointer;
}

.thumbnail-error-indicator span {
  padding: 4px 8px;
  background-color: rgba(255, 0, 0, 0.5);
  border-radius: 4px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
  