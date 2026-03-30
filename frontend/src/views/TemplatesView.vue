<template>
  <div class="panel-stack templates-grid">
    <section class="panel-card">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">模板分类</p>
          <h3>维护模板分类</h3>
        </div>
        <el-button @click="loadData" :loading="loading">刷新</el-button>
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
      </div>
    </section>

    <section class="panel-card">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">模板管理</p>
          <h3>创建、编辑并预览模板</h3>
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
              <el-option v-for="category in categories" :key="category.id" :label="category.name" :value="category.id" />
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
          <el-button v-if="selectedTemplateId" @click="submitForReview" :loading="submitReviewLoading">提交审核</el-button>
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
        <article v-for="template in templates" :key="template.id" class="list-card list-card--interactive" @click="editTemplate(template)">
          <strong>{{ template.name }}</strong>
          <span>{{ template.code }} · {{ statusLabelMap[template.status] || template.status }}</span>
          <p>{{ template.subject }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import api from '../lib/api'

const loading = ref(false)
const categorySubmitting = ref(false)
const templateSubmitting = ref(false)
const submitReviewLoading = ref(false)
const previewLoading = ref(false)
const previewMessage = ref('')
const previewType = ref('success')
const selectedTemplateId = ref('')

const categories = ref([])
const templates = ref([])
const preview = reactive({
  subject: '',
  htmlContent: '',
  textContent: '',
})

const statusLabelMap = {
  draft: '草稿',
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已驳回',
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

function editTemplate(template) {
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

async function loadData() {
  loading.value = true
  try {
    const [categoriesResponse, templatesResponse] = await Promise.all([
      api.get('/template-categories'),
      api.get('/templates'),
    ])
    categories.value = categoriesResponse.data
    templates.value = templatesResponse.data
  } finally {
    loading.value = false
  }
}

async function createCategory() {
  categorySubmitting.value = true
  try {
    await api.post('/template-categories', categoryForm)
    categoryForm.name = ''
    categoryForm.slug = ''
    categoryForm.description = ''
    await loadData()
  } finally {
    categorySubmitting.value = false
  }
}

async function submitTemplate() {
  templateSubmitting.value = true
  try {
    if (selectedTemplateId.value) {
      await api.put(`/templates/${selectedTemplateId.value}`, templateForm)
    } else {
      await api.post('/templates', templateForm)
    }
    await loadData()
    resetTemplateForm()
  } finally {
    templateSubmitting.value = false
  }
}

async function submitForReview() {
  if (!selectedTemplateId.value) {
    return
  }

  submitReviewLoading.value = true
  try {
    await api.post(`/templates/${selectedTemplateId.value}/submit-review`, {
      comment: '模板已从模板管理页提交审核。',
    })
    await loadData()
    resetTemplateForm()
  } finally {
    submitReviewLoading.value = false
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

onMounted(async () => {
  await loadData()
  resetTemplateForm()
})
</script>
