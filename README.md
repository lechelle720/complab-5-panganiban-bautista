# Shop Operations Services

## Run Locally

Start Docker Desktop, then run from the project root:

```sh
docker compose up --build
```

Open the inventory console at [http://localhost:3000](http://localhost:3000). The frontend is served by Nginx and sends `/api/` requests through the API gateway.

The inventory API is available at `http://localhost:3001`. Stock can be added from the console or with `POST /inventory/restock` using `{"sku":"SKU-1","quantity":10}`. Inventory is currently held in memory and resets when its container restarts.

## RabbitMQ

Open [http://localhost:15672](http://localhost:15672) and sign in with `guest` / `guest` for this local lab setup. The `shop.events` topic exchange is initialized from `rabbitmq/definitions.json`.

The exchange has durable bindings for:

- `order.placed` to `order.placed.queue` and `notification.events`
- `payment.success` to `payment.success.queue` and `notification.events`

The order API accepts `POST /orders` with an `items` array. It publishes `order.placed`; the payment worker consumes it and publishes `payment.success`; the notification worker logs both events. Order and payment data are demonstration-only and are not stored durably.

Stopping a consumer does not create a RabbitMQ message by itself. To repeat the queue demo and leave one test event ready while Payment is stopped, run `./scripts/stop-payment-with-message.ps1` in PowerShell. Starting Payment consumes that message, so run the script again after the next start/stop cycle if you want to see `Ready = 1` again.

To verify order buffering, stop `payment-service`, then submit an order to `POST http://localhost:8081/api/orders`. The pending event appears in `order.placed.queue` with `Ready = 1`; it does not appear in `payment.success.queue` because Payment has not processed it yet. Start `payment-service` to consume the order and publish the resulting `payment.success` event.

## Tests

Run the inventory and API gateway unit tests from the project root:

```sh
npm --prefix ./inventory-sevices test
npm --prefix ./api-gateway test
npm --prefix ./order-services test
npm --prefix ./payment-service test
npm --prefix ./notification-services test
```