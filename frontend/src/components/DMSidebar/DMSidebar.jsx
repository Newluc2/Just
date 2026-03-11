/**
 * Just - Barre latérale des messages privés (DM)
 *
 * Affiche la liste des conversations DM et permet d'en créer de nouvelles
 */

import { useEffect, useState } from 'react';
import { MessageSquare, Plus, Search, X, Settings } from 'lucide-react';
import useStore from '../../store/useStore';
import SettingsModal from '../SettingsModal/SettingsModal';
import './DMSidebar.css';

export default function DMSidebar() {
  const {
    user, dmConversations, currentDM,
    fetchDMConversations, selectDM, openDMWithUser,
  } = useStore();

  const [search, setSearch]     = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Charger les conversations au montage
  useEffect(() => {
    fetchDMConversations();
  }, []);

  // Rechercher des utilisateurs pour ouvrir un DM
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { apiFetch } = await import('../../api/config');
        const data = await apiFetch(`/users/search?q=${encodeURIComponent(search)}`);
        setSearchResults((data.users || []).filter(u => u.id !== user?.id));
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  const handleOpenDM = async (userId) => {
    await openDMWithUser(userId);
    setSearching(false);
    setSearch('');
    setSearchResults([]);
  };

  /** Obtenir le nom à afficher pour une conversation */
  const getConvName = (conv) => conv.other_username || '?';

  /** Initiale pour l'avatar */
  const getInitial = (name) => (name || '?').charAt(0).toUpperCase();

  /** Couleur déterministe */
  const getColor = (name) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f47b67', '#3ba5b8'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  };

  return (
    <div className="dm-sidebar">
      {/* Header */}
      <div className="dm-sidebar-header">
        <span className="dm-sidebar-title">Messages privés</span>
        <button
          className="dm-new-btn"
          title="Nouveau message"
          onClick={() => setSearching(s => !s)}
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Barre de recherche d'utilisateur */}
      {searching && (
        <div className="dm-search-bar">
          <Search size={14} className="dm-search-icon" />
          <input
            autoFocus
            type="text"
            placeholder="Rechercher un utilisateur…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="dm-search-clear" onClick={() => setSearch('')}>
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* Résultats de recherche */}
      {searching && search.trim() && (
        <div className="dm-search-results">
          {searchLoading && <p className="dm-search-hint">Recherche…</p>}
          {!searchLoading && searchResults.length === 0 && (
            <p className="dm-search-hint">Aucun résultat</p>
          )}
          {searchResults.map(u => (
            <button
              key={u.id}
              className="dm-search-result-item"
              onClick={() => handleOpenDM(u.id)}
            >
              <div className="dm-avatar" style={{ background: getColor(u.username) }}>
                {getInitial(u.username)}
              </div>
              <span>{u.username}</span>
            </button>
          ))}
        </div>
      )}

      {/* Liste des conversations */}
      <div className="dm-list">
        {dmConversations.length === 0 && !searching && (
          <div className="dm-empty">
            <MessageSquare size={32} />
            <p>Aucune conversation</p>
            <span>Clique sur + pour démarrer un DM</span>
          </div>
        )}

        {dmConversations.map(conv => {
          const name = getConvName(conv);
          const isActive = currentDM?.id === conv.id;

          return (
            <button
              key={conv.id}
              className={`dm-item ${isActive ? 'active' : ''}`}
              onClick={() => selectDM(conv)}
            >
              <div className="dm-avatar" style={{ background: getColor(name) }}>
                {getInitial(name)}
                <span className={`dm-status-dot ${conv.is_online ? 'online' : 'offline'}`} />
              </div>
              <div className="dm-item-info">
                <span className="dm-item-name">{name}</span>
                {conv.last_message && (
                  <span className="dm-item-preview">
                    {conv.last_message.length > 35
                      ? conv.last_message.slice(0, 35) + '…'
                      : conv.last_message}
                  </span>
                )}
              </div>
              {conv.unread_count > 0 && (
                <span className="dm-unread-badge">{conv.unread_count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Info utilisateur en bas */}
      <div className="user-panel">
        <div className="user-avatar">
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="user-avatar-img" />
          ) : (
            user?.username?.charAt(0).toUpperCase()
          )}
        </div>
        <div className="user-info">
          <span className="user-name">{user?.display_name || user?.username}</span>
          <span className="user-status">{user?.username}</span>
        </div>
        <button className="user-settings-btn" title="Paramètres" onClick={() => setShowSettingsModal(true)}>
          <Settings size={18} />
        </button>
      </div>

      {/* Modal de paramètres */}
      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}
    </div>
  );
}
