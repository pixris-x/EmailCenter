<template>
  <div class="panel-stack templates-grid access-control-grid">
    <section class="panel-card" v-loading="rolesLoading || catalogLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">角色权限</p>
          <h3>维护角色与权限范围</h3>
        </div>
        <div class="button-row">
          <el-button @click="loadRoles(rolePagination.page)" :loading="rolesLoading">刷新</el-button>
          <el-button type="primary" @click="openRoleDrawer()">新建角色</el-button>
        </div>
      </div>

      <div class="list-stack">
        <article
          v-for="role in roles"
          :key="role.id"
          class="list-card list-card--interactive"
          :class="{ 'list-card--selected': selectedRoleId === role.id && roleDrawerVisible }"
          @click="openRoleDrawer(role)"
        >
          <strong>{{ role.roleName }}</strong>
          <span>{{ role.roleCode }} · {{ role.adminUserCount || 0 }} 个账号</span>
          <p>{{ role.description || '暂无角色说明。' }}</p>
        </article>
        <el-empty v-if="!roles.length && !rolesLoading" description="暂无角色配置" />
      </div>

      <div class="list-pagination" v-if="rolePagination.total > 0">
        <el-pagination
          layout="prev, pager, next"
          :current-page="rolePagination.page"
          :page-size="rolePagination.pageSize"
          :total="rolePagination.total"
          :hide-on-single-page="false"
          @current-change="handleRolePageChange"
        />
      </div>
    </section>

    <section class="panel-card" v-loading="usersLoading">
      <div class="panel-card__header">
        <div>
          <p class="content__eyebrow">管理员账号</p>
          <h3>维护登录账号与角色归属</h3>
        </div>
        <div class="button-row">
          <el-button @click="loadAdminUsers(userPagination.page)" :loading="usersLoading">刷新</el-button>
          <el-button type="primary" @click="openUserDrawer()">新建账号</el-button>
        </div>
      </div>

      <div class="list-stack">
        <article
          v-for="admin in adminUsers"
          :key="admin.id"
          class="list-card list-card--interactive"
          :class="{ 'list-card--selected': selectedUserId === admin.id && userDrawerVisible }"
          @click="openUserDrawer(admin)"
        >
          <strong>{{ admin.displayName }}</strong>
          <span>{{ admin.email }}</span>
          <p>{{ admin.roleName || admin.roleCode }} · {{ admin.status === 'active' ? '启用中' : '已停用' }}</p>
        </article>
        <el-empty v-if="!adminUsers.length && !usersLoading" description="暂无管理员账号" />
      </div>

      <div class="list-pagination" v-if="userPagination.total > 0">
        <el-pagination
          layout="prev, pager, next"
          :current-page="userPagination.page"
          :page-size="userPagination.pageSize"
          :total="userPagination.total"
          :hide-on-single-page="false"
          @current-change="handleUserPageChange"
        />
      </div>
    </section>

    <el-drawer v-model="roleDrawerVisible" title="角色权限" size="460px" :destroy-on-close="false">
      <div v-loading="roleSubmitting" class="sender-drawer-body">
        <el-form label-position="top" @submit.prevent="submitRole">
          <div class="form-grid">
            <el-form-item label="角色名称">
              <el-input v-model="roleForm.roleName" placeholder="运营管理员" />
            </el-form-item>
            <el-form-item label="角色编码">
              <el-input v-model="roleForm.roleCode" placeholder="ops_admin" :disabled="Boolean(roleForm.id)" />
            </el-form-item>
          </div>
          <el-form-item label="角色说明">
            <el-input v-model="roleForm.description" type="textarea" :rows="3" />
          </el-form-item>

          <div class="permission-group" v-for="group in permissionGroups" :key="group.key">
            <strong>{{ group.label }}</strong>
            <el-checkbox-group v-model="roleForm.permissions" :disabled="roleForm.roleCode === 'super_admin'">
              <div class="permission-grid">
                <el-checkbox v-for="permission in group.permissions" :key="permission.code" :label="permission.code">
                  {{ permission.label }}
                </el-checkbox>
              </div>
            </el-checkbox-group>
          </div>

          <el-alert
            v-if="roleForm.roleCode === 'super_admin'"
            title="超级管理员默认拥有全部权限，不支持在这里收窄。"
            type="info"
            show-icon
            :closable="false"
          />

          <div class="button-row">
            <el-button type="primary" @click="submitRole" :loading="roleSubmitting">
              {{ roleForm.id ? '保存角色' : '创建角色' }}
            </el-button>
          </div>
        </el-form>
      </div>
    </el-drawer>

    <el-drawer v-model="userDrawerVisible" title="管理员账号" size="460px" :destroy-on-close="false">
      <div v-loading="userSubmitting" class="sender-drawer-body">
        <el-form label-position="top" @submit.prevent="submitAdminUser">
          <div class="form-grid">
            <el-form-item label="显示名称">
              <el-input v-model="userForm.displayName" placeholder="系统管理员" />
            </el-form-item>
            <el-form-item label="管理员邮箱">
              <el-input v-model="userForm.email" placeholder="admin@email.pixris.online" :disabled="Boolean(userForm.id)" />
            </el-form-item>
          </div>

          <div class="form-grid">
            <el-form-item label="角色">
              <el-select v-model="userForm.roleCode" placeholder="请选择角色">
                <el-option v-for="role in roleOptions" :key="role.id" :label="role.roleName" :value="role.roleCode" />
              </el-select>
            </el-form-item>
            <el-form-item label="账号状态">
              <el-select v-model="userForm.status">
                <el-option label="启用中" value="active" />
                <el-option label="已停用" value="disabled" />
              </el-select>
            </el-form-item>
          </div>

          <el-form-item :label="userForm.id ? '重置密码（留空表示不修改）' : '初始密码'">
            <el-input v-model="userForm.password" type="password" show-password placeholder="请输入登录密码" />
          </el-form-item>

          <div class="button-row">
            <el-button type="primary" @click="submitAdminUser" :loading="userSubmitting">
              {{ userForm.id ? '保存账号' : '创建账号' }}
            </el-button>
          </div>
        </el-form>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../lib/api'

const catalogLoading = ref(false)
const rolesLoading = ref(false)
const roleSubmitting = ref(false)
const usersLoading = ref(false)
const userSubmitting = ref(false)
const roleDrawerVisible = ref(false)
const userDrawerVisible = ref(false)
const selectedRoleId = ref('')
const selectedUserId = ref('')

const permissionGroups = ref([])
const roles = ref([])
const roleOptions = ref([])
const adminUsers = ref([])

const rolePagination = reactive({
  page: 1,
  pageSize: 8,
  total: 0,
})
const userPagination = reactive({
  page: 1,
  pageSize: 8,
  total: 0,
})

const roleForm = reactive({
  id: '',
  roleCode: '',
  roleName: '',
  description: '',
  permissions: [],
})

const userForm = reactive({
  id: '',
  email: '',
  displayName: '',
  roleCode: '',
  status: 'active',
  password: '',
})

function resetRoleForm() {
  roleForm.id = ''
  roleForm.roleCode = ''
  roleForm.roleName = ''
  roleForm.description = ''
  roleForm.permissions = []
}

function resetUserForm() {
  userForm.id = ''
  userForm.email = ''
  userForm.displayName = ''
  userForm.roleCode = ''
  userForm.status = 'active'
  userForm.password = ''
}

function applyRole(role) {
  roleForm.id = role.id
  roleForm.roleCode = role.roleCode
  roleForm.roleName = role.roleName
  roleForm.description = role.description || ''
  roleForm.permissions = Array.isArray(role.permissions) ? [...role.permissions] : []
}

function applyUser(admin) {
  userForm.id = admin.id
  userForm.email = admin.email
  userForm.displayName = admin.displayName
  userForm.roleCode = admin.roleCode
  userForm.status = admin.status
  userForm.password = ''
}

async function loadPermissionCatalog() {
  catalogLoading.value = true
  try {
    const { data } = await api.get('/permissions/catalog')
    permissionGroups.value = data.groups || []
  } finally {
    catalogLoading.value = false
  }
}

async function loadRoleOptions() {
  const { data } = await api.get('/roles', {
    params: { all: true },
  })
  roleOptions.value = data.items || []
}

async function loadRoles(page = rolePagination.page) {
  rolesLoading.value = true
  try {
    const { data } = await api.get('/roles', {
      params: {
        page,
        pageSize: rolePagination.pageSize,
      },
    })
    roles.value = data.items || []
    rolePagination.page = data.page || page
    rolePagination.pageSize = data.pageSize || rolePagination.pageSize
    rolePagination.total = data.total || 0
    await loadRoleOptions()
  } finally {
    rolesLoading.value = false
  }
}

async function loadAdminUsers(page = userPagination.page) {
  usersLoading.value = true
  try {
    const { data } = await api.get('/admin-users', {
      params: {
        page,
        pageSize: userPagination.pageSize,
      },
    })
    adminUsers.value = data.items || []
    userPagination.page = data.page || page
    userPagination.pageSize = data.pageSize || userPagination.pageSize
    userPagination.total = data.total || 0
  } finally {
    usersLoading.value = false
  }
}

async function loadData() {
  await Promise.all([
    loadPermissionCatalog(),
    loadRoles(rolePagination.page),
    loadAdminUsers(userPagination.page),
  ])
}

function openRoleDrawer(role = null) {
  if (role) {
    selectedRoleId.value = role.id
    applyRole(role)
  } else {
    selectedRoleId.value = ''
    resetRoleForm()
  }
  roleDrawerVisible.value = true
}

function openUserDrawer(admin = null) {
  if (admin) {
    selectedUserId.value = admin.id
    applyUser(admin)
  } else {
    selectedUserId.value = ''
    resetUserForm()
  }
  userDrawerVisible.value = true
}

async function submitRole() {
  roleSubmitting.value = true
  try {
    if (roleForm.id) {
      await api.put(`/roles/${roleForm.id}`, {
        roleName: roleForm.roleName,
        description: roleForm.description,
        permissions: roleForm.permissions,
      })
    } else {
      await api.post('/roles', {
        roleCode: roleForm.roleCode,
        roleName: roleForm.roleName,
        description: roleForm.description,
        permissions: roleForm.permissions,
      })
    }

    await loadRoles(roleForm.id ? rolePagination.page : 1)
    roleDrawerVisible.value = false
    ElMessage.success(roleForm.id ? '角色已更新。' : '角色已创建。')
  } finally {
    roleSubmitting.value = false
  }
}

async function submitAdminUser() {
  userSubmitting.value = true
  try {
    if (userForm.id) {
      await api.put(`/admin-users/${userForm.id}`, {
        displayName: userForm.displayName,
        roleCode: userForm.roleCode,
        status: userForm.status,
        password: userForm.password || undefined,
      })
    } else {
      await api.post('/admin-users', {
        email: userForm.email,
        displayName: userForm.displayName,
        roleCode: userForm.roleCode,
        status: userForm.status,
        password: userForm.password,
      })
    }

    await loadAdminUsers(userForm.id ? userPagination.page : 1)
    userDrawerVisible.value = false
    ElMessage.success(userForm.id ? '管理员账号已更新。' : '管理员账号已创建。')
  } finally {
    userSubmitting.value = false
  }
}

async function handleRolePageChange(page) {
  await loadRoles(page)
}

async function handleUserPageChange(page) {
  await loadAdminUsers(page)
}

onMounted(async () => {
  await loadData()
})
</script>
