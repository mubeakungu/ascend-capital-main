import React, { useEffect, useState } from 'react';
import './styles-enc-layout.css';
import { ReferralPage } from './referral-page.jsx';

export default function AppWithENCLayout() {
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
    <div className="app-container-enc">
      {account && !showLoginForm && (
        <div className="dashboard-container-enc">
          {/* Header */}
          <header className="dashboard-header-enc">
            <div className="header-left-enc">
              <h1 className="header-logo-enc">Ascend Capital</h1>
              <span className="header-title-enc">Overview</span>
            </div>
            <div className="language-selector-enc">
              <span>English</span>
              <span className="lang-icon-enc">▼</span>
            </div>
          </header>

          {/* Main Content */}
          <main className="dashboard-main-enc">
            {selectedNav === 'home' && (
              <>
                {/* ENC-Style Total Assets Card */}
                <div className="total-assets-card-enc">
                  <div className="assets-left-enc">
                    <div className="asset-label-enc">accountTotalAssets</div>
                    <h2 className="asset-amount-enc">${(account.balance / 100).toFixed(2)}</h2>
                    <p className="asset-currency-enc">USDT</p>
                  </div>
                  <div className="assets-right-enc">
                    <div className="asset-illustration-enc">💰</div>
                  </div>
                </div>

                {/* Balance Breakdown */}
                <div className="balance-breakdown-enc">
                  <div className="breakdown-item-enc">
                    <p className="breakdown-label-enc">Balance account</p>
                    <p className="breakdown-amount-enc">${(account.balance / 100).toFixed(2)}</p>
                  </div>
                  <div className="breakdown-item-enc">
                    <p className="breakdown-label-enc">Income account</p>
                    <p className="breakdown-amount-enc">${(totalDeposits / 100).toFixed(2)}</p>
                  </div>
                </div>

                {/* Asset Balances Section */}
                <div className="asset-balances-section-enc">
                  <h3 className="section-title-enc">Asset balances</h3>
                  <div className="asset-cards-enc">
                    <div className="asset-card-enc">
                      <p className="asset-card-label-enc">Deposits</p>
                      <p className="asset-card-value-enc">${(totalDeposits / 100).toFixed(2)}</p>
                    </div>
                    <div className="asset-card-enc">
                      <p className="asset-card-label-enc">Referral Earnings</p>
                      <p className="asset-card-value-enc">${(referralRewards / 100).toFixed(2)}</p>
                    </div>
                    <div className="asset-card-enc">
                      <p className="asset-card-label-enc">Available Balance</p>
                      <p className="asset-card-value-enc">${(account.balance / 100).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Flash Exchange Section (Placeholder) */}
                <div className="flash-exchange-enc">
                  <h3 className="section-title-enc">Flash exchange</h3>
                  <div style={{ padding: '24px', textAlign: 'center', color: '#828d84' }}>
                    <p>Coming soon</p>
                  </div>
                </div>

                {/* Identity Verification Alert */}
                <div className="verification-alert-enc">
                  <div className="alert-icon-enc">⚫</div>
                  <div className="alert-content-enc">
                    <p className="alert-title-enc">Identity verification</p>
                    <p className="alert-description-enc">Complete identity verification and pass review in Profile before withdrawing.</p>
                  </div>
                  <button className="verify-button-enc">Identity verification</button>
                </div>
              </>
            )}

            {selectedNav === 'referrals' && <ReferralPage account={account} onNavigate={navigate} />}

            {selectedNav === 'deposits' && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#828d84' }}>
                <h3 style={{ color: '#eff2eb', marginBottom: '12px' }}>Deposits & Withdrawals</h3>
                <p>Coming soon</p>
              </div>
            )}

            {selectedNav === 'invite' && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#828d84' }}>
                <h3 style={{ color: '#eff2eb', marginBottom: '12px' }}>Invite Friends</h3>
                <p>Share your referral code to earn commissions</p>
              </div>
            )}

            {selectedNav === 'profile' && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#828d84' }}>
                <h3 style={{ color: '#eff2eb', marginBottom: '12px' }}>Profile</h3>
                <p style={{ color: '#b7ed7b' }}>{account.email}</p>
                <button onClick={() => { setAccount(null); navigate('/login'); }} style={{ marginTop: '24px', padding: '12px 24px', background: '#b7ed7b', color: '#0b100e', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Sign Out</button>
              </div>
            )}
          </main>

          {/* ENC-Style Bottom Navigation */}
          <nav className="bottom-navigation-enc">
            <button className={`nav-item-enc ${selectedNav === 'home' ? 'active-enc' : ''}`} onClick={() => setSelectedNav('home')}>
              <span className="nav-icon-enc">🏠</span>
              <span>Home</span>
            </button>
            <button className={`nav-item-enc ${selectedNav === 'referrals' ? 'active-enc' : ''}`} onClick={() => setSelectedNav('referrals')}>
              <span className="nav-icon-enc">👥</span>
              <span>Agent</span>
            </button>
            <button className={`nav-item-enc ${selectedNav === 'deposits' ? 'active-enc' : ''}`} onClick={() => setSelectedNav('deposits')}>
              <span className="nav-icon-enc">💳</span>
              <span>Devices</span>
            </button>
            <button className={`nav-item-enc ${selectedNav === 'invite' ? 'active-enc' : ''}`} onClick={() => setSelectedNav('invite')}>
              <span className="nav-icon-enc">🔗</span>
              <span>Invite</span>
            </button>
            <button className={`nav-item-enc ${selectedNav === 'profile' ? 'active-enc' : ''}`} onClick={() => setSelectedNav('profile')}>
              <span className="nav-icon-enc">👤</span>
              <span>Profile</span>
            </button>
          </nav>
        </div>
      )}

      {!account && !showLoginForm && (
        <div style={{ padding: '40px 20px', textAlign: 'center', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b100e' }}>
          <button onClick={() => navigate('/login')} style={{ padding: '12px 24px', marginRight: '12px', background: '#b7ed7b', color: '#0b100e', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Sign In</button>
          <button onClick={() => navigate('/register')} style={{ padding: '12px 24px', background: '#111713', color: '#eff2eb', border: '1px solid #252e28', borderRadius: '6px', cursor: 'pointer' }}>Create Account</button>
        </div>
      )}

      {showLoginForm && (
        <div className="auth-container-enc" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
          Auth Form (implement based on original)
        </div>
      )}
    </div>
  );
}
