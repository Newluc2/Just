/**
 * Just - Modal des paramètres utilisateur
 *
 * Permet à l'utilisateur de modifier son profil (nom, email, mot de passe).
 */

import { useState } from 'react';
import { X, User, Lock, Save, Palette } from 'lucide-react';
import useStore from '../../store/useStore';
import './SettingsModal.css';

export default function SettingsModal({ onClose }) {
  const { user, updateProfile, logout, theme, setTheme } = useStore();

  const [tab, setTab]               = useState('profile');
  const [username, setUsername]     = useState(user?.username || '');
  const [email, setEmail]           = useState(user?.email || '');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd]         = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving]         = useState(false);
  const [message, setMessage]       = useState(null); // { type: 'success'|'error', text }

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!username.trim()) return showMsg('error', 'Le nom d\'utilisateur est requis.');
    setSaving(true);
    try {
      await updateProfile({ username: username.trim(), email: email.trim() });
      showMsg('success', 'Profil mis à jour !');
    } catch (err) {
      showMsg('error', err.message || 'Erreur lors de la mise à jour.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPwd || !newPwd) return showMsg('error', 'Remplis tous les champs.');
    if (newPwd !== confirmPwd) return showMsg('error', 'Les mots de passe ne correspondent pas.');
    if (newPwd.length < 6) return showMsg('error', 'Le mot de passe doit faire au moins 6 caractères.');
    setSaving(true);
    try {
      await updateProfile({ currentPassword: currentPwd, newPassword: newPwd });
      showMsg('success', 'Mot de passe modifié !');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      showMsg('error', err.message || 'Mot de passe actuel incorrect.');
    } finally {
      setSaving(false);
    }
  };

  const getAvatarColor = (name) => {
    const colors = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f47b67', '#3ba5b8'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  };

  const THEMES = [
    {
      id: 'bleu-violet',
      label: 'Bleu Violet',
      colors: ['#1a1a2e', '#22223b', '#5865f2'],
    },
    {
      id: 'noir-sombre',
      label: 'Noir Sombre',
      colors: ['#0a0a0a', '#111111', '#5865f2'],
    },
    {
      id: 'noir-clair',
      label: 'Noir Clair',
      colors: ['#1e1e1e', '#252525', '#5865f2'],
    },
    {
      id: 'blanc',
      label: 'Blanc',
      colors: ['#f2f3f5', '#e3e5e8', '#5865f2'],
    },
  ];

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-modal">
        {/* Header */}
        <div className="settings-header">
          <h2>Paramètres</h2>
          <button className="settings-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Avatar + pseudo */}
        <div className="settings-profile-banner">
          <div
            className="settings-avatar"
            style={{ background: getAvatarColor(user?.username) }}
          >
            {(user?.username || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="settings-username">{user?.username}</div>
            <div className="settings-email">{user?.email}</div>
          </div>
        </div>

        {/* Onglets */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${tab === 'profile' ? 'active' : ''}`}
            onClick={() => setTab('profile')}
          >
            <User size={15} /> Profil
          </button>
          <button
            className={`settings-tab ${tab === 'security' ? 'active' : ''}`}
            onClick={() => setTab('security')}
          >
            <Lock size={15} /> Sécurité
          </button>
          <button
            className={`settings-tab ${tab === 'apparence' ? 'active' : ''}`}
            onClick={() => setTab('apparence')}
          >
            <Palette size={15} /> Apparence
          </button>
        </div>

        {/* Contenu */}
        <div className="settings-content">
          {message && (
            <div className={`settings-msg ${message.type}`}>{message.text}</div>
          )}

          {/* ── Profil ── */}
          {tab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="settings-form">
              <label>
                Nom d'utilisateur
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  maxLength={32}
                />
              </label>
              <label>
                Adresse e-mail
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </label>
              <button type="submit" className="settings-save-btn" disabled={saving}>
                <Save size={15} />
                {saving ? 'Enregistrement…' : 'Sauvegarder'}
              </button>
            </form>
          )}

          {/* ── Sécurité ── */}
          {tab === 'security' && (
            <form onSubmit={handleChangePassword} className="settings-form">
              <label>
                Mot de passe actuel
                <input
                  type="password"
                  value={currentPwd}
                  onChange={e => setCurrentPwd(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label>
                Nouveau mot de passe
                <input
                  type="password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirmer le nouveau mot de passe
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <button type="submit" className="settings-save-btn" disabled={saving}>
                <Lock size={15} />
                {saving ? 'Modification…' : 'Changer le mot de passe'}
              </button>
            </form>
          )}
          {/* ── Apparence ── */}
          {tab === 'apparence' && (
            <div className="theme-grid">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`theme-card ${theme === t.id ? 'selected' : ''}`}
                  onClick={() => setTheme(t.id)}
                  title={t.label}
                >
                  <div
                    className="theme-preview"
                    style={{ background: t.colors[0] }}
                  >
                    <div
                      className="theme-preview-bar"
                      style={{ background: t.colors[1], width: '30%', height: '100%' }}
                    />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' }}>
                      <div style={{ height: '8px', borderRadius: '4px', background: t.colors[2], width: '60%' }} />
                      <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.2)', width: '80%' }} />
                      <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', width: '50%' }} />
                    </div>
                  </div>
                  <div className="theme-card-label">{t.label}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button className="settings-logout-btn" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
