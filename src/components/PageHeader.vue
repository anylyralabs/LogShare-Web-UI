<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  title: string
  description?: string
  eyebrow?: string
  icon?: Component
}>()
</script>

<template>
  <header class="mb-8 border-b border-border/60 pb-6">
    <div
      v-if="eyebrow"
      class="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground"
    >
      <component v-if="icon" :is="icon" weight="duotone" class="h-3.5 w-3.5 text-primary" />
      {{ eyebrow }}
    </div>
    <h1 class="text-3xl font-bold tracking-tight text-foreground">{{ title }}</h1>
    <p v-if="description" class="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      {{ description }}
    </p>
    <slot />
  </header>
</template>
