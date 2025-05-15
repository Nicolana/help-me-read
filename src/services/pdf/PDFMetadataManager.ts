import { PDFMetadata } from '../../types/pdf'
import { appDataDir, join } from '@tauri-apps/api/path'
import { writeFile, exists, remove, mkdir, readFile } from '@tauri-apps/plugin-fs'
import { v4 as uuidv4 } from 'uuid'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFCacheManager } from './PDFCacheManager'

export class PDFMetadataManager {
  private readonly PDF_DIR = 'pdfs'
  private readonly THUMBNAIL_DIR = 'thumbnails'
  private cacheManager: PDFCacheManager

  constructor(cacheManager: PDFCacheManager) {
    this.cacheManager = cacheManager
  }

  public async ensureDirectories(): Promise<void> {
    const appDataPath = await appDataDir()
    const pdfDir = await join(appDataPath, this.PDF_DIR)
    const thumbnailDir = await join(appDataPath, this.THUMBNAIL_DIR)

    if (!(await exists(pdfDir))) {
      await mkdir(pdfDir, { recursive: true })
    }
    if (!(await exists(thumbnailDir))) {
      await mkdir(thumbnailDir, { recursive: true })
    }
  }

  public async loadPDF(file: File): Promise<PDFMetadata> {
    console.log('开始加载 PDF 文件:', file.name)
    
    const id = uuidv4()
    const appDataPath = await appDataDir()
    const pdfPath = await join(appDataPath, this.PDF_DIR, `${id}.pdf`)
    console.log('PDF 将保存到:', pdfPath)
    
    try {
      // 将文件保存到应用数据目录
      const arrayBuffer = await file.arrayBuffer()
      await writeFile(pdfPath, new Uint8Array(arrayBuffer))
      console.log('PDF 文件已保存到磁盘')

      // 生成封面图片（现在返回 base64 数据）
      const coverUrl = await this.generateCoverImage(pdfPath, id)
      console.log('封面图片已生成')

      const metadata: PDFMetadata = {
        id,
        name: file.name,
        path: pdfPath,
        size: file.size,
        lastModified: new Date(file.lastModified).toISOString(),
        pageCount: 0,
        thumbnail: '',
        coverUrl
      }

      // 创建缓存条目
      const cache = {
        metadata,
        annotations: [],
        lastAccessed: new Date().toISOString()
      }

      this.cacheManager.setCacheItem(id, cache)
      await this.cacheManager.saveCacheToStorage()
      console.log('PDF 元数据已添加到缓存')

      return metadata
    } catch (error) {
      console.error('保存PDF文件失败:', error)
      throw error
    }
  }

  private async generateCoverImage(pdfPath: string, id: string): Promise<string> {
    try {
      // 读取 PDF 文件
      const pdfData = await readFile(pdfPath)
      const pdf = await pdfjsLib.getDocument({ 
        data: pdfData,
      }).promise
      
      // 获取第一页
      const page = await pdf.getPage(1)
      
      // 设置缩放比例
      const viewport = page.getViewport({ scale: 1.5 })
      
      // 创建 canvas
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      // 渲染 PDF 页面到 canvas
      await page.render({
        canvasContext: context!,
        viewport: viewport
      }).promise
      
      // 直接返回 base64 格式的图片数据
      return canvas.toDataURL('image/png')
    } catch (error) {
      console.error('生成封面图片失败:', error)
      return ''
    }
  }

  public getPDFMetadata(id: string): PDFMetadata | undefined {
    return this.cacheManager.getCacheItem(id)?.metadata
  }

  public async getAllPDFs(): Promise<PDFMetadata[]> {
    const pdfs = Array.from(this.cacheManager.getCache().values()).map(cache => cache.metadata)
    console.log('获取所有 PDF 文件，数量:', pdfs.length)
    return pdfs
  }

  public async deletePDF(id: string): Promise<void> {
    const cache = this.cacheManager.getCacheItem(id)
    if (cache) {
      // 删除PDF文件
      if (await exists(cache.metadata.path)) {
        await remove(cache.metadata.path)
      }
      
      // 删除缩略图
      if (cache.metadata.thumbnail && await exists(cache.metadata.thumbnail)) {
        await remove(cache.metadata.thumbnail)
      }

      this.cacheManager.deleteCacheItem(id)
      await this.cacheManager.saveCacheToStorage()
    }
  }

  public async updatePageCount(id: string, pageCount: number): Promise<void> {
    const cache = this.cacheManager.getCacheItem(id)
    if (cache) {
      cache.metadata.pageCount = pageCount
      await this.cacheManager.saveCacheToStorage()
    }
  }
} 