<script setup lang="ts">
import { computed, ref } from 'vue'
import { PhCheck as Check, PhCopy as Copy } from '@phosphor-icons/vue'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)

const props = defineProps<{
  code: string
  lang?: string
  title?: string
}>()

const copied = ref(false)

const languageAliases: Record<string, string> = {
  js: 'javascript',
  sh: 'bash',
  shell: 'bash'
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const highlightedCode = computed(() => {
  const language = props.lang ? (languageAliases[props.lang] ?? props.lang) : ''
  if (!language || !hljs.getLanguage(language)) return escapeHtml(props.code)
  return hljs.highlight(props.code, { language, ignoreIllegals: true }).value
})

const copy = async () => {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<template>
  <div class="group overflow-hidden rounded-lg border border-border bg-[#1b1b1f] text-slate-100">
    <div
      class="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-slate-400"
    >
      <span>{{ title || lang || 'text' }}</span>
      <button
        class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-slate-100"
        :aria-label="copied ? '已复制' : '复制代码'"
        @click="copy"
      >
        <Check v-if="copied" weight="duotone" class="h-3.5 w-3.5" />
        <Copy v-else weight="duotone" class="h-3.5 w-3.5" />
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
    <pre class="overflow-x-auto p-4 text-xs leading-6"><code class="hljs" v-html="highlightedCode"></code></pre>
  </div>
</template>

<style scoped>
:deep(.hljs-comment),
:deep(.hljs-quote) {
  color: #6e6a86;
  font-style: italic;
}

:deep(.hljs-keyword),
:deep(.hljs-selector-tag),
:deep(.hljs-literal),
:deep(.hljs-section),
:deep(.hljs-link),
:deep(.hljs-operator) {
  color: #c4a7e7;
}

:deep(.hljs-string),
:deep(.hljs-attr-value),
:deep(.hljs-template-tag),
:deep(.hljs-template-variable),
:deep(.hljs-built_in),
:deep(.hljs-type) {
  color: #9ccfd8;
}

:deep(.hljs-number),
:deep(.hljs-symbol),
:deep(.hljs-bullet),
:deep(.hljs-meta) {
  color: #f6c177;
}

:deep(.hljs-title),
:deep(.hljs-title.function_),
:deep(.hljs-title.class_) {
  color: #ebbcba;
}

:deep(.hljs-attr),
:deep(.hljs-property),
:deep(.hljs-variable),
:deep(.hljs-params) {
  color: #e0def4;
}

:deep(.hljs-punctuation) {
  color: #908caa;
}
</style>
