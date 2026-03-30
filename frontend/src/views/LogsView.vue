<template>
  <div class="panel-stack templates-grid">
    <section class="panel-card">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">发送日志</p>
          <h3>最近邮件任务</h3>
        </div>
        <el-button @click="loadAll" :loading="loading">刷新</el-button>
      </div>

      <div class="list-stack">
        <article v-for="job in emailJobs" :key="job.id" class="list-card list-card--interactive" @click="selectJob(job)">
          <strong>{{ job.sendRequest?.requestNo || job.id }}</strong>
          <span>{{ statusLabelMap[job.status] || job.status }} · {{ job.provider }}</span>
          <p>{{ job.sendRequest?.template?.name || '未知模板' }} · {{ job.sendRequest?.sourceProject || 'manual' }}</p>
        </article>
        <el-empty v-if="!emailJobs.length" description="暂无邮件任务日志" />
      </div>
    </section>

    <section class="panel-card" v-if="selectedJob">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">任务详情</p>
          <h3>{{ selectedJob.sendRequest?.requestNo || selectedJob.id }}</h3>
        </div>
      </div>

      <div class="preview-card">
        <strong>任务状态</strong>
        <p>{{ statusLabelMap[selectedJob.status] || selectedJob.status }} / {{ deliveryLabelMap[selectedJob.sendRequest?.deliveryStatus] || selectedJob.sendRequest?.deliveryStatus }}</p>
        <strong>服务商消息 ID</strong>
        <p>{{ selectedJob.providerMessageId || '尚未发送' }}</p>
        <strong>最后错误</strong>
        <p>{{ selectedJob.lastError || '无' }}</p>
      </div>

      <div class="list-stack" v-if="selectedJob.logs?.length">
        <article v-for="log in selectedJob.logs" :key="log.id" class="list-card">
          <strong>{{ log.eventType }}</strong>
          <span>{{ log.level }} · {{ log.createdAt }}</span>
          <p>{{ log.message }}</p>
        </article>
      </div>
      <el-empty v-else description="该任务暂无事件日志" />
    </section>

    <section class="panel-card">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">审核日志</p>
          <h3>模板审核与发送审批记录</h3>
        </div>
      </div>

      <div class="list-stack">
        <article v-for="item in reviewLogs" :key="`${item.reviewType}-${item.id}`" class="list-card">
          <strong>{{ reviewTypeLabelMap[item.reviewType] || item.reviewType }}</strong>
          <span>{{ reviewActionLabelMap[item.action] || item.action }} · {{ item.createdAt }}</span>
          <p>{{ item.comment || '暂无备注' }}</p>
        </article>
        <el-empty v-if="!reviewLogs.length" description="暂无审核日志" />
      </div>
    </section>

    <section class="panel-card">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">审计日志</p>
          <h3>关键操作与内部接口调用</h3>
        </div>
      </div>

      <div class="list-stack">
        <article v-for="item in auditLogs" :key="item.id" class="list-card">
          <strong>{{ item.eventType }}</strong>
          <span>{{ item.actorType }} · {{ item.status }} · {{ item.createdAt }}</span>
          <p>{{ item.message }}</p>
        </article>
        <el-empty v-if="!auditLogs.length" description="暂无审计日志" />
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import api from '../lib/api'

const loading = ref(false)
const emailJobs = ref([])
const reviewLogs = ref([])
const auditLogs = ref([])
const selectedJob = ref(null)

const statusLabelMap = {
  pending: '待处理',
  processing: '发送中',
  sent: '已发送',
  failed: '失败',
}

const deliveryLabelMap = {
  draft: '草稿',
  queued: '已入队',
  processing: '发送中',
  sent: '已发送',
  failed: '发送失败',
}

const reviewTypeLabelMap = {
  template_review: '模板审核',
  send_approval: '发送审批',
}

const reviewActionLabelMap = {
  submit_review: '提交审核',
  submit: '提交申请',
  approve: '审核通过',
  reject: '审核驳回',
}

async function loadAll() {
  loading.value = true
  try {
    const [jobsResponse, reviewsResponse, auditResponse] = await Promise.all([
      api.get('/logs/email-jobs'),
      api.get('/logs/reviews'),
      api.get('/logs/audit'),
    ])

    emailJobs.value = jobsResponse.data
    reviewLogs.value = reviewsResponse.data
    auditLogs.value = auditResponse.data

    if (selectedJob.value) {
      const matched = emailJobs.value.find((item) => item.id === selectedJob.value.id)
      selectedJob.value = matched || null
    } else if (emailJobs.value.length) {
      await selectJob(emailJobs.value[0])
    }
  } finally {
    loading.value = false
  }
}

async function selectJob(job) {
  const { data } = await api.get(`/logs/email-jobs/${job.id}`)
  selectedJob.value = data
}

onMounted(loadAll)
</script>
