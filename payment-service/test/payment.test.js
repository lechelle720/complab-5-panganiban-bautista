const test = require('node:test');
const assert = require('node:assert/strict');
const { createPaymentSuccess, PaymentValidationError } = require('../payment');

test('creates a payment.success event for a valid placed order', () => {
  const payment = createPaymentSuccess(
    { type: 'order.placed', orderId: 'order-1', items: [{ sku: 'SKU-1', quantity: 1 }] },
    { now: () => new Date('2026-09-29T00:00:00.000Z') },
  );

  assert.deepEqual(payment, {
    type: 'payment.success',
    eventId: 'payment-order-1',
    paymentId: 'payment-order-1',
    orderId: 'order-1',
    status: 'succeeded',
    processedAt: '2026-09-29T00:00:00.000Z',
  });
});

test('rejects malformed or non-order events', () => {
  assert.throws(() => createPaymentSuccess({ type: 'payment.success' }), PaymentValidationError);
});