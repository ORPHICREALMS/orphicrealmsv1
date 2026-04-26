const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './orphicworldv28.html';
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

// ── WebSocket — MUST attach to same http server (single port for Render) ──────
const wss = new WebSocket.Server({ server });

// ── Global room (one room = everyone) ─────────────────────────────────────────
const room = { players: new Map() }; // ws -> playerData

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

// ── Connection handler ────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
    let me = null;

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            switch (data.type) {

                case 'join':
                    me = {
                        name:   (data.name  || 'stranger').slice(0, 24),
                        avatar: (data.avatar || ''),
                        realm:  (data.realm  || 'world'),
                    };
                    room.players.set(ws, me);
                    broadcastAll({ type: 'onlineCount', count: room.players.size });
                    broadcast({ type: 'playerJoined', name: me.name, realm: me.realm }, ws);
                    console.log(`[+] ${me.name} joined (${me.realm}). Total: ${room.players.size}`);
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
                        // Relay to all OTHER players — sender adds their own message locally
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

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Orphic Realms server running at http://localhost:${PORT}`));
