import { ref, Ref } from 'vue'

interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
}

interface ConfirmResult {
  showConfirmDialog: Ref<boolean>
  confirmMessage: Ref<string>
  confirmTitle: Ref<string>
  confirmText: Ref<string>
  cancelText: Ref<string>
  show: (options: ConfirmOptions) => Promise<boolean>
  handleConfirm: () => void
  handleCancel: () => void
}

export function useConfirm(): ConfirmResult {
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

  return {
    showConfirmDialog,
    confirmMessage,
    confirmTitle,
    confirmText,
    cancelText,
    show,
    handleConfirm,
    handleCancel
  }
} 