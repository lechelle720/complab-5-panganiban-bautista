const test = require('node:test');
const assert = require('node:assert/strict');
const { formatNotification } = require('../notification');

test('formats order placed notifications', () => {
  assert.equal(
    formatNotification({ type: 'order.placed', orderId: 'order-1', items: [{}, {}] }),
    'Order order-1 was placed with 2 item line(s).',
  );
});

test('formats payment success notifications', () => {
  assert.equal(
    formatNotification({ type: 'payment.success', orderId: 'order-1', paymentId: 'payment-1' }),
    'Payment payment-1 succeeded for order order-1.',
  );
});

test('ignores unsupported event types and rejects malformed events', () => {
  assert.equal(formatNotification({ type: 'other', orderId: 'order-1' }), null);
  assert.throws(() => formatNotification({ type: 'order.placed' }), TypeError);
});