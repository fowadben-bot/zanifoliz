# Projet enfant — nom public temporaire

Plateforme éducative et ludique portée par REFLEX MEDIACOM, en coproduction avec BAD SON RECORDS.

## Fonctionnalités intégrées

- accueil responsive inspiré de la présentation visuelle validée ;
- personnages Lion, Taupe et Rihno utilisés comme assets du projet ;
- jeux éducatifs interactifs et mini quiz ;
- catalogue vidéos / histoires avec états d’attente tant que les médias définitifs ne sont pas fournis ;
- ZaniChat derrière une API serveur avec activation parentale ;
- compte parent avec vérification email et réinitialisation du mot de passe ;
- profils enfants pseudonymes avec code famille + PIN ;
- profil enfant en attente jusqu’à approbation parentale ;
- progression, favoris et réglages par profil ;
- limite quotidienne par enfant avec suivi serveur et affichage du temps restant ;
- tableau de bord parent avec usage du jour ;
- export et suppression des données ;
- PostgreSQL avec Row Level Security pour les données enfant ;
- six langues : français, anglais, arabe, espagnol, chinois, japonais ;
- RTL automatique pour l’arabe ;
- pages légales, confidentialité enfant et CGU ;
- Docker + Nginx + Node + PostgreSQL pour OVHcloud ;
- scripts de migration, sauvegarde et restauration PostgreSQL.

## Sécurité intégrée

- aucun secret dans le frontend ;
- Argon2id pour mots de passe et PIN ;
- sessions parent/enfant séparées ;
- cookies HttpOnly/Secure en production et jetons CSRF ;
- vérification Origin / Sec-Fetch-Site pour les écritures ;
- rate limiting Nginx + API ;
- CSP, anti-clickjacking, no-sniff et politique de permissions ;
- PostgreSQL et API sans port Internet public ;
- réseaux Docker séparés et base sur réseau interne ;
- conteneurs avec privilèges réduits ;
- ZaniChat sans outil d’administration ni accès direct à GitHub, OVH, SSH, secrets ou base ;
- filtrage de données personnelles et modération IA en entrée et sortie ;
- CodeQL, Dependabot et Backend CI ;
- CI avec syntaxe, tests unitaires, migrations PostgreSQL rejouées, build Docker et validation Nginx.

## Déploiement

Voir `DEPLOY_OVH.md`. Copier `.env.example` vers `.env` uniquement sur le serveur et générer de vrais secrets aléatoires.

Outils d’exploitation :

```bash
sh ops/backup.sh
sh ops/migrate.sh
RESTORE_CONFIRM=YES sh ops/restore.sh backups/<fichier>.dump
```

## Éléments externes à renseigner avant ouverture publique

Le code est préparé, mais une mise en production publique nécessite encore :

- le nom public définitif et le domaine ;
- l’accès à l’environnement OVH pour effectuer le déploiement ;
- les paramètres SMTP de production ;
- une clé IA uniquement si ZaniChat doit être activé ;
- les coordonnées légales finales et les informations exactes de l’hébergeur ;
- les fichiers/URLs définitifs des clips ;
- la validation juridique RGPD/mineurs ;
- un test de restauration et un test de sécurité sur l’environnement de production ;
- la protection de la branche `main` et, idéalement, un dépôt GitHub privé pendant le développement.

Le nom `zanifoliz` du dépôt est historique et pourra être renommé lorsque la marque définitive sera choisie.
