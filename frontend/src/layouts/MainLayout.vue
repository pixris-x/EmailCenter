<template>
  <el-container class="app-shell">
    <el-aside width="240px" class="app-aside">
      <div class="app-brand">
        <div class="app-brand__title">Pixris 邮件中心</div>
        <div class="app-brand__sub">管理后台</div>
      </div>

      <el-menu :default-active="activePath" class="app-menu" router>
        <el-menu-item index="/">仪表盘</el-menu-item>
        <el-menu-item index="/templates">模板管理</el-menu-item>
        <el-menu-item index="/template-reviews">模板审核</el-menu-item>
        <el-menu-item index="/send-approvals">发送审批</el-menu-item>
        <el-menu-item index="/api-keys">接口密钥</el-menu-item>
        <el-menu-item index="/logs">日志审计</el-menu-item>
        <el-menu-item index="/smtp-test">SMTP 测试</el-menu-item>
      </el-menu>

      <div class="app-aside__footer">
        <div class="app-user__name">{{ authStore.user.displayName || '管理员' }}</div>
        <div class="app-user__meta">{{ authStore.user.email || '未登录' }}</div>
        <el-button plain type="danger" @click="handleSignOut">退出登录</el-button>
      </div>
    </el-aside>

    <el-container>
      <el-header class="app-header">
        <div>
          <div class="app-header__tag">运营后台</div>
          <h2>{{ pageTitle }}</h2>
        </div>
      </el-header>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const titleMap = {
  '/': '仪表盘概览',
  '/templates': '模板管理',
  '/template-reviews': '模板审核',
  '/send-approvals': '发送审批',
  '/api-keys': '接口密钥',
  '/logs': '日志与审计',
  '/smtp-test': 'SMTP 测试',
}

const activePath = computed(() => route.path)
const pageTitle = computed(() => titleMap[route.path] || '邮件中心')

function handleSignOut() {
  authStore.signOut()
  router.push({ name: 'login' })
}

onMounted(() => {
  authStore.restoreSession()
})
</script>
