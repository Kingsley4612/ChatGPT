function normalizeValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function isStructuredObjectArray(value) {
  return Array.isArray(value) && value.every((item) => item && typeof item === 'object' && !Array.isArray(item));
}

export function extractRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    for (const key of ['data', 'items', 'rows', 'records', 'result', 'users', 'products', 'list']) {
      if (isStructuredObjectArray(payload[key])) {
        return payload[key];
      }
    }

    for (const value of Object.values(payload)) {
      if (isStructuredObjectArray(value)) {
        return value;
      }
    }
  }

  throw new Error('外部接口未返回可识别的结构化数组');
}

export function sanitizeFieldName(input, index) {
  const normalized = String(input ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || `column_${index + 1}`;
}

export function inferFieldType(values) {
  const nonEmptyValues = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  if (!nonEmptyValues.length) return 'string';
  if (nonEmptyValues.every((value) => /^(true|false)$/i.test(value))) return 'boolean';
  if (nonEmptyValues.every((value) => !Number.isNaN(Number(value)))) return 'number';
  if (nonEmptyValues.every((value) => !Number.isNaN(Date.parse(value)))) return 'date';
  return 'string';
}

export function buildStructuredDataset(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('结构化数据为空');
  }

  const objectRows = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('结构化数据必须是对象数组');
    }
    return row;
  });

  const headerSet = new Set();
  objectRows.forEach((row) => {
    Object.keys(row).forEach((key) => headerSet.add(key));
  });

  const headers = Array.from(headerSet);
  const fieldNames = new Set();
  const fields = headers.map((header, index) => {
    const baseName = sanitizeFieldName(header, index);
    let fieldName = baseName;
    let suffix = 1;
    while (fieldNames.has(fieldName)) {
      suffix += 1;
      fieldName = `${baseName}_${suffix}`;
    }
    fieldNames.add(fieldName);
    return {
      fieldName,
      title: String(header ?? '') || `列${index + 1}`,
      type: inferFieldType(objectRows.map((row) => row[header])),
      sortable: true,
      filterable: true,
      sensitive: false,
    };
  });

  const headerMap = new Map(headers.map((header, index) => [header, fields[index].fieldName]));
  const normalizedRows = objectRows.map((row) => {
    const next = {};
    fields.forEach((field) => {
      const sourceHeader = headers.find((header) => headerMap.get(header) === field.fieldName);
      next[field.fieldName] = normalizeValue(row[sourceHeader]);
    });
    return next;
  });

  return { fields, rows: normalizedRows };
}
