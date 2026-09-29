const http = require('node:http');
const https = require('node:https');

const allowedMethods = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const allowedHeaders = 'Content-Type,Authorization';

function sendJson(response, statusCode, value) {
	response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(value));
}

function applyCors(request, response, allowedOrigin) {
	const requestOrigin = request.headers.origin;
	if (allowedOrigin === '*' || requestOrigin === allowedOrigin) {
		response.setHeader('access-control-allow-origin', allowedOrigin === '*' ? '*' : allowedOrigin);
	}
	response.setHeader('vary', 'Origin');
	response.setHeader('access-control-allow-methods', allowedMethods);
	response.setHeader('access-control-allow-headers', allowedHeaders);
}

function proxyRequest(request, response, serviceUrl, prefix, upstreamPrefix) {
	let targetUrl;
	try {
		const incomingUrl = new URL(request.url, 'http://gateway.local');
		const servicePath = incomingUrl.pathname.slice(prefix.length).replace(/\/$/, '');
		targetUrl = new URL(serviceUrl);
		targetUrl.pathname = `${targetUrl.pathname.replace(/\/$/, '')}${upstreamPrefix}${servicePath}`;
		targetUrl.search = incomingUrl.search;
	} catch {
		sendJson(response, 500, { error: 'Invalid upstream service URL.' });
		return;
	}

	const transport = targetUrl.protocol === 'https:' ? https : http;
	const requestHeaders = { ...request.headers, host: targetUrl.host };
	const upstreamRequest = transport.request(
		{
			hostname: targetUrl.hostname,
			port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
			path: `${targetUrl.pathname}${targetUrl.search}`,
			method: request.method,
			headers: requestHeaders,
		},
		(upstreamResponse) => {
			const responseHeaders = { ...response.getHeaders(), ...upstreamResponse.headers };
			for (const header of [
				'connection',
				'keep-alive',
				'proxy-authenticate',
				'proxy-authorization',
				'te',
				'trailer',
				'transfer-encoding',
				'upgrade',
			]) {
				delete responseHeaders[header];
			}
			response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
			upstreamResponse.pipe(response);
		},
	);

	upstreamRequest.setTimeout(15000, () => {
		upstreamRequest.destroy(new Error('Upstream request timed out.'));
	});
	upstreamRequest.on('error', (error) => {
		if (!response.headersSent) {
			sendJson(response, 502, { error: 'Upstream service unavailable.', detail: error.message });
		} else {
			response.destroy(error);
		}
	});
	request.on('aborted', () => upstreamRequest.destroy());
	request.pipe(upstreamRequest);
}

function createGatewayServer(options = {}) {
	const orderServiceUrl = options.orderServiceUrl || process.env.ORDER_SERVICE_URL || 'http://order-service:3000';
	const inventoryServiceUrl = options.inventoryServiceUrl || process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3001';
	const allowedOrigin = options.corsOrigin || process.env.CORS_ORIGIN || '*';

	return http.createServer((request, response) => {
		applyCors(request, response, allowedOrigin);

		if (request.method === 'OPTIONS') {
			response.writeHead(204);
			response.end();
			return;
		}

		const requestUrl = new URL(request.url, 'http://gateway.local');
		if (request.method === 'GET' && (requestUrl.pathname === '/health' || requestUrl.pathname === '/api/health')) {
			sendJson(response, 200, { status: 'ok' });
			return;
		}

		const routes = [
			{ prefix: '/api/inventory', upstreamPrefix: '/inventory', serviceUrl: inventoryServiceUrl },
			{ prefix: '/api/orders', upstreamPrefix: '/orders', serviceUrl: orderServiceUrl },
		];
		const route = routes.find(({ prefix }) => (
			requestUrl.pathname === prefix || requestUrl.pathname.startsWith(`${prefix}/`)
		));

		if (!route) {
			sendJson(response, 404, { error: 'Route not found.' });
			return;
		}

		proxyRequest(request, response, route.serviceUrl, route.prefix, route.upstreamPrefix);
	});
}

if (require.main === module) {
	const port = Number(process.env.PORT || 8080);
	const server = createGatewayServer();
	server.listen(port, '0.0.0.0', () => {
		console.log(`API gateway listening on port ${port}.`);
	});

	const shutdown = () => server.close(() => process.exit(0));
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

module.exports = { createGatewayServer };
