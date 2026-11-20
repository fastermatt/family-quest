// Explicitly allow the dedicated LAN parent listener's HTTP login cookie.
process.env.CHOREZAP_LAN_LOGIN = '1';
// Existing HTTP parent UI on 3100; certificate-pinned device API on LAN TLS 3101.
const next = require('next');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const app = next({ dev: false, dir: __dirname });
app.prepare().then(() => {
 const handle = app.getRequestHandler();
 const options = { key: fs.readFileSync(path.join(__dirname,'.companion/tls.key')), cert:fs.readFileSync(path.join(__dirname,'.companion/tls.crt')), minVersion:'TLSv1.2' };
 const devices = https.createServer(options,(req,res)=>{
  if (req.url.startsWith('/api/companion/v2/updates/')) {
   const name = req.url.slice('/api/companion/v2/updates/'.length);
   if (req.method !== 'GET' || !(name === 'manifest.json' || /^[a-f0-9]{64}\.exe$/.test(name))) { res.writeHead(404);res.end();return; }
   const file = path.join(__dirname,'.companion/updates',name);
   fs.stat(file,(error,stat)=>{
    if(error || !stat.isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':name==='manifest.json'?'application/json':'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
   });return;
  }

  if (!req.url.startsWith('/api/companion/v2/')) {res.writeHead(404);res.end();return;}
  handle(req,res);
 });
 devices.on('error',error=>{console.error('Companion TLS failed:',error.code);process.exit(1);});
 devices.listen(Number(process.env.COMPANION_TLS_PORT || 3101),'0.0.0.0');
 const parent = http.createServer((req,res)=>{if(req.url.startsWith('/api/companion/v2/')){res.writeHead(426,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Use the encrypted device endpoint.'}));return;}handle(req,res);});
 parent.on('error',error=>{console.error('Companion parent UI failed:',error.code);process.exit(1);});
 parent.listen(Number(process.env.COMPANION_HTTP_PORT || 3100),'0.0.0.0',()=>console.log('Companion parent UI and TLS device API ready'));
}).catch(error=>{console.error('Companion startup failed:',error.message);process.exit(1);});
