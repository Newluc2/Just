/**
 * Just - Routes des messages
 * 
 * Gère la récupération des messages d'un salon
 * L'envoi se fait via Socket.io pour le temps réel
 */

const express = require('express');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/messages/:channelId
 * Récupérer les messages d'un salon (avec pagination)
 */
router.get('/:channelId', authMiddleware, (req, res) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, before } = req.query;

    // Vérifier que le salon existe
    const channel = db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    // Vérifier que l'utilisateur est membre du serveur
    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [channel.server_id, req.user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce serveur' });
    }

    // Récupérer les messages avec infos de l'auteur
    let messages;
    if (before) {
      messages = db.all(`
        SELECT m.*, u.username as author_username, u.avatar as author_avatar
        FROM messages m
        INNER JOIN users u ON m.author_id = u.id
        WHERE m.channel_id = ? AND m.created_at < ?
        ORDER BY m.created_at DESC
        LIMIT ?
      `, [channelId, before, parseInt(limit)]);
    } else {
      messages = db.all(`
        SELECT m.*, u.username as author_username, u.avatar as author_avatar
        FROM messages m
        INNER JOIN users u ON m.author_id = u.id
        WHERE m.channel_id = ?
        ORDER BY m.created_at DESC
        LIMIT ?
      `, [channelId, parseInt(limit)]);
    }

    // Renvoyer dans l'ordre chronologique
    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
