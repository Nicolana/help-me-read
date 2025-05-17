<template>
  <div class="thumbnails-panel" :class="{ 'thumbnails-panel-visible': visible }">
    <div class="thumbnails-container" ref="thumbnailsContainer">
      <div v-for="pageNum in totalPages" 
           :key="pageNum" 
           class="thumbnail-item"
           :class="{ 'thumbnail-active': pageNum === currentPage }"
           @click="selectPage(pageNum)">
        <div class="thumbnail-page-number">{{ pageNum }}</div>
        <canvas :data-page="pageNum"></canvas>
      </div>
    </div>
    <CustomScrollbar
      :container-ref="thumbnailsContainer"
      :content-height="contentHeight"
      :viewport-height="viewportHeight"
      v-model:scrollTop="scrollTop"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue';
import CustomScrollbar from './CustomScrollbar.vue';
import { PDFService } from '../services/pdf';

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

    // 计算内容高度和视口高度
    const contentHeight = computed(() => {
      return thumbnailsContainer.value?.scrollHeight || 0;
    });

    const viewportHeight = computed(() => {
      return thumbnailsContainer.value?.clientHeight || 0;
    });

    const selectPage = (pageNum: number) => {
      emit('select-page', pageNum);
    };

    // 渲染缩略图
    const renderThumbnails = async () => {
      if (!props.fileId || !thumbnailsContainer.value) return;

      try {
        const thumbnailScale = 0.2; // 缩略图缩放比例
        const canvases = thumbnailsContainer.value.querySelectorAll('canvas');
        
        for (const canvas of canvases) {
          const pageNum = parseInt(canvas.getAttribute('data-page') || '0');
          if (pageNum > 0) {
            await pdfService.renderThumbnail(props.fileId, pageNum, canvas as HTMLCanvasElement, thumbnailScale);
          }
        }
      } catch (error) {
        console.error('渲染缩略图失败:', error);
      }
    };

    // 更新当前页面
    const updateCurrentPage = (pageNum: number) => {
      const thumbnailElement = thumbnailsContainer.value?.querySelector(`[data-page="${pageNum}"]`);
      if (thumbnailElement) {
        thumbnailElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };

    // 监听 fileId 变化，重新渲染缩略图
    watch(() => props.fileId, () => {
      if (visible.value) {
        renderThumbnails();
      }
    });

    // 监听 visible 变化，当显示时渲染缩略图
    watch(visible, (newVisible) => {
      if (newVisible) {
        renderThumbnails();
      }
    });

    // 组件挂载后渲染缩略图
    // onMounted(() => {
    //   renderThumbnails();
    // });

    // 暴露给外部的方法
    const show = () => {
      visible.value = true;
    };

    const hide = () => {
      visible.value = false;
    };

    const toggle = () => {
      visible.value = !visible.value;
    };

    // 暴露方法和属性给外部
    expose({
      show,
      hide,
      toggle,
      renderThumbnails,
      updateCurrentPage,
      thumbnailsContainer
    });

    return {
      thumbnailsContainer,
      contentHeight,
      viewportHeight,
      scrollTop,
      selectPage,
      visible
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  overflow-y: scroll;
  /* 隐藏默认滚动条 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.thumbnails-container::-webkit-scrollbar {
  display: none;
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
</style>
  