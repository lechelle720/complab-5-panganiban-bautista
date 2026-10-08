# PL4107 Laboratory Worksheet 5
## Proof of Concept (PoC) for the Event-Driven Microservices Architecture

This project demonstrates a Docker Compose multi-container application using an event-driven architecture with RabbitMQ.

### Architecture
```text
Browser
  |
  v
Frontend :3000
  |
  v
API Gateway :8080
  |
  v
Order Service :3000 (internal)
  |
  | order.placed
  v
RabbitMQ / events exchange
  |------------------------------|
  v                              v
payment_order_queue        inventory_order_queue
  |                              |
Payment Service            Inventory Service
  |
  | payment.success
  v
notification_payment_queue
  |
Notification Service
```

### Requirements
- Docker Desktop
- Git / GitHub
- Web browser

### Run
Open a terminal in this folder:
```bash
docker compose up --build
```
Wait until all services show that they are running/listening.

### Frontend inspection
Open:
- http://localhost:3000

Enter an item and amount, then click **Place Order**.

### RabbitMQ Management Console
Open:
- http://localhost:15672

Credentials:
- Username: `guest`
- Password: `guest`

Check **Exchanges** and **Queues**. The `events` exchange should have bindings for:
- `order.placed`
- `payment.success`

Queues:
- `payment_order_queue`
- `inventory_order_queue`
- `notification_payment_queue`

### Fault-tolerance test
1. Stop the notification service:
```bash
docker compose stop notification-service
```
2. Submit a new order at http://localhost:3000.
3. Open RabbitMQ Management → Queues → `notification_payment_queue`.
4. The pending message should remain in the queue because the notification consumer is stopped.
5. Restart the service:
```bash
docker compose start notification-service
```
6. Refresh the queue. The notification service should consume the pending message.

### Stop the whole application
```bash
docker compose down
```

### GitHub
Create a public repository named `complab-5-panganiban` and upload the complete project folder.

### Suggested screenshots
1. Frontend at `http://localhost:3000`
2. RabbitMQ Exchanges page
3. RabbitMQ Queues page showing the required queues
4. Successful order response
5. `notification-service` stopped with a pending message in `notification_payment_queue`
6. Queue after restarting `notification-service`
