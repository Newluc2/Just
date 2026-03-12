/**
 * Just - Routes des salons (channels)
 * 
 * Gère la création, modification, suppression de salons textuels,
 * les catégories et les permissions par rôle.
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
    const { name, serverId, category } = req.body;

    if (!name || !serverId) {
      return res.status(400).json({ error: 'Nom du salon et ID du serveur requis' });
    }

    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce serveur' });
    }

    // Seul le owner peut créer des salons
    const server = db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (server.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Seul le propriétaire peut créer des salons' });
    }

    const channelId = uuidv4();
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');

    // Trouver la position max dans la catégorie
    const maxPos = db.get(
      'SELECT COALESCE(MAX(position), -1) as maxp FROM channels WHERE server_id = ? AND category = ?',
      [serverId, category || 'GÉNÉRAL']
    );

    db.run('INSERT INTO channels (id, name, type, server_id, category, position) VALUES (?, ?, ?, ?, ?, ?)',
      [channelId, cleanName, 'text', serverId, category || 'GÉNÉRAL', (maxPos?.maxp ?? -1) + 1]);

    const channel = db.get('SELECT * FROM channels WHERE id = ?', [channelId]);

    res.status(201).json({ channel });
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══ Category routes (AVANT les routes :id pour éviter le conflit) ═══

/**
 * GET /api/channels/categories/:serverId
 * Lister les catégories d'un serveur
 */
router.get('/categories/:serverId', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;

    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.id]);
    if (!membership) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const categories = db.all(
      'SELECT DISTINCT category FROM channels WHERE server_id = ? ORDER BY category ASC',
      [serverId]
    );

    res.json({ categories: categories.map(c => c.category) });
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /api/channels/categories/:serverId/rename
 * Renommer une catégorie
 */
router.put('/categories/:serverId/rename', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;
    const { oldName, newName } = req.body;

    const server = db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?',
      [serverId, req.user.id]);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut renommer les catégories' });
    }

    if (!oldName || !newName?.trim()) {
      return res.status(400).json({ error: 'Noms manquants' });
    }

    db.run('UPDATE channels SET category = ? WHERE server_id = ? AND category = ?',
      [newName.trim().toUpperCase(), serverId, oldName]);

    res.json({ message: 'Catégorie renommée' });
  } catch (err) {
    console.error('Rename category error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/channels/categories/:serverId
 * Supprimer une catégorie (déplace les salons vers GÉNÉRAL)
 */
router.delete('/categories/:serverId', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;
    const { category } = req.body;

    const server = db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?',
      [serverId, req.user.id]);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut supprimer des catégories' });
    }

    if (!category || category === 'GÉNÉRAL') {
      return res.status(400).json({ error: 'Impossible de supprimer la catégorie par défaut' });
    }

    db.run('UPDATE channels SET category = ? WHERE server_id = ? AND category = ?',
      ['GÉNÉRAL', serverId, category]);

    res.json({ message: 'Catégorie supprimée' });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══ Routes avec paramètre :id ═══

/**
 * PATCH /api/channels/:id
 * Modifier un salon (nom, catégorie, position)
 */
router.patch('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, position } = req.body;

    const channel = db.get('SELECT * FROM channels WHERE id = ?', [id]);
    if (!channel) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    const server = db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?',
      [channel.server_id, req.user.id]);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut modifier un salon' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
      if (!cleanName) return res.status(400).json({ error: 'Le nom du salon est requis' });
      updates.push('name = ?');
      params.push(cleanName);
    }

    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category || 'GÉNÉRAL');
    }

    if (position !== undefined) {
      updates.push('position = ?');
      params.push(Number(position) || 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune modification fournie' });
    }

    params.push(id);
    db.run(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = db.get('SELECT * FROM channels WHERE id = ?', [id]);
    res.json({ channel: updated });
  } catch (err) {
    console.error('Update channel error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/channels/:serverId
 * Lister les salons d'un serveur (filtré par permissions du rôle)
 */
router.get('/:serverId', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;

    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, req.user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce serveur' });
    }

    const server = db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    const allChannels = db.all('SELECT * FROM channels WHERE server_id = ? ORDER BY category ASC, position ASC, created_at ASC',
      [serverId]).map(ch => ({ ...ch, category: String(ch.category || 'GÉNÉRAL'), name: String(ch.name) }));

    // Le owner voit tout
    if (server.owner_id === req.user.id) {
      return res.json({ channels: allChannels });
    }

    // Filtrer par permissions du rôle du membre
    const channels = allChannels.filter(ch => {
      if (!membership.role_id) return true; // pas de rôle = tout visible
      const perm = db.get(
        'SELECT can_view FROM channel_permissions WHERE channel_id = ? AND role_id = ?',
        [ch.id, membership.role_id]
      );
      // Pas de restriction = visible par défaut
      return !perm || perm.can_view === 1;
    });

    res.json({ channels });
  } catch (err) {
    console.error('Get channels error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/channels/:channelId/permissions
 * Lister les permissions d'un salon par rôle
 */
router.get('/:channelId/permissions', authMiddleware, (req, res) => {
  try {
    const { channelId } = req.params;

    const channel = db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    const server = db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?',
      [channel.server_id, req.user.id]);
    if (!server) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const permissions = db.all(
      `SELECT cp.*, sr.name as role_name, sr.color as role_color
       FROM channel_permissions cp
       INNER JOIN server_roles sr ON cp.role_id = sr.id
       WHERE cp.channel_id = ?`,
      [channelId]
    );

    res.json({ permissions });
  } catch (err) {
    console.error('Get channel permissions error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /api/channels/:channelId/permissions
 * Définir les permissions d'un salon (tableau de {roleId, canView})
 */
router.put('/:channelId/permissions', authMiddleware, (req, res) => {
  try {
    const { channelId } = req.params;
    const { permissions } = req.body;

    const channel = db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Salon non trouvé' });
    }

    const server = db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?',
      [channel.server_id, req.user.id]);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut modifier les permissions' });
    }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Format invalide' });
    }

    // Supprimer les anciennes permissions
    db.run('DELETE FROM channel_permissions WHERE channel_id = ?', [channelId]);

    // Insérer les nouvelles
    for (const perm of permissions) {
      if (!perm.roleId) continue;
      // Vérifier que le rôle existe dans ce serveur
      const role = db.get('SELECT id FROM server_roles WHERE id = ? AND server_id = ?', [perm.roleId, channel.server_id]);
      if (!role) continue;
      db.run(
        'INSERT INTO channel_permissions (channel_id, role_id, can_view) VALUES (?, ?, ?)',
        [channelId, perm.roleId, perm.canView ? 1 : 0]
      );
    }

    res.json({ message: 'Permissions mises à jour' });
  } catch (err) {
    console.error('Update channel permissions error:', err);
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
    db.run('DELETE FROM channel_permissions WHERE channel_id = ?', [id]);
    db.run('DELETE FROM channels WHERE id = ?', [id]);

    res.json({ message: 'Salon supprimé' });
  } catch (err) {
    console.error('Delete channel error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
