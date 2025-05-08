import { createApp, h, ref } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'

interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
}

class ConfirmService {
  private static instance: ConfirmService
  private container: HTMLDivElement | null = null
  private app: any = null
  private show: ((options: ConfirmOptions) => Promise<boolean>) | null = null

  private constructor() {
    // 创建容器
    this.container = document.createElement('div')
    document.body.appendChild(this.container)
    
    // 创建应用实例
    this.app = createApp({
      setup: () => {
        const showConfirmDialog = ref(false)
        const confirmMessage = ref('')
        const confirmTitle = ref('确认')
        const confirmText = ref('确定')
        const cancelText = ref('取消')
        let resolvePromise: ((value: boolean) => void) | null = null

        const show = (options: ConfirmOptions): Promise<boolean> => {
          return new Promise((resolve) => {
            resolvePromise = resolve
            confirmMessage.value = options.message
            confirmTitle.value = options.title || '确认'
            confirmText.value = options.confirmText || '确定'
            cancelText.value = options.cancelText || '取消'
            showConfirmDialog.value = true
          })
        }

        const handleConfirm = () => {
          showConfirmDialog.value = false
          resolvePromise?.(true)
        }

        const handleCancel = () => {
          showConfirmDialog.value = false
          resolvePromise?.(false)
        }

        // 保存 show 函数的引用
        this.show = show

        return () => h(ConfirmDialog, {
          modelValue: showConfirmDialog.value,
          title: confirmTitle.value,
          message: confirmMessage.value,
          confirmText: confirmText.value,
          cancelText: cancelText.value,
          'onUpdate:modelValue': (value: boolean) => showConfirmDialog.value = value,
          onConfirm: handleConfirm,
          onCancel: handleCancel
        })
      }
    })

    // 挂载应用
    this.app.mount(this.container)
  }

  public static getInstance(): ConfirmService {
    if (!ConfirmService.instance) {
      ConfirmService.instance = new ConfirmService()
    }
    return ConfirmService.instance
  }

  public async confirm(options: ConfirmOptions): Promise<boolean> {
    if (!this.show) {
      throw new Error('Confirm service not initialized')
    }
    return this.show(options)
  }
}

// 导出便捷函数
export const confirm = (options: ConfirmOptions): Promise<boolean> => {
  return ConfirmService.getInstance().confirm(options)
} 