const amqp = require('amqplib');
const { formatNotification } = require('./notification');

const brokerUrl = process.env.BROKER_URL || 'amqp://guest:guest@message-broker:5672';
const exchange = 'shop.events';
const queue = 'notification.events';
const retryDelayMs = Number(process.env.BROKER_RETRY_DELAY_MS || 3000);
let brokerConnection;
let brokerChannel;
let shuttingDown = false;

async function connectToBroker() {
  while (!shuttingDown) {
    let connection;
    try {
      connection = await amqp.connect(brokerUrl);
      const channel = await connection.createChannel();
      await channel.assertExchange(exchange, 'topic', { durable: true });
      await channel.assertQueue(queue, { durable: true });
      await channel.bindQueue(queue, exchange, 'order.placed');
      await channel.bindQueue(queue, exchange, 'payment.success');
      await channel.prefetch(1);
      await channel.consume(queue, (message) => {
        if (!message) {
          return;
        }
        try {
          const event = JSON.parse(message.content.toString());
          const notification = formatNotification(event);
          if (notification) {
            console.log(notification);
          } else {
            console.log(`Ignoring unsupported event type: ${event.type}`);
          }
          channel.ack(message);
        } catch (error) {
          console.error('Discarding invalid notification event:', error.message);
          channel.ack(message);
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
      console.log(`Consuming order.placed and payment.success from ${queue}.`);
      return;
    } catch (error) {
      await connection?.close().catch(() => {});
      console.error(`RabbitMQ unavailable: ${error.message}. Retrying shortly.`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
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

module.exports = { connectToBroker };