import { useEffect, useMemo, useState } from 'react';
import './AdminPage.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const ADMIN_TOKEN_KEY = 'just_admin_token';

async function adminFetch(endpoint, options = {}) {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const response = await fetch(`${API_URL}/admin${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Erreur admin');
  }
  return data;
}

export default function AdminPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [stats, setStats] = useState(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [bans, setBans] = useState([]);
  const [banReasons, setBanReasons] = useState({});
  const [ipBans, setIpBans] = useState([]);
  const [ipBanLoading, setIpBanLoading] = useState(false);

  const totalVisibleSearch = useMemo(() => searchResults.length, [searchResults]);

  const loadDashboard = async () => {
    const [statsData, bansData, ipBansData] = await Promise.all([
      adminFetch('/stats'),
      adminFetch('/bans'),
      adminFetch('/ip-bans'),
    ]);
    setStats(statsData.stats);
    setBans(bansData.bans || []);
    setIpBans(ipBansData.ip_bans || []);
  };

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        await adminFetch('/me');
        setIsAuth(true);
        await loadDashboard();
      } catch (err) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setIsAuth(false);
      } finally {
        setAuthLoading(false);
      }
    };

    init();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await adminFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ login, password }),
        headers: { 'Content-Type': 'application/json' },
      });
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setIsAuth(true);
      await loadDashboard();
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAuth(false);
    setStats(null);
    setSearchResults([]);
    setBans([]);
    setBanReasons({});
    setIpBans([]);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setError('');
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const data = await adminFetch(`/users/search?q=${encodeURIComponent(query.trim())}`);
      setSearchResults(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const banUser = async (userId) => {
    setError('');
    setLoading(true);
    try {
      await adminFetch(`/bans/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: (banReasons[userId] || '').trim() || null }),
      });
      await loadDashboard();
      if (query.trim()) {
        const refreshed = await adminFetch(`/users/search?q=${encodeURIComponent(query.trim())}`);
        setSearchResults(refreshed.users || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const unbanUser = async (userId) => {
    setError('');
    setLoading(true);
    try {
      await adminFetch(`/bans/${userId}`, { method: 'DELETE' });
      await loadDashboard();
      if (query.trim()) {
        const refreshed = await adminFetch(`/users/search?q=${encodeURIComponent(query.trim())}`);
        setSearchResults(refreshed.users || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const removeIpBan = async (ipAddress) => {
    setError('');
    setIpBanLoading(true);
    try {
      await adminFetch(`/ip-bans/${encodeURIComponent(ipAddress)}`, {
        method: 'DELETE',
      });
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setIpBanLoading(false);
    }
  };

  const banUserIp = async (userId) => {
    setError('');
    setLoading(true);
    try {
      await adminFetch(`/ban-user-ip/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: `Banissement de l'IP de l'utilisateur ID: ${userId}` }),
      });
      await loadDashboard();
      if (query.trim()) {
        const refreshed = await adminFetch(`/users/search?q=${encodeURIComponent(query.trim())}`);
        setSearchResults(refreshed.users || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return <div className="admin-page"><div className="admin-card">Chargement admin…</div></div>;
  }

  if (!isAuth) {
    return (
      <div className="admin-page">
        <form className="admin-card" onSubmit={handleLogin}>
          <h1>Admin</h1>
          <p>Accès sécurisé au tableau de bord.</p>
          {error && <div className="admin-error">{error}</div>}
          <label>
            Login
            <input value={login} onChange={(e) => setLogin(e.target.value)} required />
          </label>
          <label>
            Mot de passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button type="submit" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-wrap">
        <div className="admin-topbar">
          <h1>Dashboard Admin</h1>
          <button onClick={handleLogout}>Déconnexion</button>
        </div>

        {error && <div className="admin-error">{error}</div>}

        <div className="admin-stats-grid">
          <div className="admin-stat"><span>Membres</span><strong>{stats?.totalMembers ?? 0}</strong></div>
          <div className="admin-stat"><span>Comptes bannis</span><strong>{stats?.totalBannedAccounts ?? 0}</strong></div>
          <div className="admin-stat"><span>Serveurs</span><strong>{stats?.totalServers ?? 0}</strong></div>
          <div className="admin-stat"><span>Messages</span><strong>{(stats?.totalMessages ?? 0) + (stats?.totalDirectMessages ?? 0)}</strong></div>
        </div>

        <section className="admin-section">
          <h2>Recherche utilisateur</h2>
          <form className="admin-search" onSubmit={handleSearch}>
            <input
              placeholder="Username, display name ou email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" disabled={loading}>Rechercher</button>
          </form>
          <p className="admin-muted">Résultats: {totalVisibleSearch}</p>

          <div className="admin-table">
            {searchResults.map((user) => (
              <div key={user.id} className="admin-row">
                <div>
                  <strong>{user.display_name || user.username}</strong>
                  <div className="admin-user-meta">@{user.username} · {user.email}</div>
                </div>
                <div className="admin-actions">
                  {!user.is_banned ? (
                    <>
                      <input
                        placeholder="Raison (optionnel)"
                        value={banReasons[user.id] || ''}
                        onChange={(e) => setBanReasons((prev) => ({ ...prev, [user.id]: e.target.value }))}
                      />
                      <button className="danger" onClick={() => banUser(user.id)}>Ban</button>
                    </>
                  ) : (
                    <button onClick={() => unbanUser(user.id)}>Unban</button>
                  )}
                  <button onClick={() => banUserIp(user.id)} title="Bannir l'IP associée à cet utilisateur">🚫 IP</button>
                </div>
              </div>
            ))}
            {!searchResults.length && <p className="admin-muted">Aucun résultat.</p>}
          </div>
        </section>

        <section className="admin-section">
          <h2>Comptes bannis</h2>
          <div className="admin-table">
            {bans.map((ban) => (
              <div key={ban.user_id} className="admin-row">
                <div>
                  <strong>{ban.display_name || ban.username}</strong>
                  <div className="admin-user-meta">@{ban.username} · {ban.email}</div>
                  {ban.reason && <div className="admin-ban-reason">Raison: {ban.reason}</div>}
                </div>
                <div className="admin-actions">
                  <button onClick={() => unbanUser(ban.user_id)}>Unban</button>
                </div>
              </div>
            ))}
            {!bans.length && <p className="admin-muted">Aucun compte banni.</p>}
          </div>
        </section>

        <section className="admin-section">
          <h2>IPs bannies</h2>
          <p className="admin-muted">Les IPs sont bannies automatiquement en cliquant sur le bouton 🚫 IP dans la recherche utilisateur.</p>

          <div className="admin-table">
            {ipBans.map((ban) => (
              <div key={ban.ip_address} className="admin-row">
                <div>
                  <strong>{ban.ip_address}</strong>
                  <div className="admin-user-meta">
                    Banni par: {ban.banned_by}
                    {ban.reason && ` · Raison: ${ban.reason}`}
                  </div>
                  <div className="admin-muted">
                    {new Date(ban.banned_at).toLocaleString('fr-FR')}
                  </div>
                </div>
                <div className="admin-actions">
                  <button onClick={() => removeIpBan(ban.ip_address)}>Débannir</button>
                </div>
              </div>
            ))}
            {!ipBans.length && <p className="admin-muted">Aucune IP bannie.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}