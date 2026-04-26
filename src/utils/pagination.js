const RESERVED_QUERY_KEYS = new Set(['page', 'limit', 'sort', 'order']);

const getPagination = (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const normalizeSort = (
  query = {},
  allowedFields = [],
  defaultField = 'createdAt',
  defaultOrder = 'desc',
) => {
  const requestedField = typeof query.sort === 'string' && query.sort.trim()
    ? query.sort.trim()
    : defaultField;

  const field = !allowedFields.length || allowedFields.includes(requestedField)
    ? requestedField
    : defaultField;

  const order = query.order === 'asc'
    ? 'asc'
    : defaultOrder === 'asc'
      ? 'asc'
      : 'desc';

  return { field, order };
};

const getSorting = (
  query = {},
  allowedFields = [],
  defaultField = 'createdAt',
  defaultOrder = 'desc',
) => {
  const sort = {};
  const { field, order } = normalizeSort(query, allowedFields, defaultField, defaultOrder);

  sort[field] = order === 'asc' ? 1 : -1;
  return sort;
};

const extractFilters = (query = {}, ignoredKeys = []) => {
  const ignored = new Set([...RESERVED_QUERY_KEYS, ...ignoredKeys]);

  return Object.entries(query).reduce((filters, [key, value]) => {
    if (ignored.has(key) || value === undefined || value === null || value === '') {
      return filters;
    }

    filters[key] = value;
    return filters;
  }, {});
};

const buildPagination = (total, page, limit, options = {}) => {
  const {
    query = {},
    allowedSortFields = [],
    defaultSortField = 'createdAt',
    defaultSortOrder = 'desc',
    ignoredFilterKeys = [],
    extra = {},
  } = options;

  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    sort: normalizeSort(query, allowedSortFields, defaultSortField, defaultSortOrder),
    filter: extractFilters(query, ignoredFilterKeys),
    ...extra,
  };
};

const buildMeta = (total, page, limit, options = {}) => {
  if (Object.keys(options).length === 0) {
    return {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  return buildPagination(total, page, limit, options);
};

module.exports = {
  getPagination,
  buildMeta,
  buildPagination,
  getSorting,
  normalizeSort,
  extractFilters,
};
