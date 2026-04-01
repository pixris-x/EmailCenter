<template>
  <div class="panel-stack templates-grid">
    <section class="panel-card" v-loading="senderPanelLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">发件人管理</p>
          <h3>维护发件人身份</h3>
        </div>
        <el-button @click="loadSenderData(senderPagination.page)" :loading="senderPanelLoading">刷新</el-button>
      </div>

      <el-form label-position="top" @submit.prevent="createSender">
        <div class="form-grid">
          <el-form-item label="发件人名称">
            <el-input v-model="senderForm.name" placeholder="Pixris 通知中心" />
          </el-form-item>
          <el-form-item label="发件邮箱">
            <el-input v-model="senderForm.email" placeholder="noreply@email.pixris.online" />
          </el-form-item>
        </div>
        <el-form-item label="回复邮箱">
          <el-input v-model="senderForm.replyToEmail" placeholder="support@email.pixris.online" />
        </el-form-item>
        <el-button type="primary" @click="createSender" :loading="senderSubmitting">创建发件人</el-button>
      </el-form>

      <div class="sender-admin-grid">
        <div class="sender-list-wrap">
          <div class="list-stack sender-list-stack">
            <article
              v-for="sender in senders"
              :key="sender.id"
              class="list-card list-card--interactive"
              :class="{ 'list-card--selected': selectedSenderId === sender.id && senderDrawerVisible }"
              @click="openSenderDrawer(sender.id)"
            >
              <strong>{{ sender.name }}</strong>
              <span>{{ sender.email }}</span>
              <p>{{ sender.status === 'active' ? '启用中' : sender.status }} · 已使用 {{ sender.usageCount || 0 }} 次</p>
            </article>
            <el-empty v-if="!senders.length && !senderPanelLoading" description="暂无发件人" />
          </div>

          <div class="sender-pagination" v-if="senderPagination.total > 0">
            <el-pagination
              layout="prev, pager, next"
              :current-page="senderPagination.page"
              :page-size="senderPagination.pageSize"
              :total="senderPagination.total"
              @current-change="handleSenderPageChange"
          :hide-on-single-page="false"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="panel-card" v-loading="mainDataLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">发送申请</p>
          <h3>创建待审批的发送任务</h3>
        </div>
      </div>

      <el-form label-position="top" @submit.prevent="createSendRequest">
        <div class="form-grid">
          <el-form-item label="已通过模板">
            <el-select v-model="requestForm.templateId" placeholder="请选择模板">
              <el-option v-for="template in approvedTemplates" :key="template.id" :label="template.name" :value="template.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="发件人身份">
            <el-select v-model="requestForm.senderIdentityId" placeholder="请选择发件人">
              <el-option v-for="sender in senderOptions" :key="sender.id" :label="sender.email" :value="sender.id" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="收件人（逗号分隔）">
          <el-input v-model="requestForm.toRecipients" placeholder="user@example.com, user2@example.com" />
        </el-form-item>
        <el-form-item label="来源项目">
          <el-input v-model="requestForm.sourceProject" placeholder="billing-service" />
        </el-form-item>
        <el-form-item label="模板变量 JSON">
          <el-input v-model="requestForm.templatePayload" type="textarea" :rows="5" />
        </el-form-item>
        <el-button type="primary" @click="createSendRequest" :loading="requestSubmitting">创建发送申请</el-button>
      </el-form>
    </section>

    <section class="panel-card" v-loading="mainDataLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">审批队列</p>
          <h3>待审批发送申请</h3>
        </div>
      </div>

      <div class="list-stack">
        <article v-for="item in requests" :key="item.id" class="list-card list-card--interactive" @click="selectRequest(item)">
          <strong>{{ item.requestNo }}</strong>
          <span>{{ item.template?.name || '未知模板' }} · {{ approvalStatusLabelMap[item.approvalStatus] || item.approvalStatus }}</span>
          <p>{{ (item.toRecipients || []).join(', ') }}</p>
        </article>
        <el-empty v-if="!requests.length && !mainDataLoading" description="暂无待审批发送申请" />
      </div>

      <div class="list-pagination" v-if="requestPagination.total > 0">
        <el-pagination
          layout="prev, pager, next"
          :current-page="requestPagination.page"
          :page-size="requestPagination.pageSize"
          :total="requestPagination.total"
          @current-change="handleRequestPageChange"
          :hide-on-single-page="false"
        />
      </div>
    </section>

    <section class="panel-card" v-if="selectedRequest" v-loading="requestDetailLoading || attachmentUploading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">审批详情</p>
          <h3>{{ selectedRequest.requestNo }}</h3>
        </div>
      </div>

      <div class="preview-card">
        <strong>收件人</strong>
        <p>{{ (selectedRequest.toRecipients || []).join(', ') }}</p>
        <strong>来源项目</strong>
        <p>{{ selectedRequest.sourceProject || 'manual' }}</p>
        <strong>状态</strong>
        <p>{{ approvalStatusLabelMap[selectedRequest.approvalStatus] || selectedRequest.approvalStatus }} / {{ deliveryStatusLabelMap[selectedRequest.deliveryStatus] || selectedRequest.deliveryStatus }}</p>
      </div>

      <el-alert
        title="请先创建发送申请，再上传单个不超过 10MB 的附件，最后再进行审批。"
        type="info"
        show-icon
        :closable="false"
      />

      <div class="panel-card panel-card--inner">
        <div class="panel-card__header">
          <div>
            <p class="content__eyebrow">附件管理</p>
            <h3>允许类型：pdf、doc、docx、xls、xlsx、jpg、jpeg、png、zip</h3>
          </div>
        </div>

        <el-upload
          drag
          :show-file-list="false"
          :http-request="uploadAttachment"
          :disabled="attachmentUploading || selectedRequest.approvalStatus !== 'pending_approval'"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
        >
          <div class="upload-copy">
            <strong>拖拽文件到这里，或点击上传</strong>
            <p>单个附件大小上限：10MB</p>
          </div>
        </el-upload>

        <div class="list-stack attachment-stack" v-if="attachments.length">
          <article v-for="attachment in attachments" :key="attachment.id" class="list-card">
            <strong>{{ attachment.originalName }}</strong>
            <span>{{ formatFileSize(attachment.fileSizeBytes) }}</span>
            <div class="button-row">
              <el-link :href="buildDownloadUrl(attachment.downloadPath)" target="_blank" type="primary">下载</el-link>
              <el-button
                link
                type="danger"
                @click="removeAttachment(attachment)"
                :loading="attachmentDeleteId === attachment.id"
                :disabled="selectedRequest.approvalStatus !== 'pending_approval'"
              >
                删除
              </el-button>
            </div>
          </article>
        </div>
        <el-empty v-else description="暂无已上传附件" />
      </div>

      <el-form label-position="top" @submit.prevent="reviewRequest('approve')">
        <el-form-item label="审批意见">
          <el-input v-model="approvalComment" type="textarea" :rows="4" placeholder="请输入审批说明" />
        </el-form-item>
        <div class="button-row">
          <el-button type="success" @click="reviewRequest('approve')" :loading="approvalSubmitting">通过</el-button>
          <el-button type="danger" @click="reviewRequest('reject')" :loading="approvalSubmitting">驳回</el-button>
        </div>
      </el-form>

      <el-alert v-if="approvalMessage" :title="approvalMessage" :type="approvalType" show-icon :closable="false" />

      <div class="list-stack" v-if="approvalLogs.length">
        <article v-for="log in approvalLogs" :key="log.id" class="list-card">
          <strong>{{ approvalActionLabelMap[log.action] || log.action }}</strong>
          <span>{{ log.created_at || log.createdAt }}</span>
          <p>{{ log.comment || '暂无备注' }}</p>
        </article>
      </div>
    </section>

    <el-drawer
      v-model="senderDrawerVisible"
      title="发件人详情"
      size="420px"
      :with-header="true"
      :destroy-on-close="false"
    >
      <div v-loading="senderDetailLoading" class="sender-drawer-body">
        <template v-if="selectedSenderDetail">
          <div class="preview-card sender-detail-card">
            <el-form label-position="top" @submit.prevent="updateSenderName">
              <el-form-item label="发件人名称">
                <el-input
                  v-model="senderDetailForm.name"
                  placeholder="请输入发件人名称"
                  :disabled="senderUpdating"
                />
              </el-form-item>
              <div class="button-row sender-detail-actions">
                <el-button type="primary" @click="updateSenderName" :loading="senderUpdating">保存名称</el-button>
                <el-button
                  type="danger"
                  plain
                  @click="removeSender(selectedSenderDetail)"
                  :loading="senderDeleting"
                  :disabled="Number(selectedSenderDetail.usageCount || 0) > 0 || senderUpdating"
                >
                  删除发件人
                </el-button>
              </div>
            </el-form>
            <p>发件邮箱：{{ selectedSenderDetail.email }}</p>
            <p>回复邮箱：{{ selectedSenderDetail.replyToEmail || '未设置' }}</p>
            <p>状态：{{ selectedSenderDetail.status === 'active' ? '启用中' : selectedSenderDetail.status }}</p>
            <p>引用次数：{{ selectedSenderDetail.usageCount || 0 }}</p>
            <p>创建时间：{{ formatDateTime(selectedSenderDetail.createdAt) }}</p>
          </div>

          <div class="list-stack" v-if="selectedSenderDetail.recentSendRequests?.length">
            <article v-for="item in selectedSenderDetail.recentSendRequests" :key="item.id" class="list-card">
              <strong>{{ item.requestNo }}</strong>
              <span>{{ item.template?.name || '未知模板' }}</span>
              <p>{{ approvalStatusLabelMap[item.approvalStatus] || item.approvalStatus }} / {{ deliveryStatusLabelMap[item.deliveryStatus] || item.deliveryStatus }}</p>
            </article>
          </div>
          <el-empty v-else description="该发件人暂无最近发送记录" />
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../lib/api'

const loading = ref(false)
const senderPanelLoading = ref(false)
const senderDetailLoading = ref(false)
const senderSubmitting = ref(false)
const senderDeleting = ref(false)
const senderUpdating = ref(false)
const mainDataLoading = ref(false)
const requestSubmitting = ref(false)
const requestDetailLoading = ref(false)
const approvalSubmitting = ref(false)
const attachmentUploading = ref(false)
const attachmentDeleteId = ref('')
const approvalMessage = ref('')
const approvalType = ref('success')
const approvalComment = ref('')

const senders = ref([])
const senderOptions = ref([])
const templates = ref([])
const requests = ref([])
const selectedRequest = ref(null)
const approvalLogs = ref([])
const attachments = ref([])
const selectedSenderId = ref('')
const selectedSenderDetail = ref(null)
const senderDrawerVisible = ref(false)
const senderDetailForm = reactive({
  name: '',
})
const senderPagination = reactive({
  page: 1,
  pageSize: 5,
  total: 0,
})
const requestPagination = reactive({
  page: 1,
  pageSize: 8,
  total: 0,
})

const approvalStatusLabelMap = {
  pending_approval: '待审批',
  approved: '已通过',
  rejected: '已驳回',
}

const deliveryStatusLabelMap = {
  draft: '草稿',
  queued: '已入队',
  processing: '发送中',
  sent: '已发送',
  failed: '发送失败',
}

const approvalActionLabelMap = {
  submit: '提交申请',
  approve: '审批通过',
  reject: '审批驳回',
}

const senderForm = reactive({
  name: 'Pixris 通知中心',
  email: 'noreply@email.pixris.online',
  replyToEmail: 'support@email.pixris.online',
})

const requestForm = reactive({
  templateId: '',
  senderIdentityId: '',
  toRecipients: '',
  sourceProject: 'manual-console',
  templatePayload: '{\n  "name": "Pixris 用户"\n}',
})

const approvedTemplates = computed(() => templates.value.filter((item) => item.status === 'approved'))

function parsePayload() {
  try {
    return JSON.parse(requestForm.templatePayload || '{}')
  } catch {
    return {}
  }
}

function buildDownloadUrl(downloadPath) {
  if (!downloadPath) {
    return '#'
  }

  const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
  const normalizedBaseUrl = rawBaseUrl === '/api'
    ? ''
    : rawBaseUrl.replace(/\/$/, '')
  return `${normalizedBaseUrl}${downloadPath}`
}

function formatFileSize(size) {
  const numeric = Number(size || 0)
  if (numeric < 1024) {
    return `${numeric} B`
  }

  const kb = numeric / 1024
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`
  }

  return `${(kb / 1024).toFixed(2)} MB`
}

function formatDateTime(value) {
  if (!value) {
    return '未知'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  })
}

async function loadSenderOptions() {
  const { data } = await api.get('/sender-identities', {
    params: { all: true },
  })
  senderOptions.value = data.items || []
}

async function loadApprovedTemplates() {
  const { data } = await api.get('/templates', {
    params: { all: true },
  })
  templates.value = data.items || []
}

function syncSenderDetailForm() {
  senderDetailForm.name = selectedSenderDetail.value?.name || ''
}

async function fetchSenderDetail(senderId) {
  senderDetailLoading.value = true
  try {
    const { data } = await api.get(`/sender-identities/${senderId}`)
    selectedSenderDetail.value = data.sender
    syncSenderDetailForm()
  } finally {
    senderDetailLoading.value = false
  }
}

async function openSenderDrawer(senderId) {
  selectedSenderId.value = senderId
  senderDrawerVisible.value = true
  await fetchSenderDetail(senderId)
}

async function loadSenderData(page = senderPagination.page) {
  senderPanelLoading.value = true
  try {
    const { data } = await api.get('/sender-identities', {
      params: {
        page,
        pageSize: senderPagination.pageSize,
      },
    })

    senders.value = data.items || []
    senderPagination.page = data.page || page
    senderPagination.pageSize = data.pageSize || senderPagination.pageSize
    senderPagination.total = data.total || 0

    await loadSenderOptions()

    if (senderDrawerVisible.value && selectedSenderId.value) {
      const exists = senderOptions.value.find((item) => item.id === selectedSenderId.value)
      if (exists) {
        await fetchSenderDetail(selectedSenderId.value)
      } else {
        senderDrawerVisible.value = false
        selectedSenderId.value = ''
        selectedSenderDetail.value = null
      }
    }
  } finally {
    senderPanelLoading.value = false
  }
}

async function loadRequestData(page = requestPagination.page) {
  mainDataLoading.value = true
  try {
    const [templatesResponse, requestsResponse] = await Promise.all([
      api.get('/templates', {
        params: { all: true },
      }),
      api.get('/send-requests/pending-approval', {
        params: {
          page,
          pageSize: requestPagination.pageSize,
        },
      }),
    ])

    templates.value = templatesResponse.data.items || []
    requests.value = requestsResponse.data.items || []
    requestPagination.page = requestsResponse.data.page || page
    requestPagination.pageSize = requestsResponse.data.pageSize || requestPagination.pageSize
    requestPagination.total = requestsResponse.data.total || 0

    if (selectedRequest.value) {
      const refreshed = requests.value.find((item) => item.id === selectedRequest.value.id)
      if (refreshed) {
        await selectRequest(refreshed)
      } else {
        selectedRequest.value = null
        approvalLogs.value = []
        attachments.value = []
      }
    } else if (requests.value.length) {
      await selectRequest(requests.value[0])
    }
  } finally {
    mainDataLoading.value = false
  }
}

async function loadData() {
  loading.value = true
  try {
    await Promise.all([
      loadSenderData(senderPagination.page),
      loadRequestData(requestPagination.page),
    ])
  } finally {
    loading.value = false
  }
}

async function loadAttachments(sendRequestId) {
  const { data } = await api.get(`/send-requests/${sendRequestId}/attachments`)
  attachments.value = data
}

async function createSender() {
  senderSubmitting.value = true
  try {
    const { data } = await api.post('/sender-identities', senderForm)
    await loadSenderData(1)
    requestForm.senderIdentityId = data.id
    ElMessage.success('发件人创建成功。')
    await openSenderDrawer(data.id)
  } finally {
    senderSubmitting.value = false
  }
}

async function handleSenderPageChange(page) {
  await loadSenderData(page)
}

async function updateSenderName() {
  if (!selectedSenderDetail.value) {
    return
  }

  senderUpdating.value = true
  try {
    await api.put(`/sender-identities/${selectedSenderDetail.value.id}`, {
      name: senderDetailForm.name,
    })
    await loadSenderData(senderPagination.page)
    ElMessage.success('发件人名称已更新。')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    senderUpdating.value = false
  }
}

async function removeSender(sender) {
  try {
    await ElMessageBox.confirm(
      `确定删除发件人 ${sender.email} 吗？`,
      '删除确认',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  senderDeleting.value = true
  try {
    await api.delete(`/sender-identities/${sender.id}`)
    ElMessage.success('发件人删除成功。')
    senderDrawerVisible.value = false
    selectedSenderId.value = ''
    selectedSenderDetail.value = null

    const maxPage = Math.max(1, Math.ceil((Math.max(senderPagination.total - 1, 0)) / senderPagination.pageSize))
    await loadSenderData(Math.min(senderPagination.page, maxPage))
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message)
  } finally {
    senderDeleting.value = false
  }
}

async function createSendRequest() {
  requestSubmitting.value = true
  try {
    const { data } = await api.post('/send-requests', {
      templateId: requestForm.templateId,
      senderIdentityId: requestForm.senderIdentityId,
      toRecipients: requestForm.toRecipients,
      sourceProject: requestForm.sourceProject,
      templatePayload: parsePayload(),
    })
    await loadRequestData(1)
    const createdItem = requests.value.find((item) => item.id === data.id)
    if (createdItem) {
      await selectRequest(createdItem)
    }
    ElMessage.success('发送申请已创建，现在可以上传附件并提交审批。')
  } finally {
    requestSubmitting.value = false
  }
}

async function selectRequest(item) {
  selectedRequest.value = item
  requestDetailLoading.value = true
  try {
    const [logsResponse] = await Promise.all([
      api.get(`/send-requests/${item.id}/approval-logs`),
      loadAttachments(item.id),
    ])
    approvalLogs.value = logsResponse.data
  } finally {
    requestDetailLoading.value = false
  }
}

async function handleRequestPageChange(page) {
  selectedRequest.value = null
  approvalLogs.value = []
  attachments.value = []
  await loadRequestData(page)
}

async function uploadAttachment(option) {
  if (!selectedRequest.value) {
    ElMessage.error('请先选择一个发送申请。')
    return
  }

  attachmentUploading.value = true
  const formData = new FormData()
  formData.append('file', option.file)

  try {
    const { data } = await api.post(`/send-requests/${selectedRequest.value.id}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    attachments.value = [data, ...attachments.value]
    selectedRequest.value.attachments = attachments.value
    option.onSuccess(data)
    ElMessage.success('附件上传成功。')
  } catch (error) {
    const message = error.response?.data?.message || error.message
    option.onError(error)
    ElMessage.error(message)
  } finally {
    attachmentUploading.value = false
  }
}

async function removeAttachment(attachment) {
  attachmentDeleteId.value = attachment.id
  try {
    await api.delete(`/attachments/${attachment.id}`)
    if (selectedRequest.value) {
      await loadAttachments(selectedRequest.value.id)
      selectedRequest.value.attachments = attachments.value
    }
    ElMessage.success('附件已删除。')
  } finally {
    attachmentDeleteId.value = ''
  }
}

async function reviewRequest(action) {
  if (!selectedRequest.value) {
    return
  }

  approvalSubmitting.value = true
  approvalMessage.value = ''

  try {
    const { data } = await api.post(`/send-requests/${selectedRequest.value.id}/review`, {
      action,
      comment: approvalComment.value,
    })
    approvalType.value = 'success'
    approvalMessage.value = data.message
    approvalComment.value = ''
    selectedRequest.value = null
    approvalLogs.value = []
    attachments.value = []
    await loadRequestData(1)
  } catch (error) {
    approvalType.value = 'error'
    approvalMessage.value = error.response?.data?.message || error.message
  } finally {
    approvalSubmitting.value = false
  }
}

onMounted(loadData)
</script>

