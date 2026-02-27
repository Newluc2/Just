/**
 * Just - Gestionnaire Socket.io
 * 
 * Gère toutes les communications en temps réel :
 * - Connexion/déconnexion des utilisateurs
 * - Envoi de messages
 * - Rejoindre/quitter des salons
 * - Notifications de frappe (typing)
 * - Statut en ligne des membres
 */

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

// Map pour suivre les utilisateurs connectés : userId -> Set<socketId>
const onlineUsers = new Map();

/**
 * Configurer les événements Socket.io
 */
function setupSocket(io) {
  // Middleware d'authentification pour Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Token manquant'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    console.log(`🟢 ${socket.user.username} connected (${socket.id})`);

    // Ajouter l'utilisateur à la liste des connectés
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Mettre à jour le statut en base
    db.run('UPDATE users SET status = ? WHERE id = ?', ['online', userId]);

    // Informer tout le monde que l'utilisateur est en ligne
    io.emit('user:online', { userId, username: socket.user.username });

    /**
     * Rejoindre un serveur (room Socket.io)
     */
    socket.on('server:join', (serverId) => {
      socket.join(`server:${serverId}`);
      console.log(`📌 ${socket.user.username} joined server ${serverId}`);

      // Envoyer la liste des utilisateurs en ligne pour ce serveur
      const members = db.all(`
        SELECT u.id, u.username, u.avatar, u.status, u.about, u.created_at,
               sm.role, sm.role_id, sm.joined_at,
               sr.name as role_name, sr.color as role_color, sr.position as role_position
        FROM users u
        INNER JOIN server_members sm ON u.id = sm.user_id
        LEFT JOIN server_roles sr ON sr.id = sm.role_id
        WHERE sm.server_id = ?
        ORDER BY COALESCE(sr.position, 0) DESC, sm.joined_at ASC
      `, [serverId]);

      const onlineMembers = members.map(m => ({
        ...m,
        online: onlineUsers.has(m.id),
      }));

      socket.emit('server:members', { serverId, members: onlineMembers });
    });

    /**
     * Quitter un serveur
     */
    socket.on('server:leave', (serverId) => {
      socket.leave(`server:${serverId}`);
    });

    /**
     * Rejoindre un salon (pour recevoir les messages en temps réel)
     */
    socket.on('channel:join', (channelId) => {
      socket.join(`channel:${channelId}`);
      console.log(`💬 ${socket.user.username} joined channel ${channelId}`);
    });

    /**
     * Quitter un salon
     */
    socket.on('channel:leave', (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    /**
     * Envoyer un message dans un salon
     */
    socket.on('message:send', (data) => {
      const { channelId, content } = data;

      if (!content || !content.trim() || !channelId) return;

      const messageId = uuidv4();
      const now = new Date().toISOString();

      // Sauvegarder le message en base
      db.run('INSERT INTO messages (id, content, author_id, channel_id, created_at) VALUES (?, ?, ?, ?, ?)',
        [messageId, content.trim(), userId, channelId, now]);

      // Construire l'objet message complet
      const message = {
        id: messageId,
        content: content.trim(),
        author_id: userId,
        author_username: socket.user.username,
        author_avatar: null,
        channel_id: channelId,
        created_at: now,
      };

      // Diffuser le message à tous dans le salon
      io.to(`channel:${channelId}`).emit('message:new', message);
    });

    /**
     * Indicateur de frappe (typing)
     */
    socket.on('typing:start', (channelId) => {
      socket.to(`channel:${channelId}`).emit('typing:update', {
        userId,
        username: socket.user.username,
        channelId,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (channelId) => {
      socket.to(`channel:${channelId}`).emit('typing:update', {
        userId,
        username: socket.user.username,
        channelId,
        isTyping: false,
      });
    });

    /**
     * Création de salon (notifier les membres du serveur)
     */
    socket.on('channel:create', (data) => {
      io.to(`server:${data.serverId}`).emit('channel:created', data.channel);
    });

    /**
     * Rejoindre une conversation DM (room Socket.io)
     */
    socket.on('dm:join', (conversationId) => {
      socket.join(`dm:${conversationId}`);
    });

    /**
     * Quitter une conversation DM
     */
    socket.on('dm:leave', (conversationId) => {
      socket.leave(`dm:${conversationId}`);
    });

    /**
     * Envoyer un message privé
     */
    socket.on('dm:send', (data) => {
      const { conversationId, recipientId, content } = data;
      if (!content || !content.trim() || !conversationId) return;

      const messageId = uuidv4();
      const now = new Date().toISOString();

      // Sauvegarder en base
      db.run(
        'INSERT INTO direct_messages (id, content, sender_id, recipient_id, created_at) VALUES (?, ?, ?, ?, ?)',
        [messageId, content.trim(), userId, recipientId, now]
      );

      const message = {
        id: messageId,
        content: content.trim(),
        sender_id: userId,
        recipient_id: recipientId,
        author_username: socket.user.username,
        author_avatar: null,
        created_at: now,
      };

      // Envoyer au salon DM
      io.to(`dm:${conversationId}`).emit('dm:new', { conversationId, message });

      // Aussi notifier le destinataire s'il n'est pas dans le salon (notification)
      if (onlineUsers.has(recipientId)) {
        const roomName = `dm:${conversationId}`;
        const roomSockets = io.sockets.adapter.rooms.get(roomName) || new Set();
        onlineUsers.get(recipientId).forEach((sid) => {
          if (!roomSockets.has(sid)) {
            io.to(sid).emit('dm:notification', { conversationId, message });
          }
        });
      }
    });

    /**
     * Indicateur de frappe DM
     */
    socket.on('dm:typing:start', (conversationId) => {
      socket.to(`dm:${conversationId}`).emit('dm:typing:update', {
        userId,
        username: socket.user.username,
        conversationId,
        isTyping: true,
      });
    });

    socket.on('dm:typing:stop', (conversationId) => {
      socket.to(`dm:${conversationId}`).emit('dm:typing:update', {
        userId,
        username: socket.user.username,
        conversationId,
        isTyping: false,
      });
    });

    /**
     * Déconnexion
     */
    socket.on('disconnect', () => {
      console.log(`🔴 ${socket.user.username} disconnected (${socket.id})`);

      if (onlineUsers.has(userId)) {
        onlineUsers.get(userId).delete(socket.id);
        if (onlineUsers.get(userId).size === 0) {
          onlineUsers.delete(userId);
          db.run('UPDATE users SET status = ? WHERE id = ?', ['offline', userId]);
          io.emit('user:offline', { userId, username: socket.user.username });
        }
      }
    });
  });
}

module.exports = setupSocket;
