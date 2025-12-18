const crypto = require('crypto');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const PORT = 3002;
const STORAGE_FILE = 'storage.json';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let funds = 500;
let products = {};
let redProducts = {};

// --- Storage ---
function initStorage() {
  if (!fs.existsSync(STORAGE_FILE)) {
    const defaultHats = {
      [crypto.randomUUID()]: { name: "Team Captain", price: 150, image: "Team_Captain.png" },
      [crypto.randomUUID()]: { name: "Gibus", price: 10, image: "Ghostly_Gibus.png" },
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(defaultHats, null, 2));
  }
}

function loadProducts() {
  return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
}

function saveProducts(p) {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(p, null, 2));
}

// --- Broadcast ---
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

// --- WebSocket ---
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'connect', products, redProducts, funds }));

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'buy' && data.id) {
        buyFromRed(data.id);
      }
    } catch (err) {
      console.error('WS message error:', err);
    }
  });
});

// --- RED kupuje od BLU (WebSocket) ---
async function buyFromRed(id) {
  const item = products[id];
  if (!item) return console.warn('Item not found');
  
  funds += item.price; 
  delete products[id]; 
  saveProducts(products);

  broadcast({ type: 'removeBLU', id, price: item.price });
  console.log(`RED koupil: ${item.name} za ${item.price} keys`);
}

// --- REST API pro BLU sklad ---
app.get('/api/hats', (req, res) => {
  res.json({
    success: true,
    data: Object.entries(products).map(([id, item]) => ({ id, ...item })),
    funds
  });
});

// --- REST API buy endpoint ---
app.post('/api/buy/:id', (req, res) => {
  const id = req.params.id;
  const item = products[id];
  if (!item) return res.status(404).json({ success: false, msg: 'Item not found' });

  funds += item.price;
  delete products[id];
  saveProducts(products);

  broadcast({ type: 'removeBLU', id, price: item.price });

  console.log(`REST BUY: RED koupil ${item.name} za ${item.price} keys`);
  res.json({ success: true, item });
});

// --- Init ---
initStorage();
products = loadProducts();

// --- Fetch RED produkty (pro WS synchronizaci) ---
async function fetchRedProducts() {
  try {
    const res = await fetch('http://localhost:3000/api/products');
    const data = await res.json();
    redProducts = data;
    for (const [id, item] of Object.entries(redProducts)) {
      broadcast({ type: 'addRED', id, item });
    }
  } catch (err) {
    console.error('fetchRedProducts failed:', err);
    setTimeout(fetchRedProducts, 5000);
  }
}
fetchRedProducts();

server.listen(PORT, () => console.log('BLU server running at http://localhost:' + PORT));

