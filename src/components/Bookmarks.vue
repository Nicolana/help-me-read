<template>
    <div class="bookmarks">
      <button v-for="bookmark in bookmarks" :key="bookmark.id" @click="goToBookmark(bookmark.id)">
        {{ bookmark.name }}
      </button>
    </div>
  </template>
  
  <script lang="ts">
  interface Bookmark {
    id: string;
    name: string;
  }

  export default {
    props: {
      bookmarks: {
        type: Array as () => Bookmark[],
        required: true
      }
    },
    methods: {
      goToBookmark(bookmarkId: string) {
        this.$emit('go-to-bookmark', bookmarkId);
      }
    }
  };
  </script>
  
  <style scoped>
  .bookmarks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  </style>
  