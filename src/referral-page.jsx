import React, { useEffect, useState } from 'react';

function Icon({ name, size = 18 }) {
  const paths = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11" /><path d="m9 12 2 2 4-4" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 15h.01" /><path d="M6 5V3h12v2" /></>,
    star: <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  };

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function requestApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;

  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed.');
  return result;
}

export function ReferralPage({ account, onNavigate }) {
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!account) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadData() {
      try {
        const [statsResult, referralsResult] = await Promise.all([
          requestApi('/api/referrals/stats'),
          requestApi('/api/referrals/list'),
        ]);

        if (!cancelled) {
          setStats(statsResult);
          setReferrals(referralsResult.referrals || []);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [account]);

  async function copyReferralCode() {
    if (!stats?.referralCode) return;
    try {
      await navigator.clipboard.writeText(stats.referralCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Fallback: user can select and copy manually
    }
  }

  async function copyReferralLink() {
    if (!stats?.referralCode) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/register?ref=${stats.referralCode}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback: user can select and copy manually
    }
  }

  if (!account) {
    return (
      <main className="standalone-shell">
        <a className="brand standalone-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
          <img className="brand-logo" src="/logo.png" alt="Ascend Capital" />
        </a>
        <section className="standalone-card">
          <div className="eyebrow"><span className="eyebrow-line" /> REFERRAL PROGRAM</div>
          <h1>Share and earn<span className="title-period">.</span></h1>
          <p className="standalone-description">Sign in to view your referral code, track your earnings, and see your referrals.</p>
          <div className="referral-status-panel"><Icon name="users" size={20} /><div><strong>Sign in required</strong><p>Create an account or sign in to access your referral dashboard.</p></div></div>
          <div className="referral-page-actions">
            <button className="button button-secondary" onClick={() => onNavigate('/login')}>Sign in</button>
            <button className="button button-primary" onClick={() => onNavigate('/register')}>Create account <Icon name="arrow" size={14} /></button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="standalone-shell">
      <a className="brand standalone-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
        <img className="brand-logo" src="/logo.png" alt="Ascend Capital" />
      </a>

      <section className="standalone-card referral-page-card">
        <div className="eyebrow"><span className="eyebrow-line" /> REFERRAL PROGRAM</div>
        <h1>Share and earn<span className="title-period">.</span></h1>
        <p className="standalone-description">Refer members to Ascend Capital and earn commission on their deposits.</p>

        {error && (
          <div className="modal-message" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <p className="admin-empty">Loading your referral data…</p>
        ) : stats ? (
          <>
            {/* Referral Code Section */}
            <div className="referral-code-section">
              <div className="referral-code-heading">
                <h3>Your referral code</h3>
                <p>Share this code to start earning</p>
              </div>
              {stats.referralCode ? (
                <div className="referral-code-display">
                  <code className="referral-code">{stats.referralCode}</code>
                  <button
                    className="referral-code-button"
                    onClick={copyReferralCode}
                    aria-label="Copy referral code"
                  >
                    <Icon name={codeCopied ? 'check' : 'copy'} size={16} />
                    {codeCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ) : (
                <p className="referral-code-generating">Generating your referral code…</p>
              )}
              {stats.referralCode && (
                <div className="referral-code-display">
                  <code className="referral-code referral-link">{`${window.location.origin}/register?ref=${stats.referralCode}`}</code>
                  <button className="referral-code-button" onClick={copyReferralLink} aria-label="Copy referral link">
                    <Icon name={linkCopied ? 'check' : 'copy'} size={16} />
                    {linkCopied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
              )}
            </div>

            {/* Tier & Commission Section */}
            <div className="referral-tier-section">
              <div className="tier-card">
                <div className="tier-label">Current tier</div>
                <div className="tier-name">
                  <Icon name="star" size={18} />
                  {stats.tier ? stats.tier : 'Not yet a member'}
                </div>
              </div>
              <div className="tier-card">
                <div className="tier-label">Commission rate</div>
                <div className="tier-value">{(stats.commissionRate * 100).toFixed(0)}%</div>
              </div>
              <div className="tier-card">
                <div className="tier-label">Direct referrals</div>
                <div className="tier-value">{stats.directReferrals}</div>
              </div>
              <div className="tier-card primary">
                <div className="tier-label">Total earnings</div>
                <div className="tier-earnings">
                  <span className="currency">$</span>
                  {stats.totalEarnings.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>

            {/* Volume Section */}
            <div className="referral-volume-section">
              <h3>Referral volume</h3>
              <div className="volume-stat">
                <span className="volume-label">Total volume from your referrals</span>
                <span className="volume-value">
                  ${stats.directVolume.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="volume-stat">
                <span className="volume-label">Commissions received</span>
                <span className="volume-value">{stats.commissionsEarned}</span>
              </div>
            </div>

            {/* Referrals List */}
            <div className="referrals-list-section">
              <h3>Your referrals ({referrals.length})</h3>
              {referrals.length === 0 ? (
                <p className="referrals-empty">
                  No referrals yet. Share your code to start earning commissions.
                </p>
              ) : (
                <div className="referrals-table-wrap">
                  <table className="referrals-table">
                    <thead>
                      <tr>
                        <th>NAME</th>
                        <th>EMAIL</th>
                        <th>SIGNED UP</th>
                        <th>TOTAL DEPOSITS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map((ref) => (
                        <tr key={ref.id}>
                          <td>{ref.name}</td>
                          <td>{ref.email}</td>
                          <td>{new Date(ref.signedUpAt).toLocaleDateString()}</td>
                          <td>
                            ${ref.totalDeposits.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Back Button */}
            <button
              className="button button-secondary referral-back"
              onClick={() => onNavigate('/')}
            >
              Return to dashboard
            </button>
          </>
        ) : null}
      </section>

      <style>{`
        .referral-code-section {
          margin: 24px 0;
          padding: 20px;
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          background: var(--card-bg, #1a1a1a);
        }

        .referral-code-heading h3 {
          margin: 0 0 4px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .referral-code-heading p {
          margin: 0;
          font-size: 14px;
          color: var(--text-muted, #888);
        }

        .referral-code-display {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 16px;
        }

        .referral-code {
          flex: 1;
          padding: 12px 16px;
          background: var(--input-bg, #0a0a0a);
          border: 1px solid var(--border-color, #333);
          border-radius: 6px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 16px;
          font-weight: 600;
          letter-spacing: 2px;
          color: var(--primary-color, #4ade80);
          user-select: all;
        }

        .referral-link {
          font-size: 12px;
          letter-spacing: 0;
          overflow-wrap: anywhere;
        }

        .referral-code-button {
          padding: 10px 16px;
          background: var(--primary-color, #4ade80);
          color: black;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
          transition: opacity 0.2s;
        }

        .referral-code-button:hover {
          opacity: 0.9;
        }

        .referral-code-generating {
          color: var(--text-muted, #888);
          font-size: 14px;
          margin-top: 16px;
        }

        .referral-tier-section {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin: 24px 0;
        }

        .tier-card {
          padding: 16px;
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          background: var(--card-bg, #1a1a1a);
        }

        .tier-card.primary {
          background: linear-gradient(135deg, var(--primary-color, #4ade80) 0%, var(--primary-color, #4ade80) 100%);
          border: none;
          color: black;
        }

        .tier-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-muted, #888);
          margin-bottom: 8px;
        }

        .tier-card.primary .tier-label {
          color: rgba(0, 0, 0, 0.7);
        }

        .tier-name {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 18px;
          font-weight: 600;
        }

        .tier-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--primary-color, #4ade80);
        }

        .tier-card.primary .tier-value {
          color: black;
        }

        .tier-earnings {
          font-size: 28px;
          font-weight: 700;
          display: flex;
          align-items: baseline;
          gap: 4px;
        }

        .currency {
          font-size: 20px;
        }

        .referral-volume-section {
          margin: 24px 0;
          padding: 20px;
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          background: var(--card-bg, #1a1a1a);
        }

        .referral-volume-section h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .volume-stat {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid var(--border-color, #333);
        }

        .volume-stat:last-child {
          border-bottom: none;
        }

        .volume-label {
          font-size: 14px;
          color: var(--text-muted, #888);
        }

        .volume-value {
          font-size: 16px;
          font-weight: 600;
        }

        .referrals-list-section {
          margin: 24px 0;
        }

        .referrals-list-section h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .referrals-empty {
          padding: 20px;
          text-align: center;
          color: var(--text-muted, #888);
          background: var(--card-bg, #1a1a1a);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
        }

        .referrals-table-wrap {
          overflow-x: auto;
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          background: var(--card-bg, #1a1a1a);
        }

        .referrals-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .referrals-table thead {
          border-bottom: 2px solid var(--border-color, #333);
          background: var(--table-header-bg, #0a0a0a);
        }

        .referrals-table th {
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-size: 12px;
          color: var(--text-muted, #888);
        }

        .referrals-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color, #333);
        }

        .referrals-table tbody tr:hover {
          background: var(--hover-bg, #111);
        }

        .referral-back {
          width: 100%;
          margin-top: 24px;
        }

        .admin-empty {
          text-align: center;
          padding: 32px 0;
          color: var(--text-muted, #888);
        }
      `}</style>
    </main>
  );
}

export default ReferralPage;
