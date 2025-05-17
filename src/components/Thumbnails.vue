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
        <!-- 只在DOM中创建可见的缩略图元素 -->
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
          
          <!-- 缩略图内容区域 -->
          <div class="thumbnail-content">
            <!-- 显示缩略图图片 -->
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
    const visible = ref(true);
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
    const itemHeight = 150; // 进一步减小缩略图高度，让每屏可显示更多项目
    const itemGap = 5; // 进一步减小间距
    const bufferSize = 20; // 大幅增加缓冲区大小
    const maxConcurrentRenders = 10; // 增加并行渲染数量
    const maxCachedPages = 150; // 增加最大缓存页数
    
    // 节流相关
    const scrollThrottleDelay = 50; // 减少滚动节流延迟，提高响应速度
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
      // 根据容器高度计算可见项目数，加上两倍缓冲区大小
      const count = Math.ceil(viewportHeight.value / (itemHeight + itemGap)) + bufferSize * 2;
      console.log(`计算可见项目数: 视口高度=${viewportHeight.value}px, 每项高度=${itemHeight + itemGap}px, 可见项目数=${count}`);
      return count;
    });

    // 计算可见项目的索引范围
    const visibleRange = computed(() => {
      if (!thumbnailsContainer.value) return { start: 0, end: 0 };

      const start = Math.floor(scrollTop.value / (itemHeight + itemGap));
      // 确保至少显示一定数量的项目，即使滚动位置很小
      const minVisibleItems = Math.min(20, props.totalPages); 
      const bufferedStart = Math.max(0, start - bufferSize);
      const bufferedEnd = Math.min(
        props.totalPages - 1, 
        Math.max(start + visibleItemCount.value, bufferedStart + minVisibleItems)
      );

      console.log(`可见范围: start=${bufferedStart}, end=${bufferedEnd}, 总项目数=${bufferedEnd - bufferedStart + 1}`);
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

      console.log(`创建的DOM项目数: ${items.length}`);
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

    // 加载缩略图
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
              // 直接渲染缩略图并获取URL
              const thumbnailScale = 0.2;
              const imageUrl = await pdfService.renderThumbnail(props.fileId, pageNum, thumbnailScale);
              
              // 保存到内存缓存
              thumbnails.value[pageNum] = imageUrl;
              
              // 记录已成功渲染的页面
              renderedPages.value.add(pageNum);
              break;
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
          console.log('文件ID已变更，重新加载缩略图');
          // 短暂延迟，确保DOM已更新
          setTimeout(() => {
            initThumbnails();
          }, 50);
        }
      }
    });

    // 监听 visible 变化，当显示时渲染缩略图
    watch(visible, (newVisible) => {
      if (newVisible) {
        console.log('缩略图面板已显示，加载缩略图');
        // 确保DOM已完全更新并且正确测量尺寸
        setTimeout(() => {
          // 滚动到当前页面
          updateCurrentPage(props.currentPage);
          // 初始化缩略图
          initThumbnails();
        }, 100);
      }
    }, { immediate: true });

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

    // 初始化时立即尝试加载第一屏缩略图
    const initThumbnails = () => {
      if (!props.fileId || !visible.value) return;
      
      console.log('initThumbnails: 开始初始化缩略图');
      
      // 确保加载前几页和当前页附近的缩略图
      const initialPages: number[] = [];
      
      // 加载前15页
      for (let i = 1; i <= Math.min(15, props.totalPages); i++) {
        initialPages.push(i);
      }
      
      // 加载当前页和周围页面
      if (props.currentPage > 5) {
        for (let i = Math.max(1, props.currentPage - 10); i <= Math.min(props.totalPages, props.currentPage + 10); i++) {
          if (!initialPages.includes(i)) {
            initialPages.push(i);
          }
        }
      }
      
      // 如果文档很大，再加载最后几页的缩略图
      if (props.totalPages > 30) {
        for (let i = Math.max(props.totalPages - 5, initialPages[initialPages.length - 1] + 1); i <= props.totalPages; i++) {
          initialPages.push(i);
        }
      }
      
      // 按与当前页的接近程度排序
      initialPages.sort((a, b) => Math.abs(a - props.currentPage) - Math.abs(b - props.currentPage));
      
      // 开始加载
      console.log(`初始化加载 ${initialPages.length} 页缩略图，当前页: ${props.currentPage}`);
      
      // 使用Promise.all和分批处理来控制并行加载
      const batchSize = maxConcurrentRenders;
      const processBatch = async (startIdx: number) => {
        const batch = initialPages.slice(startIdx, startIdx + batchSize);
        if (batch.length === 0) return;
        
        const promises = batch.map(pageNum => {
          if (!thumbnails.value[pageNum] && !loadingPages.value.includes(pageNum) && !renderPromises.value.has(pageNum)) {
            return loadThumbnail(pageNum);
          }
          return Promise.resolve();
        });
        
        await Promise.all(promises);
        
        // 处理下一批
        if (startIdx + batchSize < initialPages.length) {
          processBatch(startIdx + batchSize);
        }
      };
      
      // 开始处理第一批
      processBatch(0);
    };

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
  width: 150px;
}

.thumbnails-container {
  padding: 5px; /* 减小内边距 */
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
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  background-color: #333;
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
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.1);
}

.thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 3px;
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
  