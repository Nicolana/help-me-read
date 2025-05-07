<template>
  <div class="pdf-reader">
    <div class="pdf-toolbar">
      <zoom-control :zoom="zoom" @zoom="handleZoom" />
      <progress-bar :progress="progress" @seek="handleSeek" />
    </div>
    <div class="pdf-content" ref="pdfContent" @scroll="handleScroll">
      <canvas ref="pdfCanvas"></canvas>
    </div>
    <thumbnails :pages="pages" @select-page="selectPage" />
    <bookmarks :bookmarks="bookmarks" @go-to-bookmark="goToBookmark" />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';
import ZoomControl from '../components/ZoomControl.vue';
import ProgressBar from '../components/ProgressBar.vue';
import Thumbnails from '../components/Thumbnails.vue';
import Bookmarks from '../components/Bookmarks.vue';

export default defineComponent({
  components: { ZoomControl, ProgressBar, Thumbnails, Bookmarks },
  setup() {
    const pdfContent = ref<HTMLElement | null>(null);
    const pdfCanvas = ref<HTMLCanvasElement | null>(null);
    const zoom = ref(1);
    const progress = ref(0);
    const pages = ref<any[]>([]);
    const bookmarks = ref<any[]>([]);

    let pdfDoc: any = null;

    onMounted(async () => {
      const pdfUrl = '/path/to/your/pdf/file.pdf';  // 指定 PDF 文件路径
      pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
      renderPage(1);  // 默认渲染第一页

      // 获取所有页数缩略图
      const totalPages = pdfDoc.numPages;
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        pages.value.push(page);
      }
    });

    const renderPage = async (pageNum: number) => {
      const page = await pdfDoc.getPage(pageNum);
      const canvas = pdfCanvas.value!;
      const context = canvas.getContext('2d')!;
      const viewport = page.getViewport({ scale: zoom.value });

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      // 更新进度
      progress.value = (pageNum / pdfDoc.numPages) * 100;
    };

    const handleZoom = (newZoom: number) => {
      zoom.value = newZoom;
      renderPage(1);  // 重新渲染第一页
    };

    const handleScroll = () => {
      const scrollTop = pdfContent.value?.scrollTop || 0;
      const pageHeight = pdfCanvas.value?.height || 0;
      const currentPage = Math.floor(scrollTop / pageHeight) + 1;
      renderPage(currentPage);
    };

    const handleSeek = (newProgress: number) => {
      const pageNum = Math.ceil((newProgress / 100) * pdfDoc.numPages);
      renderPage(pageNum);
    };

    const selectPage = (pageNum: number) => {
      renderPage(pageNum);
    };

    const goToBookmark = (bookmarkId: string) => {
      const pageNum = bookmarks.value.find(b => b.id === bookmarkId)?.page || 1;
      renderPage(pageNum);
    };

    return { zoom, progress, pages, bookmarks, handleZoom, handleScroll, handleSeek, selectPage, goToBookmark };
  }
});
</script>

<style scoped>
.pdf-reader {
  display: flex;
  flex-direction: column;
}
.pdf-content {
  overflow-y: scroll;
  max-height: 80vh;
}
.pdf-toolbar {
  display: flex;
  justify-content: space-between;
}
</style>
  