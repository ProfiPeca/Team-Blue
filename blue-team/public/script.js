let ws;
let bluStore, redStore, fundsEl;

let bluItems = [];
let redItems = {};
let funds = 0;

/* ---------- UI ---------- */
function createItem(item, actionText, action) {
  const div = document.createElement('div');
  div.className = 'item';

  const img = new Image();
  img.src = `/images/${item.image}`;
  img.onerror = () => img.src = '/images/Ghostly_Gibus.png';

  const name = document.createElement('p');
  name.textContent = item.name;

  const price = document.createElement('p');
  price.textContent = `${item.price} keys`;

  const btn = document.createElement('button');
  btn.textContent = actionText;
  btn.onclick = action;

  div.append(img, name, price, btn);
  return div;
}

function buyFromRed(id) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('WebSocket not connected');
    return;
  }
  ws.send(JSON.stringify({ type: 'buy', id }));
}

/* ---------- RENDER ---------- */
function render() {
  bluStore.innerHTML = '';
  redStore.innerHTML = '';
  fundsEl.textContent = funds;

  bluItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item';

    const img = new Image();
    img.src = `/images/${item.image}`;
    img.onerror = () => img.src = '/images/Ghostly_Gibus.png';

    const name = document.createElement('p');
    name.textContent = item.name;

    const price = document.createElement('p');
    price.textContent = `${item.price} keys`;

    div.append(img, name, price);
    bluStore.appendChild(div);
  });

  Object.entries(redItems).forEach(([id, item]) =>
    redStore.appendChild(createItem(item, 'Buy', () => buyFromRed(id)))
  );
}

/* ---------- REST / WS ---------- */
async function fetchBlu() {
  try {
    const res = await fetch('/api/hats');
    const json = await res.json();
    bluItems = json.data || [];
    funds = json.funds || 0;
    render();
  } catch (err) {
    console.error('Error fetching BLU storage:', err);
  }
}

/* ---------- WebSocket ---------- */
function connectWS() {
  ws = new WebSocket('ws://localhost:3002');

  ws.onmessage = e => {
    const msg = JSON.parse(e.data);

    switch (msg.type) {
      case 'connect':
        bluItems = Object.entries(msg.products).map(([id, i]) => ({ id, ...i }));
        redItems = msg.redProducts || {};
        funds = msg.funds || 0;
        render();
        break;

      case 'addBLU':
        bluItems.push({ id: msg.id, ...msg.item });
        render();
        break;

      case 'removeBLU':
        bluItems = bluItems.filter(i => i.id !== msg.id);
        funds += msg.price || 0;
        render();
        break;

      case 'addRED':
        redItems[msg.id] = msg.item;
        render();
        break;

      case 'removeRED':
        delete redItems[msg.id];
        render();
        break;
    }
  };

  ws.onclose = () => setTimeout(connectWS, 3000);
}

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', () => {
  bluStore = document.getElementById('blu-store');
  redStore = document.getElementById('red-store');
  fundsEl = document.getElementById('funds');

  connectWS();
  fetchBlu();
});

