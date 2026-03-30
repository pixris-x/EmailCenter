const { enqueueEmailJob, closeEmailQueue } = require('../src/queues/email-queue');

async function run() {
  const job = await enqueueEmailJob({
    type: 'local_cli_test',
    to: ['test@pixris.online'],
    subject: 'BullMQ local test',
    payload: {
      hello: 'world',
      timestamp: new Date().toISOString(),
    },
  });

  console.log(`Queued test job: ${job.id}`);
  await closeEmailQueue();
}

run().catch(async (error) => {
  console.error(`Queue test failed: ${error.message}`);
  try {
    await closeEmailQueue();
  } catch (closeError) {
    // ignore queue close failure while exiting
  }
  process.exit(1);
});