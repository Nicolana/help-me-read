import { PDFMetadata, PDFAnnotation, PDFCache } from '../types/pdf'
import { v4 as uuidv4 } from 'uuid'
import { appDataDir, join } from '@tauri-apps/api/path'
import { writeTextFile, exists, readTextFile, remove, mkdir  } from '@tauri-apps/plugin-fs'

export class PDFService {
  private static instance: PDFService
  private cache: Map<string, PDFCache> = new Map()
  private readonly CACHE_FILE = 'pdf_cache.json'
  private readonly PDF_DIR = 'pdfs'
  private readonly THUMBNAIL_DIR = 'thumbnails'

  private constructor() {
    this.init()
  }

  public static getInstance(): PDFService {
    if (!PDFService.instance) {
      PDFService.instance = new PDFService()
    }
    return PDFService.instance
  }

  private async init() {
    try {
      // 确保必要的目录存在
      await this.ensureDirectories()
      // 加载缓存
      await this.loadCacheFromStorage()
    } catch (error) {
      console.error('初始化失败:', error)
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
      
      if (await exists(cachePath)) {
        const content = await readTextFile(cachePath)
        const parsed = JSON.parse(content)
        this.cache = new Map(Object.entries(parsed))
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
    } catch (error) {
      console.error('保存缓存失败:', error)
    }
  }

  public async loadPDF(file: File): Promise<PDFMetadata> {
    const id = uuidv4()
    const appDataPath = await appDataDir()
    const pdfPath = await join(appDataPath, this.PDF_DIR, `${id}.pdf`)
    
    // 将文件保存到应用数据目录
    const arrayBuffer = await file.arrayBuffer()
    await writeTextFile(pdfPath, new Uint8Array(arrayBuffer))

    const metadata: PDFMetadata = {
      id,
      name: file.name,
      path: pdfPath,
      size: file.size,
      lastModified: new Date(file.lastModified).toISOString(),
      pageCount: 0, // 需要实际解析PDF获取
      thumbnail: '' // 需要生成缩略图
    }

    // 创建缓存条目
    const cache: PDFCache = {
      metadata,
      annotations: [],
      lastAccessed: new Date().toISOString()
    }

    this.cache.set(id, cache)
    await this.saveCacheToStorage()

    return metadata
  }

  public getPDFMetadata(id: string): PDFMetadata | undefined {
    return this.cache.get(id)?.metadata
  }

  public getAllPDFs(): PDFMetadata[] {
    return Array.from(this.cache.values()).map(cache => cache.metadata)
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
} 