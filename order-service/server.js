const express = require('express');
const amqp = require('amqplib');
const app = express(); app.use(express.json());
const url = process.env.BROKER_URL || 'amqp://guest:guest@message-broker:5672';
let channel;
async function connect(){
  while(!channel){
    try{
      const connection = await amqp.connect(url);
      channel = await connection.createChannel();
      await channel.assertExchange('events','topic',{durable:true});
      console.log('Order service connected to RabbitMQ');
    }catch(err){ console.log('Order service waiting for RabbitMQ...'); await new Promise(r=>setTimeout(r,3000)); }
  }
}
app.get('/health',(req,res)=>res.json({service:'order-service',status:channel?'ok':'starting'}));
app.post('/orders',(req,res)=>{
  if(!channel) return res.status(503).json({error:'RabbitMQ is not ready yet.'});
  const order=req.body;
  channel.publish('events','order.placed',Buffer.from(JSON.stringify(order)),{persistent:true,contentType:'application/json'});
  console.log(`ORDER PLACED: ${order.id}`);
  res.status(201).json({message:'Order accepted and published as order.placed',order});
});
app.listen(3000,()=>{console.log('Order service running on port 3000');connect();});
