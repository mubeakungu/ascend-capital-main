import React, { useEffect, useState } from 'react';
import './styles.css';
import { ReferralPage } from './referral-page.jsx';

function AuthPage({ mode, name, email, password, referralCode, error, onNameChange, onEmailChange, onPasswordChange, onReferralCodeChange, onSubmit, onNavigate }) {
  const registering = mode === 'register';
  const [emailCode, setEmailCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const handleSendCode = async () => {
    setCodeSent(true);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <h2>Ascend Capital</h2>
          <p>{registering ? 'Create account' : 'Sign in'}</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          {registering && (
            <>
              <label className="account-field">
                Full Name
                <input type="text" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Enter your name" />
              </label>
            </>
          )}

          <label className="account-field">
            Email Address
            <input type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="Enter email address" />
          </label>

          {registering && codeSent && (
            <label className="account-field">
              Email Verification Code
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="Enter 6-digit code" maxLength={6} />
                <button type="button" onClick={handleSendCode} style={{ padding: '8px 12px', background: '#4ade80', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}>Resend</button>
              </div>
            </label>
          )}

          {registering && !codeSent && (
            <button type="button" onClick={handleSendCode} style={{ width: '100%', padding: '10px', background: '#4ade80', color: '#000', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px' }}>Send Verification Code</button>
          )}

          <label className="account-field">
            Password
            <input type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} placeholder="Enter password" />
          </label>

          {registering && (
            <>
              <label className="account-field">
                Confirm Password
                <input type="password" placeholder="Confirm password" />
              </label>

              <label className="account-field">
                Invitation Code
                <input type="text" value={referralCode} onChange={(e) => onReferralCodeChange(e.target.value.toUpperCase())} placeholder="Enter referral code" maxLength={16} />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '16px' }}>
                <input type="checkbox" required />
                I have read and agree to the Platform Terms of Service and Privacy Policy
              </label>
            </>
          )}

          <button type="submit" style={{ width: '100%', padding: '12px', background: '#4ade80', color: '#000', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>
            {registering ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '12px', marginTop: '12px' }}>
          {registering ? 'Already have an account? ' : "Don't have an account? "}
          <button onClick={() => onNavigate(registering ? '/login' : '/register')} style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', textDecoration: 'underline' }}>
            {registering ? 'Sign in' : 'Create account'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [account, setAccount] = useState(undefined);
  const [page, setPage] = useState('/');
  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountReferral, setAccountReferral] = useState(() => {
    try {
      const fromLink = new URLSearchParams(window.location.search).get('ref');
      if (fromLink) sessionStorage.setItem('ascend_ref', fromLink.trim().toUpperCase().slice(0, 16));
      return sessionStorage.getItem('ascend_ref') || '';
    } catch {
      return '';
    }
  });
  const [accountError, setAccountError] = useState('');
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [referralRewards, setReferralRewards] = useState(0);
  const [selectedNav, setSelectedNav] = useState('home');

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const result = await response.json();
          setAccount(result.account);
          setPage('/');
        } else {
          setAccount(null);
        }
      } catch {
        setAccount(null);
      }
    })();
  }, []);

  async function submitAccount() {
    const register = page === '/register';
    const body = register
      ? { name: accountName, email: accountEmail, password: accountPassword, ...(accountReferral.trim() ? { referralCode: accountReferral.trim() } : {}) }
      : { email: accountEmail, password: accountPassword };

    try {
      const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const result = await response.json();
        setAccount(result.account);
        setAccountName('');
        setAccountEmail('');
        setAccountPassword('');
        if (register) {
          setAccountReferral('');
          try { sessionStorage.removeItem('ascend_ref'); } catch {}
        }
        setPage('/');
      } else {
        const error = await response.json();
        setAccountError(error.error || 'Request failed');
      }
    } catch (error) {
      setAccountError(error.message);
    }
  }

  function navigate(path) {
    setPage(path);
    setAccountName('');
    setAccountEmail('');
    setAccountPassword('');
    setAccountError('');
  }

  if (account === undefined) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Loading...</div>;
  }

  const showLoginForm = !account && (page === '/login' || page === '/register');

  return (
    <div className="app-container">
      {showLoginForm && (
        <AuthPage
          mode={page === '/register' ? 'register' : 'login'}
          name={accountName}
          email={accountEmail}
          password={accountPassword}
          referralCode={accountReferral}
          error={accountError}
          onNameChange={setAccountName}
          onEmailChange={setAccountEmail}
          onPasswordChange={setAccountPassword}
          onReferralCodeChange={setAccountReferral}
          onSubmit={submitAccount}
          onNavigate={navigate}
        />
      )}

      {account && (
        <div className="dashboard-layout">
          {/* Header */}
          <header className="dashboard-header">
            <div className="header-content">
              <div className="brand-header">
                <img className="brand-logo-header" src="/logo.png" alt="Ascend Capital" />
                <span className="header-title">Overview</span>
              </div>
              <div className="language-selector">
                <span>English</span>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="dashboard-main">
            {selectedNav === 'home' && (
              <>
                {/* Total Assets Card */}
                <div className="assets-card">
                  <div className="assets-top">
                    <div className="assets-info">
                      <p className="assets-label">Account Total Assets</p>
                      <h2 className="assets-amount">${(account.balance / 100).toFixed(2)}</h2>
                      <p className="assets-currency">USDT</p>
                    </div>
                    <div className="assets-illustration">☀️</div>
                  </div>
                  <div className="accounts-breakdown">
                    <div className="breakdown-item">
                      <p className="breakdown-label">Balance account</p>
                      <p className="breakdown-amount">${(account.balance / 100).toFixed(2)}</p>
                    </div>
                    <div className="breakdown-item">
                      <p className="breakdown-label">Income account</p>
                      <p className="breakdown-amount">${(totalDeposits / 100).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Asset Balances */}
                <div className="asset-balances">
                  <h3>Asset Holdings</h3>
                  <div className="asset-cards">
                    <div className="asset-card">
                      <p className="asset-label">Deposits</p>
                      <p className="asset-value">${(totalDeposits / 100).toFixed(2)}</p>
                    </div>
                    <div className="asset-card">
                      <p className="asset-label">Referral Earnings</p>
                      <p className="asset-value">${(referralRewards / 100).toFixed(2)}</p>
                    </div>
                    <div className="asset-card">
                      <p className="asset-label">Available Balance</p>
                      <p className="asset-value">${(account.balance / 100).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Identity Verification Alert */}
                <div className="verification-alert">
                  <div className="alert-icon">⚫</div>
                  <div className="alert-content">
                    <p className="alert-title">Identity verification</p>
                    <p className="alert-description">Complete identity verification and pass review in Profile before withdrawing.</p>
                  </div>
                  <button className="verify-button">Identity verification</button>
                </div>
              </>
            )}

            {selectedNav === 'referrals' && <ReferralPage account={account} onNavigate={navigate} />}

            {selectedNav === 'deposits' && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                <h3>Deposits & Withdrawals</h3>
                <p>Coming soon</p>
              </div>
            )}

            {selectedNav === 'invite' && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                <h3>Invite Friends</h3>
                <p>Share your referral code to earn commissions</p>
              </div>
            )}

            {selectedNav === 'profile' && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                <h3>Profile</h3>
                <p>{account.email}</p>
                <button onClick={() => { setAccount(null); navigate('/login'); }} style={{ marginTop: '20px', padding: '10px 20px', background: '#f87171', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign Out</button>
              </div>
            )}
          </main>

          {/* Bottom Navigation */}
          <nav className="bottom-navigation">
            <button className={`nav-item ${selectedNav === 'home' ? 'active' : ''}`} onClick={() => setSelectedNav('home')}>
              <span className="nav-icon">🏠</span>
              <span>Home</span>
            </button>
            <button className={`nav-item ${selectedNav === 'referrals' ? 'active' : ''}`} onClick={() => setSelectedNav('referrals')}>
              <span className="nav-icon">👥</span>
              <span>Referrals</span>
            </button>
            <button className={`nav-item ${selectedNav === 'deposits' ? 'active' : ''}`} onClick={() => setSelectedNav('deposits')}>
              <span className="nav-icon">💳</span>
              <span>Deposits</span>
            </button>
            <button className={`nav-item ${selectedNav === 'invite' ? 'active' : ''}`} onClick={() => setSelectedNav('invite')}>
              <span className="nav-icon">🔗</span>
              <span>Invite</span>
            </button>
            <button className={`nav-item ${selectedNav === 'profile' ? 'active' : ''}`} onClick={() => setSelectedNav('profile')}>
              <span className="nav-icon">👤</span>
              <span>Profile</span>
            </button>
          </nav>
        </div>
      )}

      {!account && !showLoginForm && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <button onClick={() => navigate('/login')} style={{ padding: '10px 20px', marginRight: '10px', background: '#4ade80', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Sign In</button>
          <button onClick={() => navigate('/register')} style={{ padding: '10px 20px', background: '#222', color: '#ddd', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer' }}>Create Account</button>
        </div>
      )}
    </div>
  );
}

// Trading history component for member dashboard
function TradesTab({ account }) {
  const [trades, setTrades] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadTrades() {
      try {
        const res = await fetch('/api/client/trades');
        const data = await res.json();
        setTrades(data.trades || []);
      } catch (error) {
        console.error('Failed to load trades:', error);
      } finally {
        setLoading(false);
      }
    }
    loadTrades();
  }, []);

  if (loading) return <p style={{ color: '#888', padding: '20px' }}>Loading trades...</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h3>Trading History</h3>
      {trades.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', padding: '40px 0' }}>No trades yet. Check back tomorrow!</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#111', borderBottom: '1px solid #333' }}>
              <tr>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>SYMBOL</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>ENTRY</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>EXIT</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>QTY</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>PROFIT</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '10px' }}>{t.symbol}</td>
                  <td style={{ padding: '10px' }}>${parseFloat(t.entry_price).toFixed(2)}</td>
                  <td style={{ padding: '10px' }}>${parseFloat(t.close_price).toFixed(2)}</td>
                  <td style={{ padding: '10px' }}>{parseFloat(t.quantity).toFixed(4)}</td>
                  <td style={{ padding: '10px', color: t.pnl_cents > 0 ? '#4ade80' : '#f87171' }}>
                    ${(t.pnl_cents / 100).toFixed(2)}
                  </td>
                  <td style={{ padding: '10px', color: t.status === 'CLOSED' ? '#4ade80' : '#60a5fa' }}>
                    {t.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
