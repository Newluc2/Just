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
import './App.css';

export default function App() {
  const {
    isAuthenticated, restoreSession, fetchServers,
    addMessage, setMembers, setMemberOnline, setTypingUser,
    currentServer, activeView, addDMMessage, setDMTypingUser,
    profilePopover, hideProfilePopover, openDMWithUser, joinServerByInviteLink,
  } = useStore();
  const [loading, setLoading] = useState(true);

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
          // Aussi ajouter au DM courant si c'est le bon
          addDMMessage(conversationId, message);
        });

        socket.on('dm:typing:update', ({ userId, username, conversationId, isTyping }) => {
          setDMTypingUser(userId, username, isTyping);
        });
      }
    }, 100);

    return () => {
      clearInterval(checkSocket);
      const socket = getSocket();
      if (socket) {
        socket.off('message:new');
        socket.off('server:members');
        socket.off('user:online');
        socket.off('user:offline');
        socket.off('typing:update');
        socket.off('channel:created');
        socket.off('dm:new');
        socket.off('dm:notification');
        socket.off('dm:typing:update');
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
    <div className="app-layout">
      <ServerSidebar />
      {activeView === 'dm' ? (
        <>
          <DMSidebar />
          <DMChatArea />
        </>
      ) : (
        <>
          <ChannelSidebar />
          <ChatArea />
          {currentServer && <MemberList />}
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
    </div>
  );
}
