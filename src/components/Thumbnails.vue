<template>
  <div class="thumbnails-panel">
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
import { defineComponent, ref, computed } from 'vue';
import CustomScrollbar from './CustomScrollbar.vue';

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
    }
  },

  emits: ['select-page'],

  setup(props, { emit }) {
    const thumbnailsContainer = ref<HTMLElement | null>(null);
    const scrollTop = ref(0);

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

    return {
      thumbnailsContainer,
      contentHeight,
      viewportHeight,
      scrollTop,
      selectPage
    };
  }
});
</script>

<style scoped>
.thumbnails-panel {
  width: 200px;
  background-color: #2a2a2a;
  border-right: 1px solid #3a3a3a;
  position: relative;
  overflow: hidden;
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
  