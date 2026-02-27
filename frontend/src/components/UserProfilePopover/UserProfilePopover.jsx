/**
 * Just - Popover de profil utilisateur
 * 
 * Affiche les détails du profil quand on clique sur un membre
 */

import { useEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import useStore from '../../store/useStore';
import './UserProfilePopover.css';

export default function UserProfilePopover({ member, position, onClose, onStartDM }) {
  const { user } = useStore();
  const popoverRef = useRef(null);

  const getAvatarColor = (username) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f47b67', '#3ba5b8'];
    let hash = 0;
    for (let i = 0; i < (username || '').length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Close on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Calculate position
  const style = {};
  if (position) {
    // Position à gauche de l'endroit cliqué
    style.top = Math.min(position.y, window.innerHeight - 350);
    style.left = Math.max(10, position.x - 310);
  }

  const isOnline = member.online || member.status === 'online';
  const isSelf = member.id === user?.id;

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <div
        ref={popoverRef}
        className="user-popover"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner */}
        <div className="popover-banner" />

        {/* Avatar */}
        <div className="popover-avatar-section">
          <div
            className="popover-avatar"
            style={{ background: getAvatarColor(member.username) }}
          >
            {(member.username || '?').charAt(0).toUpperCase()}
          </div>
          <div className={`popover-status-dot ${isOnline ? 'online' : 'offline'}`} />
        </div>

        {/* Info */}
        <div className="popover-info">
          <div className="popover-name-row">
            <h3 style={{ color: member.role_color || undefined }}>{member.username}</h3>
            {(member.role_name || member.role) && (
              <span className="popover-badge" style={{ backgroundColor: member.role_color || '#5865f2' }}>
                {member.role_name || member.role}
              </span>
            )}
          </div>
          <span className="popover-status-text">
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </span>

          {member.about && (
            <div className="popover-section">
              <h4>À PROPOS DE MOI</h4>
              <p>{member.about}</p>
            </div>
          )}

          <div className="popover-section">
            <h4>MEMBRE DEPUIS</h4>
            <p>{member.joined_at
              ? new Date(member.joined_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
              : 'Inconnu'
            }</p>
          </div>

          {/* Actions */}
          {!isSelf && onStartDM && (
            <div className="popover-actions">
              <button className="popover-dm-btn" onClick={() => onStartDM(member.id)}>
                <MessageCircle size={16} />
                Envoyer un message
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
