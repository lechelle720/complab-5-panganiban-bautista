const express = require('express');
const app = express();
const port = 80;
const gateway = process.env.API_GATEWAY_URL || 'http://localhost:8080';

app.get('/', (req, res) => {
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Event-Driven Order System</title>
<style>
body{font-family:Arial,sans-serif;background:#f5f7fb;margin:0;padding:40px;color:#222}
.card{max-width:720px;margin:auto;background:#fff;padding:28px;border-radius:14px;box-shadow:0 4px 18px rgba(0,0,0,.08)}
h1{margin-top:0}.flow{background:#f0f3f7;padding:14px;border-radius:8px;font-size:14px;margin-bottom:20px}
label{display:block;margin-top:12px;font-weight:bold}input,button{width:100%;box-sizing:border-box;padding:11px;margin-top:6px;border:1px solid #bbb;border-radius:7px}
button{margin-top:18px;background:#222;color:#fff;cursor:pointer}.status{margin-top:18px;padding:12px;background:#f0f3f7;border-radius:8px;white-space:pre-wrap}
</style>
</head>
<body><div class="card">
<h1>Event-Driven Order System</h1>
<div class="flow">Frontend → API Gateway → Order Service → RabbitMQ → Payment / Inventory → Notification</div>
<form id="orderForm">
<label>Item</label><input id="item" required placeholder="Laptop">
<label>Amount</label><input id="amount" type="number" min="1" step="0.01" required placeholder="25000">
<button type="submit">Place Order</button>
</form><div id="status" class="status">Ready.</div>
</div>
<script>
const form=document.getElementById('orderForm');
const statusBox=document.getElementById('status');
form.addEventListener('submit',async(e)=>{
 e.preventDefault(); statusBox.textContent='Submitting order...';
 try{
  const response=await fetch('${gateway}/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item:document.getElementById('item').value,amount:Number(document.getElementById('amount').value)})});
  const data=await response.json();
  statusBox.textContent=JSON.stringify(data,null,2);
 }catch(err){statusBox.textContent='Error: '+err.message;}
});
</script></body></html>`);
});
app.get('/health',(req,res)=>res.json({service:'frontend',status:'ok'}));
app.listen(port,()=>console.log(`Frontend running on port ${port}`));
