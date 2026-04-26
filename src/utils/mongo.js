const mongoose = require('mongoose');
const ApiError = require('./ApiError');

const isNonEmptyValue = (value) => value !== undefined && value !== null && value !== '';

const toObjectId = (value, label = 'id') => {
  if (!isNonEmptyValue(value)) return null;

  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${label}`);
  }

  return new mongoose.Types.ObjectId(value);
};

const toObjectIds = (values = [], label = 'id') => (
  (Array.isArray(values) ? values : [values])
    .filter(isNonEmptyValue)
    .map((value) => toObjectId(value, label))
);

const toObjectIdMatch = (value, label = 'id') => {
  if (!isNonEmptyValue(value)) return undefined;

  if (typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.$in)) {
    return { ...value, $in: toObjectIds(value.$in, label) };
  }

  return toObjectId(value, label);
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {
  toObjectId,
  toObjectIds,
  toObjectIdMatch,
  escapeRegex,
};