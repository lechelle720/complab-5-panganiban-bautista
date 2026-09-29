# Inventory Service

The service exposes a small HTTP API on port `3001` and consumes inventory commands from RabbitMQ.
Stock is held in memory and resets when the container restarts; use a database before relying on it for persistent inventory.

## HTTP API

- `GET /health` reports service and RabbitMQ connection status.
- `GET /inventory` lists all known SKUs.
- `GET /inventory/:sku` returns a SKU and its available quantity; unknown SKUs have quantity `0`.
- `POST /inventory/restock` accepts `{"sku":"SKU-1","quantity":10}`.
- `POST /inventory/reserve` accepts `{"items":[{"sku":"SKU-1","quantity":2}]}` and reserves all requested items atomically.

## RabbitMQ Commands

The durable queue defaults to `inventory.commands` and can be changed with `INVENTORY_QUEUE`.
Messages must be JSON and include a unique `commandId`.

Reserve stock:

```json
{"type":"inventory.reserve","commandId":"cmd-1","orderId":"order-1","items":[{"sku":"SKU-1","quantity":2}]}
```

Restock:

```json
{"type":"inventory.restock","commandId":"cmd-2","sku":"SKU-1","quantity":10}
```

If the message has AMQP `replyTo`, the service sends an `inventory.reserved`, `inventory.restocked`, or `inventory.rejected` JSON response there. Repeated command IDs are deduplicated in memory.

## Configuration

- `PORT`: HTTP port, defaults to `3001`.
- `BROKER_URL`: RabbitMQ URL, defaults to `amqp://guest:guest@message-broker:5672`.
- `INVENTORY_QUEUE`: command queue, defaults to `inventory.commands`.
- `INITIAL_STOCK`: JSON object mapping SKUs to non-negative integer quantities, defaults to `{}`.
- `BROKER_RETRY_DELAY_MS`: retry delay if RabbitMQ is unavailable, defaults to `3000`.

Run `npm test` for the inventory stock-operation tests.