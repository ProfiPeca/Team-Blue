const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3002;
const WS_PORT = 3003;

// Storage soubory
const STORAGE_FILE = 'storage.json';
const TRANSACTIONS_FILE = 'transactions.json';
const FUNDS_FILE = 'funds.json';

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
  
  if (!fs.existsSync(FUNDS_FILE)) {
    fs.writeFileSync(FUNDS_FILE, JSON.stringify({ funds: 500 }, null, 2));
  }
  
  if (!fs.existsSync('public/images')) {
    fs.mkdirSync('public/images', { recursive: true });
  }
}

// WebSocket server
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Nový WebSocket klient připojen');
  clients.add(ws);
  
  const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
  const fundsData = JSON.parse(fs.readFileSync(FUNDS_FILE, 'utf8'));
  
  ws.send(JSON.stringify({ 
    type: 'init', 
    data: storage.hats,
    funds: fundsData.funds 
  }));
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket klient odpojen');
  });
});

function broadcastUpdate(type, data) {
  const fundsData = JSON.parse(fs.readFileSync(FUNDS_FILE, 'utf8'));
  const message = JSON.stringify({ 
    type, 
    data, 
    funds: fundsData.funds,
    timestamp: new Date().toISOString() 
  });
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// HTTP Server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // GET /api/hats - zobrazení skladových zásob
  if (url.pathname === '/api/hats' && req.method === 'GET') {
    try {
      const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      const fundsData = JSON.parse(fs.readFileSync(FUNDS_FILE, 'utf8'));
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: storage.hats,
        total: storage.hats.length,
        funds: fundsData.funds
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }
  
  // POST /api/hats/buy - nákup čepičky
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
        
        if (quantity <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Množství musí být kladné číslo' }));
          return;
        }
        
        const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
        const fundsData = JSON.parse(fs.readFileSync(FUNDS_FILE, 'utf8'));
        const hatIndex = storage.hats.findIndex(h => h.id === hatId);
        
        if (hatIndex === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Čepička nenalezena' }));
          return;
        }
        
        const hat = storage.hats[hatIndex];
        const totalPrice = hat.price * quantity;
        
        // Přidej peníze z prodeje
        fundsData.funds += totalPrice;
        fs.writeFileSync(FUNDS_FILE, JSON.stringify(fundsData, null, 2));
        
        // Odeber item ze storage
        storage.hats.splice(hatIndex, 1);
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
        
        // Broadcast update
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
  
  // POST /api/hats/sell - prodej čepičky Red teamu
  if (url.pathname === '/api/hats/sell' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, price, image } = JSON.parse(body);
        
        if (!name || !price) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'name a price jsou povinné' }));
          return;
        }
        
        const storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
        const fundsData = JSON.parse(fs.readFileSync(FUNDS_FILE, 'utf8'));
        
        // Kontrola fondů
        if (fundsData.funds < price) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Nedostatek fondů',
            currentFunds: fundsData.funds,
            requiredFunds: price
          }));
          return;
        }
        
        // Najdi nejvyšší ID
        const maxId = storage.hats.reduce((max, h) => Math.max(max, h.id), 0);
        
        // Přidej nový produkt
        const newHat = {
          id: maxId + 1,
          name: name,
          price: Math.ceil(price * 1.3), // Prodáváme o 30% dráž
          image: image || 'Ghostly_Gibus.png'
        };
        
        // Odečti peníze
        fundsData.funds -= price;
        fs.writeFileSync(FUNDS_FILE, JSON.stringify(fundsData, null, 2));
        
        storage.hats.push(newHat);
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2));
        
        // Broadcast update
        broadcastUpdate('new_product', {
          hat: newHat.name,
          price: newHat.price,
          source: 'Purchase from Red Team'
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Produkt zakoupen a přidán do skladových zásob',
          data: newHat
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
        const contentType = ext === '.png' ? 'image/png' : 
                           ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
    return;
  }
  
  // Statické soubory
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
  
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Endpoint nenalezen' }));
});

initStorage();

server.listen(PORT, () => {
  console.log(`REST API běží na http://localhost:${PORT}`);
  console.log(`WebSocket server běží na ws://localhost:${WS_PORT}`);
  console.log(`\nDostupné endpointy:`);
  console.log(`   GET  /api/hats          - Zobrazení skladových zásob`);
  console.log(`   POST /api/hats/buy      - Nákup čepičky (Red team kupuje od Blue)`);
  console.log(`   POST /api/hats/sell     - Prodej čepičky (Blue kupuje od Red)`);
  console.log(`\nFrontend: http://localhost:${PORT}`);
});
