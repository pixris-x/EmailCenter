<template>
  <div class="login-page">
    <el-card class="login-card login-card--floating" shadow="never">
      <div class="login-card__header">
        <div class="login-card__eyebrow">欢迎回来</div>
        <h2>管理员登录</h2>
      </div>

      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        show-icon
        :closable="false"
        class="login-card__alert"
      />

      <el-form label-position="top" @submit.prevent="handleSubmit">
        <el-form-item label="管理员邮箱">
          <el-input v-model="form.email" size="large" placeholder="请输入管理员邮箱" />
        </el-form-item>
        <el-form-item label="登录密码">
          <el-input
            v-model="form.password"
            size="large"
            type="password"
            show-password
            placeholder="请输入登录密码"
          />
        </el-form-item>
        <el-button type="primary" size="large" class="login-card__button" @click="handleSubmit" :loading="submitting">
          登录后台
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const submitting = ref(false)
const errorMessage = ref('')

const form = reactive({
  email: '',
  password: '',
})

async function handleSubmit() {
  submitting.value = true
  errorMessage.value = ''

  try {
    await authStore.signIn({
      email: form.email,
      password: form.password,
    })
    router.push({ name: 'dashboard' })
  } catch (error) {
    errorMessage.value = error.response?.data?.message || error.message
  } finally {
    submitting.value = false
  }
}
</script>
