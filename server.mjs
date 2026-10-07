import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const port = Number(process.env.PORT || 3000);
const root = path.resolve('dist');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json'};

async function proxyTruth(res) {
  try {
    const upstream = await fetch('https://gxeon-wallet-command-center.vercel.app/api/integration-status', {headers:{accept:'application/json'}});
    const body = await upstream.arrayBuffer();
    res.writeHead(upstream.status, {'content-type': upstream.headers.get('content-type') || 'application/json','cache-control':'no-store'});
    res.end(Buffer.from(body));
  } catch {
    res.writeHead(503, {'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify({error:'money_truth_upstream_unavailable'}));
  }
}
const server = http.createServer(async (req,res)=>{
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/health') { res.writeHead(200,{'content-type':'application/json'}); return res.end(JSON.stringify({ok:true,service:'gxeon-agentfi-os'})); }
  if (url.pathname === '/api/integration-status') return proxyTruth(res);
  let requested = decodeURIComponent(url.pathname);
  if (requested === '/') requested='/index.html';
  const candidate = path.resolve(root, '.'+requested);
  try {
    if (!candidate.startsWith(root)) throw new Error('bad path');
    const stat=await fs.stat(candidate);
    if (!stat.isFile()) throw new Error('not file');
    const ext=path.extname(candidate);
    res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','cache-control': ext==='.html'?'no-store':'public, max-age=3600'});
    res.end(await fs.readFile(candidate));
  } catch {
    const html=await fs.readFile(path.join(root,'index.html'));
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(html);
  }
});
server.listen(port,'0.0.0.0',()=>console.log('GXEON AgentFi OS online on',port));
