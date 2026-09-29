const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createGatewayServer } = require('../server');

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

test('serves a health response and applies the configured CORS origin', async (context) => {
  const server = createGatewayServer({ corsOrigin: 'http://localhost:3000' });
  const baseUrl = await listen(server);
  context.after(() => close(server));

  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: 'http://localhost:3000' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('forwards inventory paths, query strings, methods, and request bodies', async (context) => {
  let received;
  const upstream = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received = { method: request.method, url: request.url, body };
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ accepted: true }));
    });
  });
  const upstreamUrl = await listen(upstream);
  const gateway = createGatewayServer({ inventoryServiceUrl: upstreamUrl });
  const gatewayUrl = await listen(gateway);
  context.after(async () => {
    await close(gateway);
    await close(upstream);
  });

  const response = await fetch(`${gatewayUrl}/api/inventory/reserve?source=test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: [{ sku: 'SKU-1', quantity: 2 }] }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(received, {
    method: 'POST',
    url: '/inventory/reserve?source=test',
    body: JSON.stringify({ items: [{ sku: 'SKU-1', quantity: 2 }] }),
  });
});

test('returns 404 for unknown routes', async (context) => {
  const server = createGatewayServer();
  const baseUrl = await listen(server);
  context.after(() => close(server));

  const response = await fetch(`${baseUrl}/unknown`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Route not found.' });
});

test('forwards the inventory collection without a trailing slash', async (context) => {
  let receivedUrl;
  const upstream = http.createServer((request, response) => {
    receivedUrl = request.url;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"items":[]}');
  });
  const upstreamUrl = await listen(upstream);
  const gateway = createGatewayServer({ inventoryServiceUrl: upstreamUrl });
  const gatewayUrl = await listen(gateway);
  context.after(async () => {
    await close(gateway);
    await close(upstream);
  });

  const response = await fetch(`${gatewayUrl}/api/inventory`);
  assert.equal(response.status, 200);
  assert.equal(receivedUrl, '/inventory');
});