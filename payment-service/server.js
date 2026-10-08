const amqp = require('amqplib');
const url = process.env.BROKER_URL || 'amqp://guest:guest@message-broker:5672';
async function start(){
 while(true){
  try{
   const connection=await amqp.connect(url); const ch=await connection.createChannel();
   await ch.assertExchange('events','topic',{durable:true});
   const q=await ch.assertQueue('payment_order_queue',{durable:true});
   await ch.bindQueue(q.queue,'events','order.placed');
   ch.prefetch(1);
   await ch.consume(q.queue,msg=>{
    if(!msg)return;
    try{
      const order=JSON.parse(msg.content.toString());
      console.log(`PAYMENT SUCCESS: ${order.id}`);
      ch.publish('events','payment.success',Buffer.from(JSON.stringify({...order,paymentStatus:'SUCCESS'})),{persistent:true,contentType:'application/json'});
      ch.ack(msg);
    }catch(err){console.error(err);ch.nack(msg,false,false);}
   });
   console.log('Payment service listening on payment_order_queue');
   break;
  }catch(err){console.log('Payment service waiting for RabbitMQ...');await new Promise(r=>setTimeout(r,3000));}
 }
}
start();
