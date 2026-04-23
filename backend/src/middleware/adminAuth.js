const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token admin manquant ou invalide' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET);
    if (!decoded || decoded.type !== 'admin') {
      return res.status(403).json({ error: 'Accès admin refusé' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token admin expiré ou invalide' });
  }
}

module.exports = adminAuth;