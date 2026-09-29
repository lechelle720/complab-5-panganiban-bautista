const test = require('node:test');
const assert = require('node:assert/strict');
const { createOrder, OrderValidationError } = require('../order');

test('creates a placed order event with normalized item SKUs', () => {
  const order = createOrder(
    { items: [{ sku: ' SKU-1 ', quantity: 2 }] },
    { idFactory: () => 'order-id', now: () => new Date('2026-09-29T00:00:00.000Z') },
  );

  assert.deepEqual(order, {
    type: 'order.placed',
    eventId: 'order-order-id',
    orderId: 'order-id',
    items: [{ sku: 'SKU-1', quantity: 2 }],
    status: 'placed',
    createdAt: '2026-09-29T00:00:00.000Z',
  });
});

test('rejects empty orders and invalid quantities', () => {
  assert.throws(() => createOrder({ items: [] }), OrderValidationError);
  assert.throws(
    () => createOrder({ items: [{ sku: 'SKU-1', quantity: 0 }] }),
    OrderValidationError,
  );
});