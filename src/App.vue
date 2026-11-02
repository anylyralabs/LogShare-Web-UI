<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { RouterView, RouterLink, useRoute } from 'vue-router'
import {
  PhHeart as Heart,
  PhBookOpen as BookOpen,
  PhFileText as FileText,
  PhUsers as Users,
  PhSun as Sun,
  PhMoon as Moon,
  PhMonitor as Monitor,
  PhRocketLaunch as Rocket
} from '@phosphor-icons/vue'
import PwaUpdateToast from '@/components/PwaUpdateToast.vue'
import PwaInstallPrompt from '@/components/PwaInstallPrompt.vue'
import AnnouncementDialog from '@/components/AnnouncementDialog.vue'
import WafBlockDialog from '@/components/WafBlockDialog.vue'
import MobileNav from '@/components/MobileNav.vue'
import LanguageMenu from '@/components/LanguageMenu.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import { setPageTitle, getCurrentPageTemplate } from '@/lib/pageTitle'
import { t } from '@/lib/i18n'
import { DEPLOY_HASH } from '@/lib/deployInfo'

const route = useRoute()
const announcementDialogRef = ref<InstanceType<typeof AnnouncementDialog> | null>(null)

provide('announcementDialog', announcementDialogRef)

// 顶栏滚动后切换为毛玻璃背景
const isScrolled = ref(false)
const onWindowScroll = () => {
  isScrolled.value = window.scrollY > 8
}

const navLinks = [
  { name: () => t('group_list'), path: '/groups', icon: Users },
  { name: () => t('launchers'), path: '/launchers', icon: Rocket },
  { name: () => t('sponsor'), path: '/sponsor', icon: Heart },
  { name: () => t('tutorials'), path: '/tutorials', icon: BookOpen },
  { name: () => t('api_docs'), path: '/api-docs', icon: FileText }
]

// 显示模式：浅色 / 深色 / 跟随系统（页脚 tab 切换）
type DisplayMode = 'light' | 'dark' | 'system'
const displayMode = ref<DisplayMode>('system')

const themeOptions: { mode: DisplayMode; icon: typeof Sun; label: string }[] = [
  { mode: 'light', icon: Sun, label: t('theme_light') },
  { mode: 'dark', icon: Moon, label: t('theme_dark') },
  { mode: 'system', icon: Monitor, label: t('theme_system') }
]

const applyDisplayMode = (mode: DisplayMode) => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = mode === 'dark' || (mode === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
}

const setDisplayMode = (mode: DisplayMode) => {
  displayMode.value = mode
  if (mode === 'system') localStorage.removeItem('display_mode')
  else localStorage.setItem('display_mode', mode)
  applyDisplayMode(mode)
}

onMounted(() => {
  const template = getCurrentPageTemplate(route.name?.toString())
  setPageTitle(template)

  const stored = localStorage.getItem('display_mode')
  displayMode.value = stored === 'dark' || stored === 'light' ? stored : 'system'
  applyDisplayMode(displayMode.value)

  // 未显式设置显示模式时，跟随系统深浅色变化
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', () => {
    if (!localStorage.getItem('display_mode')) {
      applyDisplayMode('system')
    }
  })

  onWindowScroll()
  window.addEventListener('scroll', onWindowScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onWindowScroll)
})
</script>

<template>
  <div
    class="min-h-screen bg-background text-foreground flex flex-col font-sans antialiased transition-colors duration-500"
  >
    <header class="sticky top-0 z-30 w-full pointer-events-none">
      <div
        class="pointer-events-auto mx-auto transition-all duration-300 ease-out"
        :class="
          isScrolled
            ? 'mt-3 w-[calc(100%-2rem)] rounded-full border-border/60 bg-background/80 shadow-lg backdrop-blur-md'
            : 'mt-0 w-full rounded-none border border-transparent bg-background'
        "
      >
        <div
          class="flex items-center gap-3 px-4 transition-all duration-300"
          :class="isScrolled ? 'h-12' : 'h-14'"
        >
          <RouterLink to="/" class="flex shrink-0 items-center font-semibold">
            <span class="inline">LogShare.CN</span>
          </RouterLink>

          <nav class="ml-4 hidden items-center gap-1 md:flex">
            <RouterLink
              v-for="link in navLinks"
              :key="link.path"
              :to="link.path"
              class="rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              :class="
                route.path === link.path || (link.path !== '/' && route.path.startsWith(link.path))
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground'
              "
            >
              <component :is="link.icon" weight="duotone" class="mr-1 -mt-0.5 inline h-4 w-4" />
              {{ link.name() }}
            </RouterLink>
          </nav>

          <div class="flex-1" />

          <!-- 主题三态切换：圆角容器 tab，高亮胶囊在选项间平移 -->
          <div
            class="relative flex items-center gap-0.5 rounded-full border border-border/60 bg-background/60 p-0.5"
            role="tablist"
            aria-label="显示模式"
          >
            <span
              aria-hidden="true"
              class="absolute left-0.5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-muted-foreground/25 shadow-sm transition-transform duration-300 ease-out"
              :style="{
                transform: `translateX(${themeOptions.findIndex(o => o.mode === displayMode) * 30}px) translateY(-50%)`
              }"
            />
            <button
              v-for="option in themeOptions"
              :key="option.mode"
              role="tab"
              :aria-selected="displayMode === option.mode"
              :aria-label="option.label"
              :title="option.label"
              class="relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors"
              :class="
                displayMode === option.mode
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-accent-foreground'
              "
              @click="setDisplayMode(option.mode)"
            >
              <component :is="option.icon" weight="duotone" class="h-3.5 w-3.5" />
            </button>
          </div>

          <LanguageMenu compact class="hidden md:flex" />

          <MobileNav :scrolled="isScrolled" />
        </div>
      </div>
    </header>

    <!-- [&>*]:min-w-0：flex 子项默认 min-width:auto，长内容（如文档页代码块）会把页面撑出横向滚动 -->
    <main class="flex-1 flex flex-col [&>*]:min-w-0">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
    </main>

    <footer class="border-t border-border/60">
      <div class="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-muted-foreground">
        <p>
          &copy; AnyLyraLabs
          <span class="ml-1 font-mono text-[11px] text-muted-foreground/80">#{{ DEPLOY_HASH }}</span>
        </p>
        <p class="mt-1">
          阅读我们的
          <RouterLink
            to="/privacy"
            class="text-foreground transition-colors hover:text-primary hover:underline"
            >隐私政策</RouterLink
          >
          和
          <RouterLink
            to="/terms"
            class="text-foreground transition-colors hover:text-primary hover:underline"
            >用户协议</RouterLink
          >
        </p>
      </div>
    </footer>

    <PwaUpdateToast />
    <PwaInstallPrompt />
    <AnnouncementDialog ref="announcementDialogRef" />
    <WafBlockDialog />
    <ToastHost />
  </div>
</template>

<style>
/* 页面间切换：淡入 + 轻微上滑 */
.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
