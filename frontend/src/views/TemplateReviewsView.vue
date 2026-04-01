<template>
  <div class="panel-stack">
    <section class="panel-card" v-loading="loading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">审核队列</p>
          <h3>待审核模板</h3>
        </div>
        <el-button @click="loadQueue" :loading="loading">刷新</el-button>
      </div>

      <div class="list-stack">
        <article v-for="template in templates" :key="template.id" class="list-card list-card--interactive" @click="selectTemplate(template)">
          <strong>{{ template.name }}</strong>
          <span>{{ template.code }} · {{ statusLabelMap[template.status] || template.status }}</span>
          <p>{{ template.subject }}</p>
        </article>
        <el-empty v-if="!templates.length && !loading" description="暂无待审核模板" />
      </div>

      <div class="list-pagination" v-if="pagination.total > pagination.pageSize">
        <el-pagination
          layout="prev, pager, next"
          :current-page="pagination.page"
          :page-size="pagination.pageSize"
          :total="pagination.total"
          @current-change="handlePageChange"
          :hide-on-single-page="false"
        />
      </div>
    </section>

    <section class="panel-card" v-if="selectedTemplate" v-loading="reviewDetailLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">审核详情</p>
          <h3>{{ selectedTemplate.name }}</h3>
        </div>
      </div>

      <div class="preview-card">
        <strong>模板标题</strong>
        <p>{{ selectedTemplate.subject }}</p>
        <strong>当前状态</strong>
        <p>{{ statusLabelMap[selectedTemplate.status] || selectedTemplate.status }}</p>
        <strong>HTML 预览</strong>
        <div class="preview-card__html" v-html="selectedTemplate.htmlContent"></div>
      </div>

      <el-form label-position="top" @submit.prevent="submitReview('approve')">
        <el-form-item label="审核意见">
          <el-input v-model="reviewComment" type="textarea" :rows="4" placeholder="请输入审核说明" />
        </el-form-item>
        <div class="button-row">
          <el-button type="success" @click="submitReview('approve')" :loading="reviewLoading">通过</el-button>
          <el-button type="danger" @click="submitReview('reject')" :loading="reviewLoading">驳回</el-button>
        </div>
      </el-form>

      <el-alert v-if="reviewMessage" :title="reviewMessage" :type="reviewType" show-icon :closable="false" />

      <div class="list-stack" v-if="reviewLogs.length">
        <article v-for="log in reviewLogs" :key="log.id" class="list-card">
          <strong>{{ actionLabelMap[log.action] || log.action }}</strong>
          <span>{{ formatDateTime(log.created_at || log.createdAt) }}</span>
          <p>{{ log.comment || '暂无备注' }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import api from '../lib/api'

const loading = ref(false)
const reviewLoading = ref(false)
const reviewDetailLoading = ref(false)
const reviewMessage = ref('')
const reviewType = ref('success')
const reviewComment = ref('')
const templates = ref([])
const selectedTemplate = ref(null)
const reviewLogs = ref([])
const pagination = reactive({
  page: 1,
  pageSize: 8,
  total: 0,
})

const statusLabelMap = {
  draft: '草稿',
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已驳回',
}

const actionLabelMap = {
  submit_review: '提交审核',
  approve: '审核通过',
  reject: '审核驳回',
}

function formatDateTime(value) {
  if (!value) {
    return '未知'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  })
}

async function loadQueue(page = pagination.page) {
  loading.value = true
  try {
    const { data } = await api.get('/templates/review-queue', {
      params: {
        page,
        pageSize: pagination.pageSize,
      },
    })

    templates.value = data.items || []
    pagination.page = data.page || page
    pagination.pageSize = data.pageSize || pagination.pageSize
    pagination.total = data.total || 0

    if (!selectedTemplate.value && templates.value.length) {
      await selectTemplate(templates.value[0])
    }

    if (selectedTemplate.value) {
      const matched = templates.value.find((item) => item.id === selectedTemplate.value.id)
      if (matched) {
        selectedTemplate.value = matched
      } else if (!templates.value.length) {
        selectedTemplate.value = null
        reviewLogs.value = []
      }
    }
  } finally {
    loading.value = false
  }
}

async function selectTemplate(template) {
  selectedTemplate.value = template
  reviewDetailLoading.value = true
  try {
    const { data } = await api.get(`/templates/${template.id}/review-logs`)
    reviewLogs.value = data
  } finally {
    reviewDetailLoading.value = false
  }
}

async function submitReview(action) {
  if (!selectedTemplate.value) {
    return
  }

  reviewLoading.value = true
  reviewMessage.value = ''

  try {
    const { data } = await api.post(`/templates/${selectedTemplate.value.id}/review`, {
      action,
      comment: reviewComment.value,
    })
    reviewType.value = 'success'
    reviewMessage.value = data.message
    reviewComment.value = ''
    selectedTemplate.value = null
    reviewLogs.value = []
    await loadQueue(1)
  } catch (error) {
    reviewType.value = 'error'
    reviewMessage.value = error.response?.data?.message || error.message
  } finally {
    reviewLoading.value = false
  }
}

async function handlePageChange(page) {
  selectedTemplate.value = null
  reviewLogs.value = []
  await loadQueue(page)
}

onMounted(loadQueue)
</script>
