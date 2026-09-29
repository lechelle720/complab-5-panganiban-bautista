class PaymentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentValidationError';
  }
}

function createPaymentSuccess(order, { now = () => new Date() } = {}) {
  if (!order || typeof order !== 'object' || order.type !== 'order.placed') {
    throw new PaymentValidationError('Expected an order.placed event.');
  }
  if (typeof order.orderId !== 'string' || order.orderId.trim() === '') {
    throw new PaymentValidationError('Order event needs an orderId.');
  }
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new PaymentValidationError('Order event needs at least one item.');
  }

  return {
    type: 'payment.success',
    eventId: `payment-${order.orderId}`,
    paymentId: `payment-${order.orderId}`,
    orderId: order.orderId,
    status: 'succeeded',
    processedAt: now().toISOString(),
  };
}

module.exports = { PaymentValidationError, createPaymentSuccess };