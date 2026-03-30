function registerErrorHandler(app) {
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Request failed');

    reply.status(error.statusCode || 500).send({
      message: error.message || 'Internal Server Error',
    });
  });
}

module.exports = { registerErrorHandler };
