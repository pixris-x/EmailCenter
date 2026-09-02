// 日志清理脚本：按保留天数分批删除过期日志，避免日志表无限膨胀。
// 用法：
//   pnpm logs:purge                        # 删除超过 LOG_RETENTION_DAYS（默认 180）天的日志
//   node scripts/purge-old-logs.js --days 30
//   node scripts/purge-old-logs.js --dry-run   # 只统计不删除
// 建议通过宝塔计划任务每日执行一次。
const { sequelize, isDatabaseConfigured } = require('../src/config/database');

// 各日志表的时间列（mail_feedback_events 使用 received_at）
const LOG_TABLES = [
  { table: 'email_logs', column: 'created_at' },
  { table: 'audit_logs', column: 'created_at' },
  { table: 'send_approval_logs', column: 'created_at' },
  { table: 'template_review_logs', column: 'created_at' },
  { table: 'mail_feedback_events', column: 'received_at' },
];

function parseArgs() {
  const args = process.argv.slice(2);
  let days = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      days = Number(args[i + 1]);
      i++;
    }
    if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }
  return { days, dryRun };
}

async function tableExists(tableName) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = CURRENT_SCHEMA() AND table_name = :name LIMIT 1;`,
    { replacements: { name: tableName } },
  );
  return rows.length > 0;
}

async function countRows(tableName, column, cutoff) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*)::int AS total FROM "${tableName}" WHERE "${column}" < :cutoff;`,
    { replacements: { cutoff } },
  );
  return rows[0].total;
}

// 分批删除（单条 SQL 最多 batchSize 行），避免长事务锁表。
async function deleteBatch(tableName, column, cutoff, batchSize = 1000) {
  await sequelize.query(
    `DELETE FROM "${tableName}" WHERE id IN (
       SELECT id FROM "${tableName}" WHERE "${column}" < :cutoff LIMIT :batchSize
     );`,
    { replacements: { cutoff, batchSize }, type: sequelize.QueryTypes.DELETE },
  );
}

async function main() {
  if (!isDatabaseConfigured()) {
    throw new Error('Database configuration is incomplete.');
  }

  const { days, dryRun } = parseArgs();
  const retentionDays = days === null
    ? Number(process.env.LOG_RETENTION_DAYS || 180)
    : days;

  if (!Number.isFinite(retentionDays) || retentionDays < 0) {
    throw new Error('Invalid retention days.');
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  console.log(`日志保留天数：${retentionDays}，清理时间早于 ${cutoff.toISOString()}${dryRun ? '（DRY-RUN，不实际删除）' : ''}`);

  await sequelize.authenticate();

  for (const { table: tableName, column } of LOG_TABLES) {
    if (!(await tableExists(tableName))) {
      console.log(`- ${tableName}: 表不存在，跳过`);
      continue;
    }

    const total = await countRows(tableName, column, cutoff);
    if (total === 0) {
      console.log(`- ${tableName}: 无过期数据`);
      continue;
    }

    if (dryRun) {
      console.log(`- ${tableName}: 将删除 ${total} 行`);
      continue;
    }

    let deleted = 0;
    let safety = 0;
    // pg 的 DELETE 不返回影响行数，用「删除前后计数差」驱动分批循环直至清空。
    while (true) {
      const before = await countRows(tableName, column, cutoff);
      if (before === 0) {
        break;
      }
      await deleteBatch(tableName, column, cutoff);
      const after = await countRows(tableName, column, cutoff);
      deleted += before - after;
      if (after >= before || ++safety > 1000) {
        break;
      }
    }

    console.log(`- ${tableName}: 已删除 ${deleted} 行`);
  }

  await sequelize.close();
}

main().catch(async (error) => {
  console.error(`日志清理失败：${error.message}`);
  try {
    await sequelize.close();
  } catch {
    // ignore close failure on exit
  }
  process.exit(1);
});
