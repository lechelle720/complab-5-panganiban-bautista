const { randomUUID } = require('node:crypto');

class OrderValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

function createOrder(payload, { idFactory = randomUUID, now = () => new Date() } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OrderValidationError('Order body must be a JSON object.');
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new OrderValidationError('items must be a non-empty array.');
  }

  const items = payload.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new OrderValidationError('Each item must be an object.');
    }
    if (typeof item.sku !== 'string' || item.sku.trim() === '') {
      throw new OrderValidationError('Each item needs a non-empty sku.');
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new OrderValidationError('Item quantity must be a positive integer.');
    }
    return { sku: item.sku.trim(), quantity: item.quantity };
  });

  const orderId = idFactory();
  return {
    type: 'order.placed',
    eventId: `order-${orderId}`,
    orderId,
    items,
    status: 'placed',
    createdAt: now().toISOString(),
  };
}

module.exports = { OrderValidationError, createOrder };