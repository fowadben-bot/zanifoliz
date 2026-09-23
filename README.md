# Projet enfant — nom public temporaire

Plateforme éducative et ludique portée par REFLEX MEDIACOM, en coproduction avec BAD SON RECORDS.

## Fonctionnalités intégrées

- accueil responsive inspiré de la présentation visuelle validée ;
- personnages Lion, Taupe et Rihno utilisés comme assets du projet ;
- jeux éducatifs et mini quiz ;
- vidéos / histoires ;
- ZaniChat derrière une API serveur avec activation parentale ;
- compte parent avec email vérifié ;
- profils enfants pseudonymes avec code famille + PIN ;
- profil enfant en attente jusqu’à approbation parentale ;
- progression, favoris et réglages par profil ;
- export des données parent ;
- PostgreSQL avec isolation des données par règles d’accès ;
- six langues : français, anglais, arabe, espagnol, chinois, japonais ;
- RTL pour l’arabe ;
- pages légales, confidentialité enfant et CGU ;
- Docker + Nginx + Node + PostgreSQL pour OVHcloud.

## Sécurité intégrée

- aucun secret dans le frontend ;
- Argon2id pour mots de passe et PIN ;
- sessions parent/enfant séparées ;
- cookies HttpOnly/Secure en production et jetons CSRF ;
- rate limiting Nginx + API ;
- CSP, anti-clickjacking, no-sniff et politique de permissions ;
- PostgreSQL sans port Internet ;
- API sans port Internet ;
- conteneurs avec privilèges réduits ;
- ZaniChat sans outil d’administration ni accès direct à GitHub/OVH/secrets ;
- filtrage de données personnelles et modération IA ;
- CodeQL GitHub.

## Déploiement

Voir `DEPLOY_OVH.md`. Copier `.env.example` vers `.env` uniquement sur le serveur et générer de vrais secrets aléatoires.

## Éléments externes à renseigner avant ouverture publique

Le code peut être préparé sans ces informations, mais la mise en production publique nécessite encore :

- le domaine définitif ;
- les accès à l’environnement OVH ou un déploiement réalisé par l’administrateur OVH ;
- les paramètres SMTP pour la vérification des comptes parents ;
- une clé IA si ZaniChat doit être réellement activé ;
- l’email/téléphone légal et la TVA si applicable ;
- le nom public définitif de la marque ;
- une validation finale juridique RGPD/mineurs et un test de sécurité avant ouverture des inscriptions.

Le nom `zanifoliz` du dépôt est historique et pourra être renommé lorsque la marque définitive sera choisie.
