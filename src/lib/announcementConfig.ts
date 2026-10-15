export interface AnnouncementConfig {
  id: string
  title: string
  content: string
  links: Array<{
    label: string
    url: string
    icon: string
    color: string
  }>
  importantText?: string
}

export const announcementConfig: AnnouncementConfig = {
  id: '20261015_entity_rename_notice',
  title: '关于 LogShare 的运营主体变更通知',
  content:
    'LogShare 的运营主体已由 NingZeStudio（柠泽工作室）更名为 AnyLyraLabs。\n\n望周知。',
  links: [
    {
      label: '开源仓库（CNB）',
      url: 'https://cnb.cool/MornZe-Dev/LogShare',
      icon: 'Github',
      color: 'blue'
    },
    {
      label: 'GitHub 只读镜像',
      url: 'https://github.com/anylyralabs/LogShare',
      icon: 'Github',
      color: 'zinc'
    }
  ]
}

export interface LogUpdateConfig {
  logId: string
  title: string
  description: string
}

export const logUpdateConfigs: LogUpdateConfig[] = [
  {
    logId: 'example-log-id',
    title: '日志已更新',
    description: '您关注的日志有新的更新，点击查看详情。'
  }
]

export const localStorageKeys = {
  announcementShown: 'ann_shown_v2',
  logUpdateShown: 'log_upd_shown_',
  lastAnnouncementId: 'last_ann_id'
} as const

export function getLogUpdateShownKey(logId: string): string {
  return `${localStorageKeys.logUpdateShown}${logId}`
}

export function hasSeenAnnouncement(): boolean {
  if (typeof localStorage === 'undefined') return true
  const lastSeen = localStorage.getItem(localStorageKeys.lastAnnouncementId)
  const currentId = announcementConfig.id
  return (
    lastSeen === currentId && localStorage.getItem(localStorageKeys.announcementShown) === 'true'
  )
}

export function markAnnouncementAsSeen(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(localStorageKeys.announcementShown, 'true')
  localStorage.setItem(localStorageKeys.lastAnnouncementId, announcementConfig.id)
}

export function hasSeenLogUpdate(logId: string): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(getLogUpdateShownKey(logId)) === 'true'
}

export function markLogUpdateAsSeen(logId: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(getLogUpdateShownKey(logId), 'true')
}

export function resetAnnouncement(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(localStorageKeys.announcementShown)
  localStorage.removeItem(localStorageKeys.lastAnnouncementId)
}

export function resetLogUpdate(logId: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(getLogUpdateShownKey(logId))
}
