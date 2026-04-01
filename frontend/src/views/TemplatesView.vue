<template>
  <div class="panel-stack templates-grid">
    <section class="panel-card" v-loading="categoryLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">模板分类</p>
          <h3>维护模板分类</h3>
        </div>
        <el-button @click="refreshCategories" :loading="categoryLoading">刷新</el-button>
      </div>

      <el-form label-position="top" @submit.prevent="createCategory">
        <div class="form-grid">
          <el-form-item label="分类名称">
            <el-input v-model="categoryForm.name" placeholder="账号通知" />
          </el-form-item>
          <el-form-item label="分类标识">
            <el-input v-model="categoryForm.slug" placeholder="account-notify" />
          </el-form-item>
        </div>
        <el-form-item label="分类说明">
          <el-input v-model="categoryForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-button type="primary" @click="createCategory" :loading="categorySubmitting">创建分类</el-button>
      </el-form>

      <div class="list-stack">
        <article v-for="category in categories" :key="category.id" class="list-card">
          <strong>{{ category.name }}</strong>
          <span>{{ category.slug }}</span>
          <p>{{ category.description || '暂无说明。' }}</p>
        </article>
        <el-empty v-if="!categories.length && !categoryLoading" description="暂无模板分类" />
      </div>

      <div class="list-pagination" v-if="categoryPagination.total > 0">
        <el-pagination
          layout="prev, pager, next"
          :current-page="categoryPagination.page"
          :page-size="categoryPagination.pageSize"
          :total="categoryPagination.total"
          @current-change="handleCategoryPageChange"
          :hide-on-single-page="false"
        />
      </div>
    </section>

    <section class="panel-card" v-loading="templateLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">模板管理</p>
          <h3>创建、编辑并预览模板</h3>
        </div>
        <div class="button-row">
          <el-button @click="refreshTemplates" :loading="templateLoading">刷新列表</el-button>
          <el-button @click="resetTemplateForm">新建模板</el-button>
        </div>
      </div>

      <el-form label-position="top" @submit.prevent="submitTemplate">
        <div class="form-grid">
          <el-form-item label="模板名称">
            <el-input v-model="templateForm.name" placeholder="欢迎邮件" />
          </el-form-item>
          <el-form-item label="模板编码">
            <el-input v-model="templateForm.code" placeholder="welcome_email" />
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item label="所属分类">
            <el-select v-model="templateForm.categoryId" placeholder="请选择分类" clearable>
              <el-option v-for="category in categoryOptions" :key="category.id" :label="category.name" :value="category.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="模板状态">
            <el-select v-model="templateForm.status">
              <el-option label="草稿" value="draft" />
              <el-option label="待审核" value="pending_review" />
              <el-option label="已通过" value="approved" />
              <el-option label="已驳回" value="rejected" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="邮件标题">
          <el-input v-model="templateForm.subject" placeholder="欢迎你，{{name}}" />
        </el-form-item>
        <el-form-item label="变量列表（逗号分隔）">
          <el-input v-model="templateForm.variablesSchema" placeholder="name, login_url" />
        </el-form-item>
        <el-form-item label="HTML 内容">
          <el-input v-model="templateForm.htmlContent" type="textarea" :rows="8" />
        </el-form-item>
        <el-form-item label="纯文本内容">
          <el-input v-model="templateForm.textContent" type="textarea" :rows="4" />
        </el-form-item>
        <div class="button-row">
          <el-button type="primary" @click="submitTemplate" :loading="templateSubmitting">
            {{ selectedTemplateId ? '保存模板' : '创建模板' }}
          </el-button>
          <el-button @click="previewTemplate" :loading="previewLoading">预览渲染</el-button>
          <el-button
            v-if="selectedTemplateId"
            @click="submitTemplateForReview(selectedTemplateId)"
            :loading="reviewSubmitting"
            :disabled="templateForm.status === 'pending_review' || templateForm.status === 'approved'"
          >
            提交审核
          </el-button>
          <el-button v-if="selectedTemplateId" @click="resetTemplateForm">重置</el-button>
        </div>
      </el-form>

      <el-alert v-if="previewMessage" :title="previewMessage" :type="previewType" show-icon :closable="false" />

      <div v-if="preview.subject || preview.htmlContent" class="preview-card">
        <strong>预览标题</strong>
        <p>{{ preview.subject }}</p>
        <strong>预览 HTML</strong>
        <div class="preview-card__html" v-html="preview.htmlContent"></div>
      </div>

      <div class="list-stack">
        <article
          v-for="template in templates"
          :key="template.id"
          class="list-card list-card--interactive"
          :class="{ 'list-card--selected': selectedTemplateDetail?.id === template.id && templateDrawerVisible }"
          @click="openTemplateDrawer(template)"
        >
          <strong>{{ template.name }}</strong>
          <span>{{ template.code }} · {{ statusLabelMap[template.status] || template.status }}</span>
          <p>{{ template.subject }}</p>
        </article>
        <el-empty v-if="!templates.length && !templateLoading" description="暂无模板" />
      </div>

      <div class="list-pagination" v-if="templatePagination.total > 0">
        <el-pagination
          layout="prev, pager, next"
          :current-page="templatePagination.page"
          :page-size="templatePagination.pageSize"
          :total="templatePagination.total"
          @current-change="handleTemplatePageChange"
          :hide-on-single-page="false"
        />
      </div>
    </section>

    <el-drawer v-model="templateDrawerVisible" title="模板详情" size="460px" :with-header="true" :destroy-on-close="false">
      <div v-loading="templateDetailLoading" class="sender-drawer-body">
        <template v-if="selectedTemplateDetail">
          <div class="preview-card">
            <strong>{{ selectedTemplateDetail.name }}</strong>
            <p>模板编码：{{ selectedTemplateDetail.code }}</p>
            <p>分类：{{ resolveCategoryName(selectedTemplateDetail.categoryId) }}</p>
            <p>状态：{{ statusLabelMap[selectedTemplateDetail.status] || selectedTemplateDetail.status }}</p>
            <p>邮件标题：{{ selectedTemplateDetail.subject }}</p>
            <div class="button-row sender-detail-actions">
              <el-button type="primary" @click="loadTemplateIntoForm(selectedTemplateDetail)">载入表单编辑</el-button>
              <el-button
                @click="submitTemplateForReview(selectedTemplateDetail.id)"
                :loading="reviewSubmitting"
                :disabled="selectedTemplateDetail.status === 'pending_review' || selectedTemplateDetail.status === 'approved'"
              >
                提交审核
              </el-button>
            </div>
          </div>

          <div class="preview-card">
            <strong>HTML 预览</strong>
            <div class="preview-card__html" v-html="selectedTemplateDetail.htmlContent"></div>
            <strong>纯文本内容</strong>
            <div class="preview-card__code">{{ selectedTemplateDetail.textContent || '暂无纯文本内容。' }}</div>
          </div>

          <div class="list-stack" v-if="templateReviewLogs.length">
            <article v-for="log in templateReviewLogs" :key="log.id" class="list-card">
              <strong>{{ reviewActionLabelMap[log.action] || log.action }}</strong>
              <span>{{ formatDateTime(log.createdAt || log.created_at) }}</span>
              <p>{{ log.comment || '暂无备注' }}</p>
            </article>
          </div>
          <el-empty v-else description="该模板暂无审核记录" />
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../lib/api'

const categoryLoading = ref(false)
const templateLoading = ref(false)
const categorySubmitting = ref(false)
const templateSubmitting = ref(false)
const reviewSubmitting = ref(false)
const previewLoading = ref(false)
const templateDetailLoading = ref(false)
const previewMessage = ref('')
const previewType = ref('success')
const selectedTemplateId = ref('')
const templateDrawerVisible = ref(false)
const selectedTemplateDetail = ref(null)
const templateReviewLogs = ref([])

const categories = ref([])
const categoryOptions = ref([])
const templates = ref([])
const preview = reactive({
  subject: '',
  htmlContent: '',
  textContent: '',
})
const categoryPagination = reactive({
  page: 1,
  pageSize: 5,
  total: 0,
})
const templatePagination = reactive({
  page: 1,
  pageSize: 6,
  total: 0,
})

const statusLabelMap = {
  draft: '草稿',
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已驳回',
}

const reviewActionLabelMap = {
  submit_review: '提交审核',
  approve: '审核通过',
  reject: '审核驳回',
}

const categoryForm = reactive({
  name: '',
  slug: '',
  description: '',
})

const templateForm = reactive({
  name: '',
  code: '',
  categoryId: '',
  status: 'draft',
  subject: '欢迎你，{{name}}',
  variablesSchema: 'name, login_url',
  htmlContent: '<p>你好 {{name}}，</p><p>你的登录地址是 <a href="{{login_url}}">{{login_url}}</a>。</p>',
  textContent: '你好 {{name}}，你的登录地址是 {{login_url}}。',
})

function resetTemplateForm() {
  selectedTemplateId.value = ''
  templateForm.name = ''
  templateForm.code = ''
  templateForm.categoryId = ''
  templateForm.status = 'draft'
  templateForm.subject = '欢迎你，{{name}}'
  templateForm.variablesSchema = 'name, login_url'
  templateForm.htmlContent = '<p>你好 {{name}}，</p><p>你的登录地址是 <a href="{{login_url}}">{{login_url}}</a>。</p>'
  templateForm.textContent = '你好 {{name}}，你的登录地址是 {{login_url}}。'
}

function mapVariablesSchema(schema) {
  return Object.keys(schema || {}).join(', ')
}

function resolveCategoryName(categoryId) {
  if (!categoryId) {
    return '未分类'
  }

  return categoryOptions.value.find((item) => item.id === categoryId)?.name || '未分类'
}

function applyTemplateToForm(template) {
  selectedTemplateId.value = template.id
  templateForm.name = template.name
  templateForm.code = template.code
  templateForm.categoryId = template.categoryId || ''
  templateForm.status = template.status
  templateForm.subject = template.subject
  templateForm.variablesSchema = mapVariablesSchema(template.variablesSchema)
  templateForm.htmlContent = template.htmlContent
  templateForm.textContent = template.textContent || ''
}

function loadTemplateIntoForm(template) {
  applyTemplateToForm(template)
  templateDrawerVisible.value = false
  ElMessage.success('模板已载入编辑表单。')
}

function formatDateTime(value) {
  if (!value) {
    return '未知'
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  })
}

async function loadCategoryOptions() {
  const { data } = await api.get('/template-categories', {
    params: { all: true },
  })
  categoryOptions.value = data.items || []
}

async function loadCategories(page = categoryPagination.page) {
  categoryLoading.value = true
  try {
    const { data } = await api.get('/template-categories', {
      params: {
        page,
        pageSize: categoryPagination.pageSize,
      },
    })

    categories.value = data.items || []
    categoryPagination.page = data.page || page
    categoryPagination.pageSize = data.pageSize || categoryPagination.pageSize
    categoryPagination.total = data.total || 0
    await loadCategoryOptions()
  } finally {
    categoryLoading.value = false
  }
}

async function loadTemplateReviewLogs(templateId) {
  const { data } = await api.get(`/templates/${templateId}/review-logs`)
  templateReviewLogs.value = data
}

async function openTemplateDrawer(template) {
  templateDrawerVisible.value = true
  templateDetailLoading.value = true
  selectedTemplateDetail.value = template

  try {
    await loadTemplateReviewLogs(template.id)
  } finally {
    templateDetailLoading.value = false
  }
}

async function loadTemplates(page = templatePagination.page) {
  templateLoading.value = true
  try {
    const { data } = await api.get('/templates', {
      params: {
        page,
        pageSize: templatePagination.pageSize,
      },
    })

    templates.value = data.items || []
    templatePagination.page = data.page || page
    templatePagination.pageSize = data.pageSize || templatePagination.pageSize
    templatePagination.total = data.total || 0

    if (templateDrawerVisible.value && selectedTemplateDetail.value) {
      const matched = templates.value.find((item) => item.id === selectedTemplateDetail.value.id)
      if (matched) {
        selectedTemplateDetail.value = matched
        await loadTemplateReviewLogs(matched.id)
      } else {
        templateDrawerVisible.value = false
        selectedTemplateDetail.value = null
        templateReviewLogs.value = []
      }
    }

    if (selectedTemplateId.value) {
      const editingTemplate = templates.value.find((item) => item.id === selectedTemplateId.value)
      if (editingTemplate) {
        applyTemplateToForm(editingTemplate)
      }
    }
  } finally {
    templateLoading.value = false
  }
}

async function loadData() {
  await Promise.all([
    loadCategories(categoryPagination.page),
    loadTemplates(templatePagination.page),
  ])
}

async function refreshCategories() {
  await loadCategories(categoryPagination.page)
}

async function refreshTemplates() {
  await loadTemplates(templatePagination.page)
}

async function createCategory() {
  categorySubmitting.value = true
  try {
    await api.post('/template-categories', categoryForm)
    categoryForm.name = ''
    categoryForm.slug = ''
    categoryForm.description = ''
    await loadCategories(1)
    ElMessage.success('模板分类创建成功。')
  } finally {
    categorySubmitting.value = false
  }
}

async function submitTemplate() {
  templateSubmitting.value = true
  const isEditing = Boolean(selectedTemplateId.value)

  try {
    let savedId = selectedTemplateId.value

    if (isEditing) {
      await api.put(`/templates/${selectedTemplateId.value}`, templateForm)
    } else {
      const { data } = await api.post('/templates', templateForm)
      savedId = data.id
    }

    await loadTemplates(1)

    const savedTemplate = templates.value.find((item) => item.id === savedId)
    if (savedTemplate) {
      applyTemplateToForm(savedTemplate)
      selectedTemplateDetail.value = savedTemplate
    }

    ElMessage.success(isEditing ? '模板已保存。' : '模板已创建。')
  } finally {
    templateSubmitting.value = false
  }
}

async function submitTemplateForReview(templateId) {
  if (!templateId) {
    return
  }

  reviewSubmitting.value = true
  try {
    await api.post(`/templates/${templateId}/submit-review`, {
      comment: '模板已从模板管理页提交审核。',
    })
    await loadTemplates(templatePagination.page)
    const matched = templates.value.find((item) => item.id === templateId)
    if (matched) {
      selectedTemplateDetail.value = matched
      if (selectedTemplateId.value === templateId) {
        applyTemplateToForm(matched)
      }
    }
    ElMessage.success('模板已提交审核。')
  } finally {
    reviewSubmitting.value = false
  }
}

async function previewTemplate() {
  previewLoading.value = true
  previewMessage.value = ''

  try {
    const { data } = await api.post('/templates/preview', {
      subject: templateForm.subject,
      htmlContent: templateForm.htmlContent,
      textContent: templateForm.textContent,
      payload: {
        name: 'Pixris 用户',
        login_url: 'https://email.pixris.online/login',
      },
    })

    preview.subject = data.subject
    preview.htmlContent = data.htmlContent
    preview.textContent = data.textContent
    previewType.value = 'success'
    previewMessage.value = '模板预览生成成功。'
  } catch (error) {
    previewType.value = 'error'
    previewMessage.value = error.response?.data?.message || error.message
  } finally {
    previewLoading.value = false
  }
}

async function handleCategoryPageChange(page) {
  await loadCategories(page)
}

async function handleTemplatePageChange(page) {
  await loadTemplates(page)
}

onMounted(async () => {
  await loadData()
  resetTemplateForm()
})
</script>
