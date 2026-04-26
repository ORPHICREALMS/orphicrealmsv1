const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
        '.html': 'text/html',
        '.js':   'text/javascript',
        '.css':  'text/css',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.md':   'text/markdown',
    };
    fs.readFile(filePath, (err, content) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
        res.end(content);
    });
});

const wss = new WebSocket.Server({ server });
const room = { players: new Map() };

function broadcast(msg, excludeWs = null) {
    const str = JSON.stringify(msg);
    room.players.forEach((p, ws) => {
        if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) ws.send(str);
    });
}
function broadcastAll(msg) {
    const str = JSON.stringify(msg);
    room.players.forEach((p, ws) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(str);
    });
}

wss.on('connection', (ws) => {
    let me = null;

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            switch (data.type) {

                case 'join':
                    me = {
                        name:   (data.name   || 'stranger').slice(0, 24),
                        avatar: (data.avatar || ''),
                        realm:  (data.realm  || 'world'),
                        x:      data.x  || 0,
                        y:      data.y  || 0,
                        facing: data.facing || -1,
                    };
                    room.players.set(ws, me);

                    // Send joining player the full current roster
                    const roster = [];
                    room.players.forEach((p, w) => {
                        if (w !== ws) roster.push({ name: p.name, avatar: p.avatar, realm: p.realm, x: p.x, y: p.y, facing: p.facing });
                    });
                    ws.send(JSON.stringify({ type: 'init', players: roster }));

                    broadcastAll({ type: 'onlineCount', count: room.players.size });
                    broadcast({ type: 'playerJoined', name: me.name, avatar: me.avatar, realm: me.realm, x: me.x, y: me.y, facing: me.facing }, ws);
                    console.log(`[+] ${me.name} joined (${me.realm}). Total: ${room.players.size}`);
                    break;

                case 'move':
                    if (!me) break;
                    me.x      = data.x      ?? me.x;
                    me.y      = data.y      ?? me.y;
                    me.facing = data.facing ?? me.facing;
                    me.realm  = data.realm  || me.realm;
                    broadcast({ type: 'playerMove', name: me.name, realm: me.realm, x: me.x, y: me.y, facing: me.facing }, ws);
                    break;

                case 'realmChange':
                    if (!me) break;
                    me.realm = (data.realm || 'world').slice(0, 32);
                    broadcast({ type: 'realmChange', name: me.name, realm: me.realm }, ws);
                    break;

                case 'chat':
                    if (!me) break;
                    if (typeof data.text === 'string' && data.text.trim()) {
                        const text = data.text.trim().slice(0, 120);
                        broadcast({ type: 'chat', name: me.name, avatar: me.avatar, realm: me.realm, text }, ws);
                    }
                    break;
            }
        } catch (e) {
            console.error('Message error:', e);
        }
    });

    ws.on('close', () => {
        if (me) {
            room.players.delete(ws);
            broadcastAll({ type: 'onlineCount', count: room.players.size });
            broadcast({ type: 'playerLeft', name: me.name });
            console.log(`[-] ${me.name} left. Total: ${room.players.size}`);
        }
    });

    ws.on('error', (e) => console.error('WS error:', e));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Orphic Realms server running at http://localhost:${PORT}`));
