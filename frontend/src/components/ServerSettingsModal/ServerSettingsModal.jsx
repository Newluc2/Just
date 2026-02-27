import { useEffect, useMemo, useState } from 'react';
import { Settings, Users, Shield, Plus, Trash2, X } from 'lucide-react';
import useStore from '../../store/useStore';
import './ServerSettingsModal.css';

export default function ServerSettingsModal({ onClose }) {
  const {
    currentServer,
    members,
    user,
    selectServer,
    updateServerSettings,
    fetchServerRoles,
    createServerRole,
    updateServerRole,
    deleteServerRole,
    updateServerMemberRole,
    kickServerMember,
    createServerInvite,
  } = useStore();

  const [activeTab, setActiveTab] = useState('general');
  const [serverName, setServerName] = useState(currentServer?.name || '');
  const [serverIcon, setServerIcon] = useState(currentServer?.icon || '');
  const [roles, setRoles] = useState([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteMaxUses, setInviteMaxUses] = useState('');
  const [inviteExpiryHours, setInviteExpiryHours] = useState('24');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#99AAB5');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isOwner = currentServer?.owner_id === user?.id;

  const roleMap = useMemo(() => {
    const map = new Map();
    roles.forEach((role) => map.set(role.id, role));
    return map;
  }, [roles]);

  const loadRoles = async () => {
    if (!currentServer) return;
    const data = await fetchServerRoles(currentServer.id);
    setRoles(data);
  };

  useEffect(() => {
    loadRoles();
  }, [currentServer?.id]);

  const refreshServer = async () => {
    if (currentServer?.id) {
      await selectServer(currentServer.id);
    }
  };

  const showToast = (type, message) => {
    if (type === 'error') {
      setError(message);
      setSuccess('');
    } else {
      setSuccess(message);
      setError('');
    }
  };

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    if (!currentServer) return;

    try {
      await updateServerSettings(currentServer.id, {
        name: serverName,
        icon: serverIcon || null,
      });
      showToast('success', 'Paramètres du serveur mis à jour');
      await refreshServer();
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleCreateInvite = async () => {
    if (!currentServer) return;

    try {
      const invite = await createServerInvite(currentServer.id, {
        maxUses: inviteMaxUses ? Number(inviteMaxUses) : null,
        expiresInHours: inviteExpiryHours ? Number(inviteExpiryHours) : null,
      });
      setInviteUrl(`${window.location.origin}/${invite.code}`);
      showToast('success', 'Invitation créée');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleCreateRole = async () => {
    if (!currentServer || !newRoleName.trim()) return;

    try {
      await createServerRole(currentServer.id, {
        name: newRoleName.trim(),
        color: newRoleColor,
        position: 10,
      });
      setNewRoleName('');
      await loadRoles();
      await refreshServer();
      showToast('success', 'Rôle créé');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleRoleColorChange = async (roleId, color) => {
    if (!currentServer) return;
    try {
      await updateServerRole(currentServer.id, roleId, { color });
      await loadRoles();
      await refreshServer();
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!currentServer) return;
    try {
      await deleteServerRole(currentServer.id, roleId);
      await loadRoles();
      await refreshServer();
      showToast('success', 'Rôle supprimé');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleMemberRoleChange = async (memberId, roleId) => {
    if (!currentServer) return;
    try {
      await updateServerMemberRole(currentServer.id, memberId, roleId || null);
      await refreshServer();
      showToast('success', 'Rôle du membre mis à jour');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleKickMember = async (memberId) => {
    if (!currentServer) return;
    try {
      await kickServerMember(currentServer.id, memberId);
      await refreshServer();
      showToast('success', 'Membre expulsé');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  if (!currentServer || !isOwner) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="server-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="server-settings-header">
          <h2>Paramètres du serveur</h2>
          <button className="server-settings-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="server-settings-layout">
          <div className="server-settings-tabs">
            <button className={activeTab === 'general' ? 'active' : ''} onClick={() => setActiveTab('general')}>
              <Settings size={16} /> Général
            </button>
            <button className={activeTab === 'roles' ? 'active' : ''} onClick={() => setActiveTab('roles')}>
              <Shield size={16} /> Rôles
            </button>
            <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>
              <Users size={16} /> Membres
            </button>
          </div>

          <div className="server-settings-content">
            {error && <div className="settings-error">{error}</div>}
            {success && <div className="settings-success">{success}</div>}

            {activeTab === 'general' && (
              <div className="settings-section">
                <form onSubmit={handleSaveGeneral}>
                  <label>Nom du serveur</label>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    placeholder="Nom du serveur"
                  />

                  <label>Icône (URL)</label>
                  <input
                    type="text"
                    value={serverIcon}
                    onChange={(e) => setServerIcon(e.target.value)}
                    placeholder="https://..."
                  />

                  <button type="submit" className="btn-primary">Enregistrer</button>
                </form>

                <div className="invite-generator">
                  <h3>Invitation temporaire</h3>
                  <div className="invite-controls">
                    <input
                      type="number"
                      min="1"
                      placeholder="Usages max (optionnel)"
                      value={inviteMaxUses}
                      onChange={(e) => setInviteMaxUses(e.target.value)}
                    />
                    <input
                      type="number"
                      min="1"
                      placeholder="Expiration (heures)"
                      value={inviteExpiryHours}
                      onChange={(e) => setInviteExpiryHours(e.target.value)}
                    />
                    <button type="button" className="btn-primary" onClick={handleCreateInvite}>
                      Générer
                    </button>
                  </div>
                  {inviteUrl && (
                    <div className="invite-url-box">
                      <input value={inviteUrl} readOnly />
                      <button type="button" onClick={() => navigator.clipboard.writeText(inviteUrl)}>Copier</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'roles' && (
              <div className="settings-section">
                <div className="role-create-row">
                  <input
                    type="text"
                    placeholder="Nom du rôle"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                  <input
                    type="color"
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value)}
                  />
                  <button type="button" className="btn-primary" onClick={handleCreateRole}>
                    <Plus size={14} /> Ajouter
                  </button>
                </div>

                <div className="roles-list">
                  {roles.map((role) => (
                    <div key={role.id} className="role-item">
                      <div className="role-left">
                        <span className="role-dot" style={{ background: role.color }} />
                        <span>{role.name}</span>
                      </div>
                      <div className="role-actions">
                        <input
                          type="color"
                          value={role.color || '#99AAB5'}
                          onChange={(e) => handleRoleColorChange(role.id, e.target.value)}
                        />
                        {role.name !== 'Owner' && role.name !== 'Member' && (
                          <button type="button" className="danger" onClick={() => handleDeleteRole(role.id)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'members' && (
              <div className="settings-section">
                <div className="members-list">
                  {members.map((member) => (
                    <div key={member.id} className="member-row">
                      <div className="member-left">
                        <div className="member-avatar">{member.username?.charAt(0).toUpperCase()}</div>
                        <div className="member-meta">
                          <strong>{member.username}</strong>
                          <span style={{ color: roleMap.get(member.role_id)?.color || '#99AAB5' }}>
                            {roleMap.get(member.role_id)?.name || member.role || 'member'}
                          </span>
                        </div>
                      </div>

                      {member.id !== currentServer.owner_id && (
                        <div className="member-actions">
                          <select
                            value={member.role_id || ''}
                            onChange={(e) => handleMemberRoleChange(member.id, e.target.value)}
                          >
                            <option value="">Member</option>
                            {roles.map((role) => (
                              <option key={role.id} value={role.id}>{role.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleKickMember(member.id)}
                          >
                            Expulser
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
