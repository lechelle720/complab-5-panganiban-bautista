const test = require('node:test');
const assert = require('node:assert/strict');
const { createPaymentSuccess, PaymentValidationError } = require('../payment');
const { handlePaymentSuccess } = require('../index');

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

test('acknowledges valid payment.success queue messages', () => {
  let acknowledged;
  const channel = { ack: (message) => { acknowledged = message; } };
  const message = {
    content: Buffer.from(JSON.stringify({ type: 'payment.success', orderId: 'order-1' })),
  };

  handlePaymentSuccess(channel, message);
  assert.equal(acknowledged, message);
});

test('acknowledges malformed payment queue messages so they do not remain stuck', () => {
  let acknowledged;
  const channel = { ack: (message) => { acknowledged = message; } };
  const message = { content: Buffer.from('{not-json') };

  handlePaymentSuccess(channel, message);
  assert.equal(acknowledged, message);
});