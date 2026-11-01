const fs = require('node:fs');
const path = require('node:path');
const state = path.resolve(__dirname, '../../../backend-state');
const selected = path.join(state, 'selected-account.json');
const profile = fs.existsSync(selected) ? JSON.parse(fs.readFileSync(selected)).profile : 'synthetic';
if (!['synthetic', 'imported'].includes(profile)) throw new Error('Unknown local test profile');
const accountFile = path.join(state, profile === 'synthetic' ? 'test-account.json' : 'imported-account.json');
const account = fs.existsSync(accountFile) ? JSON.parse(fs.readFileSync(accountFile)) : {};
if (profile === 'imported' && (!account.userId || !account.UUK || !account.sourceHash)) throw new Error('Imported test profile incomplete');
module.exports = {
  ...account, profile, accountFile, database: path.join(state, profile + '.db'),
  userId: account.userId || 'UID-6f8b231d-f682-4cbb-b5e2-a9972f641ea4',
  name: account.name || 'Local1105'
};
