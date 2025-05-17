import * as pdfjsLib from 'pdfjs-dist'
import { readFile } from '@tauri-apps/plugin-fs'
import { PDFMetadataManager } from './PDFMetadataManager'
import { ThumbnailCache } from '../thumbnail-cache'

export class PDFRenderManager {
  private activePDFs: Map<string, any> = new Map() // 存储当前打开的PDF文档
  private metadataManager: PDFMetadataManager
  private thumbnailCache: ThumbnailCache

  constructor(metadataManager: PDFMetadataManager) {
    this.metadataManager = metadataManager
    this.thumbnailCache = ThumbnailCache.getInstance()
  }

  public async openPDF(id: string): Promise<void> {
    const metadata = this.metadataManager.getPDFMetadata(id)
    if (!metadata) {
      throw new Error('PDF not found')
    }

    if (!this.activePDFs.has(id)) {
      const pdfData = await readFile(metadata.path)
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise
      this.activePDFs.set(id, pdf)
      
      // 更新元数据中的页数
      const pageCount = pdf.numPages
      await this.metadataManager.updatePageCount(id, pageCount)
    }
  }

  public async renderPage(id: string, pageNumber: number, canvas: HTMLCanvasElement, scale: number = 1): Promise<void> {
    const pdf = this.activePDFs.get(id)
    if (!pdf) {
      throw new Error('PDF not loaded')
    }

    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale, rotation: 0 })
    
    // 设置 canvas 的物理像素大小
    const outputScale = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    
    // 设置 canvas 的 CSS 大小
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) {
      throw new Error('Failed to get canvas context')
    }

    // 设置画布缩放以匹配设备像素比
    context.scale(outputScale, outputScale)

    await page.render({
      canvasContext: context,
      viewport: viewport,
      intent: 'display',
      renderInteractiveForms: true,
      enableWebGL: true,
      cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    }).promise
  }

  public async getPageViewport(id: string, pageNumber: number, scale: number = 1) {
    const pdf = this.activePDFs.get(id)
    if (!pdf) {
      throw new Error('PDF not loaded')
    }

    const page = await pdf.getPage(pageNumber)
    return page.getViewport({ scale, rotation: 0 })
  }

  public async renderPages(id: string, startPage: number, endPage: number, container: HTMLElement, scale: number = 1, options: { isInitialLoad?: boolean, scrollPriority?: 'top' | 'center' | 'exact' } = {}): Promise<{ pageHeights: number[] }> {
    const pdf = this.activePDFs.get(id)
    if (!pdf) {
      throw new Error('PDF not loaded')
    }

    const isInitialLoad = options.isInitialLoad ?? false;
    const scrollPriority = options.scrollPriority ?? 'center';
    
    console.log(`开始渲染页面 ${startPage} 到 ${endPage}，缩放比例: ${scale}, 初始加载: ${isInitialLoad}`);

    // 获取或创建页面容器
    let pagesContainer = container.querySelector('.pdf-pages-container') as HTMLDivElement
    if (!pagesContainer) {
      pagesContainer = document.createElement('div')
      pagesContainer.className = 'pdf-pages-container'
      pagesContainer.style.display = 'flex'
      pagesContainer.style.flexDirection = 'column'
      pagesContainer.style.gap = '4px'
      container.appendChild(pagesContainer)
    }

    // 在初始加载时，创建整个文档的占位结构
    if (isInitialLoad) {
      console.log(`初始加载，创建完整文档结构占位符`);
      // 获取第一页的尺寸作为参考
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale });
      const pageCount = pdf.numPages;
      
      // 清空容器
      pagesContainer.innerHTML = '';
      
      // 创建所有页面的占位元素
      for (let i = 1; i <= pageCount; i++) {
        const placeholder = document.createElement('div');
        placeholder.setAttribute('data-page', i.toString());
        placeholder.setAttribute('data-placeholder', 'true');
        placeholder.style.width = `${viewport.width}px`;
        placeholder.style.height = `${viewport.height}px`;
        placeholder.style.backgroundColor = 'transparent';
        pagesContainer.appendChild(placeholder);
      }
    }

    const pageHeights: number[] = []

    // 渲染指定范围的页面
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      // 检查页面是否已经渲染
      const existingCanvas = pagesContainer.querySelector(`canvas[data-page="${pageNum}"]`);
      if (existingCanvas) {
        console.log(`页面 ${pageNum} 已渲染，跳过`);
        pageHeights.push(existingCanvas.clientHeight);
        continue;
      }

      console.log(`渲染页面 ${pageNum}`);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale, rotation: 0 });
      
      // 查找占位元素
      const placeholder = pagesContainer.querySelector(`[data-page="${pageNum}"][data-placeholder="true"]`);
      const canvas = document.createElement('canvas');
      canvas.setAttribute('data-page', pageNum.toString());
      
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      // 设置 canvas 的物理像素大小
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      
      // 设置 canvas 的 CSS 大小
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      
      // 设置画布缩放以匹配设备像素比
      context.scale(outputScale, outputScale);

      // 记录渲染前位置
      const scrollBefore = container.scrollTop;
      const placeholderOffset = placeholder ? (placeholder as HTMLElement).offsetTop : 0;
      
      // 渲染页面
      await page.render({
        canvasContext: context,
        viewport: viewport,
        intent: 'display',
        renderInteractiveForms: true,
        enableWebGL: true,
        cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true,
      }).promise;

      // 替换占位元素
      if (placeholder) {
        placeholder.parentNode?.replaceChild(canvas, placeholder);
      } else {
        // 找到正确的位置插入
        let inserted = false;
        const allPages = pagesContainer.querySelectorAll('[data-page]');
        for (let i = 0; i < allPages.length; i++) {
          const currentPage = parseInt(allPages[i].getAttribute('data-page') || '0');
          if (currentPage > pageNum) {
            pagesContainer.insertBefore(canvas, allPages[i]);
            inserted = true;
            break;
          }
        }
        
        if (!inserted) {
          pagesContainer.appendChild(canvas);
        }
      }

      // 处理滚动位置
      if (!isInitialLoad && scrollPriority === 'exact') {
        // 保持滚动位置不变
        container.scrollTop = scrollBefore;
      } else if (isInitialLoad && pageNum === startPage && scrollPriority === 'top') {
        // 初始加载时，确保第一个渲染的页面在顶部
        canvas.scrollIntoView({ block: 'start', behavior: 'auto' });
      } else if (isInitialLoad && pageNum === Math.floor((startPage + endPage) / 2) && scrollPriority === 'center') {
        // 初始加载时，确保中间页面居中
        canvas.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
      
      pageHeights.push(canvas.clientHeight);
    }

    console.log(`渲染完成，共渲染 ${endPage - startPage + 1} 页`);
    return { pageHeights };
  }

  public async renderVisiblePages(id: string, container: HTMLElement, visibleStartPage: number, visibleEndPage: number, bufferSize: number = 2, scale: number = 1): Promise<void> {
    const pdf = this.activePDFs.get(id)
    if (!pdf) {
      throw new Error('PDF not loaded')
    }

    const pageCount = pdf.numPages;
    const startPage = Math.max(1, visibleStartPage - bufferSize);
    const endPage = Math.min(pageCount, visibleEndPage + bufferSize);
    
    console.log(`渲染可视区域页面，可视区域: ${visibleStartPage}-${visibleEndPage}, 带缓冲区: ${startPage}-${endPage}`);
    
    await this.renderPages(id, startPage, endPage, container, scale, { scrollPriority: 'exact' });
    
    // 卸载远离可视区域的页面以节省内存
    this.unloadDistantPages(container, visibleStartPage, visibleEndPage, bufferSize + 2);
  }
  
  // 卸载远离可视区域的页面
  private unloadDistantPages(container: HTMLElement, visibleStartPage: number, visibleEndPage: number, threshold: number = 4): void {
    const pagesContainer = container.querySelector('.pdf-pages-container') as HTMLDivElement;
    if (!pagesContainer) return;
    
    const minKeepPage = Math.max(1, visibleStartPage - threshold);
    const maxKeepPage = visibleEndPage + threshold;
    
    const canvases = pagesContainer.querySelectorAll('canvas[data-page]');
    for (let i = 0; i < canvases.length; i++) {
      const canvas = canvases[i] as HTMLCanvasElement;
      const pageNum = parseInt(canvas.getAttribute('data-page') || '0');
      
      if (pageNum < minKeepPage || pageNum > maxKeepPage) {
        console.log(`卸载远离可视区域的页面 ${pageNum}`);
        
        // 创建占位符替换canvas
        const placeholder = document.createElement('div');
        placeholder.setAttribute('data-page', pageNum.toString());
        placeholder.setAttribute('data-placeholder', 'true');
        placeholder.style.width = canvas.style.width;
        placeholder.style.height = canvas.style.height;
        placeholder.style.backgroundColor = 'transparent';
        
        // 替换
        canvas.parentNode?.replaceChild(placeholder, canvas);
      }
    }
  }

  public async getPageCount(id: string): Promise<number> {
    const pdf = this.activePDFs.get(id)
    if (!pdf) {
      throw new Error('PDF not loaded')
    }
    return pdf.numPages
  }

  public async getThumbnail(id: string, pageNumber: number = 1): Promise<string> {
    const pdf = this.activePDFs.get(id)
    if (!pdf) {
      throw new Error('PDF not loaded')
    }

    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 0.5 })
    
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Failed to get canvas context')
    }

    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise

    return canvas.toDataURL('image/png')
  }

  public async renderThumbnail(id: string, pageNumber: number, canvas: HTMLCanvasElement, scale: number = 0.2): Promise<void> {
    try {
      // 首先检查缓存中是否已有该缩略图
      const isCached = await this.thumbnailCache.hasThumbnail(id, pageNumber, scale)
      
      if (isCached) {
        // 如果缓存中存在，直接加载缓存的图像
        const imageUrl = await this.thumbnailCache.getThumbnail(id, pageNumber, scale)
        
        // 将图像绘制到canvas上
        const img = new Image()
        img.src = imageUrl
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            // 设置canvas尺寸为图像尺寸
            canvas.width = img.width
            canvas.height = img.height
            
            // 绘制图像到canvas
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(img, 0, 0)
              resolve()
            } else {
              reject(new Error('Failed to get canvas context'))
            }
          }
          img.onerror = () => reject(new Error('Failed to load cached thumbnail'))
        })
        
        return
      }
      
      // 缓存中不存在，则正常渲染
      const pdf = this.activePDFs.get(id)
      if (!pdf) {
        throw new Error('PDF not loaded')
      }

      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale, rotation: 0 })
      
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Failed to get canvas context')
      }

      canvas.width = viewport.width
      canvas.height = viewport.height

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise
      
      // 渲染完成后，保存到缓存
      try {
        // 将canvas转换为二进制数据
        const imageData = await this.thumbnailCache.canvasToBytes(canvas)
        
        // 保存到缓存
        await this.thumbnailCache.saveThumbnail(id, pageNumber, imageData, scale)
      } catch (cacheError) {
        // 缓存失败不应阻止主流程，只记录错误
        console.error('保存缩略图到缓存失败:', cacheError)
      }
    } catch (error) {
      console.error(`渲染缩略图失败 (ID: ${id}, 页码: ${pageNumber}):`, error)
      throw error
    }
  }

  public async closePDF(id: string): Promise<void> {
    const pdf = this.activePDFs.get(id)
    if (pdf) {
      await pdf.destroy()
      this.activePDFs.delete(id)
    }
  }
} 