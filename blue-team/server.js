const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3002; // Změněno na 3002 kvůli červenému týmu
const WS_PORT = 3003;

// Inicializace storage souborů
const STORAGE_FILE = 'storage.json';
const TRANSACTIONS_FILE = 'transactions.json';

function initStorage() {
  if (!fs.existsSync(STORAGE_FILE)) {
    const defaultHats = {
      hats: [
        { id: 1, name: "Team Captain", price: 150, image: "Team_Captain.png" },
        { id: 2, name: "Unusual Burning Flames", price: 300, image: "Burning_Flames.png" },
        { id: 3, name: "Gibus", price: 10, image: "Ghostly_Gibus.png" },
        { id: 4, name: "Bill's Hat", price: 75, image: "Bills_Hat.png" },
        { id: 5, name: "Towering Pillar", price: 45, image: "Towering_Pillar.png" }
      ]
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(defaultHats, null, 2));
  }
  
  if (!fs.existsSync(TRANSACTIONS_FILE)) {
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify({ transactions: [] }, null, 2));
  }
  
  // Vytvoř složku pro obrázky pokud neexistuje
  if (!fs.existsSync('public/images')) {
    fs.mkdirSync('public/images', { recursive: true });
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
  
  // REST API - GET zobrazení skladových zásob (pro červený tým)
  if (url.pathname === '/api/hats' && req.method === 'GET') {
    try {
      const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: storage.hats, // Červený tým očekává pole v data
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
        
        // Ošetření záporných čísel
        if (quantity <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Množství musí být kladné číslo' }));
          return;
        }
        
        const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
        const hatIndex = storage.hats.findIndex(h => h.id === hatId);
        
        if (hatIndex === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Čepička nenalezena' }));
          return;
        }
        
        const hat = storage.hats[hatIndex];
        
        // Proveď nákup - odeber item ze skladových zásob
        const totalPrice = hat.price * quantity;
        
        // Zvýš cenu o 1 klíč
        hat.price += 1;
        
        // Odeber item ze storage (červený si ho vezme celý)
        storage.hats.splice(hatIndex, 1);
        
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
          buyer: buyer || 'Red Team',
          timestamp: new Date().toISOString()
        });
        fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
        
        // Broadcast update všem WebSocket klientům
        broadcastUpdate('purchase', {
          hat: hat.name,
          quantity,
          buyer: buyer || 'Red Team'
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Nákup úspěšný!',
          data: {
            hat: hat.name,
            quantity,
            totalPrice,
            image: hat.image
          }
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }
  
  // WEBHOOK - Příjem produktů od červeného týmu
  if (url.pathname === '/webhook/red' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        console.log('Webhook od červeného týmu:', event);
        
        // Zpracuj nový produkt od červených
        if (event.type === 'new_product') {
          const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
          
          // Najdi nejvyšší ID
          const maxId = storage.hats.reduce((max, h) => Math.max(max, h.id), 0);
          
          // Přidej nový produkt
          const newHat = {
            id: maxId + 1,
            name: event.name,
            price: event.price,
            image: event.image || 'default.png'
          };
          
          storage.hats.push(newHat);
          fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2));
          
          // Broadcast update
          broadcastUpdate('new_product', {
            hat: newHat.name,
            price: newHat.price,
            source: 'Red Team'
          });
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
  
  // Obrázky
  if (url.pathname.startsWith('/images/') && req.method === 'GET') {
    const imagePath = path.join('public', url.pathname);
    
    fs.readFile(imagePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Obrázek nenalezen');
      } else {
        const ext = path.extname(imagePath);
        const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
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
      '.json': 'application/json',
      '.png': 'image/png'
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
  console.log(`   POST /webhook/red       - Webhook pro červený tým`);
  console.log(`\nFrontend: http://localhost:${PORT}`);
});
