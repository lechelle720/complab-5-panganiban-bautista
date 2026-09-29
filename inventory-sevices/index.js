const http = require('node:http');
const amqp = require('amqplib');
const { Inventory, InventoryError } = require('./inventory');

const port = Number(process.env.PORT || 3001);
const brokerUrl = process.env.BROKER_URL || 'amqp://guest:guest@message-broker:5672';
const inventoryQueue = process.env.INVENTORY_QUEUE || 'inventory.commands';
const retryDelayMs = Number(process.env.BROKER_RETRY_DELAY_MS || 3000);
const processedCommands = new Map();
let brokerConnection;
let brokerChannel;
let shuttingDown = false;

function loadInitialStock() {
	try {
		return JSON.parse(process.env.INITIAL_STOCK || '{}');
	} catch {
		throw new Error('INITIAL_STOCK must be valid JSON.');
	}
}

const inventory = new Inventory(loadInitialStock());

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
				error.httpStatus = 413;
				reject(error);
				return;
			}

			try {
				resolve(JSON.parse(body));
			} catch {
				const error = new Error('Request body must be valid JSON.');
				error.httpStatus = 400;
				reject(error);
			}
		});

		request.on('error', reject);
	});
}

const server = http.createServer(async (request, response) => {
	const requestUrl = new URL(request.url, 'http://localhost');

	if (request.method === 'GET' && requestUrl.pathname === '/') {
		sendJson(response, 200, {
			service: 'inventory-service',
			endpoints: [
				'GET /health',
				'GET /inventory',
				'GET /inventory/:sku',
				'POST /inventory/restock',
				'POST /inventory/reserve',
			],
		});
		return;
	}

	try {
		if (request.method === 'GET' && requestUrl.pathname === '/health') {
			sendJson(response, 200, { status: 'ok', brokerConnected: Boolean(brokerConnection) });
			return;
		}

		if (request.method === 'GET' && requestUrl.pathname === '/inventory') {
			sendJson(response, 200, { items: inventory.list() });
			return;
		}

		const skuMatch = requestUrl.pathname.match(/^\/inventory\/([^/]+)$/);
		if (request.method === 'GET' && skuMatch) {
			sendJson(response, 200, inventory.get(decodeURIComponent(skuMatch[1])));
			return;
		}

		if (request.method === 'POST' && requestUrl.pathname === '/inventory/restock') {
			const body = await readJson(request);
			sendJson(response, 200, { item: inventory.restock(body.sku, body.quantity) });
			return;
		}

		if (request.method === 'POST' && requestUrl.pathname === '/inventory/reserve') {
			const body = await readJson(request);
			sendJson(response, 201, { reserved: true, items: inventory.reserve(body.items) });
			return;
		}

		sendJson(response, 404, { error: 'Not found.' });
	} catch (error) {
		const statusCode = error.httpStatus || 500;
		if (statusCode === 500) {
			console.error('Inventory request failed:', error);
		}
		sendJson(response, statusCode, {
			error: error.message,
			code: error.code || 'INTERNAL_ERROR',
			details: error.details,
		});
	}
});

function createCommandResult(command) {
	if (!command || typeof command !== 'object' || Array.isArray(command)) {
		throw new InventoryError('Command must be a JSON object.', 'INVALID_COMMAND');
	}

	if (typeof command.commandId !== 'string' || command.commandId.trim() === '') {
		throw new InventoryError('commandId is required.', 'INVALID_COMMAND');
	}

	if (command.type === 'inventory.reserve') {
		return {
			type: 'inventory.reserved',
			commandId: command.commandId,
			orderId: command.orderId,
			items: inventory.reserve(command.items),
		};
	}

	if (command.type === 'inventory.restock') {
		return {
			type: 'inventory.restocked',
			commandId: command.commandId,
			item: inventory.restock(command.sku, command.quantity),
		};
	}

	throw new InventoryError(`Unsupported command type: ${command.type}`, 'INVALID_COMMAND');
}

function rememberCommand(commandId, result) {
	if (!commandId) {
		return;
	}

	processedCommands.set(commandId, result);
	if (processedCommands.size > 10000) {
		processedCommands.delete(processedCommands.keys().next().value);
	}
}

async function handleBrokerMessage(channel, message) {
	let command;
	try {
		command = JSON.parse(message.content.toString());
	} catch {
		console.error('Discarding invalid JSON from inventory queue.');
		channel.ack(message);
		return;
	}

	const commandId = command && command.commandId;
	let result = typeof commandId === 'string' ? processedCommands.get(commandId) : undefined;

	if (!result) {
		try {
			result = createCommandResult(command);
		} catch (error) {
			result = {
				type: 'inventory.rejected',
				commandId,
				orderId: command && command.orderId,
				error: error.message,
				code: error.code || 'INVALID_COMMAND',
				details: error.details,
			};
		}
		rememberCommand(commandId, result);
	}

	if (message.properties.replyTo) {
		channel.sendToQueue(
			message.properties.replyTo,
			Buffer.from(JSON.stringify(result)),
			{
				contentType: 'application/json',
				correlationId: message.properties.correlationId,
			},
		);
	}

	channel.ack(message);
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function connectToBroker() {
	while (!shuttingDown) {
		try {
			const connection = await amqp.connect(brokerUrl);
			const channel = await connection.createChannel();
			await channel.assertQueue(inventoryQueue, { durable: true });
			await channel.prefetch(1);
			await channel.consume(inventoryQueue, (message) => {
				if (!message) {
					return;
				}
				handleBrokerMessage(channel, message).catch((error) => {
					console.error('Failed to handle inventory command:', error);
					channel.nack(message, false, true);
				});
			});

			brokerConnection = connection;
			brokerChannel = channel;
			console.log(`Consuming inventory commands from ${inventoryQueue}.`);

			connection.on('error', (error) => {
				console.error('RabbitMQ connection error:', error.message);
			});
			connection.on('close', () => {
				brokerConnection = undefined;
				brokerChannel = undefined;
				if (!shuttingDown) {
					console.error('RabbitMQ connection closed; reconnecting.');
					setTimeout(() => void connectToBroker(), retryDelayMs).unref();
				}
			});
			return;
		} catch (error) {
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
	server.listen(port, '0.0.0.0', () => {
		console.log(`Inventory API listening on port ${port}.`);
	});
	void connectToBroker();
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}
