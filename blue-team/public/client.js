// WebSocket připojení
let ws = null;
let hatsData = [];
let currentFunds = 0;

const stock = document.getElementById('stock');
const fundsDisplay = document.getElementById('funds');

// Generování itemu v TF2 stylu
const generateItem = (id, name, price, image) => {
  let container = document.createElement('div');
  container.className = 'item';
  container.dataset.id = id;
  
  let img = new Image();
  img.src = `/images/${image}`;
  img.alt = name;
  img.onerror = () => {
    img.src = '/images/Ghostly_Gibus.png'; // Fallback image
  };
  
  let nameElem = document.createElement('p');
  nameElem.textContent = name;
  
  let priceElem = document.createElement('p');
  priceElem.textContent = `${price} keys`;
  
  // Sell button (hover)
  let sellBtn = document.createElement('button');
  sellBtn.className = 'sell-button';
  sellBtn.textContent = 'Sell to Red Team';
  sellBtn.onclick = (e) => {
    e.stopPropagation();
    sellToRedTeam(id, name, price, image);
  };
  
  container.appendChild(img);
  container.appendChild(nameElem);
  container.appendChild(priceElem);
  container.appendChild(sellBtn);
  
  return container;
};

// Prodej Red teamu
async function sellToRedTeam(id, name, price, image) {
  try {
    const response = await fetch('http://localhost:3000/api/products/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name,
        price: Math.ceil(price * 0.8), // Prodáváme za 80% ceny
        image: image
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`Prodáno Red teamu: ${name}`);
      // Update se provede přes WebSocket
    } else {
      console.error('Prodej se nezdařil:', result.error);
      alert('Prodej se nezdařil: ' + result.error);
    }
  } catch (error) {
    console.error('Chyba při prodeji:', error);
    alert('Chyba při komunikaci se serverem');
  }
}

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
  
  // Update funds
  if (message.funds !== undefined) {
    currentFunds = message.funds;
    updateFundsDisplay();
  }
  
  switch (message.type) {
    case 'init':
      hatsData = message.data;
      currentFunds = message.funds || 0;
      renderHats();
      updateFundsDisplay();
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

// Update zobrazení fondů
function updateFundsDisplay() {
  if (fundsDisplay) {
    fundsDisplay.textContent = `${currentFunds} keys`;
  }
}

// Načtení dat z REST API
async function fetchHats() {
  try {
    const response = await fetch('http://localhost:3002/api/hats');
    const result = await response.json();
    
    if (result.success) {
      hatsData = result.data;
      currentFunds = result.funds || 0;
      renderHats();
      updateFundsDisplay();
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
