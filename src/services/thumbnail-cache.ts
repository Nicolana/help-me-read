// import { invoke } from '@tauri-apps/api/tauri';
// import { createDir, exists, readBinaryFile, writeBinaryFile } from '@tauri-apps/api/fs';
// import { appCacheDir, join } from '@tauri-apps/api/path';
import { appDataDir, join } from '@tauri-apps/api/path';
import { writeFile, exists, readFile, mkdir } from '@tauri-apps/plugin-fs';

/**
 * 缩略图缓存服务
 * 负责管理PDF缩略图的持久化存储
 */
export class ThumbnailCache {
  private static instance: ThumbnailCache;
  private cacheDir: string | null = null;
  private initialized = false;
  
  // 内存缓存以提高性能
  private memoryCache: Map<string, string> = new Map();
  private memoryCacheSize: number = 0;
  private maxMemoryCacheSize: number = 50 * 1024 * 1024; // 50MB
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): ThumbnailCache {
    if (!ThumbnailCache.instance) {
      ThumbnailCache.instance = new ThumbnailCache();
    }
    return ThumbnailCache.instance;
  }

  /**
   * 初始化缓存目录
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      // 获取应用数据目录
      const appDataPath = await appDataDir();
      
      // 创建缩略图缓存目录
      this.cacheDir = await join(appDataPath, 'thumbnails');
      
      // 检查目录是否存在，不存在则创建
      const dirExists = await exists(this.cacheDir);
      if (!dirExists) {
        await mkdir(this.cacheDir, { recursive: true });
      }
      
      this.initialized = true;
      console.log('缩略图缓存目录初始化成功:', this.cacheDir);
    } catch (error) {
      console.error('初始化缩略图缓存失败:', error);
      throw error;
    }
  }

  /**
   * 生成缩略图缓存的文件路径
   * @param fileId 文件ID
   * @param pageNumber 页码
   * @param scale 缩放比例
   * @returns 缓存文件路径
   */
  private async getThumbnailPath(fileId: string, pageNumber: number, scale: number): Promise<string> {
    await this.ensureInitialized();
    if (!this.cacheDir) throw new Error('缓存目录未初始化');

    // 创建文件名，使用fileId_page_scale.png格式
    const filename = `${fileId.replace(/[^a-zA-Z0-9]/g, '_')}_${pageNumber}_${scale.toString().replace('.', '_')}.jpg`;
    return await join(this.cacheDir, filename);
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(fileId: string, pageNumber: number, scale: number): string {
    return `${fileId}_${pageNumber}_${scale}`;
  }

  /**
   * 检查缩略图是否已缓存
   * @param fileId 文件ID
   * @param pageNumber 页码
   * @param scale 缩放比例
   * @returns 是否已缓存
   */
  public async hasThumbnail(fileId: string, pageNumber: number, scale: number = 0.2): Promise<boolean> {
    try {
      // 先检查内存缓存
      const cacheKey = this.getCacheKey(fileId, pageNumber, scale);
      if (this.memoryCache.has(cacheKey)) {
        this.cacheHits++;
        return true;
      }
      
      // 再检查文件系统缓存
      const path = await this.getThumbnailPath(fileId, pageNumber, scale);
      const fileExists = await exists(path);
      
      if (fileExists) {
        this.cacheHits++;
      } else {
        this.cacheMisses++;
      }
      
      return fileExists;
    } catch (error) {
      console.error('检查缩略图缓存失败:', error);
      return false;
    }
  }

  /**
   * 获取缓存的缩略图
   * @param fileId 文件ID
   * @param pageNumber 页码
   * @param scale 缩放比例
   * @returns 缩略图数据URL
   */
  public async getThumbnail(fileId: string, pageNumber: number, scale: number = 0.2): Promise<string> {
    try {
      const cacheKey = this.getCacheKey(fileId, pageNumber, scale);
      
      // 检查内存缓存
      const memoryData = this.memoryCache.get(cacheKey);
      if (memoryData) {
        return memoryData;
      }
      
      const path = await this.getThumbnailPath(fileId, pageNumber, scale);
      
      // 检查文件是否存在
      if (!(await exists(path))) {
        throw new Error('缩略图不存在');
      }
      
      // 读取文件内容
      const data = await readFile(path);
      
      // 转换为base64数据URL
      const base64 = this.arrayBufferToBase64(data);
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      
      // 添加到内存缓存
      this.addToMemoryCache(cacheKey, dataUrl, data.byteLength);
      
      return dataUrl;
    } catch (error) {
      console.error('获取缩略图缓存失败:', error);
      throw error;
    }
  }

  /**
   * 添加到内存缓存
   */
  private addToMemoryCache(key: string, dataUrl: string, size: number): void {
    // 如果缓存已满，清理最早的项目
    if (this.memoryCacheSize + size > this.maxMemoryCacheSize) {
      this.cleanupMemoryCache(size);
    }
    
    this.memoryCache.set(key, dataUrl);
    this.memoryCacheSize += size;
  }
  
  /**
   * 清理内存缓存
   */
  private cleanupMemoryCache(requiredSpace: number): void {
    // 只保留50%的缓存
    const targetSize = Math.max(this.maxMemoryCacheSize * 0.5, requiredSpace);
    const keys = Array.from(this.memoryCache.keys());
    
    // 从最早的缓存项开始移除
    while (this.memoryCacheSize > targetSize && keys.length > 0) {
      const keyToRemove = keys.shift();
      if (keyToRemove) {
        const value = this.memoryCache.get(keyToRemove)!;
        const itemSize = this.estimateDataUrlSize(value);
        this.memoryCache.delete(keyToRemove);
        this.memoryCacheSize -= itemSize;
      }
    }
    
    console.log(`内存缓存清理完成，当前大小: ${this.memoryCacheSize / 1024 / 1024}MB`);
  }
  
  /**
   * 估算数据URL大小
   */
  private estimateDataUrlSize(dataUrl: string): number {
    // dataUrl大小约等于其长度 * 0.75 (因为base64编码比原始数据大约多1/3)
    return Math.ceil(dataUrl.length * 0.75);
  }

  /**
   * 保存缩略图到缓存
   * @param fileId 文件ID
   * @param pageNumber 页码
   * @param imageData 图片数据
   * @param scale 缩放比例
   */
  public async saveThumbnail(fileId: string, pageNumber: number, imageData: Uint8Array, scale: number = 0.2): Promise<void> {
    try {
      const path = await this.getThumbnailPath(fileId, pageNumber, scale);
      await writeFile(path, imageData);
      
      // 将缩略图添加到内存缓存
      const base64 = this.arrayBufferToBase64(imageData);
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      this.addToMemoryCache(this.getCacheKey(fileId, pageNumber, scale), dataUrl, imageData.byteLength);
    } catch (error) {
      console.error('保存缩略图缓存失败:', error);
      throw error;
    }
  }

  /**
   * 将canvas转换为Uint8Array
   * @param canvas Canvas元素
   * @returns 图片数据
   */
  public canvasToBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      try {
        // 转换为blob，使用JPEG格式和0.8质量来减小文件大小
        canvas.toBlob(async (blob) => {
          if (blob) {
            // 转换为Uint8Array
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            resolve(bytes);
          } else {
            reject(new Error('Canvas转换为Blob失败'));
          }
        }, 'image/jpeg', 0.8);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 清理特定文件的缩略图缓存
   * @param fileId 文件ID
   */
  public async clearFileThumbnails(fileId: string): Promise<void> {
    // 清理内存缓存
    const keysToRemove = Array.from(this.memoryCache.keys())
      .filter(key => key.startsWith(`${fileId}_`));
    
    for (const key of keysToRemove) {
      const value = this.memoryCache.get(key)!;
      const itemSize = this.estimateDataUrlSize(value);
      this.memoryCache.delete(key);
      this.memoryCacheSize -= itemSize;
    }
    
    console.log(`已清理文件 ${fileId} 的 ${keysToRemove.length} 个缩略图内存缓存`);
    
    // 文件系统缓存清理需要遍历目录，这部分后续实现
  }

  /**
   * ArrayBuffer转Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  
  /**
   * 获取缓存统计信息
   */
  public getCacheStats(): {hits: number, misses: number, hitRate: number, memorySize: number} {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? this.cacheHits / total : 0;
    
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: hitRate,
      memorySize: this.memoryCacheSize
    };
  }
} 