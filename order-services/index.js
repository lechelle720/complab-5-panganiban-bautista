const http = require('node:http');
const amqp = require('amqplib');
const { createOrder, OrderValidationError } = require('./order');

const port = Number(process.env.PORT || 3000);
const brokerUrl = process.env.BROKER_URL || 'amqp://guest:guest@message-broker:5672';
const exchange = 'shop.events';
const retryDelayMs = Number(process.env.BROKER_RETRY_DELAY_MS || 3000);
const orders = new Map();
let brokerConnection;
let brokerChannel;
let shuttingDown = false;

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        tooLarge = true;
      } else if (!tooLarge) {
        body += chunk;
      }
    });
    request.on('end', () => {
      if (tooLarge) {
        const error = new Error('Request body exceeds 1 MB.');
        error.statusCode = 413;
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        const error = new Error('Request body must be valid JSON.');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function publishOrder(order) {
  if (!brokerChannel) {
    return Promise.reject(new Error('Message broker is not connected.'));
  }

  return new Promise((resolve, reject) => {
    brokerChannel.publish(
      exchange,
      'order.placed',
      Buffer.from(JSON.stringify(order)),
      { contentType: 'application/json', messageId: order.eventId, persistent: true },
      (error) => error ? reject(error) : resolve(),
    );
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(response, 200, { status: 'ok', brokerConnected: Boolean(brokerConnection) });
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/orders') {
    sendJson(response, 200, { orders: Array.from(orders.values()) });
    return;
  }
  const orderMatch = requestUrl.pathname.match(/^\/orders\/([^/]+)$/);
  if (request.method === 'GET' && orderMatch) {
    const order = orders.get(decodeURIComponent(orderMatch[1]));
    sendJson(response, order ? 200 : 404, order || { error: 'Order not found.' });
    return;
  }
  if (request.method !== 'POST' || requestUrl.pathname !== '/orders') {
    sendJson(response, 404, { error: 'Route not found.' });
    return;
  }

  try {
    const order = createOrder(await readJson(request));
    await publishOrder(order);
    orders.set(order.orderId, order);
    sendJson(response, 201, order);
  } catch (error) {
    if (error instanceof OrderValidationError || error.statusCode) {
      sendJson(response, error.statusCode || 400, { error: error.message });
      return;
    }
    console.error('Could not publish order:', error.message);
    sendJson(response, 503, { error: 'Order service is waiting for RabbitMQ.' });
  }
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function connectToBroker() {
  while (!shuttingDown) {
    let connection;
    try {
      connection = await amqp.connect(brokerUrl);
      const channel = await connection.createConfirmChannel();
      await channel.assertExchange(exchange, 'topic', { durable: true });
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
      console.log(`Publishing orders to ${exchange}.`);
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
  server.close(async () => {
    await brokerChannel?.close().catch(() => {});
    await brokerConnection?.close().catch(() => {});
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

if (require.main === module) {
  server.listen(port, '0.0.0.0', () => console.log(`Order API listening on port ${port}.`));
  void connectToBroker();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { server };