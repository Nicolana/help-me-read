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
            'thumbnail-active': item.pageNum === currentPage
          }"
          :style="{ 
            transform: `translateY(${item.offsetY}px)`,
            height: `${item.height}px` 
          }"
          @click="selectPage(item.pageNum)"
        >
          <div class="thumbnail-page-number">{{ item.pageNum }}</div>
          
          <!-- 缩略图内容区域 - 同时包含canvas和img，通过css控制显示 -->
          <div class="thumbnail-content">
            <!-- 始终渲染canvas元素，用于初始渲染，但在有图片时隐藏 -->
            <canvas 
              :data-page="item.pageNum" 
              class="thumbnail-canvas"
              :class="{ 'canvas-hidden': thumbnails[item.pageNum] }"
            ></canvas>
            
            <!-- 显示已缓存的图片 -->
            <img 
              v-if="thumbnails[item.pageNum]" 
              :src="thumbnails[item.pageNum]" 
              class="thumbnail-image" 
              :alt="`Page ${item.pageNum}`" 
            />
            
            <!-- 加载指示器 -->
            <div 
              v-if="loadingPages.includes(item.pageNum)" 
              class="thumbnail-loading-indicator"
            >
              <div class="loading-spinner"></div>
            </div>
            
            <!-- 错误指示器 -->
            <div 
              v-if="errorPages.includes(item.pageNum)" 
              class="thumbnail-error-indicator" 
              @click.stop="retryRender(item.pageNum)"
            >
              <span>重试</span>
            </div>
          </div>
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
import { ThumbnailCache } from '../services/thumbnail-cache';

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
    const thumbnailCache = ThumbnailCache.getInstance();
    
    // 缩略图数据URL存储
    const thumbnails = ref<Record<number, string>>({});
    
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
      
      // 找出尚未渲染或加载的页面
      for (const pageNum of currentVisiblePageNumbers) {
        if (!renderedPages.value.has(pageNum) && 
            !loadingPages.value.includes(pageNum) && 
            !renderPromises.value.has(pageNum) &&
            !thumbnails.value[pageNum]) {
          pagesToRender.push(pageNum);
        }
      }
      
      // 如果有需要渲染的页面，按优先级排序并渲染
      if (pagesToRender.length > 0) {
        // 优先渲染当前页面附近的缩略图
        pagesToRender.sort((a, b) => {
          return Math.abs(a - props.currentPage) - Math.abs(b - props.currentPage);
        });
        
        // 限制并发渲染数量
        const pagesToProcess = pagesToRender.slice(0, maxConcurrentRenders);
        for (const pageNum of pagesToProcess) {
          loadThumbnail(pageNum);
        }
      }
      
      // 清理不再可见的页面缓存（仅当内存缓存页数超过最大值时）
      if (Object.keys(thumbnails.value).length > maxCachedPages) {
        cleanupCache(currentVisiblePageNumbers);
      }
    };

    // 清理不再可见的缩略图内存缓存
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
      
      // 移除不需要保留的缩略图内存缓存
      const allCachedPages = Object.keys(thumbnails.value).map(Number);
      const pagesToRemove = allCachedPages.filter(pageNum => !pagesToKeep.has(pageNum));
      
      // 只清理内存缓存，不影响文件系统缓存
      if (pagesToRemove.length > 0) {
        for (const pageNum of pagesToRemove) {
          delete thumbnails.value[pageNum];
          renderedPages.value.delete(pageNum);
        }
      }
    };

    // 加载缩略图（从缓存或通过渲染）
    const loadThumbnail = async (pageNum: number) => {
      if (!props.fileId || renderPromises.value.has(pageNum)) return;
      
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
              // 首先尝试使用缓存
              const isCached = await thumbnailCache.hasThumbnail(props.fileId, pageNum);
              
              if (isCached) {
                // 从缓存加载缩略图
                const imageUrl = await thumbnailCache.getThumbnail(props.fileId, pageNum);
                thumbnails.value[pageNum] = imageUrl;
                
                // 记录已成功渲染的页面
                renderedPages.value.add(pageNum);
                break;
              }
              
              // 缓存不存在，使用canvas渲染
              const thumbnailScale = 0.2;
              
              // 修复获取canvas元素的方式，添加延迟确保DOM已更新
              await new Promise(resolve => setTimeout(resolve, 10));
              const canvas = thumbnailsContainer.value?.querySelector(`canvas[data-page="${pageNum}"]`) as HTMLCanvasElement;
              
              if (canvas) {
                console.log(`找到canvas元素，准备渲染页面 ${pageNum}`);
                await pdfService.renderThumbnail(props.fileId, pageNum, canvas, thumbnailScale);
                
                // PDFRenderManager现在会自动缓存渲染后的缩略图
                // 然后我们获取缓存的图像URL并在内存中保存
                const imageUrl = await thumbnailCache.getThumbnail(props.fileId, pageNum);
                thumbnails.value[pageNum] = imageUrl;
                
                // 记录已成功渲染的页面
                renderedPages.value.add(pageNum);
                break;
              } else {
                // 没有找到canvas元素，可能是DOM已更新
                console.error(`未找到canvas元素，页面 ${pageNum}`);
                throw new Error('Canvas element not found');
              }
            } catch (err) {
              console.error(`渲染尝试 ${renderAttempts}/${maxAttempts} 失败:`, err);
              
              if (renderAttempts >= maxAttempts) {
                throw err; // 达到最大重试次数，抛出错误
              }
              
              // 等待一段时间后重试
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          
          // 从加载列表中移除
          const index = loadingPages.value.indexOf(pageNum);
          if (index !== -1) {
            loadingPages.value.splice(index, 1);
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
        loadThumbnail(pageNum);
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
        thumbnails.value = {};
        renderedPages.value.clear();
        loadingPages.value = [];
        errorPages.value = [];
        renderPromises.value.clear();
        
        if (visible.value) {
          console.log('visible', visible.value);
          // 短暂延迟，确保DOM已更新
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
        // 新的元素会在下次滚动时自动触发渲染
      }
    }, { deep: true });

    // 监听当前页面变化，滚动到该页面
    watch(() => props.currentPage, (newPage) => {
      updateCurrentPage(newPage);
    });
    
    // 组件销毁前清理资源
    onBeforeUnmount(() => {
      if (throttleTimer) {
        clearTimeout(throttleTimer);
      }
      
      // 清空渲染缓存
      thumbnails.value = {};
      renderedPages.value.clear();
      loadingPages.value = [];
      errorPages.value = [];
      renderPromises.value.clear();
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
      loadThumbnail,
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
      thumbnails
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

.thumbnail-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.thumbnail-canvas {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

.canvas-hidden {
  visibility: hidden;
}

.thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  position: relative;
  z-index: 1;
}

.thumbnail-loading-indicator, 
.thumbnail-error-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2;
}

.thumbnail-loading-indicator {
  background-color: rgba(0, 0, 0, 0.2);
}

.thumbnail-error-indicator {
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.thumbnail-error-indicator span {
  padding: 4px 8px;
  background-color: rgba(255, 0, 0, 0.5);
  border-radius: 4px;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
  