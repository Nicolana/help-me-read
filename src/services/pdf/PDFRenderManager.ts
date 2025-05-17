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

  public async renderPages(id: string, startPage: number, endPage: number, container: HTMLElement, scale: number = 1, options: { isInitialLoad?: boolean, scrollPriority?: 'top' | 'center' | 'exact' } = {}): Promise<{ pageHeights: number[], totalHeight: number }> {
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

    // 初始加载时，准备文档结构
    if (isInitialLoad) {
      console.log(`初始加载，准备渲染区域`);
      // 清空容器
      pagesContainer.innerHTML = '';
      
      // 获取文档总页数
      const pageCount = pdf.numPages;
      
      // 设置数据属性，记录文档总页数
      pagesContainer.setAttribute('data-total-pages', pageCount.toString());
      
      // 预先创建所有页面的占位符，以保持正确的文档高度
      for (let i = 1; i <= pageCount; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'pdf-page-placeholder';
        placeholder.setAttribute('data-page', i.toString());
        placeholder.setAttribute('data-placeholder', 'true');
        
        // 这里我们使用一个估计高度，后续会更新
        // 这样可以避免布局抖动，提供更平滑的滚动体验
        placeholder.style.height = '1000px'; // 初始估计高度
        placeholder.style.width = '100%';
        
        pagesContainer.appendChild(placeholder);
      }
    }

    const pageHeights: number[] = [];
    let totalHeight = 0;

    // 记录渲染前的滚动位置
    const scrollBefore = container.scrollTop;

    // 渲染指定范围的页面
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      // 检查页面是否已经渲染
      const existingCanvas = pagesContainer.querySelector(`canvas[data-page="${pageNum}"]`);
      if (existingCanvas) {
        console.log(`页面 ${pageNum} 已渲染，跳过`);
        const height = existingCanvas.clientHeight;
        pageHeights.push(height);
        totalHeight += height;
        continue;
      }

      console.log(`渲染页面 ${pageNum}`);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale, rotation: 0 });
      
      // 查找该页的占位符或创建页面容器
      let pageContainer = pagesContainer.querySelector(`div[data-page="${pageNum}"]`) as HTMLElement;
      const isReplacingPlaceholder = !!pageContainer;
      
      if (!pageContainer) {
        pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-page-container';
        pageContainer.setAttribute('data-page', pageNum.toString());
      } else {
        // 清除占位符标记
        pageContainer.removeAttribute('data-placeholder');
        // 保留原始类名
        pageContainer.className = 'pdf-page-container';
      }
      
      pageContainer.style.width = `${viewport.width}px`;
      pageContainer.style.height = `${viewport.height}px`;
      pageContainer.style.position = 'relative';
      
      // 创建画布
      const canvas = document.createElement('canvas');
      canvas.setAttribute('data-page', pageNum.toString());
      
      // 先清空容器内容再添加新的canvas
      if (isReplacingPlaceholder) {
        pageContainer.innerHTML = '';
      }
      
      pageContainer.appendChild(canvas);
      
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

      // 如果不是替换占位符，将页面添加到容器中
      if (!isReplacingPlaceholder) {
        let inserted = false;
        const allPages = pagesContainer.querySelectorAll('[data-page]');
        for (let i = 0; i < allPages.length; i++) {
          const currentPage = parseInt(allPages[i].getAttribute('data-page') || '0');
          if (currentPage > pageNum) {
            pagesContainer.insertBefore(pageContainer, allPages[i]);
            inserted = true;
            break;
          }
        }
        
        if (!inserted) {
          pagesContainer.appendChild(pageContainer);
        }
      }

      const height = pageContainer.clientHeight;
      pageHeights.push(height);
      totalHeight += height;
      
      // 更新所有相同页码的占位符高度，确保布局一致性
      const otherPlaceholders = pagesContainer.querySelectorAll(`div[data-page="${pageNum}"][data-placeholder="true"]`);
      otherPlaceholders.forEach((placeholder) => {
        (placeholder as HTMLElement).style.height = `${height}px`;
      });
    }

    // 在渲染完成后处理滚动位置，分离渲染和滚动处理逻辑
    if (scrollPriority === 'exact') {
      // 保持滚动位置不变
      container.scrollTop = scrollBefore;
    } else if (isInitialLoad) {
      // 根据滚动优先级设置滚动位置
      if (scrollPriority === 'top') {
        // 初始加载时，第一页在顶部
        const firstPage = pagesContainer.querySelector(`[data-page="${startPage}"]`);
        if (firstPage) {
          firstPage.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
      } else if (scrollPriority === 'center') {
        // 初始加载时，中间页居中
        const middlePage = pagesContainer.querySelector(`[data-page="${Math.floor((startPage + endPage) / 2)}"]`);
        if (middlePage) {
          middlePage.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
      }
      // 注意：不触发额外的滚动操作，避免触发onScroll事件
    }

    console.log(`渲染完成，共渲染 ${endPage - startPage + 1} 页，总高度 ${totalHeight}px`);
    return { pageHeights, totalHeight };
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
    
    // 记录滚动位置
    const scrollBefore = container.scrollTop;
    
    // 渲染可视区域及缓冲区内的页面
    await this.renderPages(id, startPage, endPage, container, scale, { scrollPriority: 'exact' });
    
    // 卸载远离可视区域的页面以节省内存
    this.unloadDistantPages(container, visibleStartPage, visibleEndPage, bufferSize + 2);
    
    // 确保滚动位置不变
    container.scrollTop = scrollBefore;
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
        
        // 获取画布所在的容器
        const pageContainer = canvas.closest(`[data-page="${pageNum}"]`) as HTMLElement;
        if (!pageContainer) continue;
        
        // 获取容器的尺寸信息以保持一致性
        const containerWidth = pageContainer.style.width;
        const containerHeight = pageContainer.style.height;
        
        // 创建占位符替换canvas，但保留原始尺寸
        const placeholder = document.createElement('div');
        placeholder.setAttribute('data-page', pageNum.toString());
        placeholder.setAttribute('data-placeholder', 'true');
        placeholder.style.width = containerWidth;
        placeholder.style.height = containerHeight;
        placeholder.style.backgroundColor = 'transparent';
        
        // 清空页面容器并添加占位符
        pageContainer.innerHTML = '';
        pageContainer.appendChild(placeholder);
        
        // 添加必要的数据属性
        pageContainer.setAttribute('data-placeholder', 'true');
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

  /**
   * 获取缩略图
   * 不再接受canvas参数，直接返回图片URL
   */
  public async renderThumbnail(id: string, pageNumber: number, scale: number = 0.2): Promise<string> {
    try {
      // 首先检查缓存中是否已有该缩略图
      const isCached = await this.thumbnailCache.hasThumbnail(id, pageNumber, scale)
      
      if (isCached) {
        // 如果缓存中存在，直接返回图像URL
        return await this.thumbnailCache.getThumbnail(id, pageNumber, scale)
      }
      
      // 缓存中不存在，则渲染并保存
      const pdf = this.activePDFs.get(id)
      if (!pdf) {
        // 尝试加载PDF
        try {
          await this.openPDF(id)
          return this.renderThumbnail(id, pageNumber, scale)
        } catch (err) {
          console.error('自动加载PDF失败:', err)
          throw new Error('PDF not loaded')
        }
      }

      const page = await pdf.getPage(pageNumber)
      
      // 使用较低的scale以提高渲染性能，最小值为0.1
      const effectiveScale = Math.max(0.1, scale)  
      const viewport = page.getViewport({ scale: effectiveScale, rotation: 0 })
      
      // 创建临时canvas进行渲染
      const canvas = document.createElement('canvas')
      
      // 限制最大尺寸以提高性能
      const maxDimension = 200
      const widthScale = maxDimension / viewport.width
      const heightScale = maxDimension / viewport.height
      const dimensionScale = Math.min(1, Math.min(widthScale, heightScale))
      
      canvas.width = Math.floor(viewport.width * dimensionScale)
      canvas.height = Math.floor(viewport.height * dimensionScale)
      
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) {
        throw new Error('Failed to get canvas context')
      }
      
      if (dimensionScale < 1) {
        context.scale(dimensionScale, dimensionScale)
      }

      // 使用较低质量设置渲染到canvas，提高性能
      await page.render({
        canvasContext: context,
        viewport: viewport,
        intent: 'display',
        enableWebGL: true,
        renderInteractiveForms: false,
        canvasFactory: undefined,
        transform: undefined
      }).promise
      
      try {
        // 将canvas转换为二进制数据
        const imageData = await this.thumbnailCache.canvasToBytes(canvas)
        
        // 保存到缓存
        await this.thumbnailCache.saveThumbnail(id, pageNumber, imageData, scale)
        
        // 从缓存获取图像URL
        return await this.thumbnailCache.getThumbnail(id, pageNumber, scale)
      } catch (cacheError) {
        // 缓存失败，直接返回canvas的dataURL
        console.error('保存缩略图到缓存失败，返回临时图像:', cacheError)
        return canvas.toDataURL('image/jpeg', 0.8) // 使用JPEG格式和较低质量
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