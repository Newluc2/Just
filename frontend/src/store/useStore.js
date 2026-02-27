/**
 * Just - Store global (Zustand)
 * 
 * Gère l'état global de l'application :
 * - Authentification (user, token)
 * - Serveurs, salons, messages
 * - Membres en ligne
 */

import { create } from 'zustand';
import { apiFetch } from '../api/config';
import { connectSocket, disconnectSocket, getSocket } from '../api/socket';

const useStore = create((set, get) => ({
  // ===== AUTH =====
  user: null,
  token: localStorage.getItem('just_token') || null,
  isAuthenticated: false,

  /**
   * Inscription d'un nouvel utilisateur
   */
  register: async (username, email, password) => {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
    localStorage.setItem('just_token', data.token);
    set({ user: data.user, token: data.token, isAuthenticated: true });
    connectSocket(data.token);
  },

  /**
   * Connexion
   */
  login: async (email, password) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('just_token', data.token);
    set({ user: data.user, token: data.token, isAuthenticated: true });
    connectSocket(data.token);
  },

  /**
   * Déconnexion
   */
  logout: () => {
    localStorage.removeItem('just_token');
    disconnectSocket();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      servers: [],
      currentServer: null,
      channels: [],
      currentChannel: null,
      messages: [],
      members: [],
      dmConversations: [],
      currentDM: null,
      dmMessages: [],
      activeView: 'servers',
    });
  },

  /**
   * Restaurer la session à partir du token stocké
   */
  restoreSession: async () => {
    const token = localStorage.getItem('just_token');
    if (!token) return;

    try {
      const data = await apiFetch('/auth/me');
      set({ user: data.user, token, isAuthenticated: true });
      connectSocket(token);
    } catch {
      localStorage.removeItem('just_token');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },

  // ===== SERVEURS =====
  servers: [],
  currentServer: null,

  /**
   * Charger la liste des serveurs de l'utilisateur
   */
  fetchServers: async () => {
    const data = await apiFetch('/servers');
    set({ servers: data.servers });
  },

  /**
   * Sélectionner un serveur et charger ses détails
   */
  selectServer: async (serverId) => {
    const data = await apiFetch(`/servers/${serverId}`);
    const server = data.server;

    // Quitter l'ancien DM si besoin
    const socket = getSocket();
    const oldDM = get().currentDM;
    if (socket && oldDM) {
      socket.emit('dm:leave', oldDM.id);
    }

    set({
      currentServer: server,
      channels: server.channels || [],
      members: server.members || [],
      currentChannel: null,
      messages: [],
      currentDM: null,
      dmMessages: [],
      activeView: 'servers',
    });

    // Rejoindre la room Socket.io du serveur
    if (socket) {
      // Quitter l'ancien serveur si besoin
      const oldServer = get().currentServer;
      if (oldServer && oldServer.id !== serverId) {
        socket.emit('server:leave', oldServer.id);
      }
      socket.emit('server:join', serverId);
    }
  },

  /**
   * Créer un nouveau serveur
   */
  createServer: async (name) => {
    const data = await apiFetch('/servers', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    set((state) => ({ servers: [...state.servers, data.server] }));
    return data.server;
  },

  /**
   * Rejoindre un serveur via code d'invitation
   */
  joinServer: async (inviteCode) => {
    const data = await apiFetch('/servers/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
    // Recharger la liste des serveurs
    await get().fetchServers();
    return data.server;
  },

  joinServerByInviteLink: async (inviteCode) => {
    const data = await apiFetch(`/invites/${inviteCode}/join`, {
      method: 'POST',
    });
    await get().fetchServers();
    return data.server;
  },

  updateServerSettings: async (serverId, updates) => {
    const data = await apiFetch(`/servers/${serverId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });

    set((state) => ({
      servers: state.servers.map((s) => (s.id === serverId ? { ...s, ...data.server } : s)),
      currentServer: state.currentServer?.id === serverId
        ? { ...state.currentServer, ...data.server }
        : state.currentServer,
    }));

    return data.server;
  },

  fetchServerRoles: async (serverId) => {
    const data = await apiFetch(`/servers/${serverId}/roles`);
    return data.roles || [];
  },

  createServerRole: async (serverId, payload) => {
    const data = await apiFetch(`/servers/${serverId}/roles`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.role;
  },

  updateServerRole: async (serverId, roleId, payload) => {
    const data = await apiFetch(`/servers/${serverId}/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return data.role;
  },

  deleteServerRole: async (serverId, roleId) => {
    await apiFetch(`/servers/${serverId}/roles/${roleId}`, {
      method: 'DELETE',
    });
  },

  updateServerMemberRole: async (serverId, memberId, roleId) => {
    const data = await apiFetch(`/servers/${serverId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ roleId }),
    });

    if (data?.member) {
      set((state) => ({
        members: state.members.map((member) => (member.id === memberId ? data.member : member)),
      }));
    }

    return data?.member;
  },

  kickServerMember: async (serverId, memberId) => {
    await apiFetch(`/servers/${serverId}/members/${memberId}`, {
      method: 'DELETE',
    });
  },

  leaveServer: async (serverId) => {
    await apiFetch(`/servers/${serverId}/members/leave`, {
      method: 'DELETE',
    });

    set((state) => ({
      servers: state.servers.filter((server) => server.id !== serverId),
      currentServer: state.currentServer?.id === serverId ? null : state.currentServer,
      channels: state.currentServer?.id === serverId ? [] : state.channels,
      currentChannel: state.currentServer?.id === serverId ? null : state.currentChannel,
      messages: state.currentServer?.id === serverId ? [] : state.messages,
      members: state.currentServer?.id === serverId ? [] : state.members,
    }));
  },

  createServerInvite: async (serverId, payload) => {
    const data = await apiFetch(`/servers/${serverId}/invites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.invite;
  },

  /**
   * Supprimer un serveur
   */
  deleteServer: async (serverId) => {
    await apiFetch(`/servers/${serverId}`, { method: 'DELETE' });
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== serverId),
      currentServer: state.currentServer?.id === serverId ? null : state.currentServer,
      channels: state.currentServer?.id === serverId ? [] : state.channels,
      messages: state.currentServer?.id === serverId ? [] : state.messages,
    }));
  },

  // ===== SALONS =====
  channels: [],
  currentChannel: null,

  /**
   * Sélectionner un salon et charger les messages
   */
  selectChannel: async (channelId) => {
    const channel = get().channels.find((c) => c.id === channelId);
    if (!channel) return;

    // Quitter l'ancien salon Socket.io
    const socket = getSocket();
    const oldChannel = get().currentChannel;
    if (socket && oldChannel) {
      socket.emit('channel:leave', oldChannel.id);
    }

    set({ currentChannel: channel, messages: [] });

    // Charger les messages
    const data = await apiFetch(`/messages/${channelId}`);
    set({ messages: data.messages });

    // Rejoindre le nouveau salon Socket.io
    if (socket) {
      socket.emit('channel:join', channelId);
    }
  },

  /**
   * Créer un nouveau salon
   */
  createChannel: async (name) => {
    const serverId = get().currentServer?.id;
    if (!serverId) return;

    const data = await apiFetch('/channels', {
      method: 'POST',
      body: JSON.stringify({ name, serverId }),
    });

    set((state) => ({
      channels: [...state.channels, data.channel],
    }));

    // Notifier les autres membres via socket
    const socket = getSocket();
    if (socket) {
      socket.emit('channel:create', { serverId, channel: data.channel });
    }

    return data.channel;
  },

  // ===== MESSAGES =====
  messages: [],

  /**
   * Envoyer un message via Socket.io
   */
  sendMessage: (content) => {
    const channelId = get().currentChannel?.id;
    if (!channelId || !content.trim()) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('message:send', { channelId, content });
    }
  },

  /**
   * Ajouter un message reçu via Socket.io
   */
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  // ===== MEMBRES =====
  members: [],

  /**
   * Mettre à jour la liste des membres
   */
  setMembers: (members) => set({ members }),

  /**
   * Mettre à jour le statut en ligne d'un membre
   */
  setMemberOnline: (userId, online) => {
    set((state) => ({
      members: state.members.map((m) =>
        m.id === userId ? { ...m, online, status: online ? 'online' : 'offline' } : m
      ),
    }));
  },

  // ===== TYPING =====
  typingUsers: [],

  setTypingUser: (userId, username, isTyping) => {
    set((state) => {
      if (isTyping) {
        if (state.typingUsers.find((t) => t.userId === userId)) return state;
        return { typingUsers: [...state.typingUsers, { userId, username }] };
      } else {
        return { typingUsers: state.typingUsers.filter((t) => t.userId !== userId) };
      }
    });
  },

  // ===== VIEW MODE =====
  activeView: 'servers', // 'servers' | 'dm'

  setActiveView: (view) => {
    set({ activeView: view });
    if (view === 'dm') {
      // Quitter le serveur actuel si on bascule en DM
      const socket = getSocket();
      const state = get();
      if (socket && state.currentServer) {
        socket.emit('server:leave', state.currentServer.id);
      }
      set({ currentServer: null, currentChannel: null, messages: [] });
    }
  },

  // ===== MESSAGES PRIVÉS (DM) =====
  dmConversations: [],
  currentDM: null,
  dmMessages: [],
  dmTypingUsers: [],

  /**
   * Charger les conversations DM
   */
  fetchDMConversations: async () => {
    try {
      const data = await apiFetch('/dm/conversations');
      set({ dmConversations: data.conversations || [] });
    } catch (err) {
      console.error('Fetch DM conversations error:', err);
    }
  },

  /**
   * Sélectionner une conversation DM
   */
  selectDM: async (conversation) => {
    const socket = getSocket();
    const oldDM = get().currentDM;

    // Quitter l'ancienne conversation
    if (socket && oldDM) {
      socket.emit('dm:leave', oldDM.id);
    }

    // Quitter le serveur/channel actuel
    const oldChannel = get().currentChannel;
    if (socket && oldChannel) {
      socket.emit('channel:leave', oldChannel.id);
    }

    set({ 
      currentDM: conversation, 
      dmMessages: [], 
      currentServer: null, 
      currentChannel: null, 
      messages: [],
      activeView: 'dm',
      dmTypingUsers: [],
    });

    // Charger les messages
    try {
      const data = await apiFetch(`/dm/messages/${conversation.id}`);
      set({ dmMessages: data.messages || [] });
    } catch (err) {
      console.error('Fetch DM messages error:', err);
    }

    // Rejoindre la room DM
    if (socket) {
      socket.emit('dm:join', conversation.id);
    }
  },

  /**
   * Ouvrir un DM avec un utilisateur (par son ID)
   */
  openDMWithUser: async (recipientId) => {
    try {
      const data = await apiFetch('/dm/conversations', {
        method: 'POST',
        body: JSON.stringify({ recipientId }),
      });
      const conv = data.conversation;
      
      // Refresh conversations list
      await get().fetchDMConversations();
      
      // Sélectionner la conversation
      await get().selectDM(conv);
    } catch (err) {
      console.error('Open DM error:', err);
    }
  },

  /**
   * Envoyer un message DM
   */
  sendDM: (content) => {
    const dm = get().currentDM;
    if (!dm || !content.trim()) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('dm:send', {
        conversationId: dm.id,
        recipientId: dm.other_user_id,
        content,
      });
    }
  },

  /**
   * Ajouter un message DM reçu
   */
  addDMMessage: (conversationId, message) => {
    const state = get();
    if (state.currentDM?.id === conversationId) {
      if (state.dmMessages.some((m) => m.id === message.id)) return;
      set({ dmMessages: [...state.dmMessages, message] });
    }
  },

  setDMTypingUser: (userId, username, isTyping) => {
    set((state) => {
      if (isTyping) {
        if (state.dmTypingUsers.find((t) => t.userId === userId)) return state;
        return { dmTypingUsers: [...state.dmTypingUsers, { userId, username }] };
      } else {
        return { dmTypingUsers: state.dmTypingUsers.filter((t) => t.userId !== userId) };
      }
    });
  },

  // ===== PROFIL =====
  /**
   * Mettre à jour le profil utilisateur
   */
  updateProfile: async (updates) => {
    const data = await apiFetch('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    set({ user: data.user });
    return data.user;
  },

  // ===== POPOVER =====
  profilePopover: null, // { member, position }

  showProfilePopover: (member, position) => {
    set({ profilePopover: { member, position } });
  },

  hideProfilePopover: () => {
    set({ profilePopover: null });
  },
}));

export default useStore;
