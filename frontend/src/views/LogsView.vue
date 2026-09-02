<template>
  <div class="panel-stack">
    <section class="panel-card" v-loading="jobListLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">发送日志</p>
          <h3>最近邮件任务</h3>
        </div>
        <el-button @click="loadAll" :loading="jobListLoading || reviewListLoading || auditListLoading">刷新</el-button>
      </div>

      <div class="list-stack">
        <article
          v-for="job in emailJobs"
          :key="job.id"
          class="list-card list-card--interactive"
          :class="{ 'list-card--selected': selectedJobId === job.id && jobDrawerVisible }"
          @click="openJobDrawer(job)"
        >
          <strong>{{ job.sendRequest?.requestNo || job.id }}</strong>
          <span>{{ statusLabelMap[job.status] || job.status }} · {{ job.provider }}</span>
          <p>{{ job.sendRequest?.template?.name || '未知模板' }} · {{ job.sendRequest?.sourceProject || 'manual' }}</p>
          <div v-if="job.status === 'failed'" class="list-card__actions" @click.stop>
            <el-button
              link
              type="primary"
              size="small"
              :loading="retryingJobId === job.id"
              @click="retryJob(job)"
            >
              重试
            </el-button>
          </div>
        </article>
        <el-empty v-if="!emailJobs.length && !jobListLoading" description="暂无邮件任务日志" />
      </div>

      <div class="list-pagination" v-if="jobPagination.total > 0">
        <el-pagination
          layout="prev, pager, next"
          :current-page="jobPagination.page"
          :page-size="jobPagination.pageSize"
          :total="jobPagination.total"
          @current-change="handleJobPageChange"
          :hide-on-single-page="false"
        />
      </div>
    </section>

    <section class="panel-card" v-loading="reviewListLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">审核日志</p>
          <h3>模板审核与发送审批记录</h3>
        </div>
      </div>

      <div class="list-stack">
        <article v-for="item in reviewLogs" :key="`${item.reviewType}-${item.id}`" class="list-card">
          <strong>{{ reviewTypeLabelMap[item.reviewType] || item.reviewType }}</strong>
          <span>{{ reviewActionLabelMap[item.action] || item.action }} · {{ formatDateTime(item.createdAt) }}</span>
          <p>{{ item.comment || '暂无备注' }}</p>
        </article>
        <el-empty v-if="!reviewLogs.length && !reviewListLoading" description="暂无审核日志" />
      </div>

      <div class="list-pagination" v-if="reviewPagination.total > 0">
        <el-pagination
          layout="prev, pager, next"
          :current-page="reviewPagination.page"
          :page-size="reviewPagination.pageSize"
          :total="reviewPagination.total"
          @current-change="handleReviewPageChange"
          :hide-on-single-page="false"
        />
      </div>
    </section>

    <section class="panel-card" v-loading="auditListLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">审计日志</p>
          <h3>关键操作与内部接口调用</h3>
        </div>
      </div>

      <div class="list-stack">
        <article v-for="item in auditLogs" :key="item.id" class="list-card">
          <strong>{{ item.eventType }}</strong>
          <span>{{ item.actorType }} · {{ item.status }} · {{ formatDateTime(item.createdAt) }}</span>
          <p>{{ item.message }}</p>
        </article>
        <el-empty v-if="!auditLogs.length && !auditListLoading" description="暂无审计日志" />
      </div>

      <div class="list-pagination" v-if="auditPagination.total > 0">
        <el-pagination
          layout="prev, pager, next"
          :current-page="auditPagination.page"
          :page-size="auditPagination.pageSize"
          :total="auditPagination.total"
          @current-change="handleAuditPageChange"
          :hide-on-single-page="false"
        />
      </div>
    </section>

    <el-drawer v-model="jobDrawerVisible" title="任务详情" size="460px" :with-header="true" :destroy-on-close="false">
      <div v-loading="jobDetailLoading" class="sender-drawer-body">
        <template v-if="selectedJob">
          <div class="preview-card">
            <strong>{{ selectedJob.sendRequest?.requestNo || selectedJob.id }}</strong>
            <p>任务状态：{{ statusLabelMap[selectedJob.status] || selectedJob.status }}</p>
            <p>投递状态：{{ deliveryLabelMap[selectedJob.sendRequest?.deliveryStatus] || selectedJob.sendRequest?.deliveryStatus }}</p>
            <p>来源项目：{{ selectedJob.sendRequest?.sourceProject || 'manual' }}</p>
            <p>模板名称：{{ selectedJob.sendRequest?.template?.name || '未知模板' }}</p>
            <p>发件人：{{ selectedJob.sendRequest?.senderIdentity?.email || '未记录' }}</p>
            <p>服务商消息 ID：{{ selectedJob.providerMessageId || '尚未发送' }}</p>
            <p>最后错误：{{ selectedJob.lastError || '无' }}</p>
            <p>入队时间：{{ formatDateTime(selectedJob.queuedAt) }}</p>
            <p>开始时间：{{ formatDateTime(selectedJob.startedAt) }}</p>
            <p>完成时间：{{ formatDateTime(selectedJob.finishedAt) }}</p>
          </div>

          <div class="list-stack" v-if="selectedJob.logs?.length">
            <article v-for="log in selectedJob.logs" :key="log.id" class="list-card">
              <strong>{{ log.eventType }}</strong>
              <span>{{ log.level }} · {{ formatDateTime(log.createdAt) }}</span>
              <p>{{ log.message }}</p>
            </article>
          </div>

          <div class="list-stack" v-if="selectedJob.feedbackEvents?.length">
            <div class="panel-card__header">
              <div>
                <strong>回执事件</strong>
              </div>
            </div>
            <article v-for="event in selectedJob.feedbackEvents" :key="event.id" class="list-card">
              <strong>{{ feedbackKindLabelMap[event.kind] || event.kind }}</strong>
              <span>{{ event.statusCode || '—' }} · {{ formatDateTime(event.receivedAt) }}</span>
              <p>{{ event.reason || '无原因' }}</p>
            </article>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../lib/api'

const jobListLoading = ref(false)
const reviewListLoading = ref(false)
const auditListLoading = ref(false)
const jobDetailLoading = ref(false)
const retryingJobId = ref('')
const emailJobs = ref([])
const reviewLogs = ref([])
const auditLogs = ref([])
const selectedJobId = ref('')
const selectedJob = ref(null)
const jobDrawerVisible = ref(false)
const jobPagination = reactive({
  page: 1,
  pageSize: 8,
  total: 0,
})
const reviewPagination = reactive({
  page: 1,
  pageSize: 8,
  total: 0,
})
const auditPagination = reactive({
  page: 1,
  pageSize: 8,
  total: 0,
})

const statusLabelMap = {
  pending: '待处理',
  processing: '发送中',
  sent: '已发送',
  failed: '失败',
  bounced: '已退信',
  delivered: '已送达',
}

const deliveryLabelMap = {
  draft: '草稿',
  queued: '已入队',
  processing: '发送中',
  sent: '已发送',
  failed: '发送失败',
  bounced: '已退信',
  delivered: '已送达',
}

const feedbackKindLabelMap = {
  bounce: '退信',
  complaint: '投诉',
  delivered: '已送达',
  sent: '已发送',
  opened: '已打开',
  clicked: '已点击',
}

const reviewTypeLabelMap = {
  template_review: '模板审核',
  template: '模板审核',
  send_approval: '发送审批',
}

const reviewActionLabelMap = {
  submit_review: '提交审核',
  submit: '提交申请',
  approve: '审核通过',
  reject: '审核驳回',
}

function formatDateTime(value) {
  if (!value) {
    return '未记录'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  })
}

async function openJobDrawer(job) {
  selectedJobId.value = job.id
  jobDrawerVisible.value = true
  jobDetailLoading.value = true

  try {
    const { data } = await api.get(`/logs/email-jobs/${job.id}`)
    selectedJob.value = data
  } finally {
    jobDetailLoading.value = false
  }
}

async function loadEmailJobs(page = jobPagination.page) {
  jobListLoading.value = true
  try {
    const { data } = await api.get('/logs/email-jobs', {
      params: {
        page,
        pageSize: jobPagination.pageSize,
      },
    })

    emailJobs.value = data.items || []
    jobPagination.page = data.page || page
    jobPagination.pageSize = data.pageSize || jobPagination.pageSize
    jobPagination.total = data.total || 0

    if (jobDrawerVisible.value && selectedJobId.value) {
      const matched = emailJobs.value.find((item) => item.id === selectedJobId.value)
      if (matched) {
        await openJobDrawer(matched)
      } else {
        jobDrawerVisible.value = false
        selectedJobId.value = ''
        selectedJob.value = null
      }
    }
  } finally {
    jobListLoading.value = false
  }
}

async function loadReviewLogs(page = reviewPagination.page) {
  reviewListLoading.value = true
  try {
    const { data } = await api.get('/logs/reviews', {
      params: {
        page,
        pageSize: reviewPagination.pageSize,
      },
    })

    reviewLogs.value = data.items || []
    reviewPagination.page = data.page || page
    reviewPagination.pageSize = data.pageSize || reviewPagination.pageSize
    reviewPagination.total = data.total || 0
  } finally {
    reviewListLoading.value = false
  }
}

async function loadAuditLogs(page = auditPagination.page) {
  auditListLoading.value = true
  try {
    const { data } = await api.get('/logs/audit', {
      params: {
        page,
        pageSize: auditPagination.pageSize,
      },
    })

    auditLogs.value = data.items || []
    auditPagination.page = data.page || page
    auditPagination.pageSize = data.pageSize || auditPagination.pageSize
    auditPagination.total = data.total || 0
  } finally {
    auditListLoading.value = false
  }
}

async function loadAll() {
  await Promise.all([
    loadEmailJobs(jobPagination.page),
    loadReviewLogs(reviewPagination.page),
    loadAuditLogs(auditPagination.page),
  ])
}

async function retryJob(job) {
  retryingJobId.value = job.id
  try {
    const { data } = await api.post(`/queue/jobs/${job.id}/retry`)
    ElMessage.success(data.message || '邮件任务已重新入队。')
    if (jobDrawerVisible.value && selectedJobId.value === job.id) {
      selectedJob.value = null
      jobDrawerVisible.value = false
    }
    await loadEmailJobs(jobPagination.page)
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    retryingJobId.value = ''
  }
}

async function handleJobPageChange(page) {
  await loadEmailJobs(page)
}

async function handleReviewPageChange(page) {
  await loadReviewLogs(page)
}

async function handleAuditPageChange(page) {
  await loadAuditLogs(page)
}

onMounted(loadAll)
</script>
