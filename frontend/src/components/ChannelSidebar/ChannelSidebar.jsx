/**
 * Just - Panneau latéral des salons (Channels)
 * 
 * Affiche le nom du serveur, la liste des salons et un bouton pour en créer
 */

import { useState } from 'react';
import { Hash, Plus, Settings, ChevronDown, Copy, Trash2 } from 'lucide-react';
import useStore from '../../store/useStore';
import SettingsModal from '../SettingsModal/SettingsModal';
import ServerSettingsModal from '../ServerSettingsModal/ServerSettingsModal';
import './ChannelSidebar.css';

export default function ChannelSidebar() {
  const {
    currentServer, channels, currentChannel,
    selectChannel, createChannel, deleteServer, leaveServer, user
  } = useStore();

  const [showCreate, setShowCreate] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showServerSettingsModal, setShowServerSettingsModal] = useState(false);
  const [copied, setCopied] = useState(false);

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
    await createChannel(channelName);
    setChannelName('');
    setShowCreate(false);
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(currentServer.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isOwner = currentServer.owner_id === user?.id;

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

      {/* Liste des salons */}
      <div className="channel-list">
        <div className="channel-category">
          <span>SALONS TEXTUELS</span>
          <button
            className="channel-add-btn"
            onClick={() => setShowCreate(true)}
            title="Créer un salon"
          >
            <Plus size={16} />
          </button>
        </div>

        {channels.map((channel) => (
          <div
            key={channel.id}
            className={`channel-item ${currentChannel?.id === channel.id ? 'active' : ''}`}
            onClick={() => selectChannel(channel.id)}
          >
            <Hash size={18} className="channel-hash" />
            <span className="channel-name">{channel.name}</span>
          </div>
        ))}
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
          {user?.username?.charAt(0).toUpperCase()}
        </div>
        <div className="user-info">
          <span className="user-name">{user?.username}</span>
          <span className="user-status">En ligne</span>
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
