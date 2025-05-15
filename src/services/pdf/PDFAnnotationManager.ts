import { PDFAnnotation } from '../../types/pdf'
import { v4 as uuidv4 } from 'uuid'
import { PDFCacheManager } from './PDFCacheManager'

export class PDFAnnotationManager {
  private cacheManager: PDFCacheManager

  constructor(cacheManager: PDFCacheManager) {
    this.cacheManager = cacheManager
  }

  public async addAnnotation(pdfId: string, annotation: Omit<PDFAnnotation, 'id' | 'createdAt' | 'updatedAt'>): Promise<PDFAnnotation> {
    const cache = this.cacheManager.getCacheItem(pdfId)
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
    this.cacheManager.updateLastAccessed(pdfId)
    await this.cacheManager.saveCacheToStorage()

    return newAnnotation
  }

  public getAnnotations(pdfId: string): PDFAnnotation[] {
    return this.cacheManager.getCacheItem(pdfId)?.annotations || []
  }

  public async updateAnnotation(pdfId: string, annotationId: string, updates: Partial<PDFAnnotation>): Promise<PDFAnnotation> {
    const cache = this.cacheManager.getCacheItem(pdfId)
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
    this.cacheManager.updateLastAccessed(pdfId)
    await this.cacheManager.saveCacheToStorage()

    return updatedAnnotation
  }

  public async deleteAnnotation(pdfId: string, annotationId: string): Promise<void> {
    const cache = this.cacheManager.getCacheItem(pdfId)
    if (!cache) {
      throw new Error('PDF not found')
    }

    cache.annotations = cache.annotations.filter(a => a.id !== annotationId)
    this.cacheManager.updateLastAccessed(pdfId)
    await this.cacheManager.saveCacheToStorage()
  }
} 