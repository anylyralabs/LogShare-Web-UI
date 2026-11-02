/**
 * 日志解析引擎 — 异步 Web Worker 桥接层
 *
 * 所有解析逻辑在 Web Worker 中执行，不阻塞主线程。
 * 支持并发请求（按 id 配对），worker 崩溃或超时后自动重建。
 */

import type { ParsedLogRow } from './logParser.types'

type ParseMessage = { type: 'parse'; raw: string; id: number }
type ResultMessage = { type: 'result'; rows: ParsedLogRow[]; id: number }
type ErrorMessage = { type: 'error'; error: string; id: number }

const PARSE_TIMEOUT_MS = 30_000

interface PendingEntry {
  resolve: (rows: ParsedLogRow[]) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, PendingEntry>()

function settle(id: number): PendingEntry | null {
  const entry = pending.get(id)
  if (!entry) return null
  clearTimeout(entry.timer)
  pending.delete(id)
  return entry
}

function rejectAll(message: string) {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer)
    entry.reject(new Error(message))
  }
  pending.clear()
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./logParser.worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (e: MessageEvent<ResultMessage | ErrorMessage>) => {
      const data = e.data
      const entry = settle(data.id)
      if (!entry) return
      if (data.type === 'result') {
        entry.resolve(data.rows)
      } else {
        entry.reject(new Error(data.error))
      }
    }

    worker.onerror = (err: ErrorEvent) => {
      rejectAll(err.message || 'Unknown worker error')
      worker?.terminate()
      worker = null
    }
  }
  return worker
}

/**
 * 将原始日志文本解析为逐行 HTML 行。
 * @param raw 原始日志内容
 */
export function parseLog(raw: string): Promise<ParsedLogRow[]> {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => {
      if (pending.delete(id)) {
        reject(new Error('Log parse timed out'))
        // 超时通常意味着 worker 卡死，销毁后下次调用自动重建
        worker?.terminate()
        worker = null
      }
    }, PARSE_TIMEOUT_MS)

    pending.set(id, { resolve, reject, timer })
    getWorker().postMessage({ type: 'parse', raw, id } satisfies ParseMessage)
  })
}
