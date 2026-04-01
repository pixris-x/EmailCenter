// 统一分页解析，保证各列表接口返回一致的分页结构。
function parsePositiveInt(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.floor(parsed)
}

function parsePagination(query, options = {}) {
  const page = parsePositiveInt(query?.page, options.defaultPage || 1)
  const pageSize = Math.min(
    parsePositiveInt(query?.pageSize, options.defaultPageSize || 10),
    options.maxPageSize || 100,
  )

  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  }
}

function buildPaginatedResponse({ rows, count, page, pageSize }) {
  return {
    items: rows,
    total: count,
    page,
    pageSize,
  }
}

function isAllQuery(query) {
  return String(query?.all || '').toLowerCase() === 'true'
}

module.exports = {
  parsePagination,
  buildPaginatedResponse,
  isAllQuery,
}
