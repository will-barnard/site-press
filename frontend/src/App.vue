<script setup>
import { onMounted } from 'vue';
import { useAuth } from './stores/auth.js';
import { useSystem } from './stores/system.js';
import Login from './views/Login.vue';

const auth = useAuth();
const system = useSystem();
onMounted(async () => { await auth.check(); if (auth.user) system.refresh(); });
</script>

<template>
  <div v-if="!auth.checked" class="center muted">Loading…</div>
  <Login v-else-if="!auth.user" @done="system.refresh()" />
  <div v-else class="shell">
    <header class="top">
      <RouterLink to="/" class="brand">site-press</RouterLink>
      <span v-if="system.status" class="status">
        <span :class="system.status.drydock.reachable ? 'dot dot--ok' : 'dot dot--bad'" />
        dry-dock {{ system.status.drydock.configured ? (system.status.drydock.reachable ? `reachable · pool ${system.status.drydock.pool}` : 'unreachable') : 'not configured' }}
        <span class="sep">·</span>
        <span :class="system.status.brewBucket.configured ? 'dot dot--ok' : 'dot'" /> brew-bucket {{ system.status.brewBucket.configured ? system.status.brewBucket.bucket : 'off' }}
        <span class="sep">·</span> {{ system.status.queue.running }} running, {{ system.status.queue.queued }} queued
      </span>
      <nav>
        <RouterLink v-if="auth.user.is_admin" to="/users">Users</RouterLink>
        <button class="link" type="button" @click="auth.logout()">Sign out</button>
      </nav>
    </header>
    <main class="main"><RouterView /></main>
  </div>
</template>
