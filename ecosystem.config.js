// PM2 进程编排（不含任何密钥；密钥全部来自仓库根 .env，由应用启动时加载）。
//
// 使用（在服务器仓库根执行）：
//   pm2 start ecosystem.config.js
//   pm2 save          # 保存进程列表，重启后自动恢复
//   pm2 startup       # 按提示执行输出的一次性命令以开启开机自启
//
// 若项目目录不是下面的默认路径，请修改 APP_ROOT。

const APP_ROOT = '/www/wwwroot/EmailCenter';

module.exports = {
  apps: [
    {
      name: 'email_center_api',
      script: 'backend/src/server.js',
      cwd: APP_ROOT,
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      time: true,
    },
    {
      name: 'email_center_worker',
      script: 'backend/src/workers/email-worker.js',
      cwd: APP_ROOT,
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      time: true,
    },
  ],
};
