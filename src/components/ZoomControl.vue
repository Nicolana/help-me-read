<template>
    <div class="zoom-control">
      <button @click="decreaseZoom">-</button>
      <span>{{ zoom }}x</span>
      <button @click="increaseZoom">+</button>
    </div>
  </template>
  
  <script lang="ts">
  export default {
    props: {
      zoom: {
        type: Number,
        required: true
      }
    },
    emits: ['zoom'],
    methods: {
      increaseZoom() {
        this.$emit('zoom', this.zoom + 0.1);
      },
      decreaseZoom() {
        this.$emit('zoom', this.zoom - 0.1);
      }
    }
  };
  </script>
  
  <style scoped>
  .zoom-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  </style>
  