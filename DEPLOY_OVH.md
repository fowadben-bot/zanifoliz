# Déploiement OVHcloud

Le dépôt contient le frontend, l’API Node, PostgreSQL et la configuration Nginx/Docker du projet.

## Architecture

Internet → protection réseau OVH → HTTPS sur l’hôte → `127.0.0.1:8080` (Nginx web) → API privée → PostgreSQL privé.

Les ports `3000` (API) et `5432` (PostgreSQL) ne doivent jamais être exposés à Internet.

## Prérequis

- OVHcloud VPS/Public Cloud Linux maintenu à jour
- Docker Engine + Docker Compose
- un nom de domaine pointant vers le serveur
- pare-feu : 80/443 publics uniquement ; SSH limité et par clé
- certificat TLS valide et renouvellement automatique
- compte OVH protégé par MFA

## 1. Installer le dépôt

```bash
git clone <URL_DU_DEPOT>
cd zanifoliz
cp .env.example .env
chmod 600 .env
```

## 2. Générer les secrets

Générer des valeurs aléatoires différentes pour `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `SESSION_PEPPER` et `PIN_PEPPER`, par exemple :

```bash
openssl rand -base64 48
```

Ne jamais committer `.env`.

Renseigner aussi dans `.env` :
- `PUBLIC_ORIGIN=https://votre-domaine.fr`
- les paramètres SMTP pour les emails parents ;
- `OPENAI_API_KEY` uniquement si ZaniChat doit être activé ;
- le modèle IA autorisé.

## 3. Démarrer

```bash
docker compose pull
docker compose up -d --build
docker compose ps
```

Au premier démarrage d’un volume PostgreSQL neuf, les migrations `db/*.sql` sont appliquées automatiquement.

Contrôle local :

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

La réponse attendue est un JSON avec `ok: true`.

## 4. HTTPS sur l’hôte

Le reverse proxy HTTPS de l’hôte doit envoyer le domaine vers `http://127.0.0.1:8080`. Rediriger HTTP vers HTTPS. Activer HSTS uniquement une fois HTTPS validé sur le domaine et ses sous-domaines concernés.

En production, vérifier notamment :
- TLS moderne ;
- `Strict-Transport-Security` au niveau du proxy TLS ;
- limites de requêtes ;
- journaux sans contenu sensible enfant ;
- renouvellement automatique du certificat.

## 5. Migrations de base existante

Pour un serveur déjà initialisé, appliquer les migrations après sauvegarde :

```bash
sh ops/backup.sh
sh ops/migrate.sh
```

Les migrations sont écrites pour pouvoir être rejouées sans recréer les tables existantes. Toujours vérifier la sauvegarde avant une migration importante.

## 6. Sauvegardes et restauration

Créer une sauvegarde PostgreSQL :

```bash
sh ops/backup.sh
```

Par défaut, elle est placée dans `./backups` avec des permissions restrictives et les fichiers de plus de 7 jours sont supprimés. Adapter `RETENTION_DAYS` à la politique de conservation validée. Copier ensuite les sauvegardes dans un stockage distinct et chiffré avec accès limité.

Restauration destructive :

```bash
RESTORE_CONFIRM=YES sh ops/restore.sh backups/zanifol-YYYYMMDDTHHMMSSZ.dump
```

Tester régulièrement la restauration sur un environnement séparé avant de compter sur les sauvegardes en production.

## 7. Mise à jour

```bash
sh ops/backup.sh
git pull --ff-only
docker compose up -d db
sh ops/migrate.sh
docker compose up -d --build
curl -fsS http://127.0.0.1:8080/api/health
```

Ne pas effectuer une mise à jour majeure de PostgreSQL sans sauvegarde et procédure de migration testée.

## 8. Avant ouverture publique

- compléter l’email, le téléphone, la TVA si applicable et l’entité OVH exacte dans les pages légales ;
- vérifier le contrat et les informations du prestataire SMTP ;
- vérifier le paramétrage de l’IA et les conditions applicables si ZaniChat est activé ;
- effectuer une revue RGPD/mineurs et une revue de sécurité ;
- tester création/vérification parent, profil enfant en attente, approbation parent, connexion enfant, activation/désactivation IA, limite quotidienne, export et suppression ;
- tester français, anglais, arabe RTL, espagnol, chinois et japonais ;
- tester ordinateur, tablette et mobile ;
- activer une stratégie de sauvegarde, restauration testée et supervision.

## Principe de sécurité ZaniChat

Le modèle IA n’a aucun accès direct à GitHub, OVH, SSH, aux mots de passe, aux clés API ou à une fonction générale d’écriture en base. Les opérations de compte restent déterminées et autorisées uniquement par le serveur applicatif.
