const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3000;
const WS_PORT = 3001;

// Inicializace storage souborů
const STORAGE_FILE = 'storage.json';
const TRANSACTIONS_FILE = 'transactions.json';

function initStorage() {
  if (!fs.existsSync(STORAGE_FILE)) {
    const defaultHats = {
      hats: [
        { id: 1, name: "Team Captain", price: 150, quantity: 5, rarity: "legendary" },
        { id: 2, name: "Unusual Burning Flames", price: 300, quantity: 2, rarity: "unusual" },
        { id: 3, name: "Gibus", price: 10, quantity: 50, rarity: "common" },
        { id: 4, name: "Bill's Hat", price: 75, quantity: 10, rarity: "rare" },
        { id: 5, name: "Towering Pillar", price: 45, quantity: 15, rarity: "uncommon" }
      ]
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(defaultHats, null, 2));
  }
  
  if (!fs.existsSync(TRANSACTIONS_FILE)) {
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify({ transactions: [] }, null, 2));
  }
}

// WebSocket server pro real-time updaty
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Nový WebSocket klient připojen');
  clients.add(ws);
  
  // Pošli aktuální stav při připojení
  const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
  ws.send(JSON.stringify({ type: 'init', data: storage.hats }));
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket klient odpojen');
  });
});

// Broadcast funkce pro všechny připojené klienty
function broadcastUpdate(type, data) {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// HTTP Server s REST API
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // REST API - GET zobrazení skladových zásob
  if (url.pathname === '/api/hats' && req.method === 'GET') {
    try {
      const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: storage.hats,
        total: storage.hats.length
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }
  
  // REST API - POST nákup čepičky
  if (url.pathname === '/api/hats/buy' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { hatId, quantity = 1, buyer } = JSON.parse(body);
        
        if (!hatId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'hatId je povinný' }));
          return;
        }
        
        const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
        const hat = storage.hats.find(h => h.id === hatId);
        
        if (!hat) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Čepička nenalezena' }));
          return;
        }
        
        if (hat.quantity < quantity) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Nedostatečné množství na skladě',
            available: hat.quantity
          }));
          return;
        }
        
        // Proveď nákup
        hat.quantity -= quantity;
        const totalPrice = hat.price * quantity;
        
        // Ulož změny
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2));
        
        // Zaznamenej transakci
        const transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
        transactions.transactions.push({
          id: Date.now(),
          hatId: hat.id,
          hatName: hat.name,
          quantity,
          totalPrice,
          buyer: buyer || 'anonymous',
          timestamp: new Date().toISOString()
        });
        fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
        
        // Broadcast update všem WebSocket klientům
        broadcastUpdate('purchase', {
          hat: hat.name,
          quantity,
          remainingStock: hat.quantity,
          buyer: buyer || 'anonymous'
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Nákup úspěšný!',
          data: {
            hat: hat.name,
            quantity,
            totalPrice,
            remainingStock: hat.quantity
          }
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }
  
  // WEBHOOK - Příjem událostí z Alfa týmu
  if (url.pathname === '/webhook/alpha' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        console.log('Webhook z Alfa týmu:', event);
        
        // Zpracuj událost z Alfy
        if (event.type === 'restock') {
          const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
          const hat = storage.hats.find(h => h.id === event.hatId);
          
          if (hat) {
            hat.quantity += event.quantity;
            fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2));
            
            // Broadcast restock update
            broadcastUpdate('restock', {
              hat: hat.name,
              addedQuantity: event.quantity,
              newStock: hat.quantity,
              source: 'Alpha Team'
            });
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Webhook zpracován',
          receivedEvent: event.type
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }
  
  // Statické soubory (frontend)
  if (req.method === 'GET') {
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.join('public', filePath);
    
    const extname = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json'
    };
    
    const contentType = contentTypes[extname] || 'text/plain';
    
    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('404 - Soubor nenalezen');
        } else {
          res.writeHead(500);
          res.end('500 - Server error');
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
    return;
  }
  
  // 404 pro ostatní requesty
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Endpoint nenalezen' }));
});

// Spuštění serverů
initStorage();

server.listen(PORT, () => {
  console.log(`REST API běží na http://localhost:${PORT}`);
  console.log(`WebSocket server běží na ws://localhost:${WS_PORT}`);
  console.log(`\nDostupné endpointy:`);
  console.log(`   GET  /api/hats          - Zobrazení skladových zásob`);
  console.log(`   POST /api/hats/buy      - Nákup čepičky`);
  console.log(`   POST /webhook/alpha     - Webhook pro Alfa tým`);
  console.log(`\nFrontend: http://localhost:${PORT}`);
});
