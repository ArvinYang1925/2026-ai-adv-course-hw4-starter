// Query rules for a member's order list: status filter and pagination.

const ORDER_STATUSES = Object.freeze(['pending', 'paid', 'failed']);

const ORDER_LIST_LIMITS = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 50
});

/**
 * Parse a positive integer query value ("3", not "3.5", "-1", "0", "abc" or
 * repeated keys). Values beyond the safe-integer range are rejected so they
 * never reach SQLite as non-integer LIMIT/OFFSET values.
 */
function parsePositiveIntegerParam(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Validate and normalize GET /api/orders query parameters.
 * Returns { value: { status, page, limit } } or { error: message }.
 * Missing parameters fall back to defaults; limit above MAX_LIMIT is capped.
 */
function parseOrderListQuery(query = {}) {
  const { status, page, limit } = query;

  if (status !== undefined && !ORDER_STATUSES.includes(status)) {
    return { error: `status 必須為 ${ORDER_STATUSES.join('、')} 其中之一` };
  }

  let parsedPage = ORDER_LIST_LIMITS.DEFAULT_PAGE;
  if (page !== undefined) {
    parsedPage = parsePositiveIntegerParam(page);
    if (parsedPage === null) {
      return { error: 'page 必須為正整數' };
    }
  }

  let parsedLimit = ORDER_LIST_LIMITS.DEFAULT_LIMIT;
  if (limit !== undefined) {
    parsedLimit = parsePositiveIntegerParam(limit);
    if (parsedLimit === null) {
      return { error: 'limit 必須為正整數' };
    }
  }

  // Computing the offset this way keeps it a safe integer for any accepted page
  const cappedLimit = Math.min(parsedLimit, ORDER_LIST_LIMITS.MAX_LIMIT);
  if (!Number.isSafeInteger((parsedPage - 1) * cappedLimit)) {
    return { error: 'page 超出範圍' };
  }

  return {
    value: {
      status: status === undefined ? null : status,
      page: parsedPage,
      limit: cappedLimit
    }
  };
}

function buildPagination({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

module.exports = {
  ORDER_STATUSES,
  ORDER_LIST_LIMITS,
  parseOrderListQuery,
  buildPagination
};
