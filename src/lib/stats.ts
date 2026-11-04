import type { Router } from 'vue-router'

const DEFAULT_SDK_URL = 'https://api.logshare.cn/stats/sdk/1.3.0/openlitestats.min.js'
const DEFAULT_ENDPOINT = 'https://api.logshare.cn/stats/collect'
const SITE = 'logshare-web'
const STATS_HOSTS = new Set(['logshare.cn', 'www.logshare.cn'])

interface StatsPageviewInput {
  path?: string
}

interface StatsOptions {
  endpoint: string
  site: string
  autoPageview?: boolean
  autoHistory?: boolean
  singleton?: boolean
  respectDoNotTrack?: boolean
  debug?: boolean
}

interface StatsInstance {
  pageview(input?: StatsPageviewInput): void
  trackError(input: unknown): void
  trackVital(metric: 'LCP' | 'CLS' | 'INP' | 'TTFB', value: number, path?: string): void
  flush(preferBeacon?: boolean): Promise<void>
  destroy(): void
}

interface OpenLiteStatsGlobal {
  createOpenLiteStats(options: StatsOptions): StatsInstance
}

declare global {
  interface Window {
    OpenLiteStats?: OpenLiteStatsGlobal
  }
}

let loadPromise: Promise<OpenLiteStatsGlobal> | null = null

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false
  if (import.meta.env.VITE_OPENLITESTATS_ENABLED === 'true') return true
  if (!import.meta.env.PROD) return false
  return STATS_HOSTS.has(window.location.hostname)
}

function loadSdk(url: string): Promise<OpenLiteStatsGlobal> {
  if (window.OpenLiteStats) return Promise.resolve(window.OpenLiteStats)
  if (loadPromise) return loadPromise

  loadPromise = new Promise<OpenLiteStatsGlobal>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = () => {
      if (window.OpenLiteStats) {
        resolve(window.OpenLiteStats)
      } else {
        loadPromise = null
        reject(new Error('OpenLiteStats SDK loaded without global'))
      }
    }
    script.onerror = () => {
      loadPromise = null
      reject(new Error('OpenLiteStats SDK failed to load'))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}

/**
 * 只在生产站点加载统计 SDK，避免开发/预览流量污染线上统计。
 * 首屏由 router.isReady 后手动上报，后续由 afterEach 上报；避免与 SDK 自动 History 监听重复。
 */
export function initStats(router: Router): void {
  if (!isEnabled()) return

  const sdkUrl = import.meta.env.VITE_OPENLITESTATS_SDK_URL || DEFAULT_SDK_URL
  const endpoint = import.meta.env.VITE_OPENLITESTATS_ENDPOINT || DEFAULT_ENDPOINT

  loadSdk(sdkUrl)
    .then(sdk => {
      const stats = sdk.createOpenLiteStats({
        endpoint,
        site: SITE,
        autoPageview: false,
        autoHistory: false,
        singleton: true,
        respectDoNotTrack: true
      })

      const track = (path: string): void => {
        try {
          stats.pageview({ path })
        } catch {
          // 统计失败不能影响页面
        }
      }

      void router.isReady().then(() => {
        track(router.currentRoute.value.fullPath)
        router.afterEach((to, from) => {
          if (to.fullPath !== from.fullPath) track(to.fullPath)
        })
      })
    })
    .catch(error => {
      if (import.meta.env.DEV) {
        console.warn('[stats] OpenLiteStats SDK 未加载:', error)
      }
    })
}
