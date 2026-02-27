/**
 * Just - Barre latérale des serveurs
 * 
 * Affiche la liste des serveurs sous forme d'icônes rondes,
 * avec les boutons pour créer un serveur ou en rejoindre un.
 */

import { useState } from 'react';
import { Plus, LogOut, Compass } from 'lucide-react';
import useStore from '../../store/useStore';
import './ServerSidebar.css';

export default function ServerSidebar() {
  const { servers, currentServer, selectServer, createServer, joinServer, logout, user } = useStore();
  const [showModal, setShowModal] = useState(null); // 'create' | 'join' | null
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    try {
      const server = await createServer(inputValue.trim());
      setShowModal(null);
      setInputValue('');
      setError('');
      await selectServer(server.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    try {
      const server = await joinServer(inputValue.trim());
      setShowModal(null);
      setInputValue('');
      setError('');
      await selectServer(server.id);
    } catch (err) {
      setError(err.message);
    }
  };

  /**
   * Générer la couleur d'un avatar de serveur à partir de son nom
   */
  const getServerColor = (name) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f47b67', '#e8a1d0'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <>
      <div className="server-sidebar">
        {/* Logo Just / Bouton accueil */}
        <div className="server-icon-wrapper">
          <div className="server-icon home-icon" title="Accueil Just">
            <span>J</span>
          </div>
        </div>

        <div className="server-separator" />

        {/* Liste des serveurs */}
        <div className="server-list">
          {servers.map((server) => (
            <div key={server.id} className="server-icon-wrapper">
              <div
                className={`server-pill ${currentServer?.id === server.id ? 'active' : ''}`}
              />
              <div
                className={`server-icon ${currentServer?.id === server.id ? 'active' : ''}`}
                style={{ background: getServerColor(server.name) }}
                onClick={() => selectServer(server.id)}
                title={server.name}
              >
                <span>{server.name.charAt(0).toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="server-separator" />

        {/* Bouton créer un serveur */}
        <div className="server-icon-wrapper">
          <div
            className="server-icon add-icon"
            onClick={() => { setShowModal('create'); setInputValue(''); setError(''); }}
            title="Créer un serveur"
          >
            <Plus size={24} />
          </div>
        </div>

        {/* Bouton rejoindre un serveur */}
        <div className="server-icon-wrapper">
          <div
            className="server-icon join-icon"
            onClick={() => { setShowModal('join'); setInputValue(''); setError(''); }}
            title="Rejoindre un serveur"
          >
            <Compass size={20} />
          </div>
        </div>

        {/* Spacer */}
        <div className="server-sidebar-spacer" />

        {/* Bouton déconnexion */}
        <div className="server-icon-wrapper">
          <div
            className="server-icon logout-icon"
            onClick={logout}
            title={`Déconnexion (${user?.username})`}
          >
            <LogOut size={20} />
          </div>
        </div>
      </div>

      {/* Modal de création / rejoindre */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{showModal === 'create' ? 'Créer un serveur' : 'Rejoindre un serveur'}</h3>
            <p className="modal-subtitle">
              {showModal === 'create'
                ? 'Donne un nom à ton serveur pour commencer'
                : 'Entre le code d\'invitation'}
            </p>

            {error && <div className="modal-error">{error}</div>}

            <form onSubmit={showModal === 'create' ? handleCreate : handleJoin}>
              <div className="form-group">
                <label>
                  {showModal === 'create' ? 'Nom du serveur' : 'Code d\'invitation'}
                </label>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={showModal === 'create' ? 'Mon super serveur' : 'aBcD1234'}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn-confirm">
                  {showModal === 'create' ? 'Créer' : 'Rejoindre'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
