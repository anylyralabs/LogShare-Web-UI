<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '@/lib/i18n'
import { getApiUrl } from '@/lib/ApiClient'
import { useLogViewer } from '@/composables/useLogViewer'
import { useLogSearch } from '@/composables/useLogSearch'
import '@/assets/LogsAnalysis.css'
import VirtualLog from '@/components/VirtualLog.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import FontSizeControl from '@/components/ui/FontSizeControl.vue'
import {
  PhTextColumns as WrapText,
  PhMagnifyingGlass as Search,
  PhDownload as Download,
  PhCornersOut as Maximize2,
  PhCaretLeft as ChevronLeft,
  PhCaretRight as ChevronRight,
  PhCheck as Check,
  PhWarning as AlertTriangle,
  PhArrowUp as ArrowUp,
  PhArrowDown as ArrowDown,
  PhCode as Code,
  PhTrash as Trash2,
  PhCircleNotch as Loader2,
  PhTag as Tag,
  PhSparkle as Sparkle,
  PhX as X
} from '@phosphor-icons/vue'

declare global {
  interface HTMLElement {
    _clickOutside?: (event: MouseEvent) => void
  }
}

const route = useRoute()
const id = route.params.id as string

const viewer = useLogViewer(id)
const logScrollRef = ref<HTMLElement | null>(null)
const virtualLogRef = ref<{ scrollToLine: (lineNumber: number) => void } | null>(null)
const search = useLogSearch(
  () => viewer.originalLogText.value,
  (rows, fallbackHtml) => viewer.setLogResult(rows, fallbackHtml),
  lineNumber => virtualLogRef.value?.scrollToLine(lineNumber)
)

onMounted(() => {
  viewer.init()
  viewer.loadLog()
})

const showDeleteDialog = ref(false)

const confirmDelete = () => {
  showDeleteDialog.value = false
  viewer.deleteLog()
}

// 文件列表完全来自 GET /v1/log/{id} 的 files 字段
const attachedFiles = computed(() => viewer.logMeta.value?.files ?? [])

const logTitle = computed(
  () => viewer.log.value?.title || viewer.selectedFile.value || viewer.logMeta.value?.id || id
)

const rawFileUrl = computed(() => {
  const name = viewer.selectedFile.value
  const path = name ? '/' + name.split('/').map(encodeURIComponent).join('/') : ''
  return getApiUrl(`/v1/raw/${id}${path}`)
})

const formatBytes = (bytes?: number): string => {
  if (bytes == null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface InfoEntry {
  label: string
  value: string
}

// metadata 的值可能是字符串、数字、布尔或对象，统一转成可展示文本
const displayMetaValue = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

// 日志级 metadata，由上传方提供；服务端已过滤 visible=false 的条目，这里保留防御性判断
const metadataEntries = computed<InfoEntry[]>(() =>
  (viewer.logMeta.value?.metadata ?? [])
    .filter(item => item.visible !== false)
    .map(item => ({
      label: item.label || item.key,
      value: displayMetaValue(item.value)
    }))
    .filter(item => item.label && item.value)
)

// 当前文件的 Codex 识别信息，随文件切换更新
const detectedEntries = computed<InfoEntry[]>(() => {
  const information = viewer.log.value?.analysis?.information
  if (!Array.isArray(information)) return []

  const seen = new Set<string>()
  const entries: InfoEntry[] = []
  for (const item of information) {
    const label = item?.label || item?.key || t('info')
    const value = displayMetaValue(item?.value ?? item?.message)
    if (!value) continue
    const key = `${label}\u0000${value}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ label, value })
  }
  return entries
})

const problems = computed<any[]>(() => viewer.log.value?.analysis?.problems ?? [])
const warningCount = computed(
  () => problems.value.filter((problem: any) => problem.severity === 'warning').length
)
const solvableCount = computed(
  () => problems.value.filter((problem: any) => problem.solutions?.length).length
)

// 模板字符串 ref 无法写入 composable 里的嵌套 ref，这里用函数 ref 绑定
const setProblemsSection = (el: unknown) => {
  viewer.problemsSection.value = el instanceof HTMLElement ? el : null
}

const scrollToProblems = () => {
  viewer.problemsSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const HELP_TIP_DISMISS_KEY = 'log_help_tip_dismissed'
const showHelpTip = ref(localStorage.getItem(HELP_TIP_DISMISS_KEY) !== '1')

const dismissHelpTip = () => {
  showHelpTip.value = false
  localStorage.setItem(HELP_TIP_DISMISS_KEY, '1')
}

const onFileChange = async () => {
  const name = viewer.selectedFile.value
  if (!name) return
  try {
    await viewer.selectFile(name)
  } catch (e: any) {
    console.error('Failed to load attached file:', e)
    viewer.addNotification('error', t('file_load_failed'))
    // 加载失败回退第一个文件，避免正文与下拉状态不一致
    const fallback = attachedFiles.value[0]?.name
    if (fallback && fallback !== name) {
      viewer.selectedFile.value = fallback
      await viewer.selectFile(fallback).catch(() => {})
    }
  }
}
</script>

<template>
  <div class="flex flex-col flex-1">
    <div v-if="viewer.loading.value" class="container mx-auto px-4 py-12 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      <p class="mt-4 text-muted-foreground">{{ t('loading_log') }}</p>
    </div>

    <div
      v-else-if="viewer.error.value"
      class="container mx-auto px-4 py-12 text-center"
      role="alert"
    >
      <h2 class="text-2xl font-bold text-destructive">{{ t('error_title') }}</h2>
      <p class="text-muted-foreground">{{ viewer.error.value }}</p>
    </div>

    <div
      v-else
      :class="
        viewer.isFullscreen.value
          ? 'fixed inset-0 z-50 bg-background transition-all duration-300'
          : 'w-full'
      "
    >
      <div :class="viewer.isFullscreen.value ? 'h-full flex flex-col' : 'flex flex-col'">
        <!-- 标题栏 -->
        <div
          v-if="!viewer.isFullscreen.value"
          class="flex items-start justify-between gap-4 px-4 py-3"
        >
          <div class="min-w-0 flex-1">
            <h1 class="text-3xl font-bold break-all">{{ logTitle }}</h1>
            <div v-if="attachedFiles.length > 1" class="flex items-center gap-1.5 text-sm mt-1">
              <span class="text-muted-foreground">{{ t('show_current_file') }}:</span>
              <select
                v-model="viewer.selectedFile.value"
                :disabled="viewer.fileSwitching.value"
                class="max-w-56 truncate bg-muted px-1.5 py-0.5 rounded text-xs font-mono cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                @change="onFileChange"
              >
                <option v-for="file in attachedFiles" :key="file.name" :value="file.name">
                  {{ file.name }} ({{ formatBytes(file.size) }} · {{ file.lines }} 行)
                </option>
              </select>
              <Loader2
                v-if="viewer.fileSwitching.value"
                weight="duotone"
                class="h-3.5 w-3.5 animate-spin text-primary"
              />
            </div>

            <div
              v-if="metadataEntries.length > 0 || detectedEntries.length > 0"
              class="mt-2 space-y-1.5 text-sm"
            >
              <div
                v-if="metadataEntries.length > 0"
                class="flex flex-wrap items-baseline gap-x-4 gap-y-1"
              >
                <span
                  class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                >
                  <Tag weight="duotone" class="h-3.5 w-3.5" />
                  {{ t('log_metadata') }}
                </span>
                <span
                  v-for="(entry, index) in metadataEntries"
                  :key="`metadata-${index}`"
                  class="inline-flex min-w-0 max-w-full items-baseline gap-1"
                  :title="`${entry.label}: ${entry.value}`"
                >
                  <span class="shrink-0 text-muted-foreground">{{ entry.label }}:</span>
                  <span class="break-all text-foreground">{{ entry.value }}</span>
                </span>
              </div>

              <div
                v-if="detectedEntries.length > 0"
                class="flex flex-wrap items-baseline gap-x-4 gap-y-1"
              >
                <span
                  class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                >
                  <Sparkle weight="duotone" class="h-3.5 w-3.5" />
                  {{ t('log_detected') }}
                </span>
                <span
                  v-for="(entry, index) in detectedEntries"
                  :key="`detected-${index}`"
                  class="inline-flex min-w-0 max-w-full items-baseline gap-1"
                  :title="`${entry.label}: ${entry.value}`"
                >
                  <span class="shrink-0 text-muted-foreground">{{ entry.label }}:</span>
                  <span class="break-all text-foreground">{{ entry.value }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 问题概览 -->
        <div v-if="!viewer.isFullscreen.value && problems.length > 0" class="px-4">
          <div
            class="mt-2 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5"
          >
            <div class="order-1 flex items-center gap-2">
              <AlertTriangle weight="duotone" class="h-5 w-5 text-destructive" />
              <span class="text-sm font-semibold text-foreground">{{ t('problems_detected') }}</span>
            </div>

            <div
              class="order-3 flex w-full flex-wrap items-center gap-1.5 text-xs sm:order-2 sm:w-auto"
            >
              <span
                class="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-destructive"></span>
                {{ t('problems_count').replace('{count}', problems.length.toString()) }}
              </span>
              <span
                v-if="warningCount > 0"
                class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-600 dark:text-amber-400"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                {{ t('warnings_count').replace('{count}', warningCount.toString()) }}
              </span>
              <span
                v-if="solvableCount > 0"
                class="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 font-medium text-green-600 dark:text-green-400"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                {{ t('solvable_count').replace('{count}', solvableCount.toString()) }}
              </span>
            </div>

            <button
              class="order-2 ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/5 sm:order-3"
              @click="scrollToProblems"
            >
              {{ t('view_details') }}
              <ArrowDown weight="duotone" class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <!-- 帮助提示（可关闭 Tips）：PC 端工具栏直接可见，仅移动端展示 -->
        <div
          v-if="!viewer.isFullscreen.value && showHelpTip"
          class="mt-3 mb-3 px-4 text-sm sm:hidden"
        >
          <div class="relative bg-muted/50 rounded-lg px-4 py-2.5 pr-9 space-y-1.5">
            <span class="font-medium">{{ t('log_help_card_title') }}</span>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <button
                :class="
                  viewer.isCopySuccess.value
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                "
                class="inline-flex items-center rounded-md px-3.5 py-2 font-medium transition-colors"
                @click="viewer.copyShareMessage()"
              >
                {{ viewer.isCopySuccess.value ? t('copied') : t('copy_share') }}
              </button>
              <AppButton as="router-link" variant="soft" to="/groups">
                {{ t('go_group_list') }}
              </AppButton>
            </div>
            <button
              class="absolute right-2 top-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              :aria-label="t('close')"
              @click="dismissHelpTip"
            >
              <X weight="duotone" class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- 日志查看器 -->
        <div :class="viewer.isFullscreen.value ? 'flex-1 flex flex-col min-h-0' : ''">
          <!-- 工具栏 -->
          <div class="border-b bg-muted/30">
            <!-- 主工具栏：功能按钮区 -->
            <div class="flex items-center justify-between gap-2 p-2 border-b border-muted">
              <!-- 左侧：视图控制 -->
              <div class="flex items-center gap-1">
                <AppButton
                  :variant="viewer.showErrorsOnly.value ? 'destructive' : 'secondary'"
                  class="px-4 py-2"
                  :title="viewer.showErrorsOnly.value ? t('show_all') : t('show_errors_only')"
                  @click="viewer.toggleErrors()"
                >
                  <AlertTriangle weight="duotone" class="h-5 w-5" />
                  <span class="hidden sm:inline">{{
                    viewer.showErrorsOnly.value ? t('show_all') : t('show_errors_only')
                  }}</span>
                </AppButton>
                <AppButton
                  :variant="viewer.wrapLines.value ? 'primary' : 'secondary'"
                  class="px-4 py-2"
                  :title="t('toggle_wrap')"
                  @click="viewer.wrapLines.value = !viewer.wrapLines.value"
                >
                  <WrapText weight="duotone" class="h-5 w-5" />
                  <span class="hidden sm:inline">{{
                    viewer.wrapLines.value ? t('wrap_lines_on') : t('wrap_lines_off')
                  }}</span>
                </AppButton>
              </div>

              <!-- 右侧：操作按钮 -->
              <div class="flex items-center gap-1">
                <AppButton
                  variant="secondary"
                  class="px-4 py-2"
                  :title="t('download')"
                  @click="viewer.downloadLog()"
                >
                  <Download weight="duotone" class="h-5 w-5" />
                  <span class="hidden sm:inline">{{ t('download') }}</span>
                </AppButton>
                <AppButton
                  as="a"
                  variant="secondary"
                  class="px-4 py-2"
                  :href="rawFileUrl"
                  :title="t('view_raw_log')"
                >
                  <Code weight="duotone" class="h-5 w-5" />
                  <span class="hidden sm:inline">{{ t('view_raw_log') }}</span>
                </AppButton>
                <AppButton
                  variant="soft-destructive"
                  class="px-4 py-2"
                  :disabled="viewer.isDeleting.value"
                  :title="t('delete')"
                  @click="showDeleteDialog = true"
                >
                  <Trash2 weight="duotone" class="h-5 w-5" />
                  <span class="hidden sm:inline">{{
                    viewer.isDeleting.value ? t('deleting') : t('delete')
                  }}</span>
                </AppButton>

                <!-- 删除确认对话框 -->
                <AppDialog :open="showDeleteDialog" @close="showDeleteDialog = false">
                  <div class="p-5 sm:p-6">
                    <div class="mb-4 flex items-start gap-3">
                      <div
                        class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10"
                      >
                        <AlertTriangle weight="duotone" class="h-5 w-5 text-destructive" />
                      </div>
                      <div>
                        <h2 class="text-lg font-semibold text-foreground">{{ t('delete_log') }}</h2>
                        <p class="mt-1 text-sm text-muted-foreground">
                          此操作不可撤销，确定要删除这个日志吗？
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center justify-end gap-2">
                      <AppButton
                        variant="secondary"
                        :disabled="viewer.isDeleting.value"
                        @click="showDeleteDialog = false"
                      >
                        {{ t('cancel') }}
                      </AppButton>
                      <AppButton
                        variant="destructive"
                        :disabled="viewer.isDeleting.value"
                        @click="confirmDelete"
                      >
                        {{ viewer.isDeleting.value ? t('deleting') : t('delete') }}
                      </AppButton>
                    </div>
                  </div>
                </AppDialog>
                <AppButton
                  v-if="!viewer.isFullscreen.value"
                  variant="secondary"
                  class="ml-1 px-4 py-2"
                  :title="t('fullscreen')"
                  @click="viewer.enterFullscreen()"
                >
                  <Maximize2 weight="duotone" class="h-5 w-5" />
                  <span class="hidden sm:inline">{{ t('fullscreen') }}</span>
                </AppButton>
                <AppButton
                  v-else
                  variant="destructive"
                  class="ml-1 px-4 py-2"
                  :title="t('exit_fullscreen')"
                  @click="viewer.exitFullscreen()"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="h-5 w-5"
                  >
                    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                  </svg>
                  <span class="hidden sm:inline">{{ t('exit_fullscreen') }}</span>
                </AppButton>
                <div class="ml-1 hidden items-center sm:flex">
                  <FontSizeControl
                    :font-size="viewer.logFontSize.value"
                    :is-editing="viewer.isEditingFontSize.value"
                    :input="viewer.fontSizeInput.value"
                    @decrease="viewer.decreaseFontSize()"
                    @increase="viewer.increaseFontSize()"
                    @start-edit="viewer.startEditFontSize()"
                    @commit="viewer.applyFontSize()"
                    @cancel="viewer.cancelFontSizeEdit()"
                    @update:input="viewer.fontSizeInput.value = $event"
                  />
                </div>
              </div>
            </div>

            <!-- 移动端专用行：字体调节 -->
            <div class="flex items-center gap-1 border-b border-muted p-2 sm:hidden">
              <FontSizeControl
                compact
                :font-size="viewer.logFontSize.value"
                :is-editing="viewer.isEditingFontSize.value"
                :input="viewer.fontSizeInput.value"
                @decrease="viewer.decreaseFontSize()"
                @increase="viewer.increaseFontSize()"
                @start-edit="viewer.startEditFontSize()"
                @commit="viewer.applyFontSize()"
                @cancel="viewer.cancelFontSizeEdit()"
                @update:input="viewer.fontSizeInput.value = $event"
              />
            </div>

            <!-- 搜索栏 -->
            <div class="flex items-center gap-2 p-2">
              <div class="flex-1 min-w-0">
                <div class="relative">
                  <Search
                    weight="duotone"
                    class="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
                  />
                  <input
                    v-model="search.searchTerm.value"
                    :placeholder="t('search') + ' (Ctrl+F)'"
                    class="w-full bg-background border border-border rounded-md pl-9 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                    @keyup="search.handleSearchInput($event)"
                  />
                </div>
              </div>

              <div v-if="search.searchResults.value.length > 0" class="flex items-center gap-1">
                <span class="text-xs text-muted-foreground font-mono min-w-[60px] text-center"
                  >{{ search.searchIndex.value + 1 }}/{{ search.searchResults.value.length }}</span
                >
                <button
                  class="p-2 rounded-md hover:bg-secondary transition-colors"
                  :title="t('previous_result')"
                  @click="search.goToPrevResult()"
                >
                  <ChevronLeft weight="duotone" class="h-4 w-4" />
                </button>
                <button
                  class="p-2 rounded-md hover:bg-secondary transition-colors"
                  :title="t('next_result')"
                  @click="search.goToNextResult()"
                >
                  <ChevronRight weight="duotone" class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- 日志内容 -->
          <div :class="viewer.isFullscreen.value ? 'flex-1 flex flex-col min-h-0' : ''">
            <div
              ref="logScrollRef"
              :class="
                viewer.isFullscreen.value ? 'flex-1 overflow-y-auto' : 'overflow-x-auto relative'
              "
              class="bg-[--log-bg] py-2"
            >
              <VirtualLog
                ref="virtualLogRef"
                :rows="viewer.logRows.value"
                :fallback-html="viewer.logFallbackHtml.value"
                :font-size="viewer.logFontSize.value"
                :wrap-lines="viewer.wrapLines.value"
                :show-errors-only="viewer.showErrorsOnly.value"
                :scroll-container="viewer.isFullscreen.value ? logScrollRef : null"
              />
              <button
                class="fixed bottom-4 right-4 inline-flex items-center gap-1.5 rounded-md bg-[--log-bg-hover] px-4 py-2 text-xs text-gray-100 shadow-lg transition-colors hover:bg-[--log-border]"
                @click="viewer.scrollToTop()"
              >
                <ArrowUp weight="duotone" class="h-3.5 w-3.5" />
                {{ t('scroll_top') }}
              </button>
            </div>
          </div>
        </div>

        <!-- 问题详情 -->
        <div
          v-if="problems.length > 0"
          :ref="setProblemsSection"
          class="scroll-mt-20 bg-card p-4"
        >
          <div class="flex items-center gap-2 mb-4 pb-3 border-b">
            <AlertTriangle weight="duotone" class="h-5 w-5 text-destructive" />
            <h2 class="font-semibold">{{ t('problem_details') }}</h2>
          </div>
          <div class="space-y-3">
            <div
              v-for="(prob, idx) in problems"
              :key="idx"
              class="p-3 rounded-lg border bg-destructive/5 border-destructive/20"
            >
              <div class="flex items-start gap-2">
                <AlertTriangle
                  weight="duotone"
                  class="h-5 w-5 text-destructive flex-shrink-0 mt-0.5"
                />
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-sm">{{ prob.message }}</p>
                  <p v-if="prob.line" class="text-xs text-muted-foreground mt-1">
                    {{ t('line_number') }}: {{ prob.line }}
                  </p>
                  <div v-if="prob.solutions?.length" class="mt-3 space-y-2">
                    <p class="text-xs font-medium text-green-600">{{ t('solution') }}:</p>
                    <div
                      v-for="sol in prob.solutions"
                      :key="sol.message"
                      class="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check weight="duotone" class="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{{ sol.message }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 通知由全局 ToastHost 渲染 -->
  </div>
</template>

<style>
.log-content table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.log-content .line-num {
  vertical-align: top;
  text-align: right;
  width: 45px;
  font-size: inherit;
  color: #6b7280;
  line-height: inherit;
  padding-right: 8px;
  border-right: 1px solid var(--log-border);
  margin-right: 8px;
  user-select: none;
}

.log-content .line-content {
  padding: 0;
  margin: 0;
  word-break: break-all;
  vertical-align: top;
}

.log-content.show-errors-only .entry-no-error {
  display: none;
}

.log-no-wrap {
  white-space: pre;
  overflow-x: auto;
}

.log-no-wrap table {
  width: auto;
  table-layout: auto;
}

.log-no-wrap .line-content {
  word-break: normal;
  overflow-wrap: normal;
}

.log-no-wrap .level {
  white-space: pre !important;
}

.log-content tr.bg-error-group {
  background-color: rgba(239, 68, 68, 0.12) !important;
}

.log-content tr.bg-warning-group {
  background-color: rgba(245, 158, 11, 0.12) !important;
}

.dark .log-content tr.bg-error-group {
  background-color: rgba(239, 68, 68, 0.18) !important;
}

.dark .log-content tr.bg-warning-group {
  background-color: rgba(245, 158, 11, 0.18) !important;
}

mark {
  padding: 0.1em 0.2em;
  margin: 0;
  background-color: #3b82f6;
  color: #ffffff;
  border-radius: 2px;
  font-weight: 500;
}

.dark mark {
  background-color: #60a5fa;
  color: #000000;
}

.log-wrap {
  white-space: normal;
}

.log-no-wrap {
  white-space: pre;
}

.fullscreen-log-view {
  overflow: hidden;
}

.fullscreen-view-enter-active,
.fullscreen-view-leave-active {
  transition: all 0.3s ease;
}

.fullscreen-view-enter-from {
  opacity: 0;
  transform: scale(0.98);
}

.fullscreen-view-enter-to {
  opacity: 1;
  transform: scale(1);
}

.fullscreen-view-leave-from {
  opacity: 1;
  transform: scale(1);
}

.fullscreen-view-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.log-content {
  font-family:
    'HarmonyOS Sans SC',
    system-ui,
    -apple-system,
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
  font-weight: 400;
  line-height: 1.25;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  letter-spacing: 0.01em;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.log-content * {
  word-break: break-all;
  overflow-wrap: anywhere;
  line-height: inherit;
}

.log-content p {
  line-height: inherit;
  margin: 0;
}

@media (max-width: 767px) {
  .log-content .line-num {
    width: 35px;
    padding-right: 6px;
    margin-right: 6px;
  }
}

@media (min-width: 1024px) {
  .log-content .line-num {
    width: 50px;
    padding-right: 10px;
    margin-right: 10px;
  }
}

</style>
