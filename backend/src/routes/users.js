/**
 * Just - Routes utilisateurs
 *
 * GET /api/users/search?q=…   → chercher des utilisateurs par username
 */

const express = require('express');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

/**
 * GET /api/users/search?q=query
 * Rechercher des utilisateurs par nom (excluant soi-même)
 */
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) {
      return res.json({ users: [] });
    }

    const users = db.all(
      `SELECT id, username, display_name FROM users
       WHERE username LIKE ? AND id != ?
       LIMIT 20`,
      [`%${q.trim()}%`, req.user.id]
    );

    res.json({ users });
  } catch (err) {
    console.error('GET /users/search error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
