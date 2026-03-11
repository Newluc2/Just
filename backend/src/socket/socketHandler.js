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
        SELECT u.id, u.username, u.display_name, u.avatar, u.status, u.about, u.created_at,
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
      const { channelId, content, replyTo, attachments } = data;
      if ((!content || !content.trim()) && (!attachments || !attachments.length)) return;
      if (!channelId) return;

      const messageId = uuidv4();
      const now = new Date().toISOString();
      const trimmedContent = (content || '').trim();

      db.run(
        'INSERT INTO messages (id, content, author_id, channel_id, created_at, reply_to) VALUES (?, ?, ?, ?, ?, ?)',
        [messageId, trimmedContent, userId, channelId, now, replyTo || null]
      );

      // Sauvegarder les pièces jointes
      if (attachments && attachments.length) {
        for (const att of attachments) {
          db.run(
            'INSERT INTO message_attachments (id, message_id, filename, original_name, mimetype, size, url) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uuidv4(), messageId, att.filename, att.originalName, att.mimetype, att.size, att.url]
          );
        }
      }

      const currentUser = db.get('SELECT username, display_name, avatar FROM users WHERE id = ?', [userId]);
      const displayName = currentUser?.display_name || currentUser?.username || socket.user.username;

      const message = {
        id: messageId,
        content: trimmedContent,
        author_id: userId,
        author_username: currentUser?.username || socket.user.username,
        author_display_name: currentUser?.display_name || null,
        author_avatar: currentUser?.avatar || null,
        channel_id: channelId,
        created_at: now,
        edited_at: null,
        reply_to: replyTo || null,
        replied_message: null,
        reactions: [],
        attachments: attachments || [],
      };

      // Récupérer le message cité si besoin
      if (replyTo) {
        const replied = db.get(
          'SELECT m.*, u.username as author_username FROM messages m INNER JOIN users u ON m.author_id = u.id WHERE m.id = ?',
          [replyTo]
        );
        message.replied_message = replied || null;
      }

      io.to(`channel:${channelId}`).emit('message:new', message);

      // Mentions @username
      const mentionRegex = /@([a-zA-Z0-9_]+)/g;
      let match;
      while ((match = mentionRegex.exec(trimmedContent)) !== null) {
        const mentionedUser = db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [match[1]]);
        if (mentionedUser && mentionedUser.id !== userId && onlineUsers.has(mentionedUser.id)) {
          onlineUsers.get(mentionedUser.id).forEach((sid) => {
            io.to(sid).emit('mention:new', { channelId, message, mentionedBy: socket.user.username });
          });
        }
      }
    });

    /** Modifier un message */
    socket.on('message:edit', ({ messageId, content }) => {
      if (!content?.trim() || !messageId) return;
      const msg = db.get('SELECT * FROM messages WHERE id = ? AND author_id = ? AND is_deleted = 0', [messageId, userId]);
      if (!msg) return;
      const now = new Date().toISOString();
      db.run('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?', [content.trim(), now, messageId]);
      io.to(`channel:${msg.channel_id}`).emit('message:edited', {
        messageId, content: content.trim(), edited_at: now, channelId: msg.channel_id,
      });
    });

    /** Supprimer un message */
    socket.on('message:delete', ({ messageId }) => {
      if (!messageId) return;
      const msg = db.get('SELECT * FROM messages WHERE id = ?', [messageId]);
      if (!msg) return;
      const channel = db.get('SELECT * FROM channels WHERE id = ?', [msg.channel_id]);
      if (!channel) return;
      const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', [channel.server_id, userId]);
      const server = db.get('SELECT owner_id FROM servers WHERE id = ?', [channel.server_id]);
      const canDelete = msg.author_id === userId || server?.owner_id === userId || membership?.role === 'admin' || membership?.role === 'moderator';
      if (!canDelete) return;
      try {
        db.run('UPDATE messages SET is_deleted = 1 WHERE id = ?', [messageId]);
        // Émettre l'événement SEULEMENT si la persistance a réussi
        io.to(`channel:${msg.channel_id}`).emit('message:deleted', { messageId, channelId: msg.channel_id });
      } catch (err) {
        console.error('Erreur lors de la suppression du message:', err);
      }
    });

    /** Réaction à un message */
    socket.on('message:react', ({ messageId, emoji }) => {
      if (!messageId || !emoji) return;
      const msg = db.get('SELECT * FROM messages WHERE id = ?', [messageId]);
      if (!msg) return;
      const existing = db.get('SELECT * FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [messageId, userId, emoji]);
      if (existing) {
        db.run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [messageId, userId, emoji]);
      } else {
        db.run('INSERT INTO message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)', [uuidv4(), messageId, userId, emoji]);
      }
      // Récupérer toutes les réactions mises à jour
      const rawReactions = db.all('SELECT emoji, user_id FROM message_reactions WHERE message_id = ?', [messageId]);
      const reactionsMap = {};
      for (const r of rawReactions) {
        if (!reactionsMap[r.emoji]) reactionsMap[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        reactionsMap[r.emoji].count++;
        reactionsMap[r.emoji].users.push(r.user_id);
      }
      io.to(`channel:${msg.channel_id}`).emit('message:reactions', {
        messageId, channelId: msg.channel_id, reactions: Object.values(reactionsMap),
      });
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
      const { conversationId, recipientId, content, replyTo } = data;
      if (!content || !content.trim() || !conversationId) return;

      const messageId = uuidv4();
      const now = new Date().toISOString();

      // Sauvegarder en base (avec reply_to)
      db.run(
        'INSERT INTO direct_messages (id, content, sender_id, recipient_id, created_at, reply_to) VALUES (?, ?, ?, ?, ?, ?)',
        [messageId, content.trim(), userId, recipientId, now, replyTo || null]
      );

      const dmUser = db.get('SELECT username, display_name, avatar FROM users WHERE id = ?', [userId]);

      const message = {
        id: messageId,
        content: content.trim(),
        author_id: userId,
        sender_id: userId,
        recipient_id: recipientId,
        author_username: dmUser?.username || socket.user.username,
        author_display_name: dmUser?.display_name || null,
        author_avatar: dmUser?.avatar || null,
        created_at: now,
        edited_at: null,
        reply_to: replyTo || null,
        replied_message: null,
        reactions: [],
      };

      // Récupérer le message cité si besoin
      if (replyTo) {
        const replied = db.get(
          `SELECT dm.id, dm.content, dm.sender_id AS author_id, dm.is_deleted,
                  u.username AS author_username
           FROM direct_messages dm
           LEFT JOIN users u ON dm.sender_id = u.id
           WHERE dm.id = ?`,
          [replyTo]
        );
        message.replied_message = replied || null;
      }

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

    /** Modifier un message DM */
    socket.on('dm:edit', ({ messageId, content, conversationId }) => {
      if (!messageId || !content?.trim() || !conversationId) return;
      const msg = db.get('SELECT * FROM direct_messages WHERE id = ? AND sender_id = ?', [messageId, userId]);
      if (!msg) return;
      const now = new Date().toISOString();
      db.run('UPDATE direct_messages SET content = ?, edited_at = ? WHERE id = ?', [content.trim(), now, messageId]);
      io.to(`dm:${conversationId}`).emit('dm:edited', { messageId, content: content.trim(), edited_at: now, conversationId });
    });

    /** Supprimer un message DM */
    socket.on('dm:delete', ({ messageId, conversationId }) => {
      if (!messageId || !conversationId) return;
      const msg = db.get('SELECT * FROM direct_messages WHERE id = ? AND sender_id = ?', [messageId, userId]);
      if (!msg) return;
      try {
        db.run('UPDATE direct_messages SET is_deleted = 1 WHERE id = ?', [messageId]);
        io.to(`dm:${conversationId}`).emit('dm:deleted', { messageId, conversationId });
      } catch (err) {
        console.error('Erreur lors de la suppression du DM:', err);
      }
    });

    /** Réagir à un message DM */
    socket.on('dm:react', ({ messageId, emoji, conversationId }) => {
      if (!messageId || !emoji || !conversationId) return;
      const msg = db.get('SELECT * FROM direct_messages WHERE id = ?', [messageId]);
      if (!msg) return;
      const existing = db.get('SELECT * FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [messageId, userId, emoji]);
      if (existing) {
        db.run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [messageId, userId, emoji]);
      } else {
        db.run('INSERT INTO message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)', [uuidv4(), messageId, userId, emoji]);
      }
      const rawReactions = db.all('SELECT emoji, user_id FROM message_reactions WHERE message_id = ?', [messageId]);
      const reactionsMap = {};
      for (const r of rawReactions) {
        if (!reactionsMap[r.emoji]) reactionsMap[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        reactionsMap[r.emoji].count++;
        reactionsMap[r.emoji].users.push(r.user_id);
      }
      io.to(`dm:${conversationId}`).emit('dm:reactions', {
        messageId, conversationId, reactions: Object.values(reactionsMap),
      });
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
     * ─── SIGNALISATION WEBRTC (appels vocaux) ────────────────────────────────
     * Le serveur agit uniquement comme relais : il transmet les messages
     * de signalisation entre les deux pairs sans interpréter leur contenu.
     *
     * Flux :
     *   call:initiate  → notifie le destinataire d'un appel entrant
     *   call:accept    → le destinataire décroche, notifie l'appelant
     *   call:reject    → le destinataire refuse
     *   call:offer     → SDP offer de l'appelant vers le destinataire
     *   call:answer    → SDP answer du destinataire vers l'appelant
     *   call:ice-candidate → candidats ICE (les deux sens)
     *   call:end       → fin d'appel (les deux sens)
     */

    /** Appel entrant : notifier le destinataire */
    socket.on('call:initiate', ({ to, callId }) => {
      if (!to || !callId) return;
      if (onlineUsers.has(to)) {
        onlineUsers.get(to).forEach((sid) => {
          io.to(sid).emit('call:incoming', {
            from: userId,
            fromUsername: socket.user.username,
            callId,
          });
        });
      }
    });

    /** Le destinataire accepte : notifier l'appelant */
    socket.on('call:accept', ({ to, callId }) => {
      if (!to || !callId) return;
      if (onlineUsers.has(to)) {
        onlineUsers.get(to).forEach((sid) => {
          io.to(sid).emit('call:accepted', { from: userId, callId });
        });
      }
    });

    /** Le destinataire refuse : notifier l'appelant */
    socket.on('call:reject', ({ to, callId }) => {
      if (!to || !callId) return;
      if (onlineUsers.has(to)) {
        onlineUsers.get(to).forEach((sid) => {
          io.to(sid).emit('call:rejected', { from: userId, callId });
        });
      }
    });

    /** SDP offer : relayer de l'appelant vers le destinataire */
    socket.on('call:offer', ({ to, callId, offer }) => {
      if (!to || !offer) return;
      if (onlineUsers.has(to)) {
        onlineUsers.get(to).forEach((sid) => {
          io.to(sid).emit('call:offer', { from: userId, callId, offer });
        });
      }
    });

    /** SDP answer : relayer du destinataire vers l'appelant */
    socket.on('call:answer', ({ to, callId, answer }) => {
      if (!to || !answer) return;
      if (onlineUsers.has(to)) {
        onlineUsers.get(to).forEach((sid) => {
          io.to(sid).emit('call:answer', { from: userId, callId, answer });
        });
      }
    });

    /** Candidat ICE : relayer dans les deux sens */
    socket.on('call:ice-candidate', ({ to, candidate }) => {
      if (!to || !candidate) return;
      if (onlineUsers.has(to)) {
        onlineUsers.get(to).forEach((sid) => {
          io.to(sid).emit('call:ice-candidate', { from: userId, candidate });
        });
      }
    });

    /** Fin d'appel : notifier le correspondant */
    socket.on('call:end', ({ to, callId }) => {
      if (!to) return;
      if (onlineUsers.has(to)) {
        onlineUsers.get(to).forEach((sid) => {
          io.to(sid).emit('call:ended', { from: userId, callId });
        });
      }
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
