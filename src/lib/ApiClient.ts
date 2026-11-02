import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { isWafBlockHtml, showWafBlock } from '@/lib/wafBlock'

// 生产直连线上 API；开发走 vite.config.ts 的 server.proxy（同源转发到线上，规避跨域）
const baseURL = import.meta.env.DEV ? '' : 'https://api.logshare.cn'

export interface LogSubmitFile {
  name: string
  content: string
}

export interface LogSubmitParams {
  files: LogSubmitFile[]
  metadata?: Array<{
    key: string
    value: any
    label?: string
    visible?: boolean
  }>
  source?: string
}

export interface LogFileItem {
  name: string
  size: number
  lines: number
  raw: string
  insights: string
}

export interface LogSubmitResponse {
  success: boolean
  message: string
  id: string
  url: string
  filesUrl: string
  /** 主文件原文地址；单文件日志指向 /v1/raw/{id} */
  raw: string
  token: string
  /** 命中内容指纹时返回既有日志 ID；此时 token 不可用于删除 */
  deduplicated: boolean
  fileCount: number
  requiresFileSelection: boolean
  files: LogFileItem[]
}

export interface LogMetaResponse {
  success: boolean
  message: string
  id: string
  fileCount: number
  requiresFileSelection: boolean
  size: number
  lines: number
  created: number
  expires: number
  metadata: Array<{
    key: string
    value: any
    label?: string
    visible?: boolean
  }>
  source: string
  filesUrl: string
  /** 主文件原文地址；单文件日志指向 /v1/raw/{id} */
  raw: string
  files: LogFileItem[]
}

export interface DeleteResponse {
  success: boolean
  message?: string
  deleted: string[]
  failed: Array<{
    id: string
    message?: string
    error?: string
    code: number
  }>
  total: number
  deletedCount: number
  failedCount: number
}

export interface LimitsResponse {
  storageTime: number
  maxFiles: number
  maxTotalBytes: number
  maxRequestBodyBytes: number
}

/**
 * 现代浏览器与 Node 环境下，若数据大于 1 KiB 且支持 CompressionStream，则使用 Gzip 压缩请求体
 */
async function compressPayloadIfNeeded(
  data: any,
  headers: Record<string, any>
): Promise<{ data: any; headers: Record<string, any> }> {
  if (
    typeof CompressionStream === 'undefined' ||
    typeof Response === 'undefined' ||
    typeof Blob === 'undefined' ||
    data == null
  ) {
    return { data, headers }
  }

  try {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data)
    // 小于 1024 字节不压缩（避免 Gzip 头部开销反超）
    if (jsonStr.length < 1024) {
      return { data, headers }
    }

    const stream = new Blob([jsonStr]).stream().pipeThrough(new CompressionStream('gzip'))
    const buffer = await new Response(stream).arrayBuffer()
    const compressed = new Uint8Array(buffer)

    // 仅在压缩确实带来体积缩减时采用
    if (compressed.byteLength < jsonStr.length) {
      return {
        data: compressed,
        headers: {
          ...headers,
          'Content-Encoding': 'gzip'
        }
      }
    }
  } catch {
    // 任何压缩异常均优雅降级，发送原始数据
  }

  return { data, headers }
}

export class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        Accept: 'application/json'
      },
      withCredentials: false
    })

    this.client.interceptors.response.use(
      response => response,
      error => {
        if (import.meta.env.DEV) {
          console.error('API 请求错误:', {
            status: error.response?.status,
            message: error.message,
            data: error.response?.data,
            config: {
              method: error.config?.method,
              url: error.config?.url
            }
          })
        }

        // OpenLiteWaf 拦截卡片（403 + HTML 组件）：弹出展示，并把响应体
        // 替换为结构化 JSON，让调用方按普通错误路径提示简短文案
        if (error.response?.status === 403 && isWafBlockHtml(error.response.data)) {
          showWafBlock(error.response.data)
          error.response.data = {
            success: false,
            error: '您的请求已被安全系统拦截',
            code: 403
          }
        }

        return Promise.reject(error)
      }
    )
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config)
  }

  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    const rawHeaders: Record<string, any> = {
      'Content-Type': 'application/json',
      ...(config?.headers || {})
    }

    // 尝试根据负载体积自适应进行 gzip 压缩
    const { data: finalData, headers: finalHeaders } = await compressPayloadIfNeeded(
      data,
      rawHeaders
    )

    const postConfig: AxiosRequestConfig = {
      ...config,
      headers: finalHeaders
    }
    return this.client.post<T>(url, finalData, postConfig)
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config)
  }

  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config)
  }

  /**
   * 提交日志
   */
  async submitLog(params: LogSubmitParams): Promise<LogSubmitResponse> {
    const response = await this.post<LogSubmitResponse>('/v1/log', params)
    return response.data
  }

  /**
   * 获取原始日志（仅单文件；多文件请先 getLogMeta 再 getRawFile）
   */
  async getRawLog(id: string): Promise<string> {
    const response = await this.get<string>(`/v1/raw/${id}`, {
      headers: { Accept: 'text/plain' }
    })
    return response.data
  }

  /**
   * 获取日志元信息与附加文件列表
   */
  async getLogMeta(id: string): Promise<LogMetaResponse> {
    const response = await this.get<LogMetaResponse>(`/v1/log/${id}`)
    return response.data
  }

  /**
   * 获取日志的附加文件原文
   * 注意：子路径分隔符不可编码（后端按原始路径段路由），仅对各段做 URI 编码
   */
  async getRawFile(id: string, filename: string): Promise<string> {
    const path = filename.split('/').map(encodeURIComponent).join('/')
    const response = await this.get<string>(`/v1/raw/${id}/${path}`, {
      headers: { Accept: 'text/plain' }
    })
    return response.data
  }

  /**
   * 获取日志洞察（仅单文件；多文件请先 getLogMeta 再 getInsightsFile）
   */
  async getInsights(id: string) {
    const response = await this.get(`/v1/insights/${id}`)
    return response.data
  }

  /**
   * 获取指定文件的 Codex 分析
   */
  async getInsightsFile(id: string, filename: string) {
    const path = filename.split('/').map(encodeURIComponent).join('/')
    const response = await this.get(`/v1/insights/${id}/${path}`)
    return response.data
  }

  /**
   * 删除日志（支持单个和多个）
   */
  async deleteLog(id: string | string[], token: string): Promise<DeleteResponse> {
    const ids = Array.isArray(id) ? id.join(',') : id
    const response = await this.delete<DeleteResponse>(`/v1/log/${ids}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    })
    return response.data
  }

  /**
   * 获取限制信息
   */
  async getLimits(): Promise<LimitsResponse> {
    const response = await this.get<LimitsResponse>('/v1/limits')
    return response.data
  }
}

export const apiClient = new ApiClient()

export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint
  return `${baseURL}/${cleanEndpoint}`
}

export default apiClient
