/**
 * Just - Routes des messages
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ── Multer (upload fichiers) ───────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|webm|mp3|ogg|wav|pdf|zip|txt|json|md|svg)$/i;
    if (!allowed.test(file.originalname)) return cb(new Error('Type de fichier non autorisé'));
    cb(null, true);
  },
});

// ── Helper : enrichir un message ───────────────────────────────────────────
function enrichMessage(msg) {
  if (!msg) return null;
  const rawReactions = db.all(`SELECT emoji, user_id FROM message_reactions WHERE message_id = ?`, [msg.id]);
  const reactionsMap = {};
  for (const r of rawReactions) {
    if (!reactionsMap[r.emoji]) reactionsMap[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
    reactionsMap[r.emoji].count++;
    reactionsMap[r.emoji].users.push(r.user_id);
  }
  msg.reactions = Object.values(reactionsMap);
  msg.attachments = db.all(`SELECT * FROM message_attachments WHERE message_id = ?`, [msg.id]);
  // Toujours initialiser replied_message à null pour une réponse cohérente côté client
  msg.replied_message = null;
  if (msg.reply_to) {
    const replied = db.get(
      `SELECT m.id, m.content, m.author_id, m.is_deleted, u.username as author_username
       FROM messages m
       LEFT JOIN users u ON m.author_id = u.id
       WHERE m.id = ?`,
      [msg.reply_to]
    );
    msg.replied_message = replied || null;
  }
  return msg;
}

// ── GET /api/messages/:channelId ───────────────────────────────────────────
router.get('/:channelId', authMiddleware, (req, res) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, before } = req.query;
    const channel = db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) return res.status(404).json({ error: 'Salon non trouvé' });
    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', [channel.server_id, req.user.id]);
    if (!membership) return res.status(403).json({ error: 'Accès refusé' });
    const beforeClause = before ? 'AND m.created_at < ?' : '';
    const sql = `SELECT m.*, u.username as author_username, u.display_name as author_display_name, u.avatar as author_avatar FROM messages m INNER JOIN users u ON m.author_id = u.id WHERE m.channel_id = ? AND m.is_deleted = 0 ${beforeClause} ORDER BY m.created_at DESC LIMIT ?`;
    const messages = before ? db.all(sql, [channelId, before, parseInt(limit)]) : db.all(sql, [channelId, parseInt(limit)]);
    res.json({ messages: messages.reverse().map(enrichMessage) });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── PUT /api/messages/:messageId ───────────────────────────────────────────
router.put('/:messageId', authMiddleware, (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Contenu requis' });
    const msg = db.get('SELECT * FROM messages WHERE id = ? AND is_deleted = 0', [messageId]);
    if (!msg) return res.status(404).json({ error: 'Message non trouvé' });
    if (msg.author_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
    db.run('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?', [content.trim(), new Date().toISOString(), messageId]);
    const updated = db.get(`SELECT m.*, u.username as author_username, u.display_name as author_display_name FROM messages m INNER JOIN users u ON m.author_id = u.id WHERE m.id = ?`, [messageId]);
    res.json({ message: enrichMessage(updated) });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── DELETE /api/messages/:messageId ───────────────────────────────────────
router.delete('/:messageId', authMiddleware, (req, res) => {
  try {
    const { messageId } = req.params;
    const msg = db.get('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!msg) return res.status(404).json({ error: 'Message non trouvé' });
    const channel = db.get('SELECT * FROM channels WHERE id = ?', [msg.channel_id]);
    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', [channel?.server_id, req.user.id]);
    const server = db.get('SELECT owner_id FROM servers WHERE id = ?', [channel?.server_id]);
    const isOwner = server?.owner_id === req.user.id;
    const isMod = membership?.role === 'admin' || membership?.role === 'moderator';
    if (msg.author_id !== req.user.id && !isOwner && !isMod) return res.status(403).json({ error: 'Non autorisé' });
    db.run('UPDATE messages SET is_deleted = 1 WHERE id = ?', [messageId]);
    res.json({ success: true, messageId, channelId: msg.channel_id });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/messages/:messageId/reactions ────────────────────────────────
router.post('/:messageId/reactions', authMiddleware, (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Emoji requis' });
    const msg = db.get('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!msg) return res.status(404).json({ error: 'Message non trouvé' });
    const existing = db.get('SELECT * FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [messageId, req.user.id, emoji]);
    if (existing) {
      db.run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', [messageId, req.user.id, emoji]);
      res.json({ action: 'removed', emoji, messageId, channelId: msg.channel_id });
    } else {
      db.run('INSERT INTO message_reactions (id, message_id, user_id, emoji) VALUES (?, ?, ?, ?)', [uuidv4(), messageId, req.user.id, emoji]);
      res.json({ action: 'added', emoji, messageId, channelId: msg.channel_id });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── GET /api/messages/pinned/:channelId ────────────────────────────────────
router.get('/pinned/:channelId', authMiddleware, (req, res) => {
  try {
    const { channelId } = req.params;
    const pins = db.all(
      `SELECT m.*, u.username as author_username, u.display_name as author_display_name, p.pinned_at FROM pinned_messages p INNER JOIN messages m ON p.message_id = m.id INNER JOIN users u ON m.author_id = u.id WHERE p.channel_id = ? AND m.is_deleted = 0 ORDER BY p.pinned_at DESC`,
      [channelId]
    );
    res.json({ pins: pins.map(enrichMessage) });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/messages/:messageId/pin ─────────────────────────────────────
router.post('/:messageId/pin', authMiddleware, (req, res) => {
  try {
    const { messageId } = req.params;
    const msg = db.get('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!msg) return res.status(404).json({ error: 'Message non trouvé' });
    const existing = db.get('SELECT * FROM pinned_messages WHERE message_id = ?', [messageId]);
    if (existing) {
      db.run('DELETE FROM pinned_messages WHERE message_id = ?', [messageId]);
      res.json({ action: 'unpinned', messageId, channelId: msg.channel_id });
    } else {
      db.run('INSERT INTO pinned_messages (id, channel_id, message_id, pinned_by) VALUES (?, ?, ?, ?)', [uuidv4(), msg.channel_id, messageId, req.user.id]);
      res.json({ action: 'pinned', messageId, channelId: msg.channel_id });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/messages/upload ──────────────────────────────────────────────
router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename, originalName: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size });
  } catch (err) { res.status(500).json({ error: 'Erreur upload' }); }
});

module.exports = router;
