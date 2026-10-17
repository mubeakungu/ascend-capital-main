import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.js';

test('account registration, sign-in, profile updates, and logout', async (suite) => {
  const directory = await mkdtemp(join(tmpdir(), 'ascend-accounts-'));
  const { app, close } = createApp({ databasePath: join(directory, 'test.sqlite') });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let cookie = '';

  suite.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    close();
    await rm(directory, { recursive: true, force: true });
  });

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...options.headers,
      },
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const body = response.status === 204 ? null : await response.json();
    return { response, body };
  }

  await suite.test('validates registration input and persists a new account', async () => {
    const invalid = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'A', email: 'invalid', password: 'short' }),
    });
    assert.equal(invalid.response.status, 400);

    const registered = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Member', email: 'Member@example.com', password: 'long-enough-password' }),
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.body.account.name, 'Test Member');
    assert.equal(registered.body.account.email, 'member@example.com');
    assert.equal(registered.body.account.role, 'member');
    assert.equal('password' in registered.body.account, false);
    assert.match(cookie, /^ascend_session=/);
  });

  await suite.test('rejects duplicate registrations and unauthenticated profile writes', async () => {
    const duplicate = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Member', email: 'member@example.com', password: 'long-enough-password' }),
    });
    assert.equal(duplicate.response.status, 409);

    cookie = '';
    const update = await request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Changed Name' }),
    });
    assert.equal(update.response.status, 401);
  });

  await suite.test('persists profile changes and returns no transaction endpoints', async () => {
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'MEMBER@example.com', password: 'long-enough-password' }),
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.account.name, 'Test Member');

    const profile = await request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Member' }),
    });
    assert.equal(profile.response.status, 200);
    assert.equal(profile.body.account.name, 'Updated Member');

    const current = await request('/api/auth/me');
    assert.equal(current.body.account.name, 'Updated Member');

    const missingTransactionRoute = await request('/api/wallet');
    assert.equal(missingTransactionRoute.response.status, 404);
  });

  await suite.test('exposes the configured Binance deposit address for public display', async () => {
    const previousAddress = process.env.BINANCE_WALLET_ADDRESS;
    process.env.BINANCE_WALLET_ADDRESS = 'TExamplePublicDepositAddress';
    try {
      const config = await request('/api/public-config');
      assert.equal(config.response.status, 200);
      assert.deepEqual(config.body, { binanceWalletAddress: 'TExamplePublicDepositAddress' });
    } finally {
      if (previousAddress === undefined) delete process.env.BINANCE_WALLET_ADDRESS;
      else process.env.BINANCE_WALLET_ADDRESS = previousAddress;
    }
  });

  await suite.test('admin access is restricted to environment-provisioned administrators and member profiles', async () => {
    const memberList = await request('/api/admin/accounts');
    assert.equal(memberList.response.status, 403);

    const target = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Target Member', email: 'target@example.com', password: 'another-long-test-password' }),
    });
    assert.equal(target.response.status, 201);

    const db = new DatabaseSync(join(directory, 'test.sqlite'));
    try {
      db.prepare("UPDATE accounts SET role = 'admin' WHERE email = ?").run('member@example.com');
    } finally {
      db.close();
    }

    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'member@example.com', password: 'long-enough-password' }),
    });
    assert.equal(adminLogin.body.account.role, 'admin');

    const members = await request('/api/admin/accounts');
    assert.equal(members.response.status, 200);
    assert.equal(members.body.accounts.length, 2);
    const targetAccount = members.body.accounts.find((member) => member.email === 'target@example.com');
    assert.ok(targetAccount);

    const updated = await request(`/api/admin/accounts/${targetAccount.id}/profile`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Managed Member' }),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.account.name, 'Managed Member');
    assert.equal(updated.body.account.role, 'member');

    const forbiddenSelfEdit = await request(`/api/admin/accounts/${adminLogin.body.account.id}/profile`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Changed Admin' }),
    });
    assert.equal(forbiddenSelfEdit.response.status, 403);

    const financialRoute = await request('/api/admin/funds');
    assert.equal(financialRoute.response.status, 404);
  });

  await suite.test('logout revokes the session', async () => {
    const logout = await request('/api/auth/logout', { method: 'POST', body: '{}' });
    assert.equal(logout.response.status, 204);
    assert.equal((await request('/api/auth/me')).body.account, null);
  });
});

test('initial administrator is provisioned from deployment environment variables', async (suite) => {
  const directory = await mkdtemp(join(tmpdir(), 'ascend-admin-'));
  const previousEmail = process.env.INITIAL_ADMIN_EMAIL;
  const previousPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const previousStorageMode = process.env.ACCOUNT_STORAGE_MODE;
  process.env.INITIAL_ADMIN_EMAIL = 'site-admin@example.com';
  process.env.INITIAL_ADMIN_PASSWORD = 'a-long-initial-admin-password';
  process.env.ACCOUNT_STORAGE_MODE = 'ephemeral';

  let appInstance;
  let server;
  try {
    appInstance = createApp({ databasePath: join(directory, 'admin.sqlite') });
    server = createServer(appInstance.app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'SITE-ADMIN@example.com', password: 'a-long-initial-admin-password' }),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.account.role, 'admin');
    assert.equal((await fetch(`${baseUrl}/api/admin/accounts`, {
      headers: { Cookie: response.headers.get('set-cookie').split(';')[0] },
    })).status, 200);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    appInstance?.close();
    if (previousEmail === undefined) delete process.env.INITIAL_ADMIN_EMAIL;
    else process.env.INITIAL_ADMIN_EMAIL = previousEmail;
    if (previousPassword === undefined) delete process.env.INITIAL_ADMIN_PASSWORD;
    else process.env.INITIAL_ADMIN_PASSWORD = previousPassword;
    if (previousStorageMode === undefined) delete process.env.ACCOUNT_STORAGE_MODE;
    else process.env.ACCOUNT_STORAGE_MODE = previousStorageMode;
    await rm(directory, { recursive: true, force: true });
  }
});
