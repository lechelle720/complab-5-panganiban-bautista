function formatNotification(event) {
  if (!event || typeof event !== 'object' || typeof event.orderId !== 'string') {
    throw new TypeError('Notification event must include an orderId.');
  }

  if (event.type === 'order.placed') {
    const itemCount = Array.isArray(event.items) ? event.items.length : 0;
    return `Order ${event.orderId} was placed with ${itemCount} item line(s).`;
  }

  if (event.type === 'payment.success') {
    const paymentLabel = event.paymentId ? `Payment ${event.paymentId} succeeded` : 'Payment succeeded';
    return `${paymentLabel} for order ${event.orderId}.`;
  }

  return null;
}

module.exports = { formatNotification };