<template>
    <div class="thumbnails">
      <div v-for="page in pages" :key="page.pageNumber" class="thumbnail" @click="selectPage(page.pageNumber)">
        <canvas :ref="'thumbnail-' + page.pageNumber"></canvas>
      </div>
    </div>
  </template>
  
  <script lang="ts">
  interface PDFPage {
    pageNumber: number;
  }

  export default {
    props: {
      pages: {
        type: Array as () => PDFPage[],
        required: true
      }
    },
    methods: {
      selectPage(pageNum: number) {
        this.$emit('select-page', pageNum);
      }
    }
  };
  </script>
  
  <style scoped>
  .thumbnails {
    display: flex;
    gap: 8px;
    overflow-x: auto;
  }
  .thumbnail {
    cursor: pointer;
  }
  </style>
  