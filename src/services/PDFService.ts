import { PDFMetadata, PDFAnnotation, PDFCache } from '../types/pdf'
import { v4 as uuidv4 } from 'uuid'
import { appDataDir, join } from '@tauri-apps/api/path'
import { writeTextFile, exists, readTextFile, writeFile, remove, mkdir, readFile } from '@tauri-apps/plugin-fs'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/public/pdf.worker.min.mjs'

export class PDFService {
  private static instance: PDFService
  private cache: Map<string, PDFCache> = new Map()
  private readonly CACHE_FILE = 'pdf_cache.json'
  private readonly PDF_DIR = 'pdfs'
  private readonly THUMBNAIL_DIR = 'thumbnails'
  private isInitialized = false
  private initPromise: Promise<void> | null = null
  private activePDFs: Map<string, any> = new Map() // 存储当前打开的PDF文档

  private constructor() {
    this.initPromise = this.init()
  }

  public static getInstance(): PDFService {
    if (!PDFService.instance) {
      PDFService.instance = new PDFService()
    }
    return PDFService.instance
  }

  private async init() {
    try {
      console.log('开始初始化 PDFService...')
      // 确保必要的目录存在
      await this.ensureDirectories()
      // 加载缓存
      await this.loadCacheFromStorage()
      this.isInitialized = true
      console.log('PDFService 初始化完成，当前缓存大小:', this.cache.size)
    } catch (error) {
      console.error('初始化失败:', error)
      throw error
    }
  }

  private async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initPromise
    }
  }

  private async ensureDirectories() {
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

  private async loadCacheFromStorage() {
    try {
      const appDataPath = await appDataDir()
      const cachePath = await join(appDataPath, this.CACHE_FILE)
      console.log('尝试加载缓存文件:', cachePath)
      
      if (await exists(cachePath)) {
        const content = await readTextFile(cachePath)
        const parsed = JSON.parse(content)
        this.cache = new Map(Object.entries(parsed))
        console.log('成功加载缓存，包含文件数:', this.cache.size)
      } else {
        console.log('缓存文件不存在，将创建新的缓存')
      }
    } catch (error) {
      console.error('加载缓存失败:', error)
    }
  }

  private async saveCacheToStorage() {
    try {
      const appDataPath = await appDataDir()
      const cachePath = await join(appDataPath, this.CACHE_FILE)
      const obj = Object.fromEntries(this.cache)
      await writeTextFile(cachePath, JSON.stringify(obj, null, 2))
      console.log('缓存已保存，当前文件数:', this.cache.size)
    } catch (error) {
      console.error('保存缓存失败:', error)
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

  public async loadPDF(file: File): Promise<PDFMetadata> {
    console.log('开始加载 PDF 文件:', file.name)
    await this.ensureInitialized()
    
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
      const cache: PDFCache = {
        metadata,
        annotations: [],
        lastAccessed: new Date().toISOString()
      }

      this.cache.set(id, cache)
      await this.saveCacheToStorage()
      console.log('PDF 元数据已添加到缓存')

      return metadata
    } catch (error) {
      console.error('保存PDF文件失败:', error)
      throw error
    }
  }

  public getPDFMetadata(id: string): PDFMetadata | undefined {
    return this.cache.get(id)?.metadata
  }

  public async getAllPDFs(): Promise<PDFMetadata[]> {
    await this.ensureInitialized()
    const pdfs = Array.from(this.cache.values()).map(cache => cache.metadata)
    console.log('获取所有 PDF 文件，数量:', pdfs.length)
    return pdfs
  }

  public async addAnnotation(pdfId: string, annotation: Omit<PDFAnnotation, 'id' | 'createdAt' | 'updatedAt'>): Promise<PDFAnnotation> {
    const cache = this.cache.get(pdfId)
    if (!cache) {
      throw new Error('PDF not found')
    }

    const newAnnotation: PDFAnnotation = {
      ...annotation,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    cache.annotations.push(newAnnotation)
    cache.lastAccessed = new Date().toISOString()
    await this.saveCacheToStorage()

    return newAnnotation
  }

  public getAnnotations(pdfId: string): PDFAnnotation[] {
    return this.cache.get(pdfId)?.annotations || []
  }

  public async updateAnnotation(pdfId: string, annotationId: string, updates: Partial<PDFAnnotation>): Promise<PDFAnnotation> {
    const cache = this.cache.get(pdfId)
    if (!cache) {
      throw new Error('PDF not found')
    }

    const annotationIndex = cache.annotations.findIndex(a => a.id === annotationId)
    if (annotationIndex === -1) {
      throw new Error('Annotation not found')
    }

    const updatedAnnotation = {
      ...cache.annotations[annotationIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    }

    cache.annotations[annotationIndex] = updatedAnnotation
    cache.lastAccessed = new Date().toISOString()
    await this.saveCacheToStorage()

    return updatedAnnotation
  }

  public async deleteAnnotation(pdfId: string, annotationId: string): Promise<void> {
    const cache = this.cache.get(pdfId)
    if (!cache) {
      throw new Error('PDF not found')
    }

    cache.annotations = cache.annotations.filter(a => a.id !== annotationId)
    cache.lastAccessed = new Date().toISOString()
    await this.saveCacheToStorage()
  }

  public async deletePDF(id: string): Promise<void> {
    const cache = this.cache.get(id)
    if (cache) {
      // 删除PDF文件
      if (await exists(cache.metadata.path)) {
        await remove(cache.metadata.path)
      }
      
      // 删除缩略图
      if (cache.metadata.thumbnail && await exists(cache.metadata.thumbnail)) {
        await remove(cache.metadata.thumbnail)
      }

      this.cache.delete(id)
      await this.saveCacheToStorage()
    }
  }

  public async openPDF(id: string): Promise<void> {
    const metadata = this.getPDFMetadata(id)
    if (!metadata) {
      throw new Error('PDF not found')
    }

    if (!this.activePDFs.has(id)) {
      const pdfData = await readFile(metadata.path)
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise
      this.activePDFs.set(id, pdf)
      
      // 更新元数据中的页数
      const pageCount = pdf.numPages
      const cache = this.cache.get(id)
      if (cache) {
        cache.metadata.pageCount = pageCount
        await this.saveCacheToStorage()
      }
    }
  }

  public async renderPage(id: string, pageNumber: number, canvas: HTMLCanvasElement, scale: number = 1): Promise<void> {
    const pdf = this.activePDFs.get(id)
    if (!pdf) {
      throw new Error('PDF not loaded')
    }

    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    
    canvas.height = viewport.height
    canvas.width = viewport.width
    
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Failed to get canvas context')
    }

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise
  }

  public async getPageCount(id: string): Promise<number> {
    const pdf = this.activePDFs.get(id)
    if (!pdf) {
      throw new Error('PDF not loaded')
    }
    return pdf.numPages
  }

  public async closePDF(id: string): Promise<void> {
    const pdf = this.activePDFs.get(id)
    if (pdf) {
      await pdf.destroy()
      this.activePDFs.delete(id)
    }
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
} 