import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import MainLayout from '../layouts/MainLayout.vue'
import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import SmtpTestView from '../views/SmtpTestView.vue'
import TemplatesView from '../views/TemplatesView.vue'
import TemplateReviewsView from '../views/TemplateReviewsView.vue'
import SendApprovalsView from '../views/SendApprovalsView.vue'
import ApiKeysView from '../views/ApiKeysView.vue'
import LogsView from '../views/LogsView.vue'
import AccessControlView from '../views/AccessControlView.vue'

const protectedRouteOrder = [
  { name: 'dashboard', permission: 'dashboard:view' },
  { name: 'templates', permission: 'templates:manage' },
  { name: 'template-reviews', permission: 'template_reviews:manage' },
  { name: 'send-approvals', permission: 'send_approvals:manage' },
  { name: 'api-keys', permission: 'api_keys:manage' },
  { name: 'logs', permission: 'logs:view' },
  { name: 'smtp-test', permission: 'smtp_test:use' },
  { name: 'access-control', permission: 'auth_admins:manage' },
]

function resolveFirstAccessibleRoute(authStore) {
  const target = protectedRouteOrder.find((item) => authStore.hasPermission(item.permission))
  return target ? { name: target.name } : { name: 'login' }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/templates',
      redirect: { name: 'templates' },
    },
    {
      path: '/template-reviews',
      redirect: { name: 'template-reviews' },
    },
    {
      path: '/send-approvals',
      redirect: { name: 'send-approvals' },
    },
    {
      path: '/api-keys',
      redirect: { name: 'api-keys' },
    },
    {
      path: '/logs',
      redirect: { name: 'logs' },
    },
    {
      path: '/smtp-test',
      redirect: { name: 'smtp-test' },
    },
    {
      path: '/access-control',
      redirect: { name: 'access-control' },
    },
    {
      path: '/',
      component: MainLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: DashboardView,
          meta: { requiresAuth: true, requiresPermission: 'dashboard:view' },
        },
        {
          path: 'console/templates',
          name: 'templates',
          component: TemplatesView,
          meta: { requiresAuth: true, requiresPermission: 'templates:manage' },
        },
        {
          path: 'console/template-reviews',
          name: 'template-reviews',
          component: TemplateReviewsView,
          meta: { requiresAuth: true, requiresPermission: 'template_reviews:manage' },
        },
        {
          path: 'console/send-approvals',
          name: 'send-approvals',
          component: SendApprovalsView,
          meta: { requiresAuth: true, requiresPermission: 'send_approvals:manage' },
        },
        {
          path: 'console/api-keys',
          name: 'api-keys',
          component: ApiKeysView,
          meta: { requiresAuth: true, requiresPermission: 'api_keys:manage' },
        },
        {
          path: 'console/logs',
          name: 'logs',
          component: LogsView,
          meta: { requiresAuth: true, requiresPermission: 'logs:view' },
        },
        {
          path: 'console/smtp-test',
          name: 'smtp-test',
          component: SmtpTestView,
          meta: { requiresAuth: true, requiresPermission: 'smtp_test:use' },
        },
        {
          path: 'console/access-control',
          name: 'access-control',
          component: AccessControlView,
          meta: { requiresAuth: true, requiresPermission: 'auth_admins:manage' },
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return { name: 'login' }
  }

  if (authStore.isLoggedIn && (!Array.isArray(authStore.user?.permissions) || !authStore.user.permissions.length)) {
    await authStore.restoreSession()
  }

  if (to.name === 'login' && authStore.isLoggedIn) {
    return resolveFirstAccessibleRoute(authStore)
  }

  if (to.meta.requiresPermission && !authStore.hasPermission(to.meta.requiresPermission)) {
    return resolveFirstAccessibleRoute(authStore)
  }

  return true
})

export default router
