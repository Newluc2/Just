/**
 * Just - Routes des salons (channels)
 * 
 * Gère la création et la suppression de salons textuels
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/channels
 * Créer un nouveau salon dans un serveur
 */
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, serverId } = req.body;

    if (!name || !serverId) {
      return res.status(400).json({ error: 'Nom du salon et ID du serveur requis' });
    }

    // Vérifier que l'utilisateur est membre du serveur
    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce serveur' });
    }

    const channelId = uuidv4();
    
    // Nettoyer le nom du salon (pas d'espaces, minuscules)
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');

    db.run('INSERT INTO channels (id, name, type, server_id) VALUES (?, ?, ?, ?)',
      [channelId, cleanName, 'text', serverId]);

    const channel = db.get('SELECT * FROM channels WHERE id = ?', [channelId]);

    res.status(201).json({ channel });
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/channels/:serverId
 * Lister les salons d'un serveur
 */
router.get('/:serverId', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;

    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce serveur' });
    }

    const channels = db.all('SELECT * FROM channels WHERE server_id = ? ORDER BY created_at ASC',
      [serverId]);

    res.json({ channels });
  } catch (err) {
    console.error('Get channels error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/channels/:id
 * Supprimer un salon
 */
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

    const channel = db.get('SELECT * FROM channels WHERE id = ?', [id]);
    if (!channel) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    const server = db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?',
      [channel.server_id, req.user.id]);

    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire du serveur peut supprimer un salon' });
    }

    const channelCount = db.get('SELECT COUNT(*) as count FROM channels WHERE server_id = ?',
      [channel.server_id]);

    if (channelCount.count <= 1) {
      return res.status(400).json({ error: 'Un serveur doit avoir au moins un salon' });
    }

    db.run('DELETE FROM messages WHERE channel_id = ?', [id]);
    db.run('DELETE FROM channels WHERE id = ?', [id]);

    res.json({ message: 'Salon supprimé' });
  } catch (err) {
    console.error('Delete channel error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
