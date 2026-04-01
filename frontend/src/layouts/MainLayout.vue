<template>
  <el-container class="app-shell">
    <el-aside width="240px" class="app-aside">
      <div class="app-brand">
        <div class="app-brand__title">邮件中心</div>
        <div class="app-brand__sub">管理后台</div>
      </div>

      <el-menu :default-active="activePath" class="app-menu" router>
        <el-menu-item v-for="item in visibleMenuItems" :key="item.path" :index="item.path">
          {{ item.label }}
        </el-menu-item>
      </el-menu>

      <div class="app-aside__footer">
        <div class="app-user__name">{{ authStore.user.displayName || '管理员' }}</div>
        <div class="app-user__meta">{{ authStore.user.email || '未登录' }}</div>
        <div class="app-user__meta">{{ authStore.user.roleName || authStore.user.roleCode || '未分配角色' }}</div>
        <el-button plain type="danger" @click="handleSignOut">退出登录</el-button>
      </div>
    </el-aside>

    <el-container class="app-content-shell">
      <div class="app-mobile-bar">
        <div class="app-mobile-bar__brand">
          <div>
            <div class="app-header__tag">运营后台</div>
            <strong>{{ pageTitle }}</strong>
          </div>
        </div>
        <el-button plain @click="mobileMenuVisible = true">菜单</el-button>
      </div>

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

    <el-drawer
      v-model="mobileMenuVisible"
      title="邮件中心"
      direction="ltr"
      size="280px"
      :with-header="true"
      class="app-mobile-drawer"
      :destroy-on-close="false"
    >
      <div class="app-mobile-drawer__body">
        <div class="app-user-block">
          <strong>{{ authStore.user.displayName || '管理员' }}</strong>
          <p>{{ authStore.user.email || '未登录' }}</p>
          <p>{{ authStore.user.roleName || authStore.user.roleCode || '未分配角色' }}</p>
        </div>

        <el-menu :default-active="activePath" class="app-menu app-mobile-menu" @select="handleMobileNavigate">
          <el-menu-item v-for="item in visibleMenuItems" :key="item.path" :index="item.path">
            {{ item.label }}
          </el-menu-item>
        </el-menu>

        <el-button plain type="danger" class="app-mobile-drawer__logout" @click="handleMobileSignOut">
          退出登录
        </el-button>
      </div>
    </el-drawer>
  </el-container>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const mobileMenuVisible = ref(false)
const isMobile = ref(false)

const menuItems = [
  { path: '/', label: '仪表盘', permission: 'dashboard:view' },
  { path: '/console/templates', label: '模板管理', permission: 'templates:manage' },
  { path: '/console/template-reviews', label: '模板审核', permission: 'template_reviews:manage' },
  { path: '/console/send-approvals', label: '发送审批', permission: 'send_approvals:manage' },
  { path: '/console/api-keys', label: '接口密钥', permission: 'api_keys:manage' },
  { path: '/console/logs', label: '日志审计', permission: 'logs:view' },
  { path: '/console/smtp-test', label: 'SMTP 测试', permission: 'smtp_test:use' },
  { path: '/console/access-control', label: '账号与权限', permission: 'auth_admins:manage' },
]

const titleMap = {
  '/': '仪表盘概览',
  '/console/templates': '模板管理',
  '/console/template-reviews': '模板审核',
  '/console/send-approvals': '发送审批',
  '/console/api-keys': '接口密钥',
  '/console/logs': '日志与审计',
  '/console/smtp-test': 'SMTP 测试',
  '/console/access-control': '账号与权限',
}

const visibleMenuItems = computed(() => menuItems.filter((item) => authStore.hasPermission(item.permission)))
const activePath = computed(() => route.path)
const pageTitle = computed(() => titleMap[route.path] || '邮件中心')

function updateViewportState() {
  if (typeof window === 'undefined') {
    return
  }

  isMobile.value = window.innerWidth <= 960
  if (!isMobile.value) {
    mobileMenuVisible.value = false
  }
}

function handleSignOut() {
  authStore.signOut()
  router.push({ name: 'login' })
}

function handleMobileNavigate(path) {
  mobileMenuVisible.value = false
  router.push(path)
}

function handleMobileSignOut() {
  mobileMenuVisible.value = false
  handleSignOut()
}

watch(() => route.path, () => {
  if (isMobile.value) {
    mobileMenuVisible.value = false
  }
})

onMounted(() => {
  authStore.restoreSession()
  updateViewportState()
  window.addEventListener('resize', updateViewportState)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewportState)
})
</script>
