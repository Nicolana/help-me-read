<template>
    <div class="progress-bar">
      <input type="range" :min="0" :max="100" :value="progress" @input="seekProgress" />
      <span>{{ progress }}%</span>
    </div>
  </template>
  
  <script lang="ts">
  export default {
    props: {
      progress: {
        type: Number,
        required: true
      }
    },
    emits: ['seek'],
    methods: {
      seekProgress(event: Event) {
        const value = (event.target as HTMLInputElement).valueAsNumber;
        this.$emit('seek', value);
      }
    }
  };
  </script>
  
  <style scoped>
  .progress-bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  </style>
  