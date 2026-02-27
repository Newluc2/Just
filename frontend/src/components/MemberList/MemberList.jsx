/**
 * Just - Panneau des membres
 * 
 * Affiche la liste des membres du serveur avec leur statut en ligne
 */

import useStore from '../../store/useStore';
import './MemberList.css';

export default function MemberList() {
  const { members, currentServer, showProfilePopover } = useStore();

  if (!currentServer) return null;

  // Séparer les membres en ligne et hors ligne
  const onlineMembers = members.filter((m) => m.online || m.status === 'online');
  const offlineMembers = members.filter((m) => !m.online && m.status !== 'online');

  /**
   * Obtenir la couleur d'avatar d'un membre
   */
  const getAvatarColor = (username) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f47b67', '#3ba5b8'];
    let hash = 0;
    for (let i = 0; i < (username || '').length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const handleMemberClick = (member, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    showProfilePopover(member, { x: rect.left, y: rect.top });
  };

  const renderMember = (member) => (
    <div 
      key={member.id} 
      className="member-item"
      onClick={(e) => handleMemberClick(member, e)}
    >
      <div className="member-avatar-wrapper">
        <div
          className="member-avatar"
          style={{ background: getAvatarColor(member.username) }}
        >
          {(member.username || '?').charAt(0).toUpperCase()}
        </div>
        <div className={`member-status-dot ${member.online || member.status === 'online' ? 'online' : 'offline'}`} />
      </div>
      <div className="member-info">
        <span
          className={`member-name ${!member.online && member.status !== 'online' ? 'offline' : ''}`}
          style={{ color: member.role_color || undefined }}
        >
          {member.username}
        </span>
        {(member.role_name || member.role) && (
          <span className="member-badge" style={{ backgroundColor: member.role_color || '#5865f2' }}>
            {member.role_name || member.role}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="member-list">
      {/* Membres en ligne */}
      {onlineMembers.length > 0 && (
        <>
          <div className="member-category">
            EN LIGNE — {onlineMembers.length}
          </div>
          {onlineMembers.map(renderMember)}
        </>
      )}

      {/* Membres hors ligne */}
      {offlineMembers.length > 0 && (
        <>
          <div className="member-category">
            HORS LIGNE — {offlineMembers.length}
          </div>
          {offlineMembers.map(renderMember)}
        </>
      )}
    </div>
  );
}
