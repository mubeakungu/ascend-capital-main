import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

function Markets() {
  const [data, setData] = useState([]);
  useEffect(() => {
    const prices = { EURUSD: 1.08, GBPUSD: 1.27, GOLD: 2050, SILVER: 24.5 };
    const generate = () => {
      const newData = [];
      for (let i = 0; i < 30; i++) {
        const point = { time: `${i}:00` };
        ['EURUSD', 'GBPUSD', 'GOLD', 'SILVER'].forEach(inst => {
          const vol = (Math.random() - 0.5) * (inst.includes('USD') ? 0.002 : inst === 'GOLD' ? 5 : 0.3);
          prices[inst] += vol;
          point[inst] = prices[inst];
        });
        newData.push(point);
      }
      setData(newData);
    };
    generate();
    const interval = setInterval(generate, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ marginBottom: '20px', background: '#0a0a0a', padding: '15px', borderRadius: '8px', border: '1px solid #2a2a2a' }}>
      <h3>Market Instruments</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid stroke="#333" />
          <XAxis dataKey="time" stroke="#888" />
          <YAxis stroke="#888" yAxisId="left" />
          <YAxis stroke="#888" yAxisId="right" orientation="right" />
          <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #444' }} />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="EURUSD" stroke="#4ade80" name="EUR/USD" dot={false} isAnimationActive={false} />
          <Line yAxisId="left" type="monotone" dataKey="GBPUSD" stroke="#60a5fa" name="GBP/USD" dot={false} isAnimationActive={false} />
          <Line yAxisId="right" type="monotone" dataKey="GOLD" stroke="#fbbf24" name="Gold (oz)" dot={false} isAnimationActive={false} />
          <Line yAxisId="right" type="monotone" dataKey="SILVER" stroke="#e5e7eb" name="Silver (oz)" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#888' }}>Live pricing - Updates every 3 seconds</p>
    </div>
  );
}

function TradesPanel({ clientId, deposits, onBack }) {
  const [form, setForm] = useState({ instrument: 'EURUSD', entryPrice: '', quantity: '', depositId: '' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [trades, setTrades] = useState(null);
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState(null);
  const [exitPrice, setExitPrice] = useState('');

  useEffect(() => {
    api(`/api/admin/accounts/${clientId}/trades`).then(t => setTrades(t.trades)).catch(e => setNotice(e.message)).finally(() => setLoading(false));
  }, [clientId]);

  const handleCreate = async () => {
    if (!form.entryPrice || !form.quantity) return setNotice('Enter entry price and quantity');
    setBusy(true);
    try {
      await api(`/api/admin/accounts/${clientId}/trades`, {
        method: 'POST',
        body: JSON.stringify({ instrument: form.instrument, entryPrice: parseFloat(form.entryPrice), quantity: parseFloat(form.quantity), depositId: form.depositId || undefined })
      });
      setNotice('Trade opened');
      setForm({ instrument: 'EURUSD', entryPrice: '', quantity: '', depositId: '' });
      setTrades(null);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async (tradeId) => {
    if (!exitPrice) return setNotice('Enter exit price');
    setBusy(true);
    try {
      await api(`/api/admin/accounts/${clientId}/trades/${tradeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ exitPrice: parseFloat(exitPrice) })
      });
      setNotice('Trade closed');
      setClosingId(null);
      setExitPrice('');
      setTrades(null);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '20px', background: '#0a0a0a', borderRadius: '8px', border: '1px solid #2a2a2a', marginBottom: '20px' }}>
      <button onClick={onBack} style={{ marginBottom: '15px', padding: '8px 12px', border: '1px solid #444', background: '#111', borderRadius: '4px', color: '#888', cursor: 'pointer' }}>← Back</button>
      <h3 style={{ marginTop: 0 }}>Manage Trades</h3>
      {notice && <p style={{ color: '#f87171', margin: '10px 0', fontSize: '13px' }}>{notice}</p>}
      
      <div style={{ marginBottom: '20px', padding: '15px', background: '#111', borderRadius: '6px', border: '1px solid #333' }}>
        <h4 style={{ marginTop: 0 }}>Open New Trade</h4>
        <select value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })} style={{ width: '100%', padding: '8px', marginBottom: '10px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', color: '#ddd' }}>
          {['EURUSD', 'GBPUSD', 'GOLD', 'SILVER', 'NZDUSD', 'USDCAD'].map(i => <option key={i}>{i}</option>)}
        </select>
        <input type="number" placeholder="Entry price" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} style={{ width: '100%', padding: '8px', marginBottom: '10px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', color: '#ddd' }} />
        <input type="number" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={{ width: '100%', padding: '8px', marginBottom: '10px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', color: '#ddd' }} />
        <select value={form.depositId} onChange={(e) => setForm({ ...form, depositId: e.target.value })} style={{ width: '100%', padding: '8px', marginBottom: '10px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', color: '#ddd' }}>
          <option value="">Link to deposit (optional)</option>
          {deposits && deposits.map(d => <option key={d.id} value={d.id}>${(d.amount / 100).toFixed(2)} - {new Date(d.createdAt).toLocaleDateString()}</option>)}
        </select>
        <button onClick={handleCreate} disabled={busy} style={{ width: '100%', padding: '10px', background: '#4ade80', color: '#000', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Opening...' : 'Open Trade'}</button>
      </div>

      {loading && <p style={{ color: '#888' }}>Loading...</p>}
      {trades && trades.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#111', borderBottom: '2px solid #333' }}>
              <tr>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>INSTRUMENT</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>ENTRY</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>QTY</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>STATUS</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>PROFIT</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '10px' }}>{t.instrument}</td>
                  <td style={{ padding: '10px' }}>${t.entryPrice?.toFixed(2)}</td>
                  <td style={{ padding: '10px' }}>{t.quantity}</td>
                  <td style={{ padding: '10px', color: t.status === 'open' ? '#60a5fa' : '#4ade80' }}>{t.status}</td>
                  <td style={{ padding: '10px', color: t.profitCents && t.profitCents > 0 ? '#4ade80' : t.profitCents ? '#f87171' : '#888' }}>${(t.profitCents || 0) / 100}</td>
                  <td style={{ padding: '10px' }}>
                    {t.status === 'open' && (closingId === t.id ? (
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <input type="number" placeholder="Exit" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} style={{ width: '60px', padding: '4px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '3px', color: '#ddd', fontSize: '11px' }} />
                        <button onClick={() => handleClose(t.id)} disabled={busy} style={{ padding: '4px 8px', background: '#4ade80', color: '#000', border: 'none', borderRadius: '3px', fontSize: '11px', cursor: 'pointer' }}>Close</button>
                      </div>
                    ) : (
                      <button onClick={() => { setClosingId(t.id); setExitPrice(''); }} style={{ padding: '4px 8px', background: '#666', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '11px', cursor: 'pointer' }}>Close</button>
                    ))}
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

function BalanceAdjustmentPanel({ clientId, onAdjusted }) {
  const [form, setForm] = useState({ amount: '', reason: '', type: 'credit' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAdjust = async () => {
    if (!form.amount || !form.reason) return setNotice('Enter amount and reason');
    const amount = parseFloat(form.amount) * (form.type === 'credit' ? 1 : -1);
    setBusy(true);
    try {
      await api(`/api/admin/accounts/${clientId}/balance-adjustment`, {
        method: 'POST',
        body: JSON.stringify({ amount: amount.toString(), reason: form.reason })
      });
      setNotice('Balance adjusted');
      setForm({ amount: '', reason: '', type: 'credit' });
      onAdjusted();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '15px', background: '#111', borderRadius: '6px', border: '1px solid #333', marginBottom: '20px' }}>
      <h4 style={{ marginTop: 0 }}>Adjust Balance</h4>
      {notice && <p style={{ color: notice.includes('Balance adjusted') ? '#4ade80' : '#f87171', fontSize: '12px', margin: '10px 0' }}>{notice}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ padding: '8px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', color: '#ddd' }}>
          <option value="credit">Credit (+)</option>
          <option value="debit">Debit (-)</option>
        </select>
        <input type="number" placeholder="Amount ($)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ padding: '8px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', color: '#ddd' }} />
      </div>
      <input type="text" placeholder="Reason (bonus, correction, etc)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} style={{ width: '100%', padding: '8px', marginBottom: '10px', background: '#0a0a0a', border: '1px solid #333', borderRadius: '4px', color: '#ddd' }} />
      <button onClick={handleAdjust} disabled={busy} style={{ width: '100%', padding: '10px', background: '#4ade80', color: '#000', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Adjusting...' : 'Adjust Balance'}</button>
    </div>
  );
}

function MemberDetail({ clientId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('profile');

  const loadData = async () => {
    try {
      const p = await api(`/api/admin/accounts/${clientId}/profile`);
      setProfile(p.account);
      const txns = await api(`/api/admin/accounts/${clientId}/activity`);
      setDeposits(txns.deposits || []);
      setBonuses(txns.bonuses || []);
      setAdjustments(txns.adjustments || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [clientId]);

  if (loading) return <p style={{ color: '#888' }}>Loading...</p>;

  return (
    <div style={{ padding: '20px', background: '#0a0a0a', borderRadius: '8px', border: '1px solid #2a2a2a' }}>
      <button onClick={onClose} style={{ marginBottom: '15px', padding: '8px 12px', border: '1px solid #444', background: '#111', borderRadius: '4px', color: '#888', cursor: 'pointer' }}>← Back</button>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['profile', 'activity', 'trades'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', background: tab === t ? '#4ade80' : '#222', color: tab === t ? '#000' : '#ddd', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: tab === t ? '600' : '400' }}>
            {t === 'profile' ? 'Profile' : t === 'activity' ? 'Activity' : 'Trades'}
          </button>
        ))}
      </div>

      {tab === 'profile' && profile && (
        <div>
          <h3 style={{ marginTop: 0 }}>{profile.name}</h3>
          <p><strong>Email:</strong> {profile.email}</p>
          <p><strong>Status:</strong> <span style={{ color: profile.status === 'active' ? '#4ade80' : '#f87171' }}>{profile.status}</span></p>
          <p><strong>Balance:</strong> ${(profile.balance / 100).toFixed(2)}</p>
        </div>
      )}

      {tab === 'activity' && (
        <div>
          <BalanceAdjustmentPanel clientId={clientId} onAdjusted={loadData} />
          <h4>Member Activity</h4>
          {deposits.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h5>Deposits</h5>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#111', borderBottom: '1px solid #333' }}>
                    <tr>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>AMOUNT</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>STATUS</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deposits.map(d => (
                      <tr key={d.id} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ padding: '8px', color: '#4ade80' }}>+${(d.amount / 100).toFixed(2)}</td>
                        <td style={{ padding: '8px', color: d.status === 'approved' ? '#4ade80' : d.status === 'rejected' ? '#f87171' : '#60a5fa' }}>{d.status}</td>
                        <td style={{ padding: '8px', fontSize: '10px', color: '#888' }}>{new Date(d.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {bonuses.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h5>Earned Bonuses</h5>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#111', borderBottom: '1px solid #333' }}>
                    <tr>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>REASON</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>AMOUNT</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bonuses.map(b => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ padding: '8px', fontSize: '10px' }}>{b.reason}</td>
                        <td style={{ padding: '8px', color: '#4ade80' }}>+${(b.amountCents / 100).toFixed(2)}</td>
                        <td style={{ padding: '8px', fontSize: '10px', color: '#888' }}>{new Date(b.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {adjustments.length > 0 && (
            <div>
              <h5>Balance Adjustments</h5>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#111', borderBottom: '1px solid #333' }}>
                    <tr>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>REASON</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>AMOUNT</th>
                      <th style={{ padding: '8px', textAlign: 'left', color: '#888' }}>DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.map(a => (
                      <tr key={a.id} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ padding: '8px', fontSize: '10px' }}>{a.reason}</td>
                        <td style={{ padding: '8px', color: a.amountCents > 0 ? '#4ade80' : '#f87171' }}>{a.amountCents > 0 ? '+' : ''}${(a.amountCents / 100).toFixed(2)}</td>
                        <td style={{ padding: '8px', fontSize: '10px', color: '#888' }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'trades' && <TradesPanel clientId={clientId} deposits={deposits} onBack={() => setTab('profile')} />}
    </div>
  );
}

function Clients() {
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/admin/accounts').then(r => setMembers(r.accounts || [])).catch(e => console.error(e)).finally(() => setLoading(false));
  }, []);

  const filtered = members.filter(m => m.name.toLowerCase().includes(query.toLowerCase()) || m.email.toLowerCase().includes(query.toLowerCase()));

  if (selectedId) {
    return <MemberDetail clientId={selectedId} onClose={() => setSelectedId(null)} />;
  }

  return (
    <div>
      <h3>Member Accounts</h3>
      <input type="text" placeholder="Search by name or email..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '15px', background: '#111', border: '1px solid #333', borderRadius: '4px', color: '#ddd' }} />
      {loading && <p style={{ color: '#888' }}>Loading...</p>}
      {filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#111', borderBottom: '2px solid #333' }}>
              <tr>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>NAME</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>EMAIL</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>BALANCE</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>STATUS</th>
                <th style={{ padding: '10px', textAlign: 'left', color: '#888' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '10px' }}>{m.name}</td>
                  <td style={{ padding: '10px', fontSize: '11px', color: '#888' }}>{m.email}</td>
                  <td style={{ padding: '10px' }}>${(m.balance / 100).toFixed(2)}</td>
                  <td style={{ padding: '10px' }}><span style={{ padding: '2px 8px', background: m.status === 'active' ? '#1a3a1a' : '#3a1a1a', color: m.status === 'active' ? '#4ade80' : '#f87171', borderRadius: '3px', fontSize: '11px' }}>{m.status}</span></td>
                  <td style={{ padding: '10px' }}><button onClick={() => setSelectedId(m.id)} style={{ padding: '4px 8px', background: '#4ade80', color: '#000', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [account, setAccount] = useState(undefined);
  const [tab, setTab] = useState('markets');

  useEffect(() => {
    api('/api/auth/me').then(res => setAccount(res.account)).catch(() => setAccount(null));
  }, []);

  if (account === undefined) return <p style={{ padding: '20px', color: '#888' }}>Checking admin status...</p>;
  if (!account) return <p style={{ padding: '20px', color: '#f87171' }}>Admin access required.</p>;

  return (
    <main style={{ minHeight: '100vh', background: '#0b100e', color: '#ddd', padding: '20px', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 20px 0' }}>Admin Dashboard</h1>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {[['markets', 'Markets'], ['clients', 'Members']].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 16px', background: tab === t ? '#4ade80' : '#222', color: tab === t ? '#000' : '#ddd', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: tab === t ? '600' : '400' }}>{label}</button>
          ))}
        </div>
        
        {tab === 'markets' && <Markets />}
        {tab === 'clients' && <Clients />}
      </div>
    </main>
  );
}
