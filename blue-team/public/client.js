// WebSocket připojení
let ws = null;
let hatsData = [];

// Připojení k WebSocket serveru
function connectWebSocket() {
  ws = new WebSocket('ws://localhost:3001');
  
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
    // Pokus o znovupřipojení za 3 sekundy
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
      updateStats();
      break;
      
    case 'purchase':
      showNotification(
        `Nákup: ${message.data.buyer} koupil ${message.data.quantity}x ${message.data.hat}`,
        'purchase'
      );
      // Refresh dat z API
      fetchHats();
      break;
      
    case 'restock':
      showNotification(
        `Doplnění: +${message.data.addedQuantity}x ${message.data.hat} (${message.data.source})`,
        'restock'
      );
      // Refresh dat z API
      fetchHats();
      break;
  }
}

// Update status indikátoru
function updateConnectionStatus(isOnline) {
  const statusEl = document.getElementById('wsStatus');
  if (isOnline) {
    statusEl.textContent = 'Online';
    statusEl.className = 'status-indicator online';
  } else {
    statusEl.textContent = 'Offline';
    statusEl.className = 'status-indicator offline';
  }
}

// Načtení dat z REST API
async function fetchHats() {
  try {
    const response = await fetch('http://localhost:3000/api/hats');
    const result = await response.json();
    
    if (result.success) {
      hatsData = result.data;
      renderHats();
      updateStats();
    }
  } catch (error) {
    console.error('Chyba při načítání dat:', error);
  }
}

// Vykreslení čepiček
function renderHats() {
  const grid = document.getElementById('hatsGrid');
  
  if (hatsData.length === 0) {
    grid.innerHTML = '<p class="loading">Žádné čepičky na skladě</p>';
    return;
  }
  
  grid.innerHTML = hatsData.map(hat => `
    <div class="hat-card" data-hat-id="${hat.id}">
      <div class="hat-header">
        <div class="hat-name">${hat.name}</div>
        <span class="rarity-badge rarity-${hat.rarity}">${hat.rarity}</span>
      </div>
      
      <div class="hat-details">
        <div class="hat-price">${hat.price} keys</div>
        <div class="hat-stock ${hat.quantity === 0 ? 'stock-out' : hat.quantity < 5 ? 'stock-low' : ''}">
          Na skladě: ${hat.quantity}x
        </div>
      </div>
      
      <div class="buy-section">
        <input 
          type="number" 
          class="quantity-input" 
          min="1" 
          max="${hat.quantity}" 
          value="1"
          ${hat.quantity === 0 ? 'disabled' : ''}
          id="qty-${hat.id}"
        >
        <button 
          class="buy-btn" 
          onclick="buyHat(${hat.id})"
          ${hat.quantity === 0 ? 'disabled' : ''}
        >
          ${hat.quantity === 0 ? 'Vyprodáno' : 'Koupit'}
        </button>
      </div>
    </div>
  `).join('');
}

// Update statistik
function updateStats() {
  const totalQuantity = hatsData.reduce((sum, hat) => sum + hat.quantity, 0);
  const totalValue = hatsData.reduce((sum, hat) => sum + (hat.price * hat.quantity), 0);
  
  document.getElementById('totalHats').textContent = totalQuantity;
  document.getElementById('totalValue').textContent = `${totalValue} keys`;
}

// Nákup čepičky
async function buyHat(hatId) {
  const qtyInput = document.getElementById(`qty-${hatId}`);
  const quantity = parseInt(qtyInput.value) || 1;
  
  try {
    const response = await fetch('http://localhost:3000/api/hats/buy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        hatId,
        quantity,
        buyer: 'Cecilka' // Můžeš změnit na dynamické jméno
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Vizuální feedback
      const card = document.querySelector(`[data-hat-id="${hatId}"]`);
      card.classList.add('updating');
      setTimeout(() => card.classList.remove('updating'), 600);
      
      showNotification(`Úspěch: ${result.message}`, 'purchase');
    } else {
      showNotification(`Chyba: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Chyba při nákupu:', error);
    showNotification('Chyba spojení se serverem', 'error');
  }
}

// Zobrazení notifikace
function showNotification(message, type = 'info') {
  const container = document.getElementById('notifications');
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  container.appendChild(notification);
  
  // Automatické odstranění po 5 sekundách
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(400px)';
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

// Inicializace při načtení stránky
document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  fetchHats();
  
  // Pravidelný refresh každých 30 sekund jako fallback
  setInterval(fetchHats, 30000);
});
