const test = require('node:test');
const assert = require('node:assert/strict');
const { Inventory, InventoryError } = require('../inventory');

test('reserves available stock and combines duplicate SKUs', () => {
  const inventory = new Inventory({ apple: 10 });

  const reserved = inventory.reserve([
    { sku: 'apple', quantity: 2 },
    { sku: 'apple', quantity: 3 },
  ]);

  assert.deepEqual(reserved, [{ sku: 'apple', quantity: 5 }]);
  assert.deepEqual(inventory.get('apple'), { sku: 'apple', quantity: 5 });
});

test('does not partially reserve when any SKU is unavailable', () => {
  const inventory = new Inventory({ apple: 10, pear: 1 });

  assert.throws(
    () => inventory.reserve([
      { sku: 'apple', quantity: 2 },
      { sku: 'pear', quantity: 2 },
    ]),
    (error) => error instanceof InventoryError && error.code === 'INSUFFICIENT_STOCK',
  );
  assert.deepEqual(inventory.get('apple'), { sku: 'apple', quantity: 10 });
});

test('restocks only by a positive integer', () => {
  const inventory = new Inventory();

  assert.deepEqual(inventory.restock('pear', 4), { sku: 'pear', quantity: 4 });
  assert.throws(() => inventory.restock('pear', 0), { code: 'INVALID_QUANTITY' });
});

test('rejects malformed reservation items', () => {
  const inventory = new Inventory({ apple: 3 });

  assert.throws(
    () => inventory.reserve([{ sku: 'apple', quantity: -1 }]),
    { code: 'INVALID_QUANTITY' },
  );
});