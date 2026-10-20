// Minimal static server: node serve.js <root> <port>
const http=require('http'),fs=require('fs'),path=require('path');
const root=process.argv[2],port=+process.argv[3];
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.avif':'image/avif','.gif':'image/gif','.ico':'image/x-icon','.json':'application/json','.woff2':'font/woff2','.mp4':'video/mp4'};
http.createServer((q,s)=>{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';const f=path.join(root,p);if(!f.startsWith(path.resolve(root))){s.writeHead(403);return s.end();}
fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);return s.end('404');}s.writeHead(200,{'Content-Type':types[path.extname(f).toLowerCase()]||'application/octet-stream'});s.end(d);});}).listen(port,'127.0.0.1',()=>console.log('listening',port));
