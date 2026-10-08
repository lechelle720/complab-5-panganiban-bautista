const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');
const app = express();
const port = 8080;
const orderService = process.env.ORDER_SERVICE_URL || 'http://order-service:3000';

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());
app.get('/', (req,res)=>res.json({service:'api-gateway',status:'running'}));
app.get('/health', (req,res)=>res.json({service:'api-gateway',status:'ok'}));

app.post('/orders', async (req,res)=>{
  const item = String(req.body.item || '').trim();
  const amount = Number(req.body.amount);
  if(!item || !Number.isFinite(amount) || amount <= 0){
    return res.status(400).json({error:'Item and a positive amount are required.'});
  }
  const order = { id: randomUUID(), item, amount, createdAt: new Date().toISOString() };
  try{
    const response = await fetch(`${orderService}/orders`, {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(order)
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  }catch(err){
    return res.status(503).json({error:'Order service unavailable. Please wait for Docker services to finish starting.'});
  }
});
app.listen(port,()=>console.log(`API Gateway running on port ${port}`));
