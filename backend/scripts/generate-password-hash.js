const bcrypt = require('bcryptjs');

// 用法：pnpm --dir backend admin:hash 你的密码
async function main() {
  const password = process.argv[2];

  if (!password) {
    console.error('请提供要生成哈希的密码。');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  console.log(passwordHash);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
