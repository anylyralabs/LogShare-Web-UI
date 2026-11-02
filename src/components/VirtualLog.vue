<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ParsedLogRow } from '@/lib/logParser.types'

const props = defineProps<{
  rows: ParsedLogRow[]
  fallbackHtml?: string
  fontSize: number
  wrapLines: boolean
  showErrorsOnly: boolean
  scrollContainer?: HTMLElement | null
}>()

const rootEl = ref<HTMLElement | null>(null)
const start = ref(0)
const end = ref(Math.min(props.rows.length, 300))
const rowHeight = ref(props.fontSize * 1.25)
let frame = 0
let currentContainer: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null

const isVirtual = computed(
  () => !props.wrapLines && !props.showErrorsOnly && props.rows.length > 0
)

const visibleHtml = computed(() =>
  props.rows
    .slice(start.value, end.value)
    .map(row => row.html)
    .join('')
)

const fullHtml = computed(
  () =>
    '<table class="log-table"><tbody>' +
    props.rows.map(row => row.html).join('') +
    '</tbody></table>'
)

const topHeight = computed(() => (isVirtual.value ? start.value * rowHeight.value : 0))
const bottomHeight = computed(() =>
  isVirtual.value ? Math.max(0, props.rows.length - end.value) * rowHeight.value : 0
)

const lineIndex = computed(() => {
  const map = new Map<number, number>()
  props.rows.forEach((row, index) => map.set(row.lineNumber, index))
  return map
})

const measureRowHeight = () => {
  if (!isVirtual.value) return
  const row = rootEl.value?.querySelector<HTMLElement>('tbody tr')
  const height = row?.getBoundingClientRect().height
  if (height && height > 0 && Math.abs(height - rowHeight.value) > 0.5) {
    rowHeight.value = height
    updateWindow()
  }
}

const updateWindow = () => {
  const root = rootEl.value
  if (!root) return

  if (!isVirtual.value) {
    start.value = 0
    end.value = props.rows.length
    return
  }

  const style = getComputedStyle(root)
  const lineHeight =
    rowHeight.value ||
    Number.parseFloat(style.lineHeight) ||
    props.fontSize * 1.25

  const rootRect = root.getBoundingClientRect()
  const container = props.scrollContainer
  let viewTop = 0
  let viewBottom = 0

  if (container) {
    const containerRect = container.getBoundingClientRect()
    viewTop = Math.max(0, containerRect.top - rootRect.top)
    viewBottom = Math.min(rootRect.height, containerRect.bottom - rootRect.top)
  } else {
    viewTop = Math.max(0, -rootRect.top)
    viewBottom = Math.min(rootRect.height, window.innerHeight - rootRect.top)
  }

  const visibleCount = Math.max(
    1,
    Math.ceil(Math.max(0, viewBottom - viewTop) / lineHeight)
  )
  const windowSize = Math.min(props.rows.length, Math.max(1, visibleCount * 3))
  const firstVisible = Math.max(0, Math.floor(viewTop / lineHeight))

  let nextStart = Math.max(0, firstVisible - visibleCount)
  let nextEnd = Math.min(props.rows.length, nextStart + windowSize)
  if (nextEnd - nextStart < windowSize) {
    nextStart = Math.max(0, nextEnd - windowSize)
    nextEnd = Math.min(props.rows.length, nextStart + windowSize)
  }

  if (nextStart !== start.value) start.value = nextStart
  if (nextEnd !== end.value) end.value = nextEnd
}

const scheduleUpdate = () => {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    updateWindow()
    measureRowHeight()
  })
}

const bindContainer = (container: HTMLElement | null) => {
  if (currentContainer) {
    currentContainer.removeEventListener('scroll', scheduleUpdate)
  }
  currentContainer = container
  if (container) {
    container.addEventListener('scroll', scheduleUpdate, { passive: true })
  }
}

const scrollToLine = (lineNumber: number) => {
  const index = lineIndex.value.get(lineNumber)
  if (index === undefined) return

  if (!isVirtual.value) {
    document
      .getElementById(`L${lineNumber}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  const root = rootEl.value
  if (!root) return
  const lineHeight = rowHeight.value || props.fontSize * 1.25
  const container = props.scrollContainer

  if (container) {
    const rootRect = root.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const rootTop = container.scrollTop + rootRect.top - containerRect.top
    const target = rootTop + index * lineHeight - container.clientHeight / 2 + lineHeight / 2
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  } else {
    const rootTop = root.getBoundingClientRect().top + window.scrollY
    const target = rootTop + index * lineHeight - window.innerHeight / 2 + lineHeight / 2
    window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }
}

watch(
  () => props.rows,
  () => {
    start.value = 0
    end.value = Math.min(props.rows.length, 300)
    nextTick(scheduleUpdate)
  }
)

watch(
  () => props.fontSize,
  () => {
    rowHeight.value = props.fontSize * 1.25
    nextTick(scheduleUpdate)
  }
)

watch(
  () => [props.wrapLines, props.showErrorsOnly],
  () => nextTick(scheduleUpdate)
)

watch(isVirtual, virtual => {
  if (virtual) {
    // 从完整渲染切回虚拟模式时，先按当前滚动位置算窗口，避免先渲染顶部再跳回底部
    updateWindow()
  } else {
    start.value = 0
    end.value = props.rows.length
  }
  nextTick(scheduleUpdate)
})

watch(
  () => props.scrollContainer,
  container => {
    if (currentContainer) resizeObserver?.unobserve(currentContainer)
    bindContainer(container ?? null)
    if (container) resizeObserver?.observe(container)
    scheduleUpdate()
  }
)

onMounted(() => {
  bindContainer(props.scrollContainer ?? null)
  window.addEventListener('scroll', scheduleUpdate, { passive: true })
  window.addEventListener('resize', scheduleUpdate)
  resizeObserver = new ResizeObserver(scheduleUpdate)
  if (props.scrollContainer) resizeObserver.observe(props.scrollContainer)
  nextTick(scheduleUpdate)
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
  bindContainer(null)
  window.removeEventListener('scroll', scheduleUpdate)
  window.removeEventListener('resize', scheduleUpdate)
  resizeObserver?.disconnect()
})

defineExpose({ scrollToLine })
</script>

<template>
  <div
    ref="rootEl"
    class="log-content text-gray-100"
    :class="{
      'show-errors-only': showErrorsOnly,
      'log-wrap': wrapLines,
      'log-no-wrap': !wrapLines,
      'log-virtual': isVirtual
    }"
    :style="{ fontSize: `${fontSize}px` }"
  >
    <template v-if="isVirtual">
      <div
        class="log-virtual-spacer"
        :style="{ height: `${topHeight}px` }"
        aria-hidden="true"
      ></div>
      <table class="log-table">
        <tbody v-html="visibleHtml"></tbody>
      </table>
      <div
        class="log-virtual-spacer"
        :style="{ height: `${bottomHeight}px` }"
        aria-hidden="true"
      ></div>
    </template>
    <div v-else-if="rows.length === 0 && fallbackHtml" v-html="fallbackHtml"></div>
    <div v-else v-html="fullHtml"></div>
  </div>
</template>

<style scoped>
.log-virtual {
  overflow-anchor: none;
}

.log-virtual-spacer {
  pointer-events: none;
}
</style>
