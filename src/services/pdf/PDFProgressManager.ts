import { PDFCacheManager } from './PDFCacheManager'

export interface ReadingProgress {
  scrollTop: number
  zoom: number
  currentPage: number
  lastUpdated?: string
}

export class PDFProgressManager {
  private cacheManager: PDFCacheManager

  constructor(cacheManager: PDFCacheManager) {
    this.cacheManager = cacheManager
  }

  public async saveReadingProgress(id: string, progress: Omit<ReadingProgress, 'lastUpdated'>): Promise<void> {
    try {
      console.log('保存阅读进度:', id, progress)
      
      const cache = this.cacheManager.getCacheItem(id)
      if (!cache) {
        console.error('保存阅读进度失败: PDF不存在', id)
        throw new Error('PDF not found')
      }

      cache.readingProgress = {
        ...progress,
        lastUpdated: new Date().toISOString()
      }
      
      // 更新最后访问时间
      this.cacheManager.updateLastAccessed(id)
      
      await this.cacheManager.saveCacheToStorage()
      console.log('阅读进度已保存')
    } catch (error) {
      console.error('保存阅读进度失败:', error)
      throw error
    }
  }

  public getReadingProgress(id: string): ReadingProgress | null {
    try {
      console.log('获取阅读进度:', id)
      
      const cache = this.cacheManager.getCacheItem(id)
      if (!cache) {
        console.log('获取阅读进度失败: PDF不存在', id)
        return null
      }
      
      if (!cache.readingProgress) {
        console.log('PDF没有保存的阅读进度')
        return null
      }

      const progress = {
        scrollTop: cache.readingProgress.scrollTop,
        zoom: cache.readingProgress.zoom,
        currentPage: cache.readingProgress.currentPage,
        lastUpdated: cache.readingProgress.lastUpdated
      }
      
      console.log('已获取阅读进度:', progress)
      return progress
    } catch (error) {
      console.error('获取阅读进度失败:', error)
      return null
    }
  }
} 