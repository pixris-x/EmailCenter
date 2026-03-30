<template>
  <div class="panel-stack templates-grid">
    <section class="panel-card">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">发件人管理</p>
          <h3>维护发件人身份</h3>
        </div>
        <el-button @click="loadData" :loading="loading">刷新</el-button>
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

      <div class="list-stack">
        <article v-for="sender in senders" :key="sender.id" class="list-card">
          <strong>{{ sender.name }}</strong>
          <span>{{ sender.email }}</span>
          <p>{{ sender.status === 'active' ? '启用中' : sender.status }}</p>
        </article>
      </div>
    </section>

    <section class="panel-card">
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
              <el-option v-for="sender in senders" :key="sender.id" :label="sender.email" :value="sender.id" />
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

    <section class="panel-card">
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
        <el-empty v-if="!requests.length" description="暂无待审批发送申请" />
      </div>
    </section>

    <section class="panel-card" v-if="selectedRequest">
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
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../lib/api'

const loading = ref(false)
const senderSubmitting = ref(false)
const requestSubmitting = ref(false)
const approvalSubmitting = ref(false)
const attachmentUploading = ref(false)
const approvalMessage = ref('')
const approvalType = ref('success')
const approvalComment = ref('')

const senders = ref([])
const templates = ref([])
const requests = ref([])
const selectedRequest = ref(null)
const approvalLogs = ref([])
const attachments = ref([])

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

  const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
  return `${baseUrl}${downloadPath}`
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

async function loadData() {
  loading.value = true
  try {
    const [sendersResponse, templatesResponse, requestsResponse] = await Promise.all([
      api.get('/sender-identities'),
      api.get('/templates'),
      api.get('/send-requests/pending-approval'),
    ])
    senders.value = sendersResponse.data
    templates.value = templatesResponse.data
    requests.value = requestsResponse.data

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
    await api.post('/sender-identities', senderForm)
    await loadData()
    ElMessage.success('发件人创建成功。')
  } finally {
    senderSubmitting.value = false
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
    await loadData()
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
  const [logsResponse] = await Promise.all([
    api.get(`/send-requests/${item.id}/approval-logs`),
    loadAttachments(item.id),
  ])
  approvalLogs.value = logsResponse.data
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
  await api.delete(`/attachments/${attachment.id}`)
  if (selectedRequest.value) {
    await loadAttachments(selectedRequest.value.id)
    selectedRequest.value.attachments = attachments.value
  }
  ElMessage.success('附件已删除。')
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
    await loadData()
  } catch (error) {
    approvalType.value = 'error'
    approvalMessage.value = error.response?.data?.message || error.message
  } finally {
    approvalSubmitting.value = false
  }
}

onMounted(loadData)
</script>
