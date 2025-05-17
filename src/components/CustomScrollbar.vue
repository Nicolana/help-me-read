<template>
  <div class="custom-scrollbar" ref="scrollbar">
    <div class="scrollbar-track" @click="handleTrackClick">
      <div 
        class="scrollbar-thumb" 
        :style="{ 
          height: thumbHeight + 'px',
          transform: `translateY(${thumbPosition}px)`
        }"
        @mousedown="startDragging"
      ></div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

export default defineComponent({
  name: 'CustomScrollbar',
  
  props: {
    containerRef: {
      type: Object,
      required: true
    },
    contentHeight: {
      type: Number,
      required: true
    },
    viewportHeight: {
      type: Number,
      required: true
    },
    scrollTop: {
      type: Number,
      required: true
    }
  },

  emits: ['update:scrollTop'],

  setup(props, { emit }) {
    const scrollbar = ref<HTMLElement | null>(null);
    const isDragging = ref(false);
    const startY = ref(0);
    const startScrollTop = ref(0);

    // 计算滚动条高度和位置
    const thumbHeight = computed(() => {
      if (props.contentHeight <= 0) return 0;
      return Math.max(40, (props.viewportHeight / props.contentHeight) * props.viewportHeight);
    });

    const thumbPosition = computed(() => {
      if (props.contentHeight <= props.viewportHeight) return 0;
      const maxScroll = props.contentHeight - props.viewportHeight;
      const maxThumbPosition = props.viewportHeight - thumbHeight.value;
      return (props.scrollTop / maxScroll) * maxThumbPosition;
    });

    const startDragging = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDragging.value = true;
      startY.value = e.clientY;
      startScrollTop.value = props.scrollTop;
      document.addEventListener('mousemove', handleDrag);
      document.addEventListener('mouseup', stopDragging);
    };

    const handleDrag = (e: MouseEvent) => {
      if (!isDragging.value) return;
      
      const delta = e.clientY - startY.value;
      const maxScroll = props.contentHeight - props.viewportHeight;
      const maxThumbPosition = props.viewportHeight - thumbHeight.value;
      const percentage = delta / maxThumbPosition;
      const newScrollTop = startScrollTop.value + percentage * maxScroll;
      
      emit('update:scrollTop', Math.max(0, Math.min(maxScroll, newScrollTop)));
    };

    const stopDragging = () => {
      isDragging.value = false;
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', stopDragging);
    };

    const handleTrackClick = (e: MouseEvent) => {
      if (!scrollbar.value) return;
      
      const { top, height } = scrollbar.value.getBoundingClientRect();
      const clickPosition = e.clientY - top;
      const percentage = clickPosition / height;
      const maxScroll = props.contentHeight - props.viewportHeight;
      
      emit('update:scrollTop', percentage * maxScroll);
    };

    return {
      scrollbar,
      thumbHeight,
      thumbPosition,
      startDragging,
      handleTrackClick
    };
  }
});
</script>

<style scoped>
.custom-scrollbar {
  width: 8px;
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.1);
}

.scrollbar-track {
  width: 100%;
  height: 100%;
  position: relative;
  cursor: pointer;
}

.scrollbar-thumb {
  width: 100%;
  background-color: rgba(255, 255, 255, 0.3);
  position: absolute;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.5);
}

.scrollbar-thumb:active {
  background-color: rgba(255, 255, 255, 0.7);
}
</style> 