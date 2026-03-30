const { pingRedis } = require('../src/config/redis');

async function run() {
  const response = await pingRedis();
  console.log(`Redis ping response: ${response}`);
}

run().catch((error) => {
  console.error(`Redis ping failed: ${error.message}`);
  process.exit(1);
});