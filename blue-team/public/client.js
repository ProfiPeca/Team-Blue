// WebSocket připojení
let ws = null;
let hatsData = [];

const stock = document.getElementById('stock');

// Generování itemu v TF2 stylu
const generateItem = (id, name, price, image) => {
  let container = document.createElement('div');
  container.className = 'item';
  container.dataset.id = id;
  
  let img = new Image();
  img.src = `/images/${image}`;
  img.alt = name;
  
  let nameElem = document.createElement('p');
  nameElem.textContent = name;
  
  let priceElem = document.createElement('p');
  priceElem.textContent = `${price} keys`;
  
  container.appendChild(img);
  container.appendChild(nameElem);
  container.appendChild(priceElem);
  
  return container;
};

// Připojení k WebSocket serveru
function connectWebSocket() {
  ws = new WebSocket('ws://localhost:3003');
  
  ws.onopen = () => {
    console.log('WebSocket připojen');
    updateConnectionStatus(true);
  };
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleWebSocketMessage(message);
  };
  
  ws.onclose = () => {
    console.log('WebSocket odpojen');
    updateConnectionStatus(false);
    setTimeout(connectWebSocket, 3000);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Zpracování WebSocket zpráv
function handleWebSocketMessage(message) {
  console.log('WebSocket zpráva:', message);
  
  switch (message.type) {
    case 'init':
      hatsData = message.data;
      renderHats();
      break;
      
    case 'purchase':
      console.log(`Prodáno: ${message.data.hat}`);
      fetchHats();
      break;
      
    case 'new_product':
      console.log(`Nový produkt: ${message.data.hat}`);
      fetchHats();
      break;
  }
}

// Update status indikátoru
function updateConnectionStatus(isOnline) {
  let statusEl = document.querySelector('.connection-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'connection-status';
    document.body.appendChild(statusEl);
  }
  
  if (isOnline) {
    statusEl.textContent = 'Online';
    statusEl.classList.add('online');
    statusEl.classList.remove('offline');
  } else {
    statusEl.textContent = 'Offline';
    statusEl.classList.add('offline');
    statusEl.classList.remove('online');
  }
}

// Načtení dat z REST API
async function fetchHats() {
  try {
    const response = await fetch('http://localhost:3002/api/hats');
    const result = await response.json();
    
    if (result.success) {
      hatsData = result.data;
      renderHats();
    }
  } catch (error) {
    console.error('Chyba při načítání dat:', error);
  }
}

// Vykreslení čepiček
function renderHats() {
  if (hatsData.length === 0) {
    stock.innerHTML = '<p class="loading">Žádné čepičky na skladě</p>';
    return;
  }
  
  stock.innerHTML = '';
  
  hatsData.forEach(hat => {
    const item = generateItem(hat.id, hat.name, hat.price, hat.image);
    stock.appendChild(item);
  });
}

// Inicializace při načtení stránky
document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  fetchHats();
  
  // Pravidelný refresh každých 30 sekund jako fallback
  setInterval(fetchHats, 30000);
});
