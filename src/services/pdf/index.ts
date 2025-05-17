import { PDFCacheManager } from './PDFCacheManager'
import { PDFMetadataManager } from './PDFMetadataManager'
import { PDFAnnotationManager } from './PDFAnnotationManager'
import { PDFRenderManager } from './PDFRenderManager'
import { PDFProgressManager, ReadingProgress } from './PDFProgressManager'
import { PDFMetadata, PDFAnnotation } from '../../types/pdf'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/public/pdf.worker.min.mjs'

export class PDFService {
  private static instance: PDFService
  private isInitialized = false
  private initPromise: Promise<void> | null = null
  
  private cacheManager: PDFCacheManager
  private metadataManager: PDFMetadataManager
  private annotationManager: PDFAnnotationManager
  private renderManager: PDFRenderManager
  private progressManager: PDFProgressManager

  private constructor() {
    this.cacheManager = new PDFCacheManager()
    this.metadataManager = new PDFMetadataManager(this.cacheManager)
    this.annotationManager = new PDFAnnotationManager(this.cacheManager)
    this.renderManager = new PDFRenderManager(this.metadataManager)
    this.progressManager = new PDFProgressManager(this.cacheManager)
    
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
      await this.metadataManager.ensureDirectories()
      // 加载缓存
      await this.cacheManager.loadCacheFromStorage()
      this.isInitialized = true
      console.log('PDFService 初始化完成，当前缓存大小:', this.cacheManager.getCache().size)
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

  // === PDF元数据管理接口 ===
  public async loadPDF(file: File): Promise<PDFMetadata> {
    await this.ensureInitialized()
    return this.metadataManager.loadPDF(file)
  }

  public getPDFMetadata(id: string): PDFMetadata | undefined {
    return this.metadataManager.getPDFMetadata(id)
  }

  public async getAllPDFs(): Promise<PDFMetadata[]> {
    await this.ensureInitialized()
    return this.metadataManager.getAllPDFs()
  }

  public async deletePDF(id: string): Promise<void> {
    await this.ensureInitialized()
    return this.metadataManager.deletePDF(id)
  }

  // === PDF注释管理接口 ===
  public async addAnnotation(pdfId: string, annotation: Omit<PDFAnnotation, 'id' | 'createdAt' | 'updatedAt'>): Promise<PDFAnnotation> {
    await this.ensureInitialized()
    return this.annotationManager.addAnnotation(pdfId, annotation)
  }

  public getAnnotations(pdfId: string): PDFAnnotation[] {
    return this.annotationManager.getAnnotations(pdfId)
  }

  public async updateAnnotation(pdfId: string, annotationId: string, updates: Partial<PDFAnnotation>): Promise<PDFAnnotation> {
    await this.ensureInitialized()
    return this.annotationManager.updateAnnotation(pdfId, annotationId, updates)
  }

  public async deleteAnnotation(pdfId: string, annotationId: string): Promise<void> {
    await this.ensureInitialized()
    return this.annotationManager.deleteAnnotation(pdfId, annotationId)
  }

  // === PDF渲染管理接口 ===
  public async openPDF(id: string): Promise<void> {
    await this.ensureInitialized()
    return this.renderManager.openPDF(id)
  }

  public async renderPage(id: string, pageNumber: number, canvas: HTMLCanvasElement, scale: number = 1): Promise<void> {
    return this.renderManager.renderPage(id, pageNumber, canvas, scale)
  }

  public async getPageViewport(id: string, pageNumber: number, scale: number = 1) {
    return this.renderManager.getPageViewport(id, pageNumber, scale)
  }

  public async renderPages(id: string, startPage: number, endPage: number, container: HTMLElement, scale: number = 1, options: { isInitialLoad?: boolean, scrollPriority?: 'top' | 'center' | 'exact' } = {}): Promise<{ pageHeights: number[] }> {
    return this.renderManager.renderPages(id, startPage, endPage, container, scale, options)
  }

  public async renderVisiblePages(id: string, container: HTMLElement, visibleStartPage: number, visibleEndPage: number, bufferSize: number = 2, scale: number = 1): Promise<void> {
    return this.renderManager.renderVisiblePages(id, container, visibleStartPage, visibleEndPage, bufferSize, scale)
  }

  public async getPageCount(id: string): Promise<number> {
    return this.renderManager.getPageCount(id)
  }

  public async getThumbnail(id: string, pageNumber: number = 1): Promise<string> {
    return this.renderManager.getThumbnail(id, pageNumber)
  }

  public async renderThumbnail(id: string, pageNumber: number, canvas: HTMLCanvasElement, scale: number = 0.2): Promise<void> {
    return this.renderManager.renderThumbnail(id, pageNumber, canvas, scale)
  }

  public async closePDF(id: string): Promise<void> {
    await this.ensureInitialized()
    return this.renderManager.closePDF(id)
  }

  // === 阅读进度管理接口 ===
  public async saveReadingProgress(id: string, progress: { scrollTop: number; zoom: number; currentPage: number }): Promise<void> {
    await this.ensureInitialized()
    return this.progressManager.saveReadingProgress(id, progress)
  }

  public async getReadingProgress(id: string): Promise<ReadingProgress | null> {
    await this.ensureInitialized()
    return this.progressManager.getReadingProgress(id)
  }
}

export default PDFService 