import { PDFCache, PDFMetadata } from '../../types/pdf'
import { appDataDir, join } from '@tauri-apps/api/path'
import { writeTextFile, exists, readTextFile } from '@tauri-apps/plugin-fs'

export class PDFCacheManager {
  private cache: Map<string, PDFCache> = new Map()
  private readonly CACHE_FILE = 'pdf_cache.json'
  
  constructor() {}

  public getCache(): Map<string, PDFCache> {
    return this.cache
  }

  public getCacheItem(id: string): PDFCache | undefined {
    return this.cache.get(id)
  }

  public setCacheItem(id: string, item: PDFCache): void {
    this.cache.set(id, item)
  }

  public deleteCacheItem(id: string): void {
    this.cache.delete(id)
  }

  public async loadCacheFromStorage(): Promise<void> {
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

  public async saveCacheToStorage(): Promise<void> {
    try {
      const appDataPath = await appDataDir()
      const cachePath = await join(appDataPath, this.CACHE_FILE)
      const cacheData = Object.fromEntries(this.cache)
      
      // 将缓存数据序列化为 JSON 字符串
      const jsonData = JSON.stringify(cacheData, null, 2)
      
      // 输出缓存数据大小
      console.log(`保存缓存，大小: ${jsonData.length} 字节，文件数: ${this.cache.size}`)
      
      // 写入文件
      await writeTextFile(cachePath, jsonData)
      console.log('缓存已成功保存到磁盘')
    } catch (error) {
      console.error('保存缓存失败:', error)
      throw error
    }
  }

  public updateLastAccessed(id: string): void {
    const cache = this.cache.get(id)
    if (cache) {
      cache.lastAccessed = new Date().toISOString()
    }
  }
} 