const apiBase = '/api/inventory';
const state = { items: [], mode: 'restock', query: '' };

const elements = {
  connection: document.querySelector('#connection-status'),
  connectionLabel: document.querySelector('#connection-label'),
  rows: document.querySelector('#inventory-rows'),
  itemCount: document.querySelector('#inventory-count'),
  skuCount: document.querySelector('#sku-count'),
  unitCount: document.querySelector('#unit-count'),
  lowCount: document.querySelector('#low-count'),
  search: document.querySelector('#search-input'),
  form: document.querySelector('#stock-form'),
  sku: document.querySelector('#sku-input'),
  quantity: document.querySelector('#quantity-input'),
  submit: document.querySelector('#submit-button'),
  message: document.querySelector('#form-message'),
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }
  return data;
}

function setConnection(online, label) {
  elements.connection.classList.toggle('is-online', online);
  elements.connection.classList.toggle('is-offline', !online);
  elements.connectionLabel.textContent = label;
}

function renderInventory() {
  const filteredItems = state.items.filter(({ sku }) => (
    sku.toLowerCase().includes(state.query.toLowerCase())
  ));
  elements.rows.replaceChildren();

  if (filteredItems.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'table-message';
    cell.colSpan = 3;
    if (state.query) {
      cell.textContent = 'No matching SKUs.';
    } else {
      const message = document.createElement('p');
      const action = document.createElement('button');
      message.textContent = 'No stock recorded yet.';
      action.className = 'empty-action';
      action.type = 'button';
      action.textContent = 'Add your first SKU';
      action.addEventListener('click', () => elements.sku.focus());
      cell.append(message, action);
    }
    row.append(cell);
    elements.rows.append(row);
  } else {
    for (const item of filteredItems) {
      const row = document.createElement('tr');
      const skuCell = document.createElement('td');
      const quantityCell = document.createElement('td');
      const stateCell = document.createElement('td');
      const stockState = document.createElement('span');

      const skuButton = document.createElement('button');
      skuButton.className = 'sku-choice';
      skuButton.type = 'button';
      skuButton.dataset.sku = item.sku;
      skuButton.setAttribute('aria-label', `Use SKU ${item.sku}`);
      skuButton.textContent = item.sku;
      skuCell.append(skuButton);
      quantityCell.className = 'quantity-cell';
      quantityCell.textContent = Number(item.quantity).toLocaleString();
      stockState.className = `stock-state${item.quantity <= 5 ? ' is-low' : ''}`;
      stockState.textContent = item.quantity <= 5 ? 'Low' : 'In stock';
      stateCell.append(stockState);
      row.append(skuCell, quantityCell, stateCell);
      elements.rows.append(row);
    }
  }

  const totalUnits = state.items.reduce((total, item) => total + Number(item.quantity), 0);
  const lowStockItems = state.items.filter((item) => item.quantity <= 5).length;
  elements.skuCount.textContent = state.items.length.toLocaleString();
  elements.unitCount.textContent = totalUnits.toLocaleString();
  elements.lowCount.textContent = lowStockItems.toLocaleString();
  elements.itemCount.textContent = `${filteredItems.length} of ${state.items.length} items`;
}

async function refreshInventory() {
  try {
    const [health, inventory] = await Promise.all([
      requestJson('/api/health'),
      requestJson(apiBase),
    ]);
    state.items = Array.isArray(inventory.items) ? inventory.items : [];
    setConnection(health.status === 'ok', 'Connected');
    renderInventory();
  } catch (error) {
    setConnection(false, 'Unavailable');
    elements.rows.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'table-message';
    cell.colSpan = 3;
    cell.textContent = error.message;
    row.append(cell);
    elements.rows.append(row);
    elements.skuCount.textContent = '--';
    elements.unitCount.textContent = '--';
    elements.lowCount.textContent = '--';
    elements.itemCount.textContent = 'Inventory unavailable';
  }
}

function selectMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.segment').forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  elements.submit.textContent = mode === 'restock' ? 'Add stock' : 'Reserve stock';
  document.querySelector('#movement-heading').textContent = mode === 'restock' ? 'Update stock' : 'Reserve stock';
  elements.message.textContent = '';
  elements.message.className = 'form-message';
}

document.querySelectorAll('.segment').forEach((button) => {
  button.addEventListener('click', () => selectMode(button.dataset.mode));
});

elements.search.addEventListener('input', () => {
  state.query = elements.search.value.trim();
  renderInventory();
});

elements.rows.addEventListener('click', (event) => {
  const skuButton = event.target.closest('button[data-sku]');
  if (!skuButton) {
    return;
  }

  elements.sku.value = skuButton.dataset.sku;
  elements.message.textContent = `SKU ${skuButton.dataset.sku} selected. Enter a quantity.`;
  elements.message.className = 'form-message is-neutral';
  elements.quantity.focus();
});

document.querySelector('#refresh-button').addEventListener('click', refreshInventory);

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const sku = elements.sku.value.trim();
  const quantity = Number(elements.quantity.value);
  const endpoint = state.mode === 'restock' ? '/restock' : '/reserve';
  const body = state.mode === 'restock'
    ? { sku, quantity }
    : { items: [{ sku, quantity }] };

  elements.submit.disabled = true;
  elements.message.textContent = '';
  elements.message.className = 'form-message';

  try {
    await requestJson(`${apiBase}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    elements.message.textContent = state.mode === 'restock' ? 'Stock updated.' : 'Stock reserved.';
    elements.message.classList.add('is-success');
    await refreshInventory();
  } catch (error) {
    elements.message.textContent = error.message;
    elements.message.classList.add('is-error');
  } finally {
    elements.submit.disabled = false;
  }
});

refreshInventory();