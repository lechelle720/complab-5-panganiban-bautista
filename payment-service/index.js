const { createPaymentSuccess } = require('./payment');

const brokerUrl = process.env.BROKER_URL || 'amqp://guest:guest@message-broker:5672';
const exchange = 'shop.events';
const orderQueue = 'order.placed.queue';
const paymentQueue = 'payment.success.queue';
const retryDelayMs = Number(process.env.BROKER_RETRY_DELAY_MS || 3000);
let brokerConnection;
let brokerChannel;
let shuttingDown = false;

async function handleOrder(channel, message) {
  let payment;
  try {
    const order = JSON.parse(message.content.toString());
    payment = createPaymentSuccess(order);
  } catch (error) {
    console.error('Discarding invalid order event:', error.message);
    channel.ack(message);
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      channel.publish(
        exchange,
        'payment.success',
        Buffer.from(JSON.stringify(payment)),
        { contentType: 'application/json', messageId: payment.eventId, persistent: true },
        (error) => error ? reject(error) : resolve(),
      );
    });
    channel.ack(message);
    console.log(`Payment succeeded for order ${payment.orderId}.`);
  } catch (error) {
    console.error('Could not publish payment result:', error.message);
    channel.nack(message, false, true);
  }
}

function handlePaymentSuccess(channel, message) {
  try {
    const payment = JSON.parse(message.content.toString());
    if (payment.type !== 'payment.success' || typeof payment.orderId !== 'string') {
      throw new Error('Expected a payment.success event with an orderId.');
    }
    console.log(`Acknowledged payment.success for order ${payment.orderId}.`);
  } catch (error) {
    console.error('Discarding invalid payment event:', error.message);
  }
  channel.ack(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function connectToBroker() {
  const amqp = require('amqplib');
  while (!shuttingDown) {
    let connection;
    try {
      connection = await amqp.connect(brokerUrl);
      const channel = await connection.createConfirmChannel();
      await channel.assertExchange(exchange, 'topic', { durable: true });
      await channel.assertQueue(orderQueue, { durable: true });
      await channel.bindQueue(orderQueue, exchange, 'order.placed');
      await channel.assertQueue(paymentQueue, { durable: true });
      await channel.bindQueue(paymentQueue, exchange, 'payment.success');
      await channel.prefetch(1);
      await channel.consume(orderQueue, (message) => {
        if (message) {
          void handleOrder(channel, message);
        }
      });
      await channel.consume(paymentQueue, (message) => {
        if (message) {
          handlePaymentSuccess(channel, message);
        }
      });

      brokerConnection = connection;
      brokerChannel = channel;
      connection.on('error', (error) => console.error('RabbitMQ connection error:', error.message));
      connection.on('close', () => {
        brokerConnection = undefined;
        brokerChannel = undefined;
        if (!shuttingDown) {
          console.error('RabbitMQ connection closed; reconnecting.');
          setTimeout(() => void connectToBroker(), retryDelayMs).unref();
        }
      });
      console.log(`Consuming ${orderQueue} and ${paymentQueue}; publishing payment.success events.`);
      return;
    } catch (error) {
      await connection?.close().catch(() => {});
      console.error(`RabbitMQ unavailable: ${error.message}. Retrying shortly.`);
      await delay(retryDelayMs);
    }
  }
}

function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  (async () => {
    await brokerChannel?.close().catch(() => {});
    await brokerConnection?.close().catch(() => {});
  })();
}

if (require.main === module) {
  void connectToBroker();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { handleOrder, handlePaymentSuccess };