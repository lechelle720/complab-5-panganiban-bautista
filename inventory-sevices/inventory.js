class InventoryError extends Error {
  constructor(message, code, httpStatus = 400, details) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

function normalizeSku(sku) {
  if (typeof sku !== 'string' || sku.trim() === '') {
    throw new InventoryError('sku must be a non-empty string.', 'INVALID_SKU');
  }
  return sku.trim();
}

function normalizeQuantity(quantity, { allowZero = false } = {}) {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(quantity) || quantity < minimum) {
    const qualifier = allowZero ? 'a non-negative' : 'a positive';
    throw new InventoryError(`quantity must be ${qualifier} integer.`, 'INVALID_QUANTITY');
  }
  return quantity;
}

class Inventory {
  constructor(initialStock = {}) {
    if (!initialStock || typeof initialStock !== 'object' || Array.isArray(initialStock)) {
      throw new InventoryError('Initial stock must be a JSON object.', 'INVALID_INITIAL_STOCK');
    }

    this.stock = new Map();
    for (const [sku, quantity] of Object.entries(initialStock)) {
      this.stock.set(normalizeSku(sku), normalizeQuantity(quantity, { allowZero: true }));
    }
  }

  get(sku) {
    const normalizedSku = normalizeSku(sku);
    return { sku: normalizedSku, quantity: this.stock.get(normalizedSku) || 0 };
  }

  list() {
    return Array.from(this.stock, ([sku, quantity]) => ({ sku, quantity }))
      .sort((left, right) => left.sku.localeCompare(right.sku));
  }

  restock(sku, quantity) {
    const normalizedSku = normalizeSku(sku);
    normalizeQuantity(quantity);
    const updatedQuantity = (this.stock.get(normalizedSku) || 0) + quantity;
    if (!Number.isSafeInteger(updatedQuantity)) {
      throw new InventoryError('Resulting stock exceeds the safe integer limit.', 'INVALID_QUANTITY');
    }
    this.stock.set(normalizedSku, updatedQuantity);
    return this.get(normalizedSku);
  }

  reserve(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new InventoryError('items must be a non-empty array.', 'INVALID_ITEMS');
    }

    const requested = new Map();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new InventoryError('Each item must be an object.', 'INVALID_ITEM');
      }

      const sku = normalizeSku(item.sku);
      const quantity = normalizeQuantity(item.quantity);
      const total = (requested.get(sku) || 0) + quantity;
      if (!Number.isSafeInteger(total)) {
        throw new InventoryError('Requested quantity exceeds the safe integer limit.', 'INVALID_QUANTITY');
      }
      requested.set(sku, total);
    }

    for (const [sku, quantity] of requested) {
      const available = this.stock.get(sku) || 0;
      if (available < quantity) {
        throw new InventoryError(
          `Insufficient stock for ${sku}.`,
          'INSUFFICIENT_STOCK',
          409,
          { sku, requested: quantity, available },
        );
      }
    }

    for (const [sku, quantity] of requested) {
      this.stock.set(sku, this.stock.get(sku) - quantity);
    }

    return Array.from(requested, ([sku, quantity]) => ({ sku, quantity }));
  }
}

module.exports = { Inventory, InventoryError };