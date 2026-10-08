const amqp = require('amqplib');
const url = process.env.BROKER_URL || 'amqp://guest:guest@message-broker:5672';
async function start(){
 while(true){
  try{
   const connection=await amqp.connect(url); const ch=await connection.createChannel();
   await ch.assertExchange('events','topic',{durable:true});
   const q=await ch.assertQueue('inventory_order_queue',{durable:true});
   await ch.bindQueue(q.queue,'events','order.placed');
   ch.prefetch(1);
   await ch.consume(q.queue,msg=>{
    if(!msg)return;
    const order=JSON.parse(msg.content.toString());
    console.log(`INVENTORY RESERVED: ${order.id} (${order.item})`);
    ch.ack(msg);
   });
   console.log('Inventory service listening on inventory_order_queue');
   break;
  }catch(err){console.log('Inventory service waiting for RabbitMQ...');await new Promise(r=>setTimeout(r,3000));}
 }
}
start();
