<template>
  <div class="panel-stack templates-grid">
    <section class="panel-card">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">内部接口</p>
          <h3>为你的其他项目创建接口密钥</h3>
        </div>
        <el-button @click="loadKeys" :loading="loading">刷新</el-button>
      </div>

      <el-form label-position="top" @submit.prevent="createKey">
        <div class="form-grid">
          <el-form-item label="密钥名称">
            <el-input v-model="form.name" placeholder="账单服务" />
          </el-form-item>
          <el-form-item label="过期时间">
            <el-input v-model="form.expiresAt" placeholder="2026-12-31T23:59:59Z（可选）" />
          </el-form-item>
        </div>
        <el-form-item label="允许访问的项目（逗号分隔）">
          <el-input v-model="form.allowedProjects" placeholder="billing-service, notify-center" />
        </el-form-item>
        <el-form-item label="权限范围（逗号分隔）">
          <el-input v-model="form.scopes" placeholder="send:create, send:read" />
        </el-form-item>
        <el-button type="primary" @click="createKey" :loading="submitting">创建接口密钥</el-button>
      </el-form>

      <el-alert
        v-if="plainTextKey"
        title="接口密钥已创建。明文仅展示一次，请立即保存到你的服务端配置中。"
        type="success"
        show-icon
        :closable="false"
      />

      <div v-if="plainTextKey" class="preview-card">
        <strong>明文密钥</strong>
        <p class="preview-card__code">{{ plainTextKey }}</p>
        <el-button @click="copyKey">复制密钥</el-button>
      </div>
    </section>

    <section class="panel-card">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">已签发密钥</p>
          <h3>密钥清单</h3>
        </div>
      </div>

      <div class="list-stack">
        <article v-for="item in apiKeys" :key="item.id" class="list-card">
          <strong>{{ item.name }}</strong>
          <span>{{ item.keyPrefix }} · {{ item.status === 'active' ? '启用中' : '已吊销' }}</span>
          <p>允许项目：{{ (item.allowedProjects || []).join(', ') || '未设置' }}</p>
          <p>权限范围：{{ (item.scopes || []).join(', ') || '未设置' }}</p>
          <p>过期时间：{{ item.expiresAt || '永不过期' }}</p>
          <el-button v-if="item.status === 'active'" type="danger" plain @click="revokeKey(item)">吊销</el-button>
        </article>
        <el-empty v-if="!apiKeys.length" description="暂无接口密钥" />
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../lib/api'

const loading = ref(false)
const submitting = ref(false)
const apiKeys = ref([])
const plainTextKey = ref('')

const form = reactive({
  name: '账单服务',
  expiresAt: '',
  allowedProjects: 'billing-service',
  scopes: 'send:create, send:read',
})

function parseCommaValues(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

async function loadKeys() {
  loading.value = true
  try {
    const { data } = await api.get('/api-keys')
    apiKeys.value = data
  } finally {
    loading.value = false
  }
}

async function createKey() {
  submitting.value = true
  try {
    const { data } = await api.post('/api-keys', {
      name: form.name,
      expiresAt: form.expiresAt || null,
      allowedProjects: parseCommaValues(form.allowedProjects),
      scopes: parseCommaValues(form.scopes),
    })
    plainTextKey.value = data.plainTextKey || ''
    await loadKeys()
    ElMessage.success('接口密钥创建成功。')
  } finally {
    submitting.value = false
  }
}

async function revokeKey(item) {
  await api.post(`/api-keys/${item.id}/revoke`)
  await loadKeys()
  ElMessage.success('接口密钥已吊销。')
}

async function copyKey() {
  if (!plainTextKey.value) {
    return
  }

  await navigator.clipboard.writeText(plainTextKey.value)
  ElMessage.success('接口密钥已复制。')
}

onMounted(loadKeys)
</script>
