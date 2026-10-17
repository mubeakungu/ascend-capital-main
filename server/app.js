import { randomBytes, scrypt, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = 'ascend_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_BYTES = 64;
const PASSWORD_OPTIONS = { N: 16384, r: 8, p: 1 };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TX_TYPES = ['deposit', 'withdrawal'];
const TX_STATUSES = ['pending', 'approved', 'rejected'];
const MAX_TX_AMOUNT = 10_000_000;
const ADMIN_USERNAME = 'admin';
const DEFAULT_INITIAL_ADMIN_PASSWORD = 'Admin@123';

// Referral tier commission rates
const REFERRAL_COMMISSION_RATES = [
  0.05,  // Star 1: 5%
  0.06,  // Star 2: 6%
  0.07,  // Star 3: 7%
  0.08,  // Star 4: 8%
  0.10,  // Star 5: 10%
  0.12,  // Star 6: 12%
  0.14,  // Star 7: 14%
  0.16,  // Star 8: 16%
  0.18,  // Crown Leader: 18%
];

const TIER_NAMES = [
  'Star 1', 'Star 2', 'Star 3', 'Star 4', 'Star 5',
  'Star 6', 'Star 7', 'Star 8', 'Crown Leader',
];

function accountView(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role ?? 'member',
    status: row.status ?? 'active',
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
  };
}

function transactionView(row, { admin = false } = {}) {
  const view = {
    id: row.id,
    type: row.type,
    amount: row.amount_cents / 100,
    reference: row.reference,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewNote: row.review_note ?? '',
  };
  if (admin) {
    view.accountId = row.account_id;
    view.accountName = row.account_name;
    view.accountEmail = row.account_email;
    view.reviewedBy = row.reviewed_by ?? null;
  }
  return view;
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  const value = request.headers.cookie
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);

  return value ? decodeURIComponent(value) : null;
}

function setSessionCookie(response, token, secure) {
  response.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}${secure ? '; Secure' : ''}`,
  );
}

function clearSessionCookie(response, secure) {
  response.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`,
  );
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return 'Password must be between 12 and 128 characters.';
  }
  return null;
}

function validationMessage({ name, email, password }, requireName) {
  if (requireName && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80)) {
    return 'Name must be between 2 and 80 characters.';
  }
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    return 'Enter a valid email address.';
  }
  return passwordError(password);
}

function loginMessage({ email, password }) {
  const identifier = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (identifier !== ADMIN_USERNAME && (identifier.length > 254 || !EMAIL_PATTERN.test(identifier))) {
    return 'Enter a valid email address or username.';
  }
  return typeof password === 'string' && password.length > 0 && password.length <= 128 ? null : 'Enter your password.';
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function cleanText(value, { min, max }) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length < min || text.length > max) return null;
  return text;
}

function parseAmountCents(value) {
  const number = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0 || number > MAX_TX_AMOUNT) return null;
  const cents = Math.round(number * 100);
  if (Math.abs(number * 100 - cents) > 1e-6) return null;
  return cents;
}

function createRateLimiter({ limit, windowMs }) {
  const attempts = new Map();
  let nextCleanup = 0;

  return (request, response, next) => {
    const now = Date.now();
    if (now >= nextCleanup) {
      for (const [ip, entry] of attempts) {
        if (entry.resetAt <= now) attempts.delete(ip);
      }
      nextCleanup = now + windowMs;
    }

    const ip = request.ip;
    let entry = attempts.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      attempts.set(ip, entry);
    }

    entry.count += 1;
    if (entry.count > limit) {
      response.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return response.status(429).json({ error: 'Too many account requests. Try again later.' });
    }
    return next();
  };
}

// Referral helper functions
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getTierByDirectReferrals(directCount) {
  if (directCount < 1) return -1;
  if (directCount < 3) return 0;
  if (directCount < 6) return 1;
  if (directCount < 10) return 2;
  if (directCount < 15) return 3;
  if (directCount < 25) return 4;
  if (directCount < 40) return 5;
  if (directCount < 60) return 6;
  if (directCount < 100) return 7;
  return 8;
}

export function createApp({ databasePath }) {
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  `);
  const accountColumns = db.prepare('PRAGMA table_info(accounts)').all();
  if (!accountColumns.some((column) => column.name === 'role')) {
    db.exec("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin'))");
  }
  if (!accountColumns.some((column) => column.name === 'status')) {
    db.exec("ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'held'))");
  }
  if (!accountColumns.some((column) => column.name === 'hold_reason')) {
    db.exec('ALTER TABLE accounts ADD COLUMN hold_reason TEXT');
  }
  if (!accountColumns.some((column) => column.name === 'held_at')) {
    db.exec('ALTER TABLE accounts ADD COLUMN held_at TEXT');
  }
  if (!accountColumns.some((column) => column.name === 'must_change_password')) {
    db.exec('ALTER TABLE accounts ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      reference TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_note TEXT
    );
    CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions(account_id, created_at);
    CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS transactions_deposit_reference_idx
      ON transactions(reference COLLATE NOCASE)
      WHERE type = 'deposit' AND status IN ('pending', 'approved');
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_id TEXT,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at);
    CREATE TABLE IF NOT EXISTS referral_codes (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS referral_codes_account_idx ON referral_codes(account_id);
    CREATE TABLE IF NOT EXISTS referral_signups (
      id TEXT PRIMARY KEY,
      referrer_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      referral_code TEXT REFERENCES referral_codes(code) ON DELETE SET NULL,
      referred_account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      signed_up_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS referral_signups_referrer_idx ON referral_signups(referrer_id);
    CREATE INDEX IF NOT EXISTS referral_signups_referred_idx ON referral_signups(referred_account_id);
    CREATE TABLE IF NOT EXISTS referral_commissions (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      referred_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      commission_cents INTEGER NOT NULL CHECK(commission_cents > 0),
      commission_rate REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS referral_commissions_referrer_idx ON referral_commissions(referrer_id);
    CREATE INDEX IF NOT EXISTS referral_commissions_transaction_idx ON referral_commissions(transaction_id);
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      entry_price REAL NOT NULL,
      quantity REAL NOT NULL,
      stop_loss REAL,
      take_profit REAL,
      close_price REAL,
      pnl_cents INTEGER,
      status TEXT NOT NULL CHECK(status IN ('OPEN', 'CLOSED')),
      opened_at TEXT NOT NULL,
      closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS trades_account_idx ON trades(account_id);
    CREATE INDEX IF NOT EXISTS trades_user_idx ON trades(user_id);
    CREATE TABLE IF NOT EXISTS daily_trades (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      trade_date TEXT NOT NULL,
      profit_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, trade_date)
    );
    CREATE INDEX IF NOT EXISTS daily_trades_user_idx ON daily_trades(user_id);
    CREATE TABLE IF NOT EXISTS bonuses (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS bonuses_account_idx ON bonuses(account_id);
    CREATE TABLE IF NOT EXISTS balance_adjustments (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS balance_adjustments_account_idx ON balance_adjustments(account_id);

  `);

  const app = express();
  const secureCookie = process.env.NODE_ENV === 'production';
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? (secureCookie ? 1 : 0));
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.');
  }
  const authRateLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
  const passwordRateLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
  const updateRateLimit = createRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  app.use((request, response, next) => {
    response.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });

    if (request.path.startsWith('/api/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
      const origin = request.get('origin');
      if (origin && origin !== `${request.protocol}://${request.get('host')}`) {
        return response.status(403).json({ error: 'Request origin is not allowed.' });
      }
      if (!request.is('application/json')) {
        return response.status(415).json({ error: 'Content-Type must be application/json.' });
      }
    }
    return next();
  });
  app.use(express.json({ limit: '10kb', strict: true }));

  function withTransaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function recordAudit(request, action, targetId, detail = {}) {
    db.prepare(`
      INSERT INTO audit_log (actor_id, actor_email, action, target_id, detail, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.account?.id ?? null,
      request.account?.email ?? null,
      action,
      targetId ?? null,
      JSON.stringify(detail),
      request.ip ?? null,
      new Date().toISOString(),
    );
  }

  function approvedBalanceCents(accountId) {
    const row = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount_cents ELSE -amount_cents END), 0) AS balance
      FROM transactions
      WHERE account_id = ? AND status = 'approved'
    `).get(accountId);
    return row.balance;
  }

  function pendingWithdrawalsCents(accountId) {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM transactions
      WHERE account_id = ? AND type = 'withdrawal' AND status = 'pending'
    `).get(accountId);
    return row.total;
  }

  function getTransaction(id) {
    return db.prepare(`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ?
    `).get(id);
  }

  function currentAccount(request) {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return null;

    const tokenHash = hashToken(token);
    const now = Date.now();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    const row = db.prepare(`
      SELECT accounts.id, accounts.name, accounts.email, accounts.created_at, accounts.role, accounts.status,
        accounts.must_change_password
      FROM sessions
      JOIN accounts ON accounts.id = sessions.account_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND accounts.status = 'active'
    `).get(tokenHash, now);
    return row ?? null;
  }

  function requireAccount(request, response, next) {
    const account = currentAccount(request);
    if (!account) return response.status(401).json({ error: 'Sign in to continue.' });
    request.account = account;
    return next();
  }

  function requireAdmin(request, response, next) {
    if (request.account.role !== 'admin') {
      return response.status(403).json({ error: 'Administrator access is required.' });
    }
    if (request.account.must_change_password) {
      return response.status(403).json({
        error: 'Change your temporary password to continue.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    return next();
  }

  function seedInitialAdmin() {
    const password = process.env.INITIAL_ADMIN_PASSWORD || DEFAULT_INITIAL_ADMIN_PASSWORD;
    if (password.length > 128) throw new Error('INITIAL_ADMIN_PASSWORD must be at most 128 characters.');

    const resetRequested = process.env.RESET_ADMIN_PASSWORD === 'true';
    const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(ADMIN_USERNAME);
    if (existing && !resetRequested) {
      db.prepare("UPDATE accounts SET role = 'admin' WHERE id = ?").run(existing.id);
      return;
    }

    const salt = randomBytes(16);
    const passwordHash = scryptSync(password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);

    if (existing) {
      withTransaction(() => {
        db.prepare(`
          UPDATE accounts
          SET role = 'admin', status = 'active', password_salt = ?, password_hash = ?, must_change_password = 1
          WHERE id = ?
        `).run(salt.toString('hex'), passwordHash.toString('hex'), existing.id);
        db.prepare('DELETE FROM sessions WHERE account_id = ?').run(existing.id);
        recordAudit({}, 'admin.password_reset_switch', existing.id, {});
      });
      return;
    }

    const id = randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO accounts (id, name, email, password_salt, password_hash, created_at, role, must_change_password)
      VALUES (?, 'Administrator', ?, ?, ?, ?, 'admin', 1)
    `).run(id, ADMIN_USERNAME, salt.toString('hex'), passwordHash.toString('hex'), new Date().toISOString());
  }

  async function createAccountSession(accountId, response) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_DURATION_SECONDS * 1000;
    db.prepare('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), accountId, expiresAt);
    setSessionCookie(response, token, secureCookie);
  }

  function getOrCreateReferralCode(accountId) {
    const existing = db.prepare('SELECT code FROM referral_codes WHERE account_id = ? LIMIT 1').get(accountId);
    if (existing) return { code: existing.code, created: false };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        db.prepare('INSERT INTO referral_codes (id, account_id, code, created_at) VALUES (?, ?, ?, ?)')
          .run(randomBytes(16).toString('hex'), accountId, generateReferralCode(), new Date().toISOString());
        break;
      } catch (error) {
        if (attempt === 9) throw error;
      }
    }
    return { code: db.prepare('SELECT code FROM referral_codes WHERE account_id = ? LIMIT 1').get(accountId).code, created: true };
  }

  function trackReferralSignup(accountId, referralCode) {
    if (!referralCode || typeof referralCode !== 'string') return;
    const codeRecord = db.prepare('SELECT account_id FROM referral_codes WHERE code = ? COLLATE NOCASE')
      .get(referralCode);

    if (!codeRecord) return;

    const id = randomBytes(16).toString('hex');
    try {
      db.prepare(`
        INSERT INTO referral_signups (id, referrer_id, referral_code, referred_account_id, signed_up_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, codeRecord.account_id, referralCode.toUpperCase(), accountId, new Date().toISOString());
    } catch (error) {
      // Ignore duplicate referral signups
    }
  }

  function applyReferralCommission(transactionId) {
    const tx = db.prepare(`
      SELECT t.*, a.id AS account_id
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.id = ?
    `).get(transactionId);

    if (!tx || tx.type !== 'deposit' || tx.status !== 'approved') return null;

    const referralSignup = db.prepare(`
      SELECT referrer_id FROM referral_signups WHERE referred_account_id = ? LIMIT 1
    `).get(tx.account_id);

    if (!referralSignup) return null;

    const referrerId = referralSignup.referrer_id;
    const directCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM referral_signups WHERE referrer_id = ?
    `).get(referrerId).cnt;

    const tier = getTierByDirectReferrals(directCount);
    if (tier < 0) return null;

    const commissionRate = REFERRAL_COMMISSION_RATES[tier];
    const commissionCents = Math.round(tx.amount_cents * commissionRate);

    const commissionId = randomBytes(16).toString('hex');
    try {
      db.prepare(`
        INSERT INTO referral_commissions (id, referrer_id, transaction_id, referred_account_id, commission_cents, commission_rate, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        commissionId,
        referrerId,
        transactionId,
        tx.account_id,
        commissionCents,
        commissionRate,
        new Date().toISOString(),
      );
      return { commissionId, amount: commissionCents / 100 };
    } catch (error) {
      return null;
    }
  }

  seedInitialAdmin();

  app.get('/api/health', (_request, response) => response.json({
    status: 'ok',
    accountStorage: process.env.ACCOUNT_STORAGE_MODE ?? 'local',
  }));

  app.get('/api/public-config', (_request, response) => response.json({
    primeWalletAddress: process.env.PRIME_WALLET_ADDRESS?.trim() ?? '',
  }));

  app.post('/api/auth/register', authRateLimit, async (request, response, next) => {
    try {
      const input = request.body ?? {};
      const error = validationMessage(input, true);
      if (error) return response.status(400).json({ error });

      const email = input.email.trim().toLowerCase();
      const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email);
      if (existing) return response.status(409).json({ error: 'An account with this email already exists.' });

      const salt = randomBytes(16);
      const passwordHash = await scryptAsync(input.password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      const id = randomBytes(16).toString('hex');
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO accounts (id, name, email, password_salt, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, input.name.trim(), email, salt.toString('hex'), passwordHash.toString('hex'), createdAt);

      // Track referral if provided
      const referralCode = input.referralCode?.trim().toUpperCase();
      if (referralCode) {
        trackReferralSignup(id, referralCode);
      }

      const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?').get(id);
      await createAccountSession(id, response);
      return response.status(201).json({ account: accountView(account) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/login', authRateLimit, async (request, response, next) => {
    try {
      const input = request.body ?? {};
      const error = loginMessage(input);
      if (error) return response.status(400).json({ error });

      const email = input.email.trim().toLowerCase();
      const row = db.prepare(`
        SELECT id, name, email, password_salt, password_hash, created_at, role, status, must_change_password
        FROM accounts WHERE email = ?
      `).get(email);

      const salt = row ? Buffer.from(row.password_salt, 'hex') : Buffer.alloc(16);
      const storedHash = row ? Buffer.from(row.password_hash, 'hex') : Buffer.alloc(PASSWORD_BYTES);
      const candidate = await scryptAsync(input.password, salt, PASSWORD_BYTES, PASSWORD_OPTIONS);
      if (!row || !timingSafeEqual(candidate, storedHash)) {
        return response.status(401).json({ error: 'Email or password is incorrect.' });
      }

      if (row.status === 'held') {
        return response.status(403).json({ error: 'This account is on hold. Please contact support.' });
      }

      db.prepare('DELETE FROM sessions WHERE account_id = ?').run(row.id);
      await createAccountSession(row.id, response);
      return response.json({ account: accountView(row) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/me', (request, response) => {
    const account = currentAccount(request);
    return response.json({ account: account ? accountView(account) : null });
  });

  app.patch('/api/auth/profile', updateRateLimit, requireAccount, (request, response) => {
    const name = request.body?.name;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    }
    db.prepare('UPDATE accounts SET name = ? WHERE id = ?').run(name.trim(), request.account.id);
    const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?')
      .get(request.account.id);
    return response.json({ account: accountView(account) });
  });

  app.post('/api/auth/password', passwordRateLimit, requireAccount, async (request, response, next) => {
    try {
      const { currentPassword, newPassword } = request.body ?? {};
      if (typeof currentPassword !== 'string' || currentPassword.length === 0 || currentPassword.length > 128) {
        return response.status(400).json({ error: 'Enter your current password.' });
      }
      const newError = passwordError(newPassword);
      if (newError) return response.status(400).json({ error: newError });
      if (newPassword === currentPassword) {
        return response.status(400).json({ error: 'New password must be different from the current password.' });
      }

      const row = db.prepare('SELECT password_salt, password_hash FROM accounts WHERE id = ?').get(request.account.id);
      const candidate = await scryptAsync(
        currentPassword,
        Buffer.from(row.password_salt, 'hex'),
        PASSWORD_BYTES,
        PASSWORD_OPTIONS,
      );
      if (!timingSafeEqual(candidate, Buffer.from(row.password_hash, 'hex'))) {
        return response.status(401).json({ error: 'Current password is incorrect.' });
      }

      const hashed = await hashPassword(newPassword);
      withTransaction(() => {
        db.prepare('UPDATE accounts SET password_salt = ?, password_hash = ?, must_change_password = 0 WHERE id = ?')
          .run(hashed.salt, hashed.hash, request.account.id);
        db.prepare('DELETE FROM sessions WHERE account_id = ?').run(request.account.id);
        recordAudit(request, 'password.change_self', request.account.id, { role: request.account.role });
      });
      await createAccountSession(request.account.id, response);
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/logout', (request, response, next) => {
    try {
      const token = readCookie(request, SESSION_COOKIE);
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
      clearSessionCookie(response, secureCookie);
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  // ---------------------------------------------------------------------------
  // Referral Endpoints
  // ---------------------------------------------------------------------------

  app.get('/api/referrals/code', requireAccount, (request, response) => {
    const { code, created } = getOrCreateReferralCode(request.account.id);
    return response.status(created ? 201 : 200).json({ code });
  });

  app.get('/api/referrals/stats', requireAccount, (request, response) => {
    const directStats = db.prepare(`
      SELECT COUNT(DISTINCT rs.id) AS direct_count,
        COALESCE(SUM(CASE WHEN t.type = 'deposit' AND t.status = 'approved' THEN t.amount_cents ELSE 0 END), 0) AS direct_volume
      FROM referral_signups rs
      LEFT JOIN accounts a ON a.id = rs.referred_account_id
      LEFT JOIN transactions t ON t.account_id = a.id
      WHERE rs.referrer_id = ?
    `).get(request.account.id);

    const commissionStats = db.prepare(`
      SELECT COUNT(*) AS commission_count,
        COALESCE(SUM(commission_cents), 0) AS total_commission_cents
      FROM referral_commissions
      WHERE referrer_id = ?
    `).get(request.account.id);

    const tier = getTierByDirectReferrals(directStats.direct_count);
    const tierName = tier >= 0 ? TIER_NAMES[tier] : null;
    const commissionRate = tier >= 0 ? REFERRAL_COMMISSION_RATES[tier] : 0;

    return response.json({
      referralCode: getOrCreateReferralCode(request.account.id).code,
      tier: tierName,
      commissionRate: commissionRate,
      directReferrals: directStats.direct_count,
      directVolume: directStats.direct_volume / 100,
      commissionsEarned: commissionStats.commission_count,
      totalEarnings: commissionStats.total_commission_cents / 100,
    });
  });

  app.get('/api/referrals/list', requireAccount, (request, response) => {
    const referrals = db.prepare(`
      SELECT
        rs.id,
        a.id AS account_id,
        a.name,
        a.email,
        rs.signed_up_at,
        COALESCE(SUM(CASE WHEN t.type = 'deposit' AND t.status = 'approved' THEN t.amount_cents ELSE 0 END), 0) AS total_deposits
      FROM referral_signups rs
      JOIN accounts a ON a.id = rs.referred_account_id
      LEFT JOIN transactions t ON t.account_id = a.id
      WHERE rs.referrer_id = ?
      GROUP BY a.id
      ORDER BY rs.signed_up_at DESC
      LIMIT 100
    `).all(request.account.id);

    return response.json({
      referrals: referrals.map(r => ({
        id: r.account_id,
        name: r.name,
        email: r.email,
        signedUpAt: r.signed_up_at,
        totalDeposits: r.total_deposits / 100,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  app.post('/api/transactions', updateRateLimit, requireAccount, (request, response, next) => {
    try {
      if (request.account.role === 'admin') {
        return response.status(403).json({ error: 'Administrator accounts cannot request transactions.' });
      }
      const input = request.body ?? {};
      if (!TX_TYPES.includes(input.type)) {
        return response.status(400).json({ error: 'Type must be deposit or withdrawal.' });
      }
      const amountCents = parseAmountCents(input.amount);
      if (amountCents === null) {
        return response.status(400).json({ error: 'Enter a valid amount with at most two decimal places.' });
      }
      const reference = cleanText(input.reference, { min: 3, max: 120 });
      if (reference === null) {
        return response.status(400).json({
          error: input.type === 'deposit'
            ? 'Enter the payment reference or transaction code (3-120 characters).'
            : 'Enter the withdrawal destination (3-120 characters).',
        });
      }

      if (input.type === 'withdrawal') {
        const available = approvedBalanceCents(request.account.id) - pendingWithdrawalsCents(request.account.id);
        if (amountCents > available) {
          return response.status(409).json({ error: 'Withdrawal exceeds your available balance.' });
        }
      } else {
        const duplicate = db.prepare(`
          SELECT id FROM transactions
          WHERE type = 'deposit' AND reference = ? COLLATE NOCASE AND status IN ('pending', 'approved')
        `).get(reference);
        if (duplicate) {
          return response.status(409).json({ error: 'A deposit with this reference was already submitted.' });
        }
      }

      const id = randomBytes(16).toString('hex');
      db.prepare(`
        INSERT INTO transactions (id, account_id, type, amount_cents, reference, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `).run(id, request.account.id, input.type, amountCents, reference, new Date().toISOString());

      return response.status(201).json({ transaction: transactionView(getTransaction(id)) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/transactions', requireAccount, (request, response) => {
    const rows = db.prepare(`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.account_id = ?
      ORDER BY t.created_at DESC
      LIMIT 100
    `).all(request.account.id);
    return response.json({
      balance: approvedBalanceCents(request.account.id) / 100,
      pendingWithdrawals: pendingWithdrawalsCents(request.account.id) / 100,
      transactions: rows.map((row) => transactionView(row)),
    });
  });

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  const adminLimiter = createRateLimiter({ limit: 60, windowMs: 15 * 60 * 1000 });

  app.get('/api/admin/accounts', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const accounts = db.prepare(`
      SELECT a.id, a.name, a.email, a.created_at, a.role, a.status, a.hold_reason, a.held_at,
        COALESCE((
          SELECT SUM(CASE WHEN t.type = 'deposit' THEN t.amount_cents ELSE -t.amount_cents END)
          FROM transactions t
          WHERE t.account_id = a.id AND t.status = 'approved'
        ), 0) AS balance_cents,
        (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id AND t.status = 'pending') AS pending_count
      FROM accounts a
      ORDER BY a.created_at DESC
      LIMIT 100
    `).all().map((row) => ({
      ...accountView(row),
      holdReason: row.hold_reason ?? null,
      heldAt: row.held_at ?? null,
      balance: row.balance_cents / 100,
      pendingTransactions: row.pending_count,
    }));
    return response.json({ accounts });
  });

  app.patch('/api/admin/accounts/:id/profile', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const name = request.body?.name;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
      return response.status(400).json({ error: 'Name must be between 2 and 80 characters.' });
    }

    const target = db.prepare('SELECT id, role FROM accounts WHERE id = ?').get(request.params.id);
    if (!target) return response.status(404).json({ error: 'Member account not found.' });
    if (target.role === 'admin') return response.status(403).json({ error: 'Administrator profiles cannot be changed here.' });

    db.prepare('UPDATE accounts SET name = ? WHERE id = ?').run(name.trim(), target.id);
    const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?').get(target.id);
    return response.json({ account: accountView(account) });
  });

  app.get('/api/admin/accounts/:id/activity', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const account = db.prepare(`
      SELECT id, name, email, created_at, role, status, hold_reason, held_at
      FROM accounts WHERE id = ?
    `).get(request.params.id);
    if (!account) return response.status(404).json({ error: 'Account not found.' });

    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' AND type = 'deposit' THEN amount_cents END), 0) AS deposited,
        COALESCE(SUM(CASE WHEN status = 'approved' AND type = 'withdrawal' THEN amount_cents END), 0) AS withdrawn,
        COALESCE(SUM(CASE WHEN status = 'pending' AND type = 'deposit' THEN amount_cents END), 0) AS pending_deposits,
        COALESCE(SUM(CASE WHEN status = 'pending' AND type = 'withdrawal' THEN amount_cents END), 0) AS pending_withdrawals,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 END), 0) AS rejected_count
      FROM transactions WHERE account_id = ?
    `).get(account.id);

    const recent = db.prepare(`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      WHERE t.account_id = ?
      ORDER BY t.created_at DESC
      LIMIT 50
    `).all(account.id);

    return response.json({
      account: {
        ...accountView(account),
        holdReason: account.hold_reason ?? null,
        heldAt: account.held_at ?? null,
      },
      summary: {
        balance: (totals.deposited - totals.withdrawn) / 100,
        totalDeposited: totals.deposited / 100,
        totalWithdrawn: totals.withdrawn / 100,
        pendingDeposits: totals.pending_deposits / 100,
        pendingWithdrawals: totals.pending_withdrawals / 100,
        rejectedCount: totals.rejected_count,
      },
      transactions: recent.map((row) => transactionView(row, { admin: true })),
    });
  });

  app.get('/api/admin/transactions', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const { status, type, accountId } = request.query;
    const where = [];
    const params = [];

    if (status !== undefined) {
      if (!TX_STATUSES.includes(status)) return response.status(400).json({ error: 'Invalid status filter.' });
      where.push('t.status = ?');
      params.push(status);
    }
    if (type !== undefined) {
      if (!TX_TYPES.includes(type)) return response.status(400).json({ error: 'Invalid type filter.' });
      where.push('t.type = ?');
      params.push(type);
    }
    if (accountId !== undefined) {
      if (typeof accountId !== 'string' || accountId.length === 0 || accountId.length > 64) {
        return response.status(400).json({ error: 'Invalid account filter.' });
      }
      where.push('t.account_id = ?');
      params.push(accountId);
    }

    const rows = db.prepare(`
      SELECT t.*, a.name AS account_name, a.email AS account_email
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY t.created_at DESC
      LIMIT 200
    `).all(...params);
    return response.json({ transactions: rows.map((row) => transactionView(row, { admin: true })) });
  });

  function reviewTransaction(decision) {
    return (request, response, next) => {
      try {
        const note = request.body?.note == null ? '' : cleanText(request.body.note, { min: 0, max: 300 });
        if (note === null) return response.status(400).json({ error: 'Note must be at most 300 characters.' });
        if (decision === 'rejected' && note.length < 3) {
          return response.status(400).json({ error: 'A reason is required to reject a transaction.' });
        }

        const tx = getTransaction(request.params.id);
        if (!tx) return response.status(404).json({ error: 'Transaction not found.' });
        if (tx.status !== 'pending') {
          return response.status(409).json({ error: `Transaction is already ${tx.status}.` });
        }
        if (decision === 'approved') {
          if (tx.account_id === request.account.id) {
            return response.status(403).json({ error: 'You cannot approve your own transaction.' });
          }
          const owner = db.prepare('SELECT status FROM accounts WHERE id = ?').get(tx.account_id);
          if (owner.status === 'held') {
            return response.status(409).json({ error: 'This account is on hold. Release it before approving.' });
          }
          if (tx.type === 'withdrawal' && approvedBalanceCents(tx.account_id) < tx.amount_cents) {
            return response.status(409).json({ error: 'Insufficient approved balance for this withdrawal.' });
          }
        }

        withTransaction(() => {
          db.prepare(`
            UPDATE transactions
            SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?
            WHERE id = ? AND status = 'pending'
          `).run(decision, request.account.id, new Date().toISOString(), note, tx.id);
          recordAudit(request, `transaction.${decision}`, tx.id, {
            type: tx.type,
            amount: tx.amount_cents / 100,
            accountId: tx.account_id,
            accountEmail: tx.account_email,
            note,
          });

          // Apply referral commission if approved
          if (decision === 'approved') {
            const commission = applyReferralCommission(tx.id);
            if (commission) {
              recordAudit(request, 'referral.commission_earned', tx.account_id, {
                amount: commission.amount,
                commissionId: commission.commissionId,
              });
            }
          }
        });

        return response.json({ transaction: transactionView(getTransaction(tx.id), { admin: true }) });
      } catch (error) {
        return next(error);
      }
    };
  }

  app.post('/api/admin/transactions/:id/approve', adminLimiter, requireAccount, requireAdmin, reviewTransaction('approved'));
  app.post('/api/admin/transactions/:id/reject', adminLimiter, requireAccount, requireAdmin, reviewTransaction('rejected'));

  app.post('/api/admin/accounts/:id/hold', adminLimiter, requireAccount, requireAdmin, (request, response, next) => {
    try {
      const reason = cleanText(request.body?.reason, { min: 3, max: 300 });
      if (reason === null) {
        return response.status(400).json({ error: 'A hold reason of 3-300 characters is required.' });
      }
      const target = db.prepare('SELECT id, email, role, status FROM accounts WHERE id = ?').get(request.params.id);
      if (!target) return response.status(404).json({ error: 'Member account not found.' });
      if (target.role === 'admin') return response.status(403).json({ error: 'Administrator accounts cannot be put on hold.' });
      if (target.status === 'held') return response.status(409).json({ error: 'Account is already on hold.' });

      withTransaction(() => {
        db.prepare("UPDATE accounts SET status = 'held', hold_reason = ?, held_at = ? WHERE id = ?")
          .run(reason, new Date().toISOString(), target.id);
        db.prepare('DELETE FROM sessions WHERE account_id = ?').run(target.id);
        recordAudit(request, 'account.hold', target.id, { email: target.email, reason });
      });

      const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?').get(target.id);
      return response.json({ account: accountView(account) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/accounts/:id/release', adminLimiter, requireAccount, requireAdmin, (request, response, next) => {
    try {
      const note = request.body?.note == null ? '' : cleanText(request.body.note, { min: 0, max: 300 });
      if (note === null) return response.status(400).json({ error: 'Note must be at most 300 characters.' });

      const target = db.prepare('SELECT id, email, role, status FROM accounts WHERE id = ?').get(request.params.id);
      if (!target) return response.status(404).json({ error: 'Member account not found.' });
      if (target.status !== 'held') return response.status(409).json({ error: 'Account is not on hold.' });

      withTransaction(() => {
        db.prepare("UPDATE accounts SET status = 'active', hold_reason = NULL, held_at = NULL WHERE id = ?")
          .run(target.id);
        recordAudit(request, 'account.release', target.id, { email: target.email, note });
      });

      const account = db.prepare('SELECT id, name, email, created_at, role, status, must_change_password FROM accounts WHERE id = ?').get(target.id);
      return response.json({ account: accountView(account) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/admin/accounts/:id/password', adminLimiter, requireAccount, requireAdmin, async (request, response, next) => {
    try {
      const newError = passwordError(request.body?.newPassword);
      if (newError) return response.status(400).json({ error: newError });

      const target = db.prepare('SELECT id, email, role FROM accounts WHERE id = ?').get(request.params.id);
      if (!target) return response.status(404).json({ error: 'Member account not found.' });
      if (target.role === 'admin') {
        return response.status(403).json({ error: 'Administrator passwords can only be changed by that administrator.' });
      }

      const hashed = await hashPassword(request.body.newPassword);
      withTransaction(() => {
        db.prepare('UPDATE accounts SET password_salt = ?, password_hash = ? WHERE id = ?')
          .run(hashed.salt, hashed.hash, target.id);
        db.prepare('DELETE FROM sessions WHERE account_id = ?').run(target.id);
        recordAudit(request, 'password.reset_by_admin', target.id, { email: target.email });
      });
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  // Admin: view all referral data for a member
  app.get('/api/admin/referrals/:accountId', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const account = db.prepare('SELECT id, name, email FROM accounts WHERE id = ?').get(request.params.accountId);
    if (!account) return response.status(404).json({ error: 'Account not found.' });

    const directStats = db.prepare(`
      SELECT COUNT(*) AS direct_count
      FROM referral_signups WHERE referrer_id = ?
    `).get(account.id);

    const commissions = db.prepare(`
      SELECT
        rc.id,
        rc.commission_cents,
        rc.commission_rate,
        rc.created_at,
        a.name AS referred_name,
        a.email AS referred_email,
        t.amount_cents,
        t.type
      FROM referral_commissions rc
      JOIN accounts a ON a.id = rc.referred_account_id
      JOIN transactions t ON t.id = rc.transaction_id
      WHERE rc.referrer_id = ?
      ORDER BY rc.created_at DESC
      LIMIT 100
    `).all(account.id);

    const tier = getTierByDirectReferrals(directStats.direct_count);

    return response.json({
      account: { id: account.id, name: account.name, email: account.email },
      tier: tier >= 0 ? TIER_NAMES[tier] : null,
      directReferrals: directStats.direct_count,
      commissions: commissions.map(c => ({
        id: c.id,
        referredName: c.referred_name,
        referredEmail: c.referred_email,
        transactionAmount: c.amount_cents / 100,
        transactionType: c.type,
        commissionRate: c.commission_rate,
        commissionEarned: c.commission_cents / 100,
        earnedAt: c.created_at,
      })),
    });
  });

  app.get('/api/admin/audit', adminLimiter, requireAccount, requireAdmin, (request, response) => {
    const { action } = request.query;
    if (action !== undefined && (typeof action !== 'string' || action.length === 0 || action.length > 64)) {
      return response.status(400).json({ error: 'Invalid action filter.' });
    }
    const rows = db.prepare(`
      SELECT id, actor_id, actor_email, action, target_id, detail, ip, created_at
      FROM audit_log
      ${action ? 'WHERE action = ?' : ''}
      ORDER BY id DESC
      LIMIT 200
    `).all(...(action ? [action] : []));
    return response.json({
      entries: rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorEmail: row.actor_email,
        action: row.action,
        targetId: row.target_id,
        detail: row.detail ? JSON.parse(row.detail) : {},
        ip: row.ip,
        createdAt: row.created_at,
      })),
    });
  });

  app.use('/api', (_request, response) => response.status(404).json({ error: 'API endpoint not found.' }));

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ error: 'Request body must contain valid JSON.' });
    }
    console.error('Request failed:', error);
    return response.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return { app, close: () => db.close() };
}

// ────────────────────────────────────────────────────────────────────────────
// PRIME HOUR TRADING SYSTEM
// ────────────────────────────────────────────────────────────────────────────

const DEPOSIT_PACKAGES = [300, 400, 500, 750, 1000, 2000, 5000, 10000, 20000, 35000];
const DAILY_TRADE_PROFITS = {
  300: 8,
  400: 11,
  500: 15.50,
  750: 25,
  1000: 35,
  2000: 70,
  5000: 180,
  10000: 370,
  20000: 750,
  35000: 1400,
};

const PRIME_HOUR = parseInt(process.env.PRIME_HOUR || '5');
const TRADE_SYMBOL = process.env.TRADE_SYMBOL || 'BTCUSDT';

function calculateDailyProfit(totalDeposit) {
  let profit = 0;
  for (const pkg of DEPOSIT_PACKAGES) {
    if (totalDeposit >= pkg) profit = DAILY_TRADE_PROFITS[pkg];
    else break;
  }
  return profit;
}

async function getLivePrice(symbol = TRADE_SYMBOL) {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error('Failed to get live price:', error);
    return null;
  }
}

async function runDailyTrades() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const price = await getLivePrice();
  
  if (!price) {
    console.error('Cannot run trades: no price data');
    return;
  }

  const pctGain = 0.004; // 0.4% gain
  const closePrice = Math.round(price * (1 + pctGain) * 100) / 100;
  const priceDiff = closePrice - price;

  if (priceDiff <= 0) {
    console.error('Price diff is zero or negative, aborting trades');
    return;
  }

  try {
    const clients = db.prepare(`
      SELECT a.id, a.user_id, a.balance,
             COALESCE(SUM(t.amount_cents), 0) as total_deposits
      FROM accounts a
      LEFT JOIN (
        SELECT account_id, amount_cents FROM transactions 
        WHERE type = 'deposit' AND status = 'approved'
      ) t ON a.id = t.account_id
      GROUP BY a.id, a.user_id, a.balance
      HAVING COALESCE(SUM(t.amount_cents), 0) >= 30000
    `).all();

    let tradedCount = 0;
    for (const client of clients) {
      const totalDeposit = client.total_deposits / 100;
      const dailyProfit = calculateDailyProfit(totalDeposit);
      
      if (dailyProfit === 0) continue;

      const tradeId = randomBytes(16).toString('hex');
      const quantity = Math.round((dailyProfit / priceDiff) * 1000000) / 1000000;
      const sl = Math.round(price * 0.985 * 100) / 100;
      const tp = closePrice;
      const openedAt = new Date(now.getTime() - Math.random() * 90 * 60000).toISOString();
      const closedAt = now.toISOString();

      try {
        db.prepare(`
          INSERT INTO daily_trades (id, account_id, user_id, trade_date, profit_cents, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id, trade_date) DO NOTHING
        `).run(randomBytes(16).toString('hex'), client.id, client.user_id, today, Math.round(dailyProfit * 100), now.toISOString());

        db.prepare(`
          INSERT INTO trades (id, account_id, user_id, symbol, direction, entry_price, quantity, stop_loss, take_profit, close_price, pnl_cents, status, opened_at, closed_at)
          VALUES (?, ?, ?, ?, 'BUY', ?, ?, ?, ?, ?, ?, 'CLOSED', ?, ?)
        `).run(tradeId, client.id, client.user_id, TRADE_SYMBOL, price, quantity, sl, tp, closePrice, Math.round(dailyProfit * 100), openedAt, closedAt);

        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(Math.round(dailyProfit * 100), client.id);

        tradedCount++;
        console.log(`✓ Trade for ${client.user_id}: +$${dailyProfit} (deposit: $${totalDeposit})`);
      } catch (error) {
        console.error(`Trade failed for ${client.user_id}:`, error);
      }
    }

    console.log(`Daily trades complete: ${tradedCount}/${clients.length} clients credited`);
  } catch (error) {
    console.error('Daily trades error:', error);
  }
}

let lastTradeDate = null;
function startTradeScheduler() {
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === PRIME_HOUR && now.getMinutes() === 0 && lastTradeDate !== now.toDateString()) {
      lastTradeDate = now.toDateString();
      console.log(`[${now.toISOString()}] Running daily trades...`);
      await runDailyTrades();
    }
  }, 60000);
  console.log(`Trade scheduler started (runs at ${PRIME_HOUR}:00 UTC daily)`);
}

// Start scheduler on app init
if (process.env.NODE_ENV !== 'test') {
  startTradeScheduler();
}

// Expose trade endpoints
app.get('/api/client/trades', requireAccount, (request, response) => {
  const trades = db.prepare('SELECT * FROM trades WHERE user_id = ? ORDER BY closed_at DESC LIMIT 50').all(request.account.id);
  return response.json({ trades });
});

app.get('/api/client/balance-history', requireAccount, (request, response) => {
  const txns = db.prepare(`
    SELECT type, amount_cents, created_at FROM transactions 
    WHERE account_id = ? AND type IN ('deposit', 'withdrawal')
    ORDER BY created_at DESC LIMIT 100
  `).all(request.account.id);
  
  const trades = db.prepare('SELECT pnl_cents, closed_at FROM trades WHERE user_id = ? ORDER BY closed_at DESC LIMIT 100').all(request.account.id);
  
  const events = [];
  for (const t of txns) {
    events.push({ date: t.created_at, type: t.type, amount: t.amount_cents / 100 });
  }
  for (const tr of trades) {
    events.push({ date: tr.closed_at, type: 'trade', amount: tr.pnl_cents / 100 });
  }
  
  return response.json({ events: events.sort((a, b) => new Date(b.date) - new Date(a.date)) });
});
