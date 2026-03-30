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

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
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
        },
        {
          path: 'templates',
          name: 'templates',
          component: TemplatesView,
        },
        {
          path: 'template-reviews',
          name: 'template-reviews',
          component: TemplateReviewsView,
        },
        {
          path: 'send-approvals',
          name: 'send-approvals',
          component: SendApprovalsView,
        },
        {
          path: 'api-keys',
          name: 'api-keys',
          component: ApiKeysView,
        },
        {
          path: 'logs',
          name: 'logs',
          component: LogsView,
        },
        {
          path: 'smtp-test',
          name: 'smtp-test',
          component: SmtpTestView,
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return { name: 'login' }
  }

  if (to.name === 'login' && authStore.isLoggedIn) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
