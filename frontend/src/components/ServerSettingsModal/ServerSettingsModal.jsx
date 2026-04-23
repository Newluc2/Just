import { useEffect, useMemo, useState } from 'react';
import { Settings, Users, Shield, Plus, Trash2, X, Hash, Eye, EyeOff, Edit2, Check, FolderPlus, MessageSquare, SmilePlus, ChevronUp, ChevronDown, Ban } from 'lucide-react';
import useStore from '../../store/useStore';
import { apiFetch } from '../../api/config';
import './ServerSettingsModal.css';

export default function ServerSettingsModal({ onClose }) {
  const {
    currentServer,
    members,
    channels,
    user,
    selectServer,
    updateServerSettings,
    fetchServerRoles,
    createServerRole,
    updateServerRole,
    deleteServerRole,
    updateServerMemberRole,
    kickServerMember,
    banServerMember,
    unbanServerMember,
    fetchServerBans,
    createServerInvite,
    createChannel,
    updateChannel,
    deleteChannel,
    fetchChannelPermissions,
    updateChannelPermissions,
    renameCategory,
    deleteCategory,
    reorderCategories,
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

  // Channels tab state
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelCategory, setNewChannelCategory] = useState('GÉNÉRAL');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingChannel, setEditingChannel] = useState(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [permChannel, setPermChannel] = useState(null);
  const [channelPerms, setChannelPerms] = useState([]);
  const [renamingCategory, setRenamingCategory] = useState(null);
  const [renameCategoryValue, setRenameCategoryValue] = useState('');
  const [categoryOrder, setCategoryOrder] = useState([]);
  const [bans, setBans] = useState([]);

  const isOwner = currentServer?.owner_id === user?.id;

  const roleMap = useMemo(() => {
    const map = new Map();
    roles.forEach((role) => map.set(role.id, role));
    return map;
  }, [roles]);

  // Group channels by category
  const categorizedChannels = useMemo(() => {
    const groups = {};
    (channels || []).forEach(ch => {
      const cat = String(ch.category || 'GÉNÉRAL');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(ch);
    });
    // Sort channels within each category by position
    Object.values(groups).forEach(arr => arr.sort((a, b) => (a.position || 0) - (b.position || 0)));
    return groups;
  }, [channels]);

  // Sort categories by stored order
  const categories = useMemo(() => {
    const keys = Object.keys(categorizedChannels);
    if (categoryOrder.length === 0) return keys;
    const posMap = {};
    categoryOrder.forEach((cat, i) => { posMap[cat] = i; });
    return keys.sort((a, b) => (posMap[a] ?? 9999) - (posMap[b] ?? 9999));
  }, [categorizedChannels, categoryOrder]);

  const loadRoles = async () => {
    if (!currentServer) return;
    const data = await fetchServerRoles(currentServer.id);
    setRoles(data);
  };

  const loadCategoryOrder = async () => {
    if (!currentServer) return;
    try {
      const data = await apiFetch(`/channels/categories/${currentServer.id}`);
      setCategoryOrder(data.categories || []);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    loadRoles();
    loadCategoryOrder();
    loadBans();
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
    setTimeout(() => { setError(''); setSuccess(''); }, 3000);
  };

  // ── General tab ──
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

  // ── Roles tab ──
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

  // ── Members tab ──
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

  const loadBans = async () => {
    if (!currentServer) return;
    try {
      const data = await fetchServerBans(currentServer.id);
      setBans(data);
    } catch (e) { /* ignore */ }
  };

  const handleBanMember = async (memberId) => {
    if (!currentServer) return;
    const reason = prompt('Raison du ban (optionnel) :');
    try {
      await banServerMember(currentServer.id, memberId, reason);
      await refreshServer();
      await loadBans();
      showToast('success', 'Membre banni');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleUnban = async (userId) => {
    if (!currentServer) return;
    try {
      await unbanServerMember(currentServer.id, userId);
      await loadBans();
      showToast('success', 'Utilisateur débanni');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  // ── Channels tab ──
  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      await createChannel(newChannelName, newChannelCategory);
      setNewChannelName('');
      await refreshServer();
      showToast('success', 'Salon créé');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleDeleteChannel = async (channelId) => {
    try {
      await deleteChannel(channelId);
      await refreshServer();
      showToast('success', 'Salon supprimé');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleEditChannel = async (channelId) => {
    if (!editChannelName.trim()) return;
    try {
      await updateChannel(channelId, { name: editChannelName });
      setEditingChannel(null);
      await refreshServer();
      showToast('success', 'Salon renommé');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleMoveChannel = async (channelId, newCategory) => {
    try {
      await updateChannel(channelId, { category: newCategory });
      await refreshServer();
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    const catName = newCategoryName.trim().toUpperCase();
    if (categories.includes(catName)) {
      showToast('error', 'Cette catégorie existe déjà');
      return;
    }
    // Create a placeholder channel in this category
    try {
      await createChannel('général', catName);
      setNewCategoryName('');
      await refreshServer();
      showToast('success', 'Catégorie créée');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleRenameCategory = async (oldName) => {
    if (!renameCategoryValue.trim()) return;
    try {
      await renameCategory(currentServer.id, oldName, renameCategoryValue);
      setRenamingCategory(null);
      await refreshServer();
      await loadCategoryOrder();
      showToast('success', 'Catégorie renommée');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleDeleteCategory = async (catName) => {
    try {
      await deleteCategory(currentServer.id, catName);
      await refreshServer();
      await loadCategoryOrder();
      showToast('success', 'Catégorie supprimée, salons déplacés vers GÉNÉRAL');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleMoveCategory = async (catName, direction) => {
    const idx = categories.indexOf(catName);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= categories.length) return;
    const newOrder = [...categories];
    [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]];
    setCategoryOrder(newOrder);
    try {
      await reorderCategories(currentServer.id, newOrder);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  // ── Permissions ──
  const openPermissions = async (channel) => {
    setPermChannel(channel);
    try {
      const perms = await fetchChannelPermissions(channel.id);
      // Build full list: one entry per role (excluding Owner)
      const fullPerms = roles
        .filter(r => r.name !== 'Owner')
        .map(role => {
          const existing = perms.find(p => p.role_id === role.id);
          return {
            roleId: role.id,
            roleName: role.name,
            roleColor: role.color,
            canView: existing ? existing.can_view === 1 : true,
            canSend: existing ? (existing.can_send ?? 1) === 1 : true,
            canReact: existing ? (existing.can_react ?? 1) === 1 : true,
          };
        });
      setChannelPerms(fullPerms);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleTogglePerm = (roleId, field = 'canView') => {
    setChannelPerms(prev =>
      prev.map(p => p.roleId === roleId ? { ...p, [field]: !p[field] } : p)
    );
  };

  const handleSavePermissions = async () => {
    if (!permChannel) return;
    try {
      await updateChannelPermissions(permChannel.id, channelPerms);
      showToast('success', `Permissions de #${permChannel.name} mises à jour`);
      setPermChannel(null);
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
            <button className={activeTab === 'channels' ? 'active' : ''} onClick={() => setActiveTab('channels')}>
              <Hash size={16} /> Salons
            </button>
            <button className={activeTab === 'roles' ? 'active' : ''} onClick={() => setActiveTab('roles')}>
              <Shield size={16} /> Rôles
            </button>
            <button className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>
              <Users size={16} /> Membres
            </button>
            <button className={activeTab === 'bans' ? 'active' : ''} onClick={() => setActiveTab('bans')}>
              <Ban size={16} /> Bans
            </button>
          </div>

          <div className="server-settings-content">
            {error && <div className="settings-error">{error}</div>}
            {success && <div className="settings-success">{success}</div>}

            {/* ── GÉNÉRAL ── */}
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

            {/* ── SALONS ── */}
            {activeTab === 'channels' && (
              <div className="settings-section">
                {/* Créer une catégorie */}
                <h3>Catégories</h3>
                <div className="channel-create-row">
                  <input
                    type="text"
                    placeholder="Nouvelle catégorie"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <button type="button" className="btn-primary" onClick={handleCreateCategory}>
                    <FolderPlus size={14} /> Créer
                  </button>
                </div>

                {/* Créer un salon */}
                <h3>Nouveau salon</h3>
                <div className="channel-create-row">
                  <input
                    type="text"
                    placeholder="nom-du-salon"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                  />
                  <select
                    value={newChannelCategory}
                    onChange={(e) => setNewChannelCategory(e.target.value)}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <button type="button" className="btn-primary" onClick={handleCreateChannel}>
                    <Plus size={14} /> Créer
                  </button>
                </div>

                {/* Panneau des permissions */}
                {permChannel && (
                  <div className="perm-panel">
                    <div className="perm-panel-header">
                      <h3>Permissions — #{permChannel.name}</h3>
                      <button className="perm-close" onClick={() => setPermChannel(null)}><X size={16} /></button>
                    </div>
                    <p className="perm-hint">Le Owner a toujours toutes les permissions.</p>
                    <div className="perm-list">
                      {channelPerms.map(p => (
                        <div key={p.roleId} className="perm-row">
                          <div className="perm-role">
                            <span className="role-dot" style={{ background: p.roleColor }} />
                            <span>{p.roleName}</span>
                          </div>
                          <div className="perm-toggles">
                            <button
                              className={`perm-toggle ${p.canView ? 'allowed' : 'denied'}`}
                              onClick={() => handleTogglePerm(p.roleId, 'canView')}
                              title={p.canView ? 'Voir : Oui' : 'Voir : Non'}
                            >
                              {p.canView ? <Eye size={14} /> : <EyeOff size={14} />}
                              Voir
                            </button>
                            <button
                              className={`perm-toggle ${p.canSend ? 'allowed' : 'denied'}`}
                              onClick={() => handleTogglePerm(p.roleId, 'canSend')}
                              title={p.canSend ? 'Envoyer : Oui' : 'Envoyer : Non'}
                            >
                              <MessageSquare size={14} />
                              Parler
                            </button>
                            <button
                              className={`perm-toggle ${p.canReact ? 'allowed' : 'denied'}`}
                              onClick={() => handleTogglePerm(p.roleId, 'canReact')}
                              title={p.canReact ? 'Réactions : Oui' : 'Réactions : Non'}
                            >
                              <SmilePlus size={14} />
                              Réagir
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="btn-primary" onClick={handleSavePermissions}>
                      Enregistrer les permissions
                    </button>
                  </div>
                )}

                {/* Liste des catégories + salons */}
                <div className="channels-management">
                  {categories.map(cat => (
                    <div key={cat} className="cat-group">
                      <div className="cat-header">
                        {renamingCategory === cat ? (
                          <div className="cat-rename-row">
                            <input
                              autoFocus
                              value={renameCategoryValue}
                              onChange={(e) => setRenameCategoryValue(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleRenameCategory(cat)}
                            />
                            <button className="cat-rename-ok" onClick={() => handleRenameCategory(cat)}>
                              <Check size={14} />
                            </button>
                            <button className="cat-rename-cancel" onClick={() => setRenamingCategory(null)}>
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="cat-name">{cat}</span>
                            <div className="cat-actions">
                              <button
                                title="Monter"
                                disabled={categories.indexOf(cat) === 0}
                                onClick={() => handleMoveCategory(cat, -1)}
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                title="Descendre"
                                disabled={categories.indexOf(cat) === categories.length - 1}
                                onClick={() => handleMoveCategory(cat, 1)}
                              >
                                <ChevronDown size={13} />
                              </button>
                              <button
                                title="Renommer"
                                onClick={() => { setRenamingCategory(cat); setRenameCategoryValue(cat); }}
                              >
                                <Edit2 size={13} />
                              </button>
                              {cat !== 'GÉNÉRAL' && (
                                <button title="Supprimer la catégorie" className="danger-sm" onClick={() => handleDeleteCategory(cat)}>
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {categorizedChannels[cat].map(ch => (
                        <div key={ch.id} className="ch-row">
                          <div className="ch-left">
                            <Hash size={15} />
                            {editingChannel === ch.id ? (
                              <input
                                autoFocus
                                className="ch-edit-input"
                                value={editChannelName}
                                onChange={(e) => setEditChannelName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleEditChannel(ch.id)}
                              />
                            ) : (
                              <span>{ch.name}</span>
                            )}
                          </div>
                          <div className="ch-actions">
                            {/* Déplacer vers une autre catégorie */}
                            {categories.length > 1 && (
                              <select
                                className="ch-move-select"
                                value={ch.category || 'GÉNÉRAL'}
                                onChange={(e) => handleMoveChannel(ch.id, e.target.value)}
                              >
                                {categories.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            )}
                            {/* Permissions */}
                            <button title="Permissions" onClick={() => openPermissions(ch)}>
                              <Shield size={13} />
                            </button>
                            {/* Renommer */}
                            {editingChannel === ch.id ? (
                              <button onClick={() => handleEditChannel(ch.id)}>
                                <Check size={13} />
                              </button>
                            ) : (
                              <button title="Renommer" onClick={() => { setEditingChannel(ch.id); setEditChannelName(ch.name); }}>
                                <Edit2 size={13} />
                              </button>
                            )}
                            {/* Supprimer */}
                            <button className="danger-sm" title="Supprimer" onClick={() => handleDeleteChannel(ch.id)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── RÔLES ── */}
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

            {/* ── MEMBRES ── */}
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
                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleBanMember(member.id)}
                          >
                            Bannir
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── BANS ── */}
            {activeTab === 'bans' && (
              <div className="settings-section">
                <h3>Utilisateurs bannis ({bans.length})</h3>
                {bans.length === 0 ? (
                  <p style={{ color: '#888', fontSize: 13 }}>Aucun utilisateur banni.</p>
                ) : (
                  <div className="members-list">
                    {bans.map((ban) => (
                      <div key={ban.user_id} className="member-row">
                        <div className="member-left">
                          <div className="member-avatar">{ban.username?.charAt(0).toUpperCase()}</div>
                          <div className="member-meta">
                            <strong>{ban.username}</strong>
                            <span style={{ color: '#ff8f92', fontSize: 12 }}>
                              {ban.reason || 'Aucune raison'}
                            </span>
                          </div>
                        </div>
                        <div className="member-actions">
                          <button type="button" className="btn-primary" onClick={() => handleUnban(ban.user_id)}>
                            Débannir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
