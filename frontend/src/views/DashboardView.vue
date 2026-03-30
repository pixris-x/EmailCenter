<template>
  <div class="dashboard-grid">
    <section class="metric-card">
      <span>待审核模板</span>
      <strong>{{ overview.pendingReviews }}</strong>
    </section>
    <section class="metric-card">
      <span>待审批发送申请</span>
      <strong>{{ overview.pendingApprovals }}</strong>
    </section>
    <section class="metric-card">
      <span>发送失败任务</span>
      <strong>{{ overview.failedJobs }}</strong>
    </section>
    <section class="metric-card">
      <span>审计日志条数</span>
      <strong>{{ overview.auditLogCount }}</strong>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive } from 'vue'
import api from '../lib/api'

const overview = reactive({
  pendingApprovals: 0,
  pendingReviews: 0,
  failedJobs: 0,
  auditLogCount: 0,
})

onMounted(async () => {
  const { data } = await api.get('/logs/overview')
  overview.pendingApprovals = data.pendingApprovals
  overview.pendingReviews = data.pendingReviews
  overview.failedJobs = data.failedJobs
  overview.auditLogCount = data.auditLogCount
})
</script>
