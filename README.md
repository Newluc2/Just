# Just 💬

Application de messagerie en temps réel inspirée de Discord.

## Stack

- **Backend** : Node.js + Express + Socket.io + SQLite (sql.js)
- **Frontend** : React + Vite + Zustand + Lucide Icons
- **Production** : Docker + Nginx (reverse proxy)

## 🐳 Lancement avec Docker (recommandé)

### Prérequis
- Docker et Docker Compose installés

### Démarrage

```bash
# 1. Copier et adapter les variables d'environnement
cp .env.docker .env

# 2. Lancer l'application
docker compose up -d --build

# 3. Ouvrir dans le navigateur
open http://localhost
```

### Arrêter

```bash
docker compose down
```

### Voir les logs

```bash
docker compose logs -f
```

## 🌍 Accès public sans redirection de port

Utilise Cloudflare Tunnel pour exposer l'app sur Internet sans ouvrir de ports sur la box.

### Étapes

```bash
# 1) Copier la config d'env
cp .env.docker .env

# 2) Renseigner dans .env:
# - CLIENT_URL=https://ton-domaine
# - CLOUDFLARE_TUNNEL_TOKEN=ton_token_cloudflare

# 3) Lancer l'app + tunnel
docker compose --profile public up -d --build
```

### Vérification

```bash
docker compose ps
docker compose logs -f cloudflared
```

Le tunnel doit router vers le service `frontend` (Nginx), qui proxy déjà `/api` et `/socket.io` vers le backend.

### Réinitialiser la base de données

```bash
docker compose down -v   # -v supprime les volumes (données)
docker compose up -d --build
```

## 🛠️ Développement local (sans Docker)

### Prérequis
- Node.js 20+

### Installation

```bash
# Installer les dépendances
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### Configuration

Éditer `backend/.env` :
```env
PORT=5001
JWT_SECRET=dev_secret
CLIENT_URL=http://localhost:5173
```

### Lancement

```bash
# Terminal 1 : Backend
cd backend && npm run dev

# Terminal 2 : Frontend
cd frontend && npm run dev
```

Ouvrir http://localhost:5173

## 📁 Architecture

```
just/
├── docker-compose.yml          # Orchestration Docker
├── .env                        # Variables d'environnement Docker
├── backend/
│   ├── Dockerfile              # Image Docker backend
│   ├── package.json
│   ├── .env                    # Config locale (dev)
│   ├── data/                   # Base SQLite (persistée en volume Docker)
│   ├── uploads/                # Fichiers uploadés
│   └── src/
│       ├── index.js            # Point d'entrée Express
│       ├── database/
│       │   └── db.js           # Module SQLite (sql.js)
│       ├── middleware/
│       │   └── auth.js         # Middleware JWT
│       ├── routes/
│       │   ├── auth.js         # Inscription / Connexion
│       │   ├── servers.js      # CRUD Serveurs
│       │   ├── channels.js     # CRUD Salons
│       │   └── messages.js     # Récupération messages
│       └── socket/
│           └── socketHandler.js # Temps réel Socket.io
├── frontend/
│   ├── Dockerfile              # Image Docker (build + Nginx)
│   ├── nginx.conf              # Config Nginx (SPA + reverse proxy)
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx             # Layout principal
│       ├── api/
│       │   ├── config.js       # Client API REST
│       │   └── socket.js       # Client Socket.io
│       ├── store/
│       │   └── useStore.js     # État global (Zustand)
│       ├── pages/
│       │   ├── AuthPage.jsx    # Page connexion / inscription
│       │   └── AuthPage.css
│       └── components/
│           ├── ServerSidebar/   # Barre latérale serveurs
│           ├── ChannelSidebar/  # Liste des salons
│           ├── ChatArea/        # Zone de messages
│           └── MemberList/      # Liste des membres
```

## 🔧 Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `JWT_SECRET` | Clé secrète JWT | `just_super_secret...` |
| `CLIENT_URL` | URLs CORS autorisées (virgule) | `http://localhost` |
| `APP_PORT` | Port exposé Docker | `80` |
| `VITE_API_URL` | URL API côté navigateur | `/api` |
| `VITE_SOCKET_URL` | URL Socket.io côté navigateur | _(vide = même origine)_ |

## ✨ Fonctionnalités ajoutées (MVP)

- **MP temps réel** : anti-doublons sur réception (`dm:new` + `dm:notification`).
- **Paramètres du serveur** (owner) :
	- modification du nom / icône,
	- gestion des rôles (création, couleur, suppression),
	- gestion des membres (assignation de rôle, expulsion).
- **Invitations temporaires** :
	- création avec limite d'usages et/ou expiration,
	- format public d'URL : `https://just.newluc.top/[CODE_ALPHANUMERIQUE]`,
	- validation et jonction via API (`/api/invites/:code`, `/api/invites/:code/join`).
