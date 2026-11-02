import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiClient, type LogMetaResponse } from '@/lib/ApiClient'
import { parseLog } from '@/lib/logParser'
import type { ParsedLogRow } from '@/lib/logParser.types'
import { setPageTitle } from '@/lib/pageTitle'
import { t } from '@/lib/i18n'
import { toast } from '@/lib/toast'

export function useLogViewer(logId: string) {
  const router = useRouter()
  const log = ref<any>(null)
  const logMeta = ref<LogMetaResponse | null>(null)
  const logRows = ref<ParsedLogRow[]>([])
  const logFallbackHtml = ref('')
  const loading = ref(true)
  const error = ref('')
  const showErrorsOnly = ref(false)
  const wrapLines = ref(false)
  const isFullscreen = ref(false)
  const isCopySuccess = ref(false)
  const isDeleting = ref(false)
  const logToken = ref<string | null>(null)
  const logFontSize = ref(12)
  const isEditingFontSize = ref(false)
  const fontSizeInput = ref('12')
  const originalLogText = ref('')
  const selectedFile = ref('')
  const fileSwitching = ref(false)

  const addNotification = (type: 'success' | 'error', message: string) => {
    if (type === 'success') toast.success(message)
    else toast.error(message)
  }

  const setLogResult = (rows: ParsedLogRow[], fallbackHtml = '') => {
    logRows.value = rows
    logFallbackHtml.value = fallbackHtml
  }

  const init = () => {
    logToken.value = localStorage.getItem(`log_token_${logId}`)
    const savedFontSize = localStorage.getItem('log_font_size')
    if (savedFontSize) {
      const val = parseInt(savedFontSize)
      if (!isNaN(val) && val >= 8 && val <= 48) {
        logFontSize.value = val
      }
    }
  }

  const loadFile = async (name: string, scrollToTop = false) => {
    const rawText = await apiClient.getRawFile(logId, name)
    selectedFile.value = name
    originalLogText.value = rawText
    setLogResult(await parseLog(rawText))
    log.value = null
    setPageTitle('log', { id: logId })

    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    // 分析按文件懒加载，不阻塞正文展示
    apiClient
      .getInsightsFile(logId, name)
      .then(insights => {
        if (selectedFile.value !== name) return
        log.value = insights
        if (insights?.title) {
          setPageTitle('log', { title: insights.title, id: logId })
        }
      })
      .catch(e => {
        console.warn('Failed to load insights:', e)
      })
  }

  const loadLog = async () => {
    try {
      const meta = await apiClient.getLogMeta(logId)
      logMeta.value = meta
      const firstFile = meta.files?.[0]
      if (!firstFile) {
        throw new Error(t('log_load_failed'))
      }
      await loadFile(firstFile.name)
    } catch (e: any) {
      console.error('Failed to load log:', e)
      const status = e.response?.status
      if (status === 404) {
        error.value = t('log_not_found')
      } else if (status === 429) {
        error.value = t('log_rate_limited')
      } else {
        error.value = e.response?.data?.error || e.response?.data?.message || t('log_load_failed')
      }
    } finally {
      loading.value = false
    }
  }

  /** 切换当前查看的文件，并同步该文件的 Codex 分析 */
  const selectFile = async (name: string) => {
    if (!name) return
    fileSwitching.value = true
    try {
      await loadFile(name, true)
    } finally {
      fileSwitching.value = false
    }
  }

  const toggleErrors = () => {
    showErrorsOnly.value = !showErrorsOnly.value
  }

  const deleteLog = async () => {
    isDeleting.value = true
    try {
      if (logToken.value) {
        const result = await apiClient.deleteLog(logId, logToken.value)
        if (result.success) {
          localStorage.removeItem(`log_token_${logId}`)
          router.push('/')
          addNotification('success', t('delete_log_success'))
        } else {
          addNotification(
            'error',
            t('delete_log_failed') +
              ': ' +
              (result.failed[0]?.error || result.failed[0]?.message || '')
          )
        }
      } else {
        addNotification('error', t('delete_log_no_token'))
      }
    } catch (e: any) {
      console.error('Delete error:', e)
      addNotification(
        'error',
        e.response?.data?.error || e.response?.data?.message || t('delete_log_failed')
      )
    } finally {
      isDeleting.value = false
    }
  }

  const copyShareMessage = async () => {
    if (!log.value?.title && selectedFile.value) {
      try {
        log.value = await apiClient.getInsightsFile(logId, selectedFile.value)
      } catch (e) {
        console.error('Failed to load analysis for share message:', e)
      }
    }

    let shareMessage = '我遇到了一个问题，'
    if (log.value && log.value.title) {
      shareMessage += `是${log.value.title} `
    }
    shareMessage += '，网站要求我复制链接给可以帮助我的人，链接如下：\n'
    shareMessage += window.location.href
    shareMessage += '\n不管能不能解决问题，先谢谢大佬！'

    try {
      await navigator.clipboard.writeText(shareMessage)
      isCopySuccess.value = true
      setTimeout(() => (isCopySuccess.value = false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
      addNotification('error', t('share_failed'))
    }
  }

  const downloadLog = () => {
    const text = originalLogText.value
    if (!text) {
      addNotification('error', t('download_failed'))
      return
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', selectedFile.value.split('/').pop() || `${logId}.log`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const enterFullscreen = () => {
    isFullscreen.value = true
    document.body.classList.add('fullscreen-log-view')
  }

  const exitFullscreen = () => {
    isFullscreen.value = false
    document.body.classList.remove('fullscreen-log-view')
  }

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  const increaseFontSize = () => {
    if (logFontSize.value < 24) {
      logFontSize.value += 2
      saveFontSize()
    }
  }

  const decreaseFontSize = () => {
    if (logFontSize.value > 10) {
      logFontSize.value -= 2
      saveFontSize()
    }
  }

  const startEditFontSize = () => {
    fontSizeInput.value = String(logFontSize.value)
    isEditingFontSize.value = true
  }

  const cancelFontSizeEdit = () => {
    isEditingFontSize.value = false
  }

  const applyFontSize = () => {
    const val = parseInt(fontSizeInput.value)
    if (!isNaN(val) && val >= 8 && val <= 48) {
      logFontSize.value = val
      saveFontSize()
    }
    isEditingFontSize.value = false
  }

  const saveFontSize = () => {
    localStorage.setItem('log_font_size', String(logFontSize.value))
  }

  return {
    log,
    logMeta,
    logRows,
    logFallbackHtml,
    setLogResult,
    loading,
    error,
    showErrorsOnly,
    wrapLines,
    isFullscreen,
    isCopySuccess,
    isDeleting,
    logToken,
    logFontSize,
    isEditingFontSize,
    fontSizeInput,
    originalLogText,
    selectedFile,
    fileSwitching,
    init,
    loadLog,
    selectFile,
    toggleErrors,
    deleteLog,
    copyShareMessage,
    downloadLog,
    enterFullscreen,
    exitFullscreen,
    scrollToTop,
    increaseFontSize,
    decreaseFontSize,
    startEditFontSize,
    cancelFontSizeEdit,
    applyFontSize,
    addNotification
  }
}
