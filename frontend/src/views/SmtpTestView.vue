<template>
  <div class="panel-stack">
    <section class="panel-card">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">SMTP</p>
          <h3>Resend SMTP 健康检查与测试发送</h3>
        </div>
        <el-button @click="checkHealth" :loading="healthLoading">检查连接</el-button>
      </div>

      <el-alert
        v-if="healthMessage"
        :title="healthMessage"
        :type="healthStatus"
        show-icon
        :closable="false"
      />
    </section>

    <section class="panel-card">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">测试发信</p>
          <h3>发送一封真实的 SMTP 测试邮件</h3>
        </div>
      </div>

      <el-form label-position="top" @submit.prevent="sendTestEmail">
        <el-form-item label="收件邮箱">
          <el-input v-model="form.to" placeholder="your@email.com" />
        </el-form-item>
        <el-form-item label="邮件标题">
          <el-input v-model="form.subject" placeholder="邮件中心 SMTP 测试" />
        </el-form-item>
        <el-form-item label="HTML 内容">
          <el-input v-model="form.html" type="textarea" :rows="6" />
        </el-form-item>
        <el-button type="primary" @click="sendTestEmail" :loading="sendLoading">
          发送测试邮件
        </el-button>
      </el-form>

      <el-alert
        v-if="sendMessage"
        :title="sendMessage"
        :type="sendStatus"
        show-icon
        :closable="false"
      />
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import api from '../lib/api'

const healthLoading = ref(false)
const healthMessage = ref('')
const healthStatus = ref('info')

const sendLoading = ref(false)
const sendMessage = ref('')
const sendStatus = ref('info')

const form = reactive({
  to: '',
  subject: '邮件中心 SMTP 测试',
  html: '<p>这是一封来自 Pixris 邮件中心的测试邮件。</p>',
})

async function checkHealth() {
  healthLoading.value = true
  healthMessage.value = ''

  try {
    await api.get('/mail/health')
    healthStatus.value = 'success'
    healthMessage.value = 'SMTP 连接校验通过。'
  } catch (error) {
    healthStatus.value = 'error'
    healthMessage.value = error.response?.data?.message || error.message
  } finally {
    healthLoading.value = false
  }
}

async function sendTestEmail() {
  sendLoading.value = true
  sendMessage.value = ''

  try {
    const { data } = await api.post('/mail/test', {
      to: form.to,
      subject: form.subject,
      html: form.html,
    })
    sendStatus.value = 'success'
    sendMessage.value = `${data.message}，消息 ID：${data.result.messageId}`
  } catch (error) {
    sendStatus.value = 'error'
    sendMessage.value = error.response?.data?.message || error.message
  } finally {
    sendLoading.value = false
  }
}
</script>
