<script setup lang="ts">
import { PhArrowRight as ArrowRight } from '@phosphor-icons/vue'
import { t } from '@/lib/i18n'
import PageHeader from '@/components/PageHeader.vue'

const tutorials = [
  {
    id: 'tutorials-collection',
    title: '各类教程合集',
    description: '涵盖渲染器配置、启动器使用、原生库兼容性等常见问题的教程合集',
    category: '置顶',
    author: '社区经验总结'
  },
  {
    id: 'basic-concepts',
    title: 'Minecraft 玩家计算机基础概念扫盲',
    description: '文件后缀名、压缩包解压、模组插件区别等基础概念，面向新手的全面知识科普',
    category: '新手入门',
    author: '社区经验总结'
  },
  {
    id: 'ask-questions-effectively',
    title: '如何有效地提问求助指南',
    description: '学会正确的提问方法，提高获得帮助的概率，建立良好的社区关系',
    category: '社区指南',
    author: '社区经验总结'
  },
  {
    id: 'mobileglues-setup',
    title: '关于 FoldCraftLauncher 和 ZalithLauncher2 使用 MobileGlues 渲染器',
    description: '在 Android 设备上配置 MobileGlues 渲染器，提升 Minecraft 游戏性能和兼容性',
    category: '客户端配置',
    author: '用户提供内容'
  }
]
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-4xl">
    <PageHeader
      :title="t('tutorials_center')"
      :description="t('tutorials_description')"
    />

    <!-- 教程列表 -->
    <div class="space-y-3">
      <RouterLink
        v-for="tutorial in tutorials"
        :key="tutorial.id"
        :to="`/tutorials/${tutorial.id}`"
        class="group block rounded-lg border border-border/80 bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted/20"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <h3 class="text-base font-semibold mb-1 group-hover:text-primary transition-colors">
              {{ tutorial.title }}
            </h3>
            <p class="text-sm text-muted-foreground mb-2">
              {{ tutorial.description }}
            </p>
            <div class="flex items-center gap-2">
              <span class="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                {{ tutorial.category }}
              </span>
              <span class="text-xs text-muted-foreground">
                {{ tutorial.author }}
              </span>
            </div>
          </div>
          <ArrowRight
            weight="duotone"
            class="h-5 w-5 flex-shrink-0 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary"
          />
        </div>
      </RouterLink>
    </div>

    <!-- 快速链接 -->
    <div class="mt-8 p-4 bg-muted/30 rounded-lg border border-border">
      <h2 class="text-sm font-semibold mb-2">{{ t('need_help') }}</h2>
      <div class="flex flex-wrap gap-3 text-xs">
        <RouterLink to="/api-docs" class="text-primary hover:underline">
          {{ t('view_api_docs') }}
        </RouterLink>
        <span class="text-muted-foreground">|</span>
        <a
          href="https://qm.qq.com/q/FOGt99aayY"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary hover:underline"
        >
          {{ t('join_qq_group_link') }}
        </a>
      </div>
    </div>
  </div>
</template>
