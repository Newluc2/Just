/**
 * Just - Routes des serveurs
 * 
 * Gère la création, listing, rejoindre/quitter des serveurs
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

/**
 * Générer un code d'invitation unique (8 caractères alphanumériques)
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getServerRole(serverId, roleId) {
  return db.get('SELECT * FROM server_roles WHERE id = ? AND server_id = ?', [roleId, serverId]);
}

function requireServerOwner(serverId, userId) {
  return db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?', [serverId, userId]);
}

function getServerMembers(serverId) {
  return db.all(`
    SELECT u.id, u.username, u.avatar, u.status, u.about, u.created_at,
           sm.role, sm.role_id, sm.joined_at,
           sr.name as role_name, sr.color as role_color, sr.position as role_position
    FROM users u
    INNER JOIN server_members sm ON u.id = sm.user_id
    LEFT JOIN server_roles sr ON sr.id = sm.role_id
    WHERE sm.server_id = ?
    ORDER BY COALESCE(sr.position, 0) DESC, sm.joined_at ASC
  `, [serverId]);
}

function getServerMember(serverId, memberId) {
  return db.get(`
    SELECT u.id, u.username, u.avatar, u.status, u.about, u.created_at,
           sm.role, sm.role_id, sm.joined_at,
           sr.name as role_name, sr.color as role_color, sr.position as role_position
    FROM users u
    INNER JOIN server_members sm ON u.id = sm.user_id
    LEFT JOIN server_roles sr ON sr.id = sm.role_id
    WHERE sm.server_id = ? AND sm.user_id = ?
  `, [serverId, memberId]);
}

/**
 * POST /api/servers
 * Créer un nouveau serveur
 */
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Le nom du serveur est requis' });
    }

    const serverId = uuidv4();
    const inviteCode = generateInviteCode();
    const ownerRoleId = uuidv4();
    const memberRoleId = uuidv4();

    // Créer le serveur
    db.run('INSERT INTO servers (id, name, owner_id, invite_code) VALUES (?, ?, ?, ?)',
      [serverId, name.trim(), req.user.id, inviteCode]);

    db.run(
      'INSERT INTO server_roles (id, server_id, name, color, position, permissions) VALUES (?, ?, ?, ?, ?, ?)',
      [ownerRoleId, serverId, 'Owner', '#F1C40F', 100, JSON.stringify(['*'])]
    );
    db.run(
      'INSERT INTO server_roles (id, server_id, name, color, position, permissions) VALUES (?, ?, ?, ?, ?, ?)',
      [memberRoleId, serverId, 'Member', '#99AAB5', 1, JSON.stringify([])]
    );

    // Ajouter le créateur comme membre (rôle owner)
    db.run('INSERT INTO server_members (server_id, user_id, role, role_id) VALUES (?, ?, ?, ?)',
      [serverId, req.user.id, 'owner', ownerRoleId]);

    // Créer un salon "général" par défaut
    const channelId = uuidv4();
    db.run('INSERT INTO channels (id, name, type, server_id) VALUES (?, ?, ?, ?)',
      [channelId, 'général', 'text', serverId]);

    const server = db.get('SELECT * FROM servers WHERE id = ?', [serverId]);

    res.status(201).json({
      server: { ...server, channels: [{ id: channelId, name: 'général', type: 'text' }] },
    });
  } catch (err) {
    console.error('Create server error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/servers
 * Lister les serveurs de l'utilisateur connecté
 */
router.get('/', authMiddleware, (req, res) => {
  try {
    const servers = db.all(`
      SELECT s.* FROM servers s
      INNER JOIN server_members sm ON s.id = sm.server_id
      WHERE sm.user_id = ?
      ORDER BY s.created_at ASC
    `, [req.user.id]);

    res.json({ servers });
  } catch (err) {
    console.error('Get servers error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/servers/:id
 * Obtenir les détails d'un serveur (avec salons et membres)
 */
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que l'utilisateur est membre
    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [id, req.user.id]);

    if (!membership) {
      return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce serveur' });
    }

    const server = db.get('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) {
      return res.status(404).json({ error: 'Serveur non trouvé' });
    }

    // Récupérer les salons
    const channels = db.all('SELECT * FROM channels WHERE server_id = ? ORDER BY created_at ASC', [id]);

    const members = getServerMembers(id);

    res.json({ server: { ...server, channels, members } });
  } catch (err) {
    console.error('Get server error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/servers/join
 * Rejoindre un serveur via code d'invitation
 */
router.post('/join', authMiddleware, (req, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ error: 'Code d\'invitation requis' });
    }

    const server = db.get('SELECT * FROM servers WHERE invite_code = ?', [inviteCode]);
    if (!server) {
      return res.status(404).json({ error: 'Code d\'invitation invalide' });
    }

    const existing = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [server.id, req.user.id]);

    if (existing) {
      return res.status(400).json({ error: 'Vous êtes déjà membre de ce serveur' });
    }

    const memberRole = db.get(
      'SELECT id FROM server_roles WHERE server_id = ? ORDER BY position ASC LIMIT 1',
      [server.id]
    );

    db.run('INSERT INTO server_members (server_id, user_id, role, role_id) VALUES (?, ?, ?, ?)',
      [server.id, req.user.id, 'member', memberRole?.id || null]);

    res.json({ server });
  } catch (err) {
    console.error('Join server error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/servers/:id
 * Supprimer un serveur (owner uniquement)
 */
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

    const server = db.get('SELECT * FROM servers WHERE id = ? AND owner_id = ?',
      [id, req.user.id]);

    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut supprimer le serveur' });
    }

    db.run('DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)', [id]);
    db.run('DELETE FROM channels WHERE server_id = ?', [id]);
    db.run('DELETE FROM server_members WHERE server_id = ?', [id]);
    db.run('DELETE FROM servers WHERE id = ?', [id]);

    res.json({ message: 'Serveur supprimé' });
  } catch (err) {
    console.error('Delete server error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/servers/:id/leave
 * Quitter un serveur
 */
router.post('/:id/leave', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;

    const server = db.get('SELECT * FROM servers WHERE id = ?', [id]);
    if (!server) {
      return res.status(404).json({ error: 'Serveur non trouvé' });
    }

    if (server.owner_id === req.user.id) {
      return res.status(400).json({ error: 'Le propriétaire ne peut pas quitter le serveur. Supprimez-le à la place.' });
    }

    db.run('DELETE FROM server_members WHERE server_id = ? AND user_id = ?',
      [id, req.user.id]);

    res.json({ message: 'Vous avez quitté le serveur' });
  } catch (err) {
    console.error('Leave server error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/servers/:serverId/members/leave
 * Quitter un serveur (self-leave)
 */
router.delete('/:serverId/members/leave', authMiddleware, (req, res) => {
  try {
    const { serverId } = req.params;

    const server = db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) {
      return res.status(404).json({ error: 'Serveur non trouvé' });
    }

    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, req.user.id]);
    if (!membership) {
      return res.status(404).json({ error: 'Vous n\'êtes pas membre de ce serveur' });
    }

    if (server.owner_id === req.user.id) {
      return res.status(400).json({ error: 'Le propriétaire ne peut pas quitter le serveur sans transfert ou suppression.' });
    }

    db.run('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, req.user.id]);
    res.json({ message: 'Vous avez quitté le serveur' });
  } catch (err) {
    console.error('Leave server (members/leave) error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/servers/:id/settings
 * Modifier le nom et l'icône du serveur (owner)
 */
router.patch('/:id/settings', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon } = req.body;

    const server = requireServerOwner(id, req.user.id);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut modifier les paramètres du serveur' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Le nom du serveur est requis' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (icon !== undefined) {
      updates.push('icon = ?');
      params.push(icon || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune modification fournie' });
    }

    params.push(id);
    db.run(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`, params);

    const updatedServer = db.get('SELECT * FROM servers WHERE id = ?', [id]);
    res.json({ server: updatedServer });
  } catch (err) {
    console.error('Update server settings error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/servers/:id/roles
 * Liste des rôles d'un serveur
 */
router.get('/:id/roles', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', [id, req.user.id]);
    if (!membership) {
      return res.status(403).json({ error: 'Vous n\'êtes pas membre de ce serveur' });
    }

    const roles = db.all(
      'SELECT * FROM server_roles WHERE server_id = ? ORDER BY position DESC, created_at ASC',
      [id]
    );
    res.json({ roles });
  } catch (err) {
    console.error('Get roles error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/servers/:id/roles
 * Créer un rôle (owner)
 */
router.post('/:id/roles', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, permissions, position } = req.body;

    const server = requireServerOwner(id, req.user.id);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut créer des rôles' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Le nom du rôle est requis' });
    }

    const roleId = uuidv4();
    db.run(
      'INSERT INTO server_roles (id, server_id, name, color, position, permissions) VALUES (?, ?, ?, ?, ?, ?)',
      [
        roleId,
        id,
        name.trim(),
        color || '#99AAB5',
        Number.isInteger(position) ? position : 10,
        JSON.stringify(Array.isArray(permissions) ? permissions : []),
      ]
    );

    const role = getServerRole(id, roleId);
    res.status(201).json({ role });
  } catch (err) {
    console.error('Create role error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/servers/:id/roles/:roleId
 * Modifier un rôle (owner)
 */
router.patch('/:id/roles/:roleId', authMiddleware, (req, res) => {
  try {
    const { id, roleId } = req.params;
    const { name, color, permissions, position } = req.body;

    const server = requireServerOwner(id, req.user.id);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut modifier les rôles' });
    }

    const role = getServerRole(id, roleId);
    if (!role) {
      return res.status(404).json({ error: 'Rôle non trouvé' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color || '#99AAB5');
    }
    if (permissions !== undefined) {
      updates.push('permissions = ?');
      params.push(JSON.stringify(Array.isArray(permissions) ? permissions : []));
    }
    if (position !== undefined) {
      updates.push('position = ?');
      params.push(Number(position) || 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Aucune modification fournie' });
    }

    params.push(roleId, id);
    db.run(`UPDATE server_roles SET ${updates.join(', ')} WHERE id = ? AND server_id = ?`, params);

    const updatedRole = getServerRole(id, roleId);
    res.json({ role: updatedRole });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/servers/:id/roles/:roleId
 * Supprimer un rôle (owner)
 */
router.delete('/:id/roles/:roleId', authMiddleware, (req, res) => {
  try {
    const { id, roleId } = req.params;

    const server = requireServerOwner(id, req.user.id);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut supprimer des rôles' });
    }

    db.run('UPDATE server_members SET role_id = NULL, role = ? WHERE server_id = ? AND role_id = ?', ['member', id, roleId]);
    db.run('DELETE FROM server_roles WHERE id = ? AND server_id = ?', [roleId, id]);

    res.json({ message: 'Rôle supprimé' });
  } catch (err) {
    console.error('Delete role error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/servers/:id/members/:memberId
 * Modifier le rôle d'un membre (owner)
 */
router.patch('/:id/members/:memberId', authMiddleware, (req, res) => {
  try {
    const { id, memberId } = req.params;
    const { roleId } = req.body;

    const server = requireServerOwner(id, req.user.id);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut modifier les membres' });
    }

    const member = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', [id, memberId]);
    if (!member) {
      return res.status(404).json({ error: 'Membre non trouvé' });
    }

    const role = roleId ? getServerRole(id, roleId) : null;
    if (roleId && !role) {
      return res.status(404).json({ error: 'Rôle invalide' });
    }

    db.run(
      'UPDATE server_members SET role_id = ?, role = ? WHERE server_id = ? AND user_id = ?',
      [roleId || null, role?.name?.toLowerCase() || 'member', id, memberId]
    );

    const updatedMember = getServerMember(id, memberId);
    res.json({ message: 'Membre mis à jour', member: updatedMember });
  } catch (err) {
    console.error('Update member role error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/servers/:id/members/:memberId
 * Expulser un membre (owner)
 */
router.delete('/:id/members/:memberId', authMiddleware, (req, res) => {
  try {
    const { id, memberId } = req.params;

    const server = requireServerOwner(id, req.user.id);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut gérer les membres' });
    }

    if (memberId === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous expulser vous-même' });
    }

    db.run('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [id, memberId]);
    res.json({ message: 'Membre expulsé' });
  } catch (err) {
    console.error('Kick member error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/servers/:id/invites
 * Créer une invitation temporaire (owner)
 */
router.post('/:id/invites', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { maxUses, expiresInHours } = req.body;

    const server = requireServerOwner(id, req.user.id);
    if (!server) {
      return res.status(403).json({ error: 'Seul le propriétaire peut créer une invitation' });
    }

    const inviteId = uuidv4();
    const code = generateInviteCode() + generateInviteCode();
    const expiresAt = expiresInHours
      ? new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000).toISOString()
      : null;
    const normalizedMaxUses = maxUses ? Math.max(1, Number(maxUses)) : null;

    db.run(
      `INSERT INTO server_invites
       (id, server_id, code, created_by, max_uses, uses_count, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, 0, ?, 1)`,
      [inviteId, id, code, req.user.id, normalizedMaxUses, expiresAt]
    );

    const invite = db.get('SELECT * FROM server_invites WHERE id = ?', [inviteId]);
    res.status(201).json({
      invite: {
        ...invite,
        url: `/${invite.code}`,
      },
    });
  } catch (err) {
    console.error('Create server invite error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
