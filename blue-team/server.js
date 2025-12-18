const crypto = require('crypto');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

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

// --- WS ---
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'connect', products, redProducts, funds }));

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'buy' && data.id) {
        buyFromRed(data.id);
      }
    } catch (err) {
      console.error(err);
    }
  });
});

// --- BLU -> RED purchase ---
async function buyFromRed(id) {
  if (!redProducts[id]) return console.warn('item not found');
  if (redProducts[id].price > funds) return console.warn('not enough funds');

  try {
    const res = await fetch(`http://localhost:3000/api/buy/${id}`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok || !json.name) return console.error('RED purchase failed');

    // Deduct funds
    funds -= json.price;

    // Add to local BLU storage
    const uuid = crypto.randomUUID();
    products[uuid] = { name: json.name, price: json.price + 1, image: json.image };
    saveProducts(products);

    // Broadcast changes
    broadcast({ type: 'addBLU', id: uuid, item: products[uuid] });
    delete redProducts[id];
    broadcast({ type: 'removeRED', id, price: json.price });

  } catch (err) {
    console.error('buyFromRed error:', err);
  }
}

// --- Init ---
initStorage();
products = loadProducts();

// --- Fetch RED products ---
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

