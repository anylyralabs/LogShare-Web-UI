/**
 * LogShare.CN JavaScript SDK
 * 适配 LogShare API v1.8.5+（纯文件模型、按文件分析）
 *
 * 支持浏览器与 Node.js 18+（使用全局 fetch）。
 *
 * @version 3.1.0
 */

export class LogShareError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string | number | null, body?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message)
    this.name = 'LogShareError'
    this.status = options.status ?? 0
    this.code = options.code ?? null
    this.body = options.body ?? null
  }
}

export class LogShareSDK {
  /**
   * @param {{
   *   baseUrl?: string,
   *   timeout?: number,
   *   headers?: Record<string, string>,
   *   onError?: ((error: LogShareError) => void) | null
   * }} [options]
   */
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || 'https://api.logshare.cn').replace(/\/$/, '')
    this.timeout = options.timeout || 120000
    this.headers = options.headers || {}
    this.onError = options.onError || null
    this.version = '3.1.0'
  }

  /**
   * 上传日志文件列表。
   * @param {Array<{ name: string, content: string }>} files 至少一个文件
   * @param {{
   *   metadata?: Array<{ key: string, value: unknown, label?: string, visible?: boolean }>,
   *   source?: string
   * }} [options]
   */
  submit(files, options = {}) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new LogShareError('至少需要一个文件', { status: 400 })
    }
    const body = { files }
    if (options.metadata) body.metadata = options.metadata
    if (options.source) body.source = options.source
    return this._request('/v1/log', { method: 'POST', body })
  }

  /** 兼容旧调用名；参数为文件数组。 */
  paste(files, metadata = null, source = null) {
    return this.submit(files, {
      metadata: metadata || undefined,
      source: source || undefined
    })
  }

  /** 获取文件列表与日志元信息。 */
  getMeta(id) {
    return this._request(`/v1/log/${encodeURIComponent(id)}`)
  }

  /** 单文件日志的 Codex 分析；多文件请用 getInsightsFile。 */
  getInsights(id) {
    return this._request(`/v1/insights/${encodeURIComponent(id)}`)
  }

  /** 指定文件的 Codex 分析。 */
  getInsightsFile(id, filename) {
    const path = filename.split('/').map(encodeURIComponent).join('/')
    return this._request(`/v1/insights/${encodeURIComponent(id)}/${path}`)
  }

  /** 单文件日志原文；多文件请用 getRawFile。 */
  getRaw(id) {
    return this._request(`/v1/raw/${encodeURIComponent(id)}`, { raw: true })
  }

  /** 指定文件原文；filename 支持子路径。 */
  getRawFile(id, filename) {
    const path = filename.split('/').map(encodeURIComponent).join('/')
    return this._request(`/v1/raw/${encodeURIComponent(id)}/${path}`, { raw: true })
  }

  /** 获取上传限制。 */
  getLimits() {
    return this._request('/v1/limits')
  }

  /**
   * 删除日志。
   * @param {string | string[]} id 单个 ID 或 ID 数组
   * @param {string} token 上传时返回的删除令牌
   */
  delete(id, token) {
    const ids = (Array.isArray(id) ? id : [id]).map(encodeURIComponent).join(',')
    return this._request(`/v1/log/${ids}`, { method: 'DELETE', token })
  }

  /** 兼容别名。 */
  deleteLog(id, token) {
    return this.delete(id, token)
  }

  static isValidId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9]{7}$/.test(id)
  }

  /**
   * @private
   * @param {string} path
   * @param {{ method?: string, body?: unknown, token?: string, raw?: boolean }} [options]
   */
  async _request(path, options = {}) {
    const { method = 'GET', body, token, raw = false } = options
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)
    const headers = {
      Accept: raw ? 'text/plain' : 'application/json',
      ...this.headers
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      })
      const text = await response.text()

      if (!response.ok) {
        let data = null
        try {
          data = text ? JSON.parse(text) : null
        } catch {
          data = null
        }
        const error = new LogShareError(
          data?.error || data?.message || text || `HTTP ${response.status}`,
          { status: response.status, code: data?.code ?? response.status, body: data ?? text }
        )
        this.onError?.(error)
        throw error
      }

      if (raw) return text
      return text ? JSON.parse(text) : null
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutError = new LogShareError('请求超时', { status: 408 })
        this.onError?.(timeoutError)
        throw timeoutError
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

export default LogShareSDK
