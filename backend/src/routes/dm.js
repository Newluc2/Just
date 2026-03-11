/**
 * Just - Routes DM (messages privés)
 *
 * GET  /api/dm/conversations         → liste des conversations de l'utilisateur
 * POST /api/dm/conversations         → créer/trouver une conversation avec recipientId
 * GET  /api/dm/messages/:id          → messages d'une conversation
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Toutes les routes DM nécessitent une authentification
router.use(authMiddleware);

/**
 * GET /api/dm/conversations
 * Retourne toutes les conversations DM de l'utilisateur courant
 */
router.get('/conversations', (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = db.all(
      `SELECT
        dc.id,
        dc.user1_id,
        dc.user2_id,
        dc.created_at,
        CASE WHEN dc.user1_id = ? THEN u2.id   ELSE u1.id   END AS other_user_id,
        CASE WHEN dc.user1_id = ? THEN u2.username ELSE u1.username END AS other_username
       FROM dm_conversations dc
       JOIN users u1 ON u1.id = dc.user1_id
       JOIN users u2 ON u2.id = dc.user2_id
       WHERE dc.user1_id = ? OR dc.user2_id = ?
       ORDER BY dc.created_at DESC`,
      [userId, userId, userId, userId]
    );

    res.json({ conversations });
  } catch (err) {
    console.error('GET /dm/conversations error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/dm/conversations
 * Créer ou retrouver une conversation avec un utilisateur
 * Body: { recipientId }
 */
router.post('/conversations', (req, res) => {
  try {
    const userId = req.user.id;
    const { recipientId } = req.body;

    if (!recipientId) {
      return res.status(400).json({ error: 'recipientId requis' });
    }
    if (recipientId === userId) {
      return res.status(400).json({ error: 'Impossible de vous envoyer un DM à vous-même' });
    }

    // Vérifier que le destinataire existe
    const recipient = db.get('SELECT id, username FROM users WHERE id = ?', [recipientId]);
    if (!recipient) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    // Chercher une conversation existante (dans les deux sens)
    const [u1, u2] = userId < recipientId ? [userId, recipientId] : [recipientId, userId];

    let conversation = db.get(
      'SELECT * FROM dm_conversations WHERE user1_id = ? AND user2_id = ?',
      [u1, u2]
    );

    if (!conversation) {
      const id = uuidv4();
      db.run(
        'INSERT INTO dm_conversations (id, user1_id, user2_id) VALUES (?, ?, ?)',
        [id, u1, u2]
      );
      conversation = db.get('SELECT * FROM dm_conversations WHERE id = ?', [id]);
    }

    // Enrichir avec les infos de l'autre utilisateur
    const other = userId === conversation.user1_id
      ? db.get('SELECT id, username FROM users WHERE id = ?', [conversation.user2_id])
      : db.get('SELECT id, username FROM users WHERE id = ?', [conversation.user1_id]);

    res.json({
      conversation: {
        ...conversation,
        other_user_id: other.id,
        other_username: other.username,
      },
    });
  } catch (err) {
    console.error('POST /dm/conversations error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Helper : enrichir un message DM ──────────────────────────────────────
function enrichDMMessage(msg) {
  if (!msg) return null;
  // Réactions
  const rawReactions = db.all(`SELECT emoji, user_id FROM message_reactions WHERE message_id = ?`, [msg.id]);
  const reactionsMap = {};
  for (const r of rawReactions) {
    if (!reactionsMap[r.emoji]) reactionsMap[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
    reactionsMap[r.emoji].count++;
    reactionsMap[r.emoji].users.push(r.user_id);
  }
  msg.reactions = Object.values(reactionsMap);
  // Message cité
  msg.replied_message = null;
  if (msg.reply_to) {
    const replied = db.get(
      `SELECT dm.id, dm.content, dm.sender_id AS author_id, dm.is_deleted,
              u.username AS author_username
       FROM direct_messages dm
       LEFT JOIN users u ON dm.sender_id = u.id
       WHERE dm.id = ?`,
      [msg.reply_to]
    );
    msg.replied_message = replied || null;
  }
  return msg;
}

/**
 * GET /api/dm/messages/:conversationId
 * Retourne les messages d'une conversation
 */
router.get('/messages/:conversationId', (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;

    // Vérifier que l'utilisateur fait partie de la conversation
    const conv = db.get(
      'SELECT * FROM dm_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
      [conversationId, userId, userId]
    );

    if (!conv) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const messages = db.all(
      `SELECT
        dm.id,
        dm.content,
        dm.sender_id   AS author_id,
        dm.recipient_id,
        dm.created_at,
        dm.edited_at,
        dm.reply_to,
        u.username     AS author_username,
        u.display_name AS author_display_name,
        u.avatar       AS author_avatar
       FROM direct_messages dm
       JOIN users u ON u.id = dm.sender_id
       WHERE ((dm.sender_id = ? AND dm.recipient_id = ?)
          OR (dm.sender_id = ? AND dm.recipient_id = ?))
         AND dm.is_deleted = 0
       ORDER BY dm.created_at ASC
       LIMIT 200`,
      [conv.user1_id, conv.user2_id, conv.user2_id, conv.user1_id]
    );

    res.json({ messages: messages.map(enrichDMMessage) });
  } catch (err) {
    console.error('GET /dm/messages error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
