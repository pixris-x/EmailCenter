function getPayloadValue(payload, key) {
  return key.split('.').reduce((accumulator, segment) => {
    if (accumulator === undefined || accumulator === null) {
      return undefined;
    }

    return accumulator[segment];
  }, payload);
}

function renderTemplateContent(content = '', payload = {}) {
  return String(content).replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key) => {
    const value = getPayloadValue(payload, key);
    return value === undefined || value === null ? '' : String(value);
  });
}

function renderEmailTemplate(template = {}, payload = {}, subjectOverride = null) {
  return {
    subject: renderTemplateContent(subjectOverride || template.subject || '', payload),
    htmlContent: renderTemplateContent(template.htmlContent || '', payload),
    textContent: renderTemplateContent(template.textContent || '', payload),
  };
}

module.exports = {
  getPayloadValue,
  renderTemplateContent,
  renderEmailTemplate,
};
