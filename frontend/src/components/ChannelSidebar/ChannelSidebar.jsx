/**
 * Just - Panneau latéral des salons (Channels)
 * 
 * Affiche le nom du serveur, la liste des salons et un bouton pour en créer
 */

import { useMemo, useState } from 'react';
import { Hash, Plus, Settings, ChevronDown, ChevronRight, Copy, Trash2 } from 'lucide-react';
import useStore from '../../store/useStore';
import SettingsModal from '../SettingsModal/SettingsModal';
import ServerSettingsModal from '../ServerSettingsModal/ServerSettingsModal';
import './ChannelSidebar.css';

export default function ChannelSidebar({ mobileView, setMobileView, isMobileDevice }) {
  const {
    currentServer, channels, currentChannel,
    selectChannel, createChannel, deleteServer, leaveServer, user,
    categoryOrder
  } = useStore();

  const [showCreate, setShowCreate] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [createCategory, setCreateCategory] = useState('GÉNÉRAL');
  const [showSettings, setShowSettings] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showServerSettingsModal, setShowServerSettingsModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState({});

  // Group channels by category (must be before any early return to respect hook rules)
  const categorizedChannels = useMemo(() => {
    const groups = {};
    (channels || []).forEach(ch => {
      const cat = String(ch.category || 'GÉNÉRAL');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(ch);
    });
    Object.values(groups).forEach(arr => arr.sort((a, b) => (a.position || 0) - (b.position || 0)));
    return groups;
  }, [channels]);

  // Sort categories using stored order
  const sortedCategories = useMemo(() => {
    const keys = Object.keys(categorizedChannels);
    if (!categoryOrder || categoryOrder.length === 0) return keys;
    const posMap = {};
    categoryOrder.forEach((cat, i) => { posMap[cat] = i; });
    return keys.sort((a, b) => (posMap[a] ?? 9999) - (posMap[b] ?? 9999));
  }, [categorizedChannels, categoryOrder]);

  if (!currentServer) {
    return (
      <div className="channel-sidebar">
        <div className="channel-sidebar-empty">
          <div className="empty-icon">💬</div>
          <h3>Bienvenue sur Just</h3>
          <p>Sélectionne ou crée un serveur pour commencer</p>
        </div>
      </div>
    );
  }

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!channelName.trim()) return;
    await createChannel(channelName, createCategory);
    setChannelName('');
    setShowCreate(false);
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(currentServer.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isOwner = currentServer.owner_id === user?.id;

  const toggleCategory = (cat) => {
    setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="channel-sidebar">
      {/* Header du serveur */}
      <div className="channel-header" onClick={() => setShowSettings(!showSettings)}>
        <h2>{currentServer.name}</h2>
        <ChevronDown size={18} className={`chevron ${showSettings ? 'open' : ''}`} />
      </div>

      {/* Menu déroulant du serveur */}
      {showSettings && (
        <div className="server-dropdown">
          <button className="dropdown-item" onClick={handleCopyInvite}>
            <Copy size={16} />
            {copied ? 'Copié !' : 'Copier le code d\'invitation'}
          </button>
          <div className="invite-code">
            Code : <strong>{currentServer.invite_code}</strong>
          </div>
          {isOwner && (
            <>
              <button
                className="dropdown-item"
                onClick={() => {
                  setShowSettings(false);
                  setShowServerSettingsModal(true);
                }}
              >
                <Settings size={16} />
                Paramètres du serveur
              </button>
            <button
              className="dropdown-item danger"
              onClick={() => {
                if (confirm('Supprimer ce serveur ?')) {
                  deleteServer(currentServer.id);
                }
              }}
            >
              <Trash2 size={16} />
              Supprimer le serveur
            </button>
            </>
          )}

          {!isOwner && (
            <button
              className="dropdown-item danger"
              onClick={async () => {
                if (confirm('Quitter ce serveur ?')) {
                  await leaveServer(currentServer.id);
                }
              }}
            >
              <Trash2 size={16} />
              Quitter le serveur
            </button>
          )}
        </div>
      )}

      {/* Liste des salons groupés par catégorie */}
      <div className="channel-list">
        {sortedCategories.map((category) => {
          const catChannels = categorizedChannels[category];
          return (
          <div key={category} className="channel-category-group">
            <div className="channel-category" onClick={() => toggleCategory(category)}>
              {collapsedCategories[category]
                ? <ChevronRight size={12} className="cat-chevron" />
                : <ChevronDown size={12} className="cat-chevron" />
              }
              <span>{category}</span>
              {isOwner && (
                <button
                  className="channel-add-btn"
                  onClick={(e) => { e.stopPropagation(); setCreateCategory(category); setShowCreate(true); }}
                  title="Créer un salon"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            {!collapsedCategories[category] && catChannels.map((channel) => (
              <div
                key={channel.id}
                className={`channel-item ${currentChannel?.id === channel.id ? 'active' : ''}`}
                onClick={() => {
                  selectChannel(channel.id);
                  // Auto-redirect to chat on mobile
                  if (isMobileDevice && setMobileView) {
                    setMobileView('chat');
                  }
                }}
              >
                <Hash size={18} className="channel-hash" />
                <span className="channel-name">{channel.name}</span>
              </div>
            ))}
          </div>
        );
        })}
      </div>

      {/* Formulaire de création de salon */}
      {showCreate && (
        <div className="channel-create-form">
          <form onSubmit={handleCreateChannel}>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="nouveau-salon"
              autoFocus
            />
            <div className="channel-create-actions">
              <button type="button" onClick={() => setShowCreate(false)}>Annuler</button>
              <button type="submit" className="btn-primary">Créer</button>
            </div>
          </form>
        </div>
      )}

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

      {showServerSettingsModal && (
        <ServerSettingsModal onClose={() => setShowServerSettingsModal(false)} />
      )}
    </div>
  );
}
