/**
 * Just - Composant principal de l'application
 * 
 * Gère le routing entre la page d'auth et l'interface principale,
 * et initialise les listeners Socket.io pour le temps réel.
 */

import { useEffect, useState } from 'react';
import useStore from './store/useStore';
import { getSocket } from './api/socket';
import AuthPage from './pages/AuthPage';
import ServerSidebar from './components/ServerSidebar/ServerSidebar';
import ChannelSidebar from './components/ChannelSidebar/ChannelSidebar';
import ChatArea from './components/ChatArea/ChatArea';
import MemberList from './components/MemberList/MemberList';
import DMSidebar from './components/DMSidebar/DMSidebar';
import DMChatArea from './components/DMChatArea/DMChatArea';
import UserProfilePopover from './components/UserProfilePopover/UserProfilePopover';
import VoiceCallUI from './components/VoiceCall/VoiceCallUI';
import AdminPage from './pages/AdminPage';
import {
  requestPermission,
  notifyNewMessage,
  notifyDM,
} from './api/notifications';
import './App.css';

export default function App() {
  const isAdminPath = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

  const {
    isAuthenticated, restoreSession, fetchServers,
    addMessage, setMembers, setMemberOnline, setTypingUser,
    currentServer, activeView, addDMMessage, setDMTypingUser,
    profilePopover, hideProfilePopover, openDMWithUser, joinServerByInviteLink,
    theme, updateMessage, removeMessage, updateMessageReactions,
  } = useStore();
  const [loading, setLoading] = useState(true);
  const [isMobileDevice, setIsMobileDevice] = useState(window.innerWidth < 768);
  const [mobileView, setMobileView] = useState(window.innerWidth < 768 ? 'dms' : 'chat'); // 'chat' | 'channels' | 'dms'

  if (isAdminPath) {
    return <AdminPage />;
  }

  // Appliquer le thème au démarrage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Détecter les changements de taille d'écran (mobile/desktop)
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileDevice(mobile);
      if (!mobile) setMobileView('chat'); // Reset to chat on desktop
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const extractInviteCodeFromPath = () => {
    const match = window.location.pathname.match(/^\/([A-Za-z0-9]{8,32})\/?$/);
    return match ? match[1] : null;
  };

  // Restaurer la session au chargement
  useEffect(() => {
    const init = async () => {
      const inviteCodeFromPath = extractInviteCodeFromPath();
      if (inviteCodeFromPath) {
        localStorage.setItem('just_pending_invite_code', inviteCodeFromPath);
      }

      await restoreSession();
      setLoading(false);
    };
    init();
  }, []);

  // Consommer une invitation temporaire après authentification
  useEffect(() => {
    if (!isAuthenticated) return;

    const joinPendingInvite = async () => {
      const code = localStorage.getItem('just_pending_invite_code');
      if (!code) return;

      try {
        await joinServerByInviteLink(code);
      } catch (err) {
        console.error('Join pending invite error:', err);
      } finally {
        localStorage.removeItem('just_pending_invite_code');
        if (window.location.pathname !== '/') {
          window.history.replaceState({}, '', '/');
        }
      }
    };

    joinPendingInvite();
  }, [isAuthenticated]);

  // Charger les serveurs quand authentifié
  useEffect(() => {
    if (isAuthenticated) {
      fetchServers();
      // Demander la permission pour les notifications navigateur
      requestPermission();
    }
  }, [isAuthenticated]);

  // Configurer les listeners Socket.io
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkSocket = setInterval(() => {
      const socket = getSocket();
      if (socket) {
        clearInterval(checkSocket);

        // Nouveau message reçu
        socket.on('message:new', (message) => {
          addMessage(message);
          // Notification si page en arrière-plan
          const state = useStore.getState();
          if (message.author_id !== state.user?.id) {
            const channelName = state.currentChannel?.name || 'salon';
            notifyNewMessage(
              message.author_username,
              channelName,
              message.content,
            );
          }
        });

        // Mention @username
        socket.on('mention:new', ({ channelId, message, mentionedBy }) => {
          const state = useStore.getState();
          // Ajouter le message s'il n'est pas déjà là
          addMessage(message);
          // Toujours notifier pour une mention
          notifyNewMessage(
            `${mentionedBy} vous a mentionné`,
            state.currentChannel?.name || 'salon',
            message.content,
          );
        });

        // Mise à jour de la liste des membres
        socket.on('server:members', ({ serverId, members }) => {
          setMembers(members);
        });

        // Un utilisateur se connecte
        socket.on('user:online', ({ userId }) => {
          setMemberOnline(userId, true);
        });

        // Un utilisateur se déconnecte
        socket.on('user:offline', ({ userId }) => {
          setMemberOnline(userId, false);
        });

        // Indicateur de frappe
        socket.on('typing:update', ({ userId, username, isTyping }) => {
          setTypingUser(userId, username, isTyping);
        });

        // Nouveau salon créé
        socket.on('channel:created', (channel) => {
          const state = useStore.getState();
          if (!state.channels.find(c => c.id === channel.id)) {
            useStore.setState({ channels: [...state.channels, channel] });
          }
        });

        // === DM Events ===
        socket.on('dm:new', ({ conversationId, message }) => {
          addDMMessage(conversationId, message);
        });

        socket.on('dm:notification', ({ conversationId, message }) => {
          addDMMessage(conversationId, message);
          // Notification navigateur pour les DM reçus
          const state = useStore.getState();
          if (message.author_id !== state.user?.id) {
            notifyDM(message.author_username, message.content);
          }
        });

        socket.on('dm:typing:update', ({ userId, username, conversationId, isTyping }) => {
          setDMTypingUser(userId, username, isTyping);
        });

        // === DM edit/delete/reaction events ===
        socket.on('dm:edited', ({ messageId, content, edited_at, conversationId }) => {
          const state = useStore.getState();
          if (state.currentDM?.id === conversationId) {
            useStore.setState({
              dmMessages: state.dmMessages.map((m) =>
                m.id === messageId ? { ...m, content, edited_at } : m
              ),
            });
          }
        });

        socket.on('dm:deleted', ({ messageId, conversationId }) => {
          const state = useStore.getState();
          if (state.currentDM?.id === conversationId) {
            useStore.setState({
              dmMessages: state.dmMessages.filter((m) => m.id !== messageId),
            });
          }
        });

        socket.on('dm:reactions', ({ messageId, reactions, conversationId }) => {
          const state = useStore.getState();
          if (state.currentDM?.id === conversationId) {
            useStore.setState({
              dmMessages: state.dmMessages.map((m) =>
                m.id === messageId ? { ...m, reactions } : m
              ),
            });
          }
        });

        // === Message edit/delete/reaction events ===
        socket.on('message:edited', ({ messageId, content, edited_at }) => {
          updateMessage(messageId, { content, edited_at });
        });

        socket.on('message:deleted', ({ messageId }) => {
          removeMessage(messageId);
        });

        socket.on('message:reactions', ({ messageId, reactions }) => {
          updateMessageReactions(messageId, reactions);
        });

        // Rate limit error
        socket.on('error:ratelimit', ({ message }) => {
          alert(message);
        });

        socket.on('account:banned', ({ reason }) => {
          alert(`Compte banni: ${reason || 'Bannissement administratif'}`);
          useStore.getState().logout();
        });
      }
    }, 100);

    return () => {
      clearInterval(checkSocket);
      const socket = getSocket();
      if (socket) {
        socket.off('message:new');
        socket.off('mention:new');
        socket.off('server:members');
        socket.off('user:online');
        socket.off('user:offline');
        socket.off('typing:update');
        socket.off('channel:created');
        socket.off('dm:new');
        socket.off('dm:notification');
        socket.off('dm:typing:update');
        socket.off('dm:edited');
        socket.off('dm:deleted');
        socket.off('dm:reactions');
        socket.off('message:edited');
        socket.off('message:deleted');
        socket.off('message:reactions');
        socket.off('error:ratelimit');
        socket.off('account:banned');
      }
    };
  }, [isAuthenticated]);

  // Écran de chargement
  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-logo">J</div>
        <div className="loading-spinner" />
      </div>
    );
  }

  // Page d'authentification
  if (!isAuthenticated) {
    return <AuthPage />;
  }

  // Interface principale (layout Discord-like)
  return (
    <>
      <div className="app-layout">
        <ServerSidebar isMobileDevice={isMobileDevice} mobileView={mobileView} setMobileView={setMobileView} />
        {activeView === 'dm' ? (
          <>
            {/* DMSidebar : visible en desktop, overlay en mobile */}
            {!isMobileDevice && <DMSidebar mobileView={mobileView} setMobileView={setMobileView} isMobileDevice={isMobileDevice} />}
            {isMobileDevice && mobileView === 'dms' && (
              <div className="mobile-sidebar-overlay">
                <DMSidebar mobileView={mobileView} setMobileView={setMobileView} isMobileDevice={isMobileDevice} />
              </div>
            )}
            {/* Sur mobile: DMChatArea visible seulement si mobileView === 'chat' */}
            {!isMobileDevice || mobileView === 'chat' ? <DMChatArea /> : null}
          </>
        ) : (
          <>
            {/* ChannelSidebar : visible en desktop, overlay en mobile */}
            {!isMobileDevice && <ChannelSidebar mobileView={mobileView} setMobileView={setMobileView} isMobileDevice={isMobileDevice} />}
            {isMobileDevice && mobileView === 'channels' && (
              <div className="mobile-sidebar-overlay">
                <ChannelSidebar mobileView={mobileView} setMobileView={setMobileView} isMobileDevice={isMobileDevice} />
              </div>
            )}
            {/* Sur mobile: ChatArea visible seulement si mobileView === 'chat' */}
            {!isMobileDevice || mobileView === 'chat' ? <ChatArea /> : null}
            {/* MemberList : visible en desktop, overlay en mobile */}
            {!isMobileDevice && currentServer && <MemberList />}
            {isMobileDevice && mobileView === 'members' && currentServer && (
              <div className="mobile-sidebar-overlay">
                <MemberList />
              </div>
            )}
          </>
        )}

        {/* Popover de profil */}
        {profilePopover && (
          <UserProfilePopover
            member={profilePopover.member}
            position={profilePopover.position}
            onClose={hideProfilePopover}
            onStartDM={async (memberId) => {
              hideProfilePopover();
              await openDMWithUser(memberId);
            }}
          />
        )}

        {/* Bannière d'appel vocal (appel entrant / sortant / connecté) */}
        <VoiceCallUI currentUserId={useStore.getState().user?.id} />
      </div>

      {/* Onglets de navigation mobile (en bas) - HORS de app-layout */}
      {isMobileDevice && (
        <div className="mobile-tabs">
          {/* En serveur: afficher Canaux, Chat, Membres */}
          {activeView !== 'dm' && (
            <>
              <button
                className={`mobile-tab ${mobileView === 'channels' ? 'active' : ''}`}
                onClick={() => setMobileView('channels')}
                title="Canaux"
              >
                <span>#</span>
                <span className="mobile-tab-label">Canaux</span>
              </button>
              <button
                className={`mobile-tab ${mobileView === 'chat' ? 'active' : ''}`}
                onClick={() => setMobileView('chat')}
                title="Chat"
              >
                <span>💬</span>
                <span className="mobile-tab-label">Chat</span>
              </button>
              <button
                className={`mobile-tab ${mobileView === 'members' ? 'active' : ''}`}
                onClick={() => setMobileView('members')}
                title="Membres"
              >
                <span>👥</span>
                <span className="mobile-tab-label">Membres</span>
              </button>
            </>
          )}

          {/* En DM: afficher seulement Chat et Messages */}
          {activeView === 'dm' && (
            <>
              <button
                className={`mobile-tab ${mobileView === 'chat' ? 'active' : ''}`}
                onClick={() => setMobileView('chat')}
                title="Chat"
              >
                <span>💬</span>
                <span className="mobile-tab-label">Chat</span>
              </button>
              <button
                className={`mobile-tab ${mobileView === 'dms' ? 'active' : ''}`}
                onClick={() => setMobileView('dms')}
                title="Messages privés"
              >
                <span>✉️</span>
                <span className="mobile-tab-label">Messages</span>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
