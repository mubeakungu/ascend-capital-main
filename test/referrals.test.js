import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createApp } from '../server/app.js';

test('referral codes, signups, and commissions work end to end', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ascend-referrals-'));
  process.env.INITIAL_ADMIN_PASSWORD = 'a-long-initial-admin-password';
  const { app, close } = createApp({ databasePath: join(directory, 'ref.sqlite') });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function call(path, { cookie, ...options } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    });
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, body: await response.json(), cookie: setCookie ? setCookie.split(';')[0] : cookie };
  }

  try {
    const referrer = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Referrer One', email: 'one@example.com', password: 'long-enough-password' }) });
    assert.equal(referrer.status, 201);

    const emptyStats = await call('/api/referrals/stats', { cookie: referrer.cookie });
    assert.match(emptyStats.body.referralCode, /^[A-Z0-9]{8}$/);
    assert.equal(emptyStats.body.directReferrals, 0);
    assert.equal(emptyStats.body.tier, null);

    const code = emptyStats.body.referralCode;
    const again = await call('/api/referrals/code', { cookie: referrer.cookie });
    assert.equal(again.body.code, code);

    const referred = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Referred Two', email: 'two@example.com', password: 'long-enough-password', referralCode: code.toLowerCase() }) });
    assert.equal(referred.status, 201);

    const deposit = await call('/api/transactions', { method: 'POST', cookie: referred.cookie, body: JSON.stringify({ type: 'deposit', amount: '1000', reference: 'TXN-123456' }) });
    assert.equal(deposit.status, 201);

    const login = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin', password: 'a-long-initial-admin-password' }) });
    assert.equal(login.status, 200);
    const changed = await call('/api/auth/password', { method: 'POST', cookie: login.cookie, body: JSON.stringify({ currentPassword: 'a-long-initial-admin-password', newPassword: 'a-different-admin-password' }) });
    assert.equal(changed.status, 200);
    const admin = changed;
    const txId = deposit.body.transaction.id;
    const approved = await call(`/api/admin/transactions/${txId}/approve`, { method: 'POST', cookie: admin.cookie, body: JSON.stringify({}) });
    assert.equal(approved.status, 200);

    const stats = await call('/api/referrals/stats', { cookie: referrer.cookie });
    assert.equal(stats.body.directReferrals, 1);
    assert.equal(stats.body.tier !== null, true);
    assert.equal(stats.body.directVolume, 1000);
    assert.equal(stats.body.totalEarnings, 50);

    const list = await call('/api/referrals/list', { cookie: referrer.cookie });
    assert.equal(list.body.referrals.length, 1);
    assert.equal(list.body.referrals[0].email, 'two@example.com');
    assert.equal(list.body.referrals[0].totalDeposits, 1000);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    close();
    delete process.env.INITIAL_ADMIN_PASSWORD;
    await rm(directory, { recursive: true, force: true });
  }
});
