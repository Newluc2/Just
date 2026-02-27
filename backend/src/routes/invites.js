/**
 * Just - Routes des invitations temporaires
 */

const express = require('express');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function getInviteByCode(code) {
  return db.get('SELECT * FROM server_invites WHERE code = ? AND is_active = 1', [code]);
}

function isInviteExpired(invite) {
  if (!invite) return true;
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return true;
  if (invite.max_uses !== null && invite.max_uses !== undefined && Number(invite.uses_count) >= Number(invite.max_uses)) return true;
  return false;
}

/**
 * GET /api/invites/:code
 * Valider un code d'invitation et retourner les infos du serveur
 */
router.get('/:code', (req, res) => {
  try {
    const { code } = req.params;
    const invite = getInviteByCode(code);

    if (!invite) {
      return res.status(404).json({ valid: false, error: 'Invitation introuvable' });
    }

    if (isInviteExpired(invite)) {
      return res.status(410).json({ valid: false, error: 'Invitation expirée' });
    }

    const server = db.get('SELECT id, name, icon FROM servers WHERE id = ?', [invite.server_id]);
    if (!server) {
      return res.status(404).json({ valid: false, error: 'Serveur introuvable' });
    }

    res.json({
      valid: true,
      invite: {
        code: invite.code,
        expires_at: invite.expires_at,
        max_uses: invite.max_uses,
        uses_count: invite.uses_count,
      },
      server,
    });
  } catch (err) {
    console.error('Validate invite error:', err);
    res.status(500).json({ valid: false, error: 'Erreur serveur' });
  }
});

/**
 * POST /api/invites/:code/join
 * Rejoindre un serveur via invitation temporaire
 */
router.post('/:code/join', authMiddleware, (req, res) => {
  try {
    const { code } = req.params;
    const invite = getInviteByCode(code);

    if (!invite) {
      return res.status(404).json({ error: 'Invitation introuvable' });
    }

    if (isInviteExpired(invite)) {
      return res.status(410).json({ error: 'Invitation expirée' });
    }

    const existing = db.get(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [invite.server_id, req.user.id]
    );

    if (!existing) {
      const memberRole = db.get(
        'SELECT id FROM server_roles WHERE server_id = ? ORDER BY position ASC LIMIT 1',
        [invite.server_id]
      );

      db.run(
        'INSERT INTO server_members (server_id, user_id, role, role_id) VALUES (?, ?, ?, ?)',
        [invite.server_id, req.user.id, 'member', memberRole?.id || null]
      );
    }

    db.run('UPDATE server_invites SET uses_count = uses_count + 1 WHERE id = ?', [invite.id]);

    const updatedInvite = db.get('SELECT * FROM server_invites WHERE id = ?', [invite.id]);
    if (updatedInvite.max_uses !== null && Number(updatedInvite.uses_count) >= Number(updatedInvite.max_uses)) {
      db.run('UPDATE server_invites SET is_active = 0 WHERE id = ?', [invite.id]);
    }

    const server = db.get('SELECT * FROM servers WHERE id = ?', [invite.server_id]);
    res.json({ server, alreadyMember: !!existing });
  } catch (err) {
    console.error('Join invite error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
