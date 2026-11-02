<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '@/lib/i18n'
import ApiCodeBlock from '@/components/ApiCodeBlock.vue'
import { PhCheck as Check, PhCopy as Copy } from '@phosphor-icons/vue'

const baseUrl = 'https://api.logshare.cn'
const copied = ref(false)
const activeSection = ref('overview')
let observer: IntersectionObserver | null = null

const sections = [
  { id: 'overview', title: '概览', group: '开始' },
  { id: 'flow', title: '接入流程', group: '开始' },
  { id: 'quick-start', title: '快速开始', group: '开始' },
  { id: 'endpoints', title: '端点总览', group: '接口' },
  { id: 'upload', title: '上传日志', group: '接口' },
  { id: 'meta', title: '日志元信息', group: '接口' },
  { id: 'read', title: '读取文件', group: '接口' },
  { id: 'analyse', title: '分析文件', group: '接口' },
  { id: 'delete', title: '删除日志', group: '接口' },
  { id: 'limits', title: '上传限制', group: '参考' },
  { id: 'errors', title: '错误与状态码', group: '参考' },
  { id: 'sdk', title: 'SDK', group: '参考' }
]

const groups = computed(() => {
  const result: Array<{ name: string; items: typeof sections }> = []
  for (const section of sections) {
    const group = result.find(item => item.name === section.group)
    if (group) group.items.push(section)
    else result.push({ name: section.group, items: [section] })
  }
  return result
})

const endpoints = [
  { method: 'POST', path: '/v1/log', desc: '上传一个或多个日志文件（也兼容旧版单文件 content），创建日志记录，并返回日志 ID、分享地址、删除 token 和文件列表。' },
  { method: 'GET', path: '/v1/log/{id}', desc: '获取日志的元信息、公开 metadata 和文件列表。' },
  { method: 'GET', path: '/v1/raw/{id}', desc: '读取日志原文。当同一个 ID 下只有一个文件时直接返回文本；存在多个文件时返回文件列表，客户端需要先选择文件。' },
  { method: 'GET', path: '/v1/raw/{id}/{filename}', desc: '读取指定文件的原文。文件名可以包含子路径。' },
  { method: 'GET', path: '/v1/insights/{id}', desc: '获取 Codex 分析。当同一个 ID 下只有一个文件时直接返回分析结果；存在多个文件时返回文件列表。' },
  { method: 'GET', path: '/v1/insights/{id}/{filename}', desc: '对指定文件执行 Codex 分析，并返回结构化结果。' },
  { method: 'DELETE', path: '/v1/log/{id}', desc: '删除一个或多个日志。需要上传时返回的删除 token。' },
  { method: 'GET', path: '/v1/limits', desc: '获取当前上传限制，包括文件数、总大小、请求体大小和保留时间。' },
  { method: 'GET', path: '/', desc: '返回当前可用的端点列表，可用于健康检查或能力发现。' }
]

const uploadFields = [
  { name: 'files', type: 'array<FileInput>', required: '否*', desc: '日志文件数组，每个元素是一个 FileInput 对象。一次最多上传 200 个文件；所有文件展开后的总大小不能超过 20 MiB。与 content 至少提供一个。' },
  { name: 'content', type: 'string', required: '否*', desc: '旧版单文件字段。非空时会映射为主文件（优先 latest.log，重名时使用 main.log、latest (2).log 等）；与 files 同时提交时作为主文件。它同样占用文件数配额并计入总大小。' },
  { name: 'metadata', type: 'array<MetadataEntry>', required: '否', desc: '可选。结构化元数据数组，最多 100 条。服务端会使用日志识别结果补充 version 和 loader；如果客户端提交了同名 key，则以客户端值为准。' },
  { name: 'source', type: 'string', required: '否', desc: '可选。来源标识，最长 64 字节。推荐使用「启动器标识/版本号」格式，例如 fcl/1.2.0。省略时服务端会尝试从 User-Agent 推断启动器来源，无法识别时记为「未指定」。该字段也会参与内容去重。' }
]

const fileInputFields = [
  { name: 'name', type: 'string', required: '是', desc: '必填。文件名或相对路径，例如 latest.log 或 crash-reports/crash-01.txt。最长 512 字节，超长会返回 400。如果文件名以 .zip 结尾，服务端会把 content 当作 ZIP 压缩包并展开。' },
  { name: 'content', type: 'string', required: '是', desc: '必填。文件内容。普通日志直接传文本；ZIP 文件传压缩包字节内容。' }
]

const metadataFields = [
  { name: 'key', type: 'string', required: '是', desc: '必填。元数据键，去除首尾空白后不能为空；超过 64 个字符会截断。' },
  { name: 'value', type: 'string | number | boolean | object', required: '是', desc: '必填。元数据值。字符串超过 1024 个字符会截断；数组、对象会先 JSON 序列化，再按同样长度截断，公开接口返回的是 JSON 字符串。value 为 null 的条目会被丢弃。' },
  { name: 'label', type: 'string', required: '否', desc: '可选。展示名称，超过 128 个字符会截断。' },
  { name: 'visible', type: 'boolean', required: '否', desc: '可选。是否在公开元信息接口中返回，默认 true。设置为 false 后，GET /v1/log/{id} 不会返回该条目。' }
]

const uploadResponseFields = [
  { name: 'success', type: 'boolean', desc: '请求是否成功。' },
  { name: 'message', type: 'string', desc: '服务端返回的结果说明。' },
  { name: 'id', type: 'string', desc: '本次创建的日志 ID。如果命中内容去重，该 ID 指向已有日志。' },
  { name: 'url', type: 'string', desc: '可以直接分享给用户的页面地址。' },
  { name: 'filesUrl', type: 'string', desc: '该日志的文件列表接口地址。' },
  { name: 'raw', type: 'string', desc: '主文件原文地址。单文件日志指向 /v1/raw/{id}；多文件日志如果上传时提供了 content，则指向 content 映射出的主文件，否则指向按文件名排序后的第一个文件。' },
  { name: 'token', type: 'string', desc: '删除该日志所需的凭证。只在本次上传响应中返回一次，请立即保存。' },
  { name: 'deduplicated', type: 'boolean', desc: '是否命中内容去重。为 true 时，本次响应中的 token 不能用于删除已有日志。' },
  { name: 'fileCount', type: 'number', desc: '本次日志包含的文件数量。' },
  { name: 'requiresFileSelection', type: 'boolean', desc: '是否需要在多个文件中选择。文件数大于 1 时为 true。' },
  { name: 'files', type: 'array<FileObject>', desc: '文件列表，每个元素是一个 FileObject。' }
]

const fileObjectFields = [
  { name: 'name', type: 'string', desc: '文件名或相对路径。后续读取或分析该文件时，需要把这个值作为 filename 参数。' },
  { name: 'size', type: 'number', desc: '文件字节数，仅用于展示，不参与上传限制。' },
  { name: 'lines', type: 'number', desc: '文件行数，按换行符计算，仅用于展示，不参与上传限制。' },
  { name: 'raw', type: 'string', desc: '该文件的原文接口地址。' },
  { name: 'insights', type: 'string', desc: '该文件的 Codex 分析接口地址。' }
]

const metaFields = [
  { name: 'id', type: 'string', desc: '日志 ID，由 7 位字母和数字组成。' },
  { name: 'fileCount', type: 'number', desc: '该日志包含的文件数量。' },
  { name: 'requiresFileSelection', type: 'boolean', desc: '是否需要在多个文件中选择。文件数大于 1 时为 true。' },
  { name: 'size', type: 'number', desc: '所有文件合计的字节数。' },
  { name: 'lines', type: 'number', desc: '所有文件合计的行数。' },
  { name: 'created', type: 'number', desc: '日志创建或最近一次续期的时间，Unix 秒。' },
  { name: 'expires', type: 'number', desc: '逻辑过期时间，值为 created + storageTime，Unix 秒。实际删除可能因 TTL 回收延迟而晚于这个时间。' },
  { name: 'metadata', type: 'array<MetadataEntry>', desc: '公开元数据数组。visible=false 的条目不会出现在这个字段中；数组/对象类型的 value 会以 JSON 字符串返回。' },
  { name: 'source', type: 'string', desc: '上传时提交的来源标识；省略时可能由服务端从 User-Agent 推断，无法识别时为「未指定」。' },
  { name: 'filesUrl', type: 'string', desc: '该日志的文件列表接口地址。' },
  { name: 'raw', type: 'string', desc: '单文件日志指向 /v1/raw/{id}；多文件日志指向按文件名排序后的第一个文件的 raw 地址，不保证是上传时 content 映射出的主文件。' },
  { name: 'files', type: 'array<FileObject>', desc: '文件列表。每个元素包含文件名、大小、行数以及该文件的 raw/insights 地址。' }
]

const analysisFields = [
  { name: 'id', type: 'string', desc: 'Codex 识别出的日志类型标识，例如 vanilla/server。' },
  { name: 'name', type: 'string', desc: '日志类型名称。' },
  { name: 'type', type: 'string', desc: '日志类别，例如 Server Log 或 Crash Report。' },
  { name: 'version', type: 'string', desc: '识别出的 Minecraft 版本。' },
  { name: 'title', type: 'string', desc: '分析标题。部分日志类型可能不返回这个字段。' },
  { name: 'analysis.problems', type: 'array<Problem>', desc: '检测到的问题列表。每个问题包含问题描述、出现次数和解决建议。' },
  { name: 'analysis.information', type: 'array<Information>', desc: '提取到的环境与版本信息列表。每条信息包含标签、值和出现次数。' }
]

const problemFields = [
  { name: 'message', type: 'string', desc: '问题描述。' },
  { name: 'counter', type: 'number', desc: '该问题在文件中出现的次数。' },
  { name: 'solutions', type: 'array<{ message: string }>', desc: '解决建议列表。每个建议是一个对象，message 字段为建议内容。' }
]

const informationFields = [
  { name: 'message', type: 'string', desc: '信息文本。' },
  { name: 'counter', type: 'number', desc: '该信息出现的次数。' },
  { name: 'label', type: 'string', desc: '信息标签，例如 Minecraft version。' },
  { name: 'value', type: 'string', desc: '信息值。' }
]

const deleteResponseFields = [
  { name: 'success', type: 'boolean', desc: '请求是否成功。只要至少有一个日志删除成功，这个字段就是 true。' },
  { name: 'message', type: 'string', desc: '服务端返回的结果说明。' },
  { name: 'deleted', type: 'string[]', desc: '删除成功的日志 ID 列表。' },
  { name: 'failed', type: 'array<{ id, message, code }>', desc: '删除失败的日志列表。每个元素包含 id、message 和 code。' },
  { name: 'total', type: 'number', desc: '本次请求包含的日志总数。' },
  { name: 'deletedCount', type: 'number', desc: '删除成功的日志数量。' },
  { name: 'failedCount', type: 'number', desc: '删除失败的日志数量。' }
]

const limitFields = [
  { name: 'storageTime', type: 'number', desc: '日志保留时间，单位为秒。默认 604800 秒，即至少保留 7 天；expires 是逻辑过期时间，实际删除可能延迟。' },
  { name: 'maxFiles', type: 'number', desc: '一次上传允许包含的最大文件数。旧版 content 映射出的主文件也计入这个配额。' },
  { name: 'maxTotalBytes', type: 'number', desc: '所有文件展开后的总字节数上限。ZIP 压缩包自身大小不计入，但原始 ZIP 字节仍受 maxRequestBodyBytes 限制。' },
  { name: 'maxRequestBodyBytes', type: 'number', desc: '请求体（原始和解压后）的最大字节数。多层 Content-Encoding 会逐层解压，每一层输出都不能超过这个值。' }
]

const statusCodes = [
  { code: '200', desc: '请求成功。多文件日志返回文件列表时也使用 200。' },
  { code: '400', desc: '请求参数错误、必填字段缺失、内容为空或文件名校验失败。' },
  { code: '401', desc: '删除请求缺少 Authorization: Bearer token。' },
  { code: '403', desc: '删除 token 不匹配，或客户端 IP 已被封禁。' },
  { code: '404', desc: '指定的日志或文件不存在。' },
  { code: '405', desc: '当前路径不支持该 HTTP 方法。' },
  { code: '413', desc: '请求体、文件数量或文件总大小超过限制；边缘 nginx 的 210 MB 请求体上限也返回 413。' },
  { code: '415', desc: '请求使用了不支持的 Content-Encoding。Content-Type 缺失或未知时会按 urlencoded 尝试解析，不返回 415。' },
  { code: '429', desc: '触发了 WAF CC 限流。响应会带 Retry-After 头，客户端应等待后重试。' },
  { code: '500', desc: '服务端内部错误。' },
  { code: '501', desc: '服务端未安装 Brotli 扩展，无法解压 br 请求体。' },
  { code: '503', desc: '触发了 nginx limit_req 限流。' }
]

const quickStart = `# 1. 上传文件列表
curl -X POST ${baseUrl}/v1/log \\
  -H 'Content-Type: application/json' \\
  -d '{
    "files": [
      {"name": "latest.log", "content": "<游戏主日志>"},
      {"name": "crash-reports/crash-01.txt", "content": "<崩溃报告>"}
    ],
    "source": "fcl/1.2.0",
    "metadata": [
      {"key": "version", "value": "1.21.9", "label": "Minecraft 版本"}
    ]
  }'

# 2. 获取文件列表
curl ${baseUrl}/v1/log/sAbCdEf

# 3. 选择文件后读取或分析
curl ${baseUrl}/v1/raw/sAbCdEf/latest.log
curl ${baseUrl}/v1/insights/sAbCdEf/latest.log

# 4. 删除日志
curl -X DELETE ${baseUrl}/v1/log/sAbCdEf \\
  -H 'Authorization: Bearer <token>'`

const uploadResponse = `{
  "success": true,
  "message": "Log submitted successfully",
  "id": "sAbCdEf",
  "url": "https://logshare.cn/sAbCdEf",
  "filesUrl": "https://api.logshare.cn/v1/log/sAbCdEf",
  "raw": "https://api.logshare.cn/v1/raw/sAbCdEf/latest.log",
  "token": "3f9c1a7d...",
  "deduplicated": false,
  "fileCount": 2,
  "requiresFileSelection": true,
  "files": [
    {
      "name": "latest.log",
      "size": 2048,
      "lines": 40,
      "raw": "https://api.logshare.cn/v1/raw/sAbCdEf/latest.log",
      "insights": "https://api.logshare.cn/v1/insights/sAbCdEf/latest.log"
    },
    {
      "name": "crash-reports/crash-01.txt",
      "size": 2048,
      "lines": 80,
      "raw": "https://api.logshare.cn/v1/raw/sAbCdEf/crash-reports/crash-01.txt",
      "insights": "https://api.logshare.cn/v1/insights/sAbCdEf/crash-reports/crash-01.txt"
    }
  ]
}`

const metaResponse = `{
  "success": true,
  "message": "Log metadata retrieved successfully",
  "id": "sAbCdEf",
  "fileCount": 2,
  "requiresFileSelection": true,
  "size": 4096,
  "lines": 120,
  "created": 1755200000,
  "expires": 1755804800,
  "metadata": [],
  "source": "fcl/1.2.0",
  "filesUrl": "https://api.logshare.cn/v1/log/sAbCdEf",
  "raw": "https://api.logshare.cn/v1/raw/sAbCdEf/latest.log",
  "files": [
    {
      "name": "latest.log",
      "size": 2048,
      "lines": 40,
      "raw": "https://api.logshare.cn/v1/raw/sAbCdEf/latest.log",
      "insights": "https://api.logshare.cn/v1/insights/sAbCdEf/latest.log"
    },
    {
      "name": "crash-reports/crash-01.txt",
      "size": 2048,
      "lines": 80,
      "raw": "https://api.logshare.cn/v1/raw/sAbCdEf/crash-reports/crash-01.txt",
      "insights": "https://api.logshare.cn/v1/insights/sAbCdEf/crash-reports/crash-01.txt"
    }
  ]
}`

const insightsResponse = `{
  "id": "vanilla/server",
  "name": "Vanilla",
  "type": "Server Log",
  "version": "1.21.9",
  "title": "Vanilla 1.21.9 Server Log",
  "analysis": {
    "problems": [
      {
        "message": "Could not load chunk",
        "counter": 3,
        "solutions": [
          { "message": "检查世界存档完整性并恢复备份" }
        ]
      }
    ],
    "information": [
      {
        "message": "Minecraft version: 1.21.9",
        "counter": 1,
        "label": "Minecraft version",
        "value": "1.21.9"
      }
    ]
  }
}`

const deleteResponse = `{
  "success": true,
  "message": "Log deletion completed",
  "deleted": ["sAbCdEf"],
  "failed": [],
  "total": 1,
  "deletedCount": 1,
  "failedCount": 0
}`

const limitsResponse = `{
  "storageTime": 604800,
  "maxFiles": 200,
  "maxTotalBytes": 20971520,
  "maxRequestBodyBytes": 33554432
}`

const indexResponse = `{
  "success": true,
  "message": "LogShare API",
  "endpoints": [
    "POST /v1/log",
    "GET /v1/log/{id}",
    "GET /v1/raw/{id}",
    "GET /v1/raw/{id}/{filename}",
    "GET /v1/insights/{id}",
    "GET /v1/insights/{id}/{filename}",
    "DELETE /v1/log/{id}",
    "GET /v1/limits"
  ]
}`

const errorResponse = `{
  "success": false,
  "error": "错误描述",
  "code": 400
}`

const sdkExample = `import { LogShareSDK } from './mclogs.js'

const sdk = new LogShareSDK()

const result = await sdk.submit([
  { name: 'latest.log', content: logText },
  { name: 'crash-reports/crash-01.txt', content: crashText }
], {
  source: 'fcl/1.2.0',
  metadata: [{ key: 'version', value: '1.21.9', label: 'Minecraft 版本' }]
})

const meta = await sdk.getMeta(result.id)
const file = meta.files[0].name

const raw = await sdk.getRawFile(result.id, file)
const analysis = await sdk.getInsightsFile(result.id, file)`

const sdkMethods = [
  { name: 'submit(files, options)', desc: '上传文件列表，返回日志对象' },
  { name: 'getMeta(id)', desc: '获取日志元信息与文件列表，用于确定文件名以及是否需要让用户选择文件。' },
  { name: 'getRaw(id)', desc: '读取单文件日志原文。仅当该日志只有一个文件时使用；多文件请使用 getRawFile。' },
  { name: 'getRawFile(id, filename)', desc: '读取指定文件原文；filename 使用文件列表中的 name。' },
  { name: 'getInsights(id)', desc: '分析单文件日志。仅当该日志只有一个文件时使用；多文件请使用 getInsightsFile。' },
  { name: 'getInsightsFile(id, filename)', desc: '分析指定文件；filename 使用文件列表中的 name。' },
  { name: 'getLimits()', desc: '获取上传限制' },
  { name: 'delete(id, token)', desc: '删除一个或多个日志' }
]

onMounted(() => {
  observer = new IntersectionObserver(
    entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) activeSection.value = visible[0].target.id
    },
    { rootMargin: '-96px 0px -70% 0px', threshold: [0, 1] }
  )
  document.querySelectorAll('[data-doc-section]').forEach(el => observer?.observe(el))
})

onBeforeUnmount(() => observer?.disconnect())

const copyBaseUrl = async () => {
  try {
    await navigator.clipboard.writeText(baseUrl)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

const scrollToSection = (id: string) => {
  activeSection.value = id
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const methodClass = (method: string) => {
  if (method === 'POST') return 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
  if (method === 'DELETE') return 'bg-red-500/10 text-red-600 dark:text-red-400'
  return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
}
</script>

<template>
  <div class="mx-auto max-w-[1440px] px-4 py-6 lg:px-8">
    <div
      class="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_220px]"
    >
      <aside class="hidden lg:block">
        <div class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10 pr-2">
          <div class="mb-4 px-3">
            <div class="text-base font-semibold">{{ t('api_docs') }}</div>
            <div class="mt-1 text-xs text-muted-foreground">LogShare API v1</div>
          </div>
          <nav class="space-y-5">
            <div v-for="group in groups" :key="group.name">
              <div
                class="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {{ group.name }}
              </div>
              <button
                v-for="section in group.items"
                :key="section.id"
                class="block w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors"
                :class="
                  activeSection === section.id
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                "
                :aria-current="activeSection === section.id ? 'location' : undefined"
                @click="scrollToSection(section.id)"
              >
                {{ section.title }}
              </button>
            </div>
          </nav>
        </div>
      </aside>

      <main class="min-w-0">
        <header class="mb-6 max-w-3xl border-b border-border/70 pb-5">
          <div class="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>文档</span>
            <span>/</span>
            <span class="text-foreground">API</span>
            <span class="rounded-full border border-border px-2 py-0.5">v1</span>
          </div>
          <h1 class="text-3xl font-bold tracking-tight text-foreground">{{ t('api_docs') }}</h1>
          <p class="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            日志文件上传、读取、Codex 分析与删除的 HTTP API 参考。
          </p>
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <code
              class="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-xs"
              >{{ baseUrl }}</code
            >
            <button
              class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="copyBaseUrl"
            >
              <Check v-if="copied" weight="duotone" class="h-3.5 w-3.5" />
              <Copy v-else weight="duotone" class="h-3.5 w-3.5" />
              {{ copied ? '已复制' : '复制' }}
            </button>
          </div>
        </header>

        <div class="mb-4 max-w-3xl lg:hidden">
          <label class="mb-1 block text-xs font-medium text-muted-foreground" for="doc-section"
            >本页目录</label
          >
          <select
            id="doc-section"
            v-model="activeSection"
            class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            @change="scrollToSection(activeSection)"
          >
            <option v-for="section in sections" :key="section.id" :value="section.id">
              {{ section.title }}
            </option>
          </select>
        </div>

        <article class="max-w-3xl text-[15px] leading-7 text-foreground/80">
          <!-- 概览 -->
          <section
            id="overview"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 pb-10"
          >
            <h2 class="text-xl font-semibold tracking-tight text-foreground">概览</h2>
            <p>
              LogShare API 用于把 Minecraft/Hytale 日志文件上传到平台，并在之后读取文件内容、获取 Codex
              结构化分析或删除日志。所有接口都通过 HTTPS 访问，当前版本为
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">v1</code>。
            </p>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">项目</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="border-t border-border/70">
                    <td class="p-2.5 font-medium text-foreground">Base URL</td>
                    <td class="p-2.5 font-mono text-xs">{{ baseUrl }}</td>
                  </tr>
                  <tr class="border-t border-border/70">
                    <td class="p-2.5 font-medium text-foreground">API 版本</td>
                    <td class="p-2.5 text-muted-foreground">当前稳定版本，所有接口路径都以 /v1 开头。</td>
                  </tr>
                  <tr class="border-t border-border/70">
                    <td class="p-2.5 font-medium text-foreground">请求格式</td>
                    <td class="p-2.5 text-muted-foreground">
                      上传接口支持
                      <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                        >application/json</code
                      >
                      和
                      <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                        >application/x-www-form-urlencoded</code
                      >；读取和删除接口使用标准 HTTP 方法。
                    </td>
                  </tr>
                  <tr class="border-t border-border/70">
                    <td class="p-2.5 font-medium text-foreground">响应格式</td>
                    <td class="p-2.5 text-muted-foreground">
                      单文件 raw 接口返回
                      <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                        >text/plain</code
                      >；多文件 raw 接口返回 JSON 文件列表；其余接口均返回 JSON。
                    </td>
                  </tr>
                  <tr class="border-t border-border/70">
                    <td class="p-2.5 font-medium text-foreground">认证</td>
                    <td class="p-2.5 text-muted-foreground">
                      上传和读取接口不需要认证；删除日志时必须携带上传时返回的 Bearer token。
                    </td>
                  </tr>
                  <tr class="border-t border-border/70">
                    <td class="p-2.5 font-medium text-foreground">日志 ID</td>
                    <td class="p-2.5 text-muted-foreground">
                      每次上传成功后生成，由 7 位字母和数字组成。
                    </td>
                  </tr>
                  <tr class="border-t border-border/70">
                    <td class="p-2.5 font-medium text-foreground">默认保留时间</td>
                    <td class="p-2.5 text-muted-foreground">
                      默认至少保留 7 天。expires 是逻辑过期时间，实际删除可能因 TTL 回收延迟；仅访问日志元信息不会续期。
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul class="list-disc space-y-1.5 pl-5">
              <li>
                成功响应使用
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >{ success: true, message, ... }</code
                >，错误响应使用
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >{ success: false, error, code }</code
                >。客户端应先判断 HTTP 状态码，再读取 success 和 error 字段。
              </li>
              <li>
                请求体支持
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">br</code> /
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">gzip</code> /
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">deflate</code>
                压缩，最多 5 层；服务端响应优先 Brotli，可发送
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >Accept-Encoding: br, gzip</code
                >。
              </li>
              <li>
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >GET /v1/log/{id}</code
                >
                不会续期。raw / insights 的任意成功读取（包括多文件时返回文件列表）都会延长日志的保留时间。
              </li>
            </ul>
          </section>

          <!-- 接入流程 -->
          <section
            id="flow"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 py-10"
          >
            <h2 class="text-xl font-semibold tracking-tight text-foreground">接入流程</h2>
            <p>
              每次上传会创建一条日志记录，这条记录可以包含一个或多个文件。客户端接入时，建议按照下面的顺序处理：
            </p>
            <ol class="list-decimal space-y-2 pl-5">
              <li>
                <strong class="text-foreground">上传文件。</strong>
                使用
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >POST /v1/log</code
                >，把本次要分享的日志文件放入
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">files</code>
                数组。旧客户端也可以继续提交
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">content</code>
                字段，服务端会把它映射为
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">latest.log</code>。上传成功后，响应会返回日志 ID、分享地址、主文件原文地址、删除 token 和文件列表。请立即保存 token，它只在这次响应中返回一次。
              </li>
              <li>
                <strong class="text-foreground">获取文件列表。</strong>
                使用
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >GET /v1/log/{id}</code
                >
                获取日志元信息和文件列表。该接口不会续期，适合在打开日志页面时使用。
              </li>
              <li>
                <strong class="text-foreground">让用户选择文件。</strong>
                如果响应中的
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >requiresFileSelection</code
                >
                为 true，说明这次上传包含多个文件。客户端应展示
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">files</code>
                列表，让用户选择要查看的文件，而不是自行假定某个文件是主日志。
              </li>
              <li>
                <strong class="text-foreground">读取或分析文件。</strong>
                使用文件对象中的
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">name</code>
                作为 filename，请求
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >/v1/raw/{id}/{filename}</code
                >
                读取原文，或请求
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >/v1/insights/{id}/{filename}</code
                >
                获取 Codex 分析。
              </li>
            </ol>
            <div class="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              服务端会对「按名称排序后的文件集合 + source」计算内容指纹。如果命中已有日志，响应中的
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">id</code>
              会指向已有日志，
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                >deduplicated</code
              >
              为 true。此时返回的 token 是本次请求新生成的，并未写入存储，不能用于删除已有日志；删除凭证仍然属于第一次上传该内容的客户端。
            </div>
            </section>

          <!-- 快速开始 -->
          <section
            id="quick-start"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 py-10"
          >
            <h2 class="text-xl font-semibold tracking-tight text-foreground">快速开始</h2>
            <ApiCodeBlock :code="quickStart" lang="bash" title="cURL" />
            <p class="text-sm text-muted-foreground">
              如果客户端只上传单个文件，也可以继续使用旧版
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">content</code>
              字段：服务端会把它映射为
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">latest.log</code>，响应结构与 files 上传一致。
            </p>
          </section>

          <!-- 端点总览 -->
          <section
            id="endpoints"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 py-10"
          >
            <h2 class="text-xl font-semibold tracking-tight text-foreground">端点总览</h2>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">方法</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">路径</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="endpoint in endpoints"
                    :key="`${endpoint.method} ${endpoint.path}`"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5">
                      <span
                        class="rounded px-2 py-0.5 font-mono text-[11px] font-semibold"
                        :class="methodClass(endpoint.method)"
                      >
                        {{ endpoint.method }}
                      </span>
                    </td>
                    <td class="break-all p-2.5 font-mono text-xs">{{ endpoint.path }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ endpoint.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- 上传日志 -->
          <section
            id="upload"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 py-10"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400"
                >POST</span
              >
              <code class="font-mono text-sm font-semibold text-foreground">/v1/log</code>
            </div>
            <h2 class="text-xl font-semibold tracking-tight text-foreground">上传日志</h2>
            <p>
              该接口用于上传一个或多个日志文件。新客户端应把文件放入
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">files</code>
              数组；旧版单文件字段
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">content</code>
              仍然可用，服务端会把它映射为主文件（优先
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">latest.log</code>，重名时使用
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">main.log</code>、<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">latest (2).log</code>
              等名称），已对接旧接口的客户端不需要修改。这个主文件同样占用文件数配额并计入总大小。每次上传会创建一条日志记录；平台会对每个文件单独执行脱敏，并在识别为
              Minecraft 日志时执行 SpinYarn 反混淆。Codex 全文分析不会在上传时执行，而是在之后请求某个文件的分析接口时按需执行。
            </p>
            <div class="space-y-2 text-sm">
              <p>
                <strong class="text-foreground">Content-Type：</strong>
                上传接口支持
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >application/json</code
                >
                和
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >application/x-www-form-urlencoded</code
                >
                两种请求格式。推荐使用 JSON，便于同时提交文件、metadata 和 source。如果 Content-Type 缺失或不是上述两种，服务端会按 urlencoded 尝试解析。
              </p>
              <p>
                <strong class="text-foreground">Content-Encoding：</strong>
                如果请求体较大，可以使用
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">br</code> /
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">gzip</code> /
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">x-gzip</code> /
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">deflate</code>
                压缩请求体，最多支持 5 层编码；每一层解压后的输出都不能超过 32 MiB。gzip、x-gzip 和 deflate 由 PHP 内置 zlib 支持，br 需要服务端安装 ext-brotli，缺少扩展时返回 501。服务端返回响应时会优先使用 Brotli 压缩，客户端可以发送
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >Accept-Encoding: br, gzip</code
                >。
              </p>
            </div>
            <h3 class="text-base font-semibold text-foreground">请求字段</h3>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">字段</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">类型</th>
                    <th class="whitespace-nowrap p-2.5 text-left font-medium text-muted-foreground">必填</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="field in uploadFields"
                    :key="field.name"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                    <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                    <td class="whitespace-nowrap p-2.5 text-muted-foreground">{{ field.required }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-sm text-muted-foreground">
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">files</code>
              和
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">content</code>
              至少提供一个。两者同时提供时，
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">content</code>
              作为主文件：服务端优先使用
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">latest.log</code>，如果该名称已被
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">files</code>
              占用，则依次尝试
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">main.log</code>、
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">latest (2).log</code>
              等名称。
            </p>
            <h3 class="text-base font-semibold text-foreground">FileInput</h3>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">字段</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">类型</th>
                    <th class="whitespace-nowrap p-2.5 text-left font-medium text-muted-foreground">必填</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="field in fileInputFields"
                    :key="field.name"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                    <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                    <td class="whitespace-nowrap p-2.5 text-muted-foreground">{{ field.required }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 class="text-base font-semibold text-foreground">MetadataEntry</h3>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">字段</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">类型</th>
                    <th class="whitespace-nowrap p-2.5 text-left font-medium text-muted-foreground">必填</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="field in metadataFields"
                    :key="field.name"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                    <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                    <td class="whitespace-nowrap p-2.5 text-muted-foreground">{{ field.required }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-sm text-muted-foreground">
              服务端会用日志识别结果补写
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">version</code> /
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">loader</code>
              元数据；客户端提交同名 key 时以客户端值为准。重复 key 以首次出现为准。
            </p>
            <h3 class="text-base font-semibold text-foreground">响应字段</h3>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">字段</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">类型</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="field in uploadResponseFields"
                    :key="field.name"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                    <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 class="text-base font-semibold text-foreground">FileObject</h3>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">字段</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">类型</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="field in fileObjectFields"
                    :key="field.name"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                    <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ApiCodeBlock :code="uploadResponse" lang="json" title="响应示例" />
            <ul class="list-disc space-y-1.5 pl-5">
              <li>
                如果文件是 ZIP 压缩包，服务端会展开压缩包并保留内部相对路径。展开后的每个文件都会单独脱敏和反混淆。同名文件会自动改名为
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >name (2).ext</code
                >、
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  >name (3).ext</code
                >，避免覆盖。
              </li>
              <li>
                一次上传最多包含 200 个文件；所有文件展开后的总大小不能超过 20 MiB。旧版 content 映射出的主文件也计入这两个限制。单个文件本身没有大小或行数限制；ZIP 压缩包自身大小不计入 20 MiB，但原始 ZIP 字节仍受 32 MiB 请求体限制。
              </li>
              <li>
                文件名最长 512 字节，超过会返回 400。文件名中的子路径需要按路径段做 URL 编码，服务端只按存储名称精确匹配。
              </li>
              <li>
                如果同时提交了 content 和 files，content 会作为主文件，响应中的 raw 指向该文件；files 中的其余文件仍会出现在 files 列表。
              </li>
              <li>
                上传接口会返回删除 token。请把它保存在安全的位置；服务端不保存明文 token，丢失后无法找回。
              </li>
            </ul>
          </section>

          <!-- 日志元信息 -->
          <section
            id="meta"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 py-10"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                >GET</span
              >
              <code class="font-mono text-sm font-semibold text-foreground">/v1/log/{id}</code>
            </div>
            <h2 class="text-xl font-semibold tracking-tight text-foreground">日志元信息</h2>
            <p>
              该接口用于获取一条日志的元信息、公开 metadata 和文件列表。上传成功后，客户端通常应先获取一次元信息，确认日志包含哪些文件，以及是否需要让用户选择文件。
            </p>
            <p>
              如果响应中的
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                >requiresFileSelection</code
              >
              为 true，说明这条日志包含多个文件。客户端应展示
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">files</code>
              列表，让用户选择要查看的文件。
            </p>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">字段</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">类型</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="field in metaFields"
                    :key="field.name"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                    <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-sm text-muted-foreground">
              该接口不会续期。raw / insights 的任意成功读取（包括多文件时返回文件列表）都会重新计算过期时间；仅仅打开元信息页面不会延长日志的保留时间。
            </p>
            <p class="text-sm text-muted-foreground">
              多文件响应中的 raw 指向按文件名排序后的第一个文件，不保证是上传时 content 映射出的主文件。如果客户端依赖主文件，请使用上传响应的 raw，或 files 中对应文件的 URL。
            </p>
            <ApiCodeBlock :code="metaResponse" lang="json" title="响应示例" />
          </section>

          <!-- 读取文件 -->
          <section
            id="read"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 py-10"
          >
            <h2 class="text-xl font-semibold tracking-tight text-foreground">读取文件</h2>
            <p>
              读取文件时，需要先判断日志是否包含多个文件。单文件日志可以直接读取；多文件日志必须先获取文件列表，并使用文件名请求指定文件。
            </p>
            <div class="space-y-4">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                    >GET</span
                  >
                  <code class="font-mono text-sm text-foreground">/v1/raw/{id}</code>
                </div>
                <p>
                  当同一个 ID 下只有一个文件时，该接口会直接返回
                  <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                    >text/plain</code
                  >
                  正文。如果该 ID 下存在多个文件，接口不会自动选择文件，而是返回文件列表；客户端需要先让用户选择文件，再使用带 filename 的接口。
                </p>
              </div>
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                    >GET</span
                  >
                  <code class="font-mono text-sm text-foreground"
                    >/v1/raw/{id}/{filename}</code
                  >
                </div>
                <p>
                  该接口用于读取指定文件的原文。filename 必须与文件列表中的
                  <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">name</code>
                  完全一致。如果文件名包含子路径，例如
                  <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                    >crash-reports/crash-01.txt</code
                  >，需要对每个路径段进行 URL 编码，但保留斜杠分隔符。服务端只按数据库中的文件名精确匹配，不会把它当作文件系统路径。
                </p>
                <p class="text-sm text-muted-foreground">
                  读取成功时返回
                  <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                    >200 text/plain; charset=utf-8</code
                  >；文件不存在时返回
                  <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">404</code>。读取成功会续期日志的保留时间。
                </p>
              </div>
            </div>
            <ApiCodeBlock
              :code="`curl '${baseUrl}/v1/raw/sAbCdEf/crash-reports/crash-01.txt'`"
              lang="bash"
              title="示例"
            />
          </section>

          <!-- 分析文件 -->
          <section
            id="analyse"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 py-10"
          >
            <h2 class="text-xl font-semibold tracking-tight text-foreground">分析文件</h2>
            <p>
              Codex 分析按文件执行。上传时不会立即分析全文，只有在请求某个文件的分析接口时才会执行。
            </p>
            <div class="space-y-4">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                    >GET</span
                  >
                  <code class="font-mono text-sm text-foreground">/v1/insights/{id}</code>
                </div>
                <p>
                  当同一个 ID 下只有一个文件时，该接口会直接返回该文件的 Codex 分析 JSON；如果该 ID 下存在多个文件，接口会返回文件列表，客户端需要先让用户选择文件，再请求
                  <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                    >/v1/insights/{id}/{filename}</code
                  >
                  获取指定文件的分析结果。
                </p>
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                    >GET</span
                  >
                  <code class="font-mono text-sm text-foreground"
                    >/v1/insights/{id}/{filename}</code
                  >
                </div>
              </div>
            </div>
            <h3 class="text-base font-semibold text-foreground">响应字段</h3>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">字段</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">类型</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="field in analysisFields"
                    :key="field.name"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                    <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="overflow-x-auto rounded-lg border border-border">
                <div class="border-b border-border bg-muted/40 p-2.5 text-sm font-medium text-foreground">
                  Problem
                </div>
                <table class="w-full text-sm">
                  <tbody>
                    <tr
                      v-for="field in problemFields"
                      :key="field.name"
                      class="border-t border-border/70 first:border-t-0"
                    >
                      <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                      <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                      <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="overflow-x-auto rounded-lg border border-border">
                <div class="border-b border-border bg-muted/40 p-2.5 text-sm font-medium text-foreground">
                  Information
                </div>
                <table class="w-full text-sm">
                  <tbody>
                    <tr
                      v-for="field in informationFields"
                      :key="field.name"
                      class="border-t border-border/70 first:border-t-0"
                    >
                      <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                      <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                      <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <ApiCodeBlock :code="insightsResponse" lang="json" title="响应示例" />
            <p class="text-sm text-muted-foreground">
              分析结果会按文件内容哈希缓存在服务端进程内。相同内容的文件重复请求时会直接返回缓存结果，不会重复执行 Codex。缓存有容量上限，服务重启后失效。
            </p>
          </section>

          <!-- 删除日志 -->
          <section
            id="delete"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 py-10"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded bg-red-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-red-600 dark:text-red-400"
                >DELETE</span
              >
              <code class="font-mono text-sm font-semibold text-foreground">/v1/log/{id}</code>
            </div>
            <h2 class="text-xl font-semibold tracking-tight text-foreground">删除日志</h2>
            <p>
              该接口用于删除日志。删除时需要上传时返回的 token；服务端只保存 token 的哈希值，因此 token 丢失后无法找回。请求头中需要携带
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                >Authorization: Bearer &lt;token&gt;</code
              >。
            </p>
            <p>
              路径中的
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{id}</code>
              可以是一个日志 ID，也可以是多个用逗号分隔的日志 ID，例如
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                >DELETE /v1/log/id1,id2</code
              >。服务端会逐个校验日志是否存在，以及 token 是否匹配。
            </p>
            <h3 class="text-base font-semibold text-foreground">响应字段</h3>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">字段</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">类型</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="field in deleteResponseFields"
                    :key="field.name"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                    <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ApiCodeBlock :code="deleteResponse" lang="json" title="响应示例" />
            <ul class="list-disc space-y-1.5 pl-5">
              <li>如果所有 ID 都删除失败，接口返回 400，failed 数组会列出每个 ID 的失败原因和状态码。</li>
              <li>如果只有部分 ID 删除成功，接口返回 200，失败项仍然会出现在 failed 数组中。</li>
              <li>缺少 Authorization 请求头时返回 401；token 与日志不匹配时返回 403。</li>
            </ul>
          </section>

          <!-- 上传限制 -->
          <section
            id="limits"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 py-10"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                >GET</span
              >
              <code class="font-mono text-sm font-semibold text-foreground">/v1/limits</code>
            </div>
            <h2 class="text-xl font-semibold tracking-tight text-foreground">上传限制</h2>
            <p>
              该接口返回当前部署的上传限制。客户端应在选择文件或上传前读取这些值，避免提交明显超过限制的内容。
            </p>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">字段</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">类型</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="field in limitFields"
                    :key="field.name"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ field.name }}</td>
                    <td class="p-2.5 font-mono text-xs">{{ field.type }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ field.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ApiCodeBlock :code="limitsResponse" lang="json" title="响应示例" />
            <p class="text-sm text-muted-foreground">
              当前版本只返回上述四个字段。如果某个实例仍返回 maxLength / maxLines，说明它尚未升级到当前版本；客户端应以四个字段为准，并处理旧实例的差异。
            </p>
            <p class="text-sm text-muted-foreground">
              平台在边缘层进行限流：nginx limit_req 按 IP 30 r/s（burst 60），OpenLiteWaf 再叠加 10 秒窗口 240 次的 CC 限流。触发 CC 限流时返回 429，并带有 Retry-After 响应头；触发 nginx limit_req 时返回 503。
            </p>
          </section>

          <!-- 错误与状态码 -->
          <section
            id="errors"
            data-doc-section
            class="scroll-mt-24 space-y-4 border-b border-border/60 py-10"
          >
            <h2 class="text-xl font-semibold tracking-tight text-foreground">错误与状态码</h2>
            <p>
              所有错误响应都使用相同的 JSON 结构。调用方应先检查 HTTP 状态码，再读取 error 字段；不要只依赖 message 字段，因为部分错误可能只返回 error。
            </p>
            <ApiCodeBlock :code="errorResponse" lang="json" title="错误响应" />
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">状态码</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in statusCodes"
                    :key="row.code"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ row.code }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ row.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-sm text-muted-foreground">
              根端点
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">GET /</code>
              返回当前部署支持的端点列表。它不需要认证，适合用于健康检查或确认服务能力。
            </p>
            <ApiCodeBlock :code="indexResponse" lang="json" title="GET / 响应示例" />
          </section>

          <!-- SDK -->
          <section id="sdk" data-doc-section class="scroll-mt-24 space-y-4 py-10">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-xl font-semibold tracking-tight text-foreground">SDK</h2>
              <span class="text-xs text-muted-foreground">v3.1.0</span>
            </div>
            <p>
              我们提供 JavaScript、PHP、Java 和 C#/.NET 四个 SDK。它们封装了上传、文件列表、读取、分析和删除接口，方法命名基本一致。下载后直接引入即可使用。JavaScript SDK 支持浏览器和 Node.js 18+；PHP 需要 7.4+；Java 需要 11+；.NET 需要 6+。
            </p>
            <div class="grid gap-3 sm:grid-cols-2">
              <a
                v-for="sdk in [
                  { href: '/sdk/logshare-js-sdk.zip', name: 'JavaScript', label: 'JS', desc: '浏览器与 Node.js 18+，零依赖' },
                  { href: '/sdk/logshare-php-sdk.zip', name: 'PHP', label: 'PHP', desc: 'cURL 封装，PHP 7.4+' },
                  { href: '/sdk/logshare-java-sdk.zip', name: 'Java', label: 'JAVA', desc: 'java.net.http，Java 11+' },
                  { href: '/sdk/logshare-dotnet-sdk.zip', name: 'C# / .NET', label: '.NET', desc: 'System.Text.Json，.NET 6+' }
                ]"
                :key="sdk.href"
                :href="sdk.href"
                download
                class="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <div class="mb-2 flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 font-semibold">
                    <span class="rounded bg-muted px-2 py-1 text-[10px] font-bold">{{
                      sdk.label
                    }}</span>
                    {{ sdk.name }}
                  </div>
                  <span class="text-[10px] text-muted-foreground group-hover:text-primary"
                    >下载</span
                  >
                </div>
                <p class="text-xs text-muted-foreground">{{ sdk.desc }}</p>
              </a>
            </div>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/40">
                  <tr>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">方法</th>
                    <th class="p-2.5 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="method in sdkMethods"
                    :key="method.name"
                    class="border-t border-border/70"
                  >
                    <td class="p-2.5 font-mono text-xs">{{ method.name }}</td>
                    <td class="p-2.5 text-muted-foreground">{{ method.desc }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-sm text-muted-foreground">
              JavaScript、PHP 和 Java 使用 camelCase 方法名；.NET 使用 PascalCase，并在异步方法后加
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">Async</code>
              后缀。四个 SDK 返回的数据结构与本文档一致；raw 文件接口返回字符串。
            </p>
            <ApiCodeBlock :code="sdkExample" lang="javascript" title="JavaScript 示例" />
          </section>
        </article>
      </main>

      <aside class="hidden xl:block">
        <div class="sticky top-20 pb-10">
          <div
            class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            本页目录
          </div>
          <nav class="space-y-1 border-l border-border/70">
            <button
              v-for="section in sections"
              :key="section.id"
              class="block w-full border-l-2 py-1 pl-3 text-left text-xs transition-colors"
              :class="
                activeSection === section.id
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              "
              :aria-current="activeSection === section.id ? 'location' : undefined"
              @click="scrollToSection(section.id)"
            >
              {{ section.title }}
            </button>
          </nav>
        </div>
      </aside>
    </div>
  </div>
</template>
