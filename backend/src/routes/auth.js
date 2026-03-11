/**
 * Just - Routes d'authentification
 * 
 * Gère l'inscription, la connexion et la récupération du profil
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ── Multer pour avatar ─────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.user.id}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (!allowed.test(file.originalname)) return cb(new Error('Type de fichier non autorisé'));
    cb(null, true);
  },
});

/**
 * POST /api/auth/register
 * Inscription d'un nouvel utilisateur
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validation des champs
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: 'Le nom d\'utilisateur doit faire entre 3 et 32 caractères' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existingUser) {
      return res.status(400).json({ error: 'Cet email ou nom d\'utilisateur est déjà utilisé' });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Insérer l'utilisateur en base
    db.run('INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)',
      [userId, username, email, hashedPassword]);

    // Générer un token JWT
    const token = jwt.sign(
      { id: userId, username, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: userId, username, email, avatar: null, display_name: null, status: 'online' },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/auth/login
 * Connexion d'un utilisateur existant
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Chercher l'utilisateur par email
    const user = db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Vérifier le mot de passe
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    // Générer un token JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        display_name: user.display_name || null,
        status: 'online',
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * GET /api/auth/me
 * Récupérer le profil de l'utilisateur connecté
 */
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = db.get('SELECT id, username, email, avatar, display_name, status, created_at FROM users WHERE id = ?',
      [req.user.id]);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /api/auth/profile
 * Mettre à jour le profil (username, email) ou le mot de passe
 */
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, email, currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Changement de mot de passe
    if (currentPassword && newPassword) {
      const bcrypt = require('bcryptjs');
      const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) {
        return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
      return res.json({ message: 'Mot de passe modifié' });
    }

    const { display_name: displayName } = req.body;

    // Mise à jour du profil
    if (username) {
      // Vérifier l'unicité
      const existing = db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
      if (existing) {
        return res.status(400).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
      }
    }

    db.run(
      'UPDATE users SET username = COALESCE(?, username), email = COALESCE(?, email), display_name = COALESCE(?, display_name) WHERE id = ?',
      [username || null, email || null, displayName !== undefined ? (displayName || null) : undefined, userId]
    );

    const updated = db.get(
      'SELECT id, username, email, avatar, display_name, status, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({ user: updated });
  } catch (err) {
    console.error('PUT /auth/profile error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/auth/avatar
 * Upload d'un avatar utilisateur
 */
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
    const avatarUrl = `/uploads/${req.file.filename}`;
    db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, req.user.id]);
    const updated = db.get(
      'SELECT id, username, email, avatar, display_name, status, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ user: updated });
  } catch (err) {
    console.error('POST /auth/avatar error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
