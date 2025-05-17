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
    const filename = `${fileId.replace(/[^a-zA-Z0-9]/g, '_')}_${pageNumber}_${scale.toString().replace('.', '_')}.png`;
    return await join(this.cacheDir, filename);
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
      const path = await this.getThumbnailPath(fileId, pageNumber, scale);
      return await exists(path);
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
      const path = await this.getThumbnailPath(fileId, pageNumber, scale);
      
      // 检查文件是否存在
      if (!(await exists(path))) {
        throw new Error('缩略图不存在');
      }
      
      // 读取文件内容
      const data = await readFile(path);
      
      // 转换为base64数据URL
      const base64 = this.arrayBufferToBase64(data);
      return `data:image/png;base64,${base64}`;
    } catch (error) {
      console.error('获取缩略图缓存失败:', error);
      throw error;
    }
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
        // 转换为blob
        canvas.toBlob(async (blob) => {
          if (blob) {
            // 转换为Uint8Array
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            resolve(bytes);
          } else {
            reject(new Error('Canvas转换为Blob失败'));
          }
        }, 'image/png');
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
    // 这个功能需要遍历目录并删除匹配的文件
    // 待实现
    console.log('清理缩略图缓存:', fileId);
  }
} 