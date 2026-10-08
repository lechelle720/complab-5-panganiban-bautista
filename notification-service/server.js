const amqp = require('amqplib');
const url = process.env.BROKER_URL || 'amqp://guest:guest@message-broker:5672';
async function start(){
 while(true){
  try{
   const connection=await amqp.connect(url); const ch=await connection.createChannel();
   await ch.assertExchange('events','topic',{durable:true});
   const q=await ch.assertQueue('notification_payment_queue',{durable:true});
   await ch.bindQueue(q.queue,'events','payment.success');
   ch.prefetch(1);
   await ch.consume(q.queue,msg=>{
    if(!msg)return;
    try{
      const order=JSON.parse(msg.content.toString());
      console.log(`NOTIFICATION SENT: Payment successful for order ${order.id}`);
      ch.ack(msg);
    }catch(err){console.error(err);ch.nack(msg,false,false);}
   });
   console.log('Notification service listening on notification_payment_queue');
   break;
  }catch(err){console.log('Notification service waiting for RabbitMQ...');await new Promise(r=>setTimeout(r,3000));}
 }
}
start();
