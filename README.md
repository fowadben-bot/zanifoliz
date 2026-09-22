# Zanifoliz — Prototype web

Prototype statique responsive (HTML/CSS/JS) comprenant :
- Accueil
- Clips vidéo
- Jeux éducatifs + mini quiz fonctionnel
- ZaniChat (interface + réponses de démonstration)
- Espace parents

## Pour lancer
Ouvrir `index.html` dans un navigateur, ou servir le dossier avec un serveur local.

## Étape production recommandée
Passer sur Next.js/React + base de données + CMS de contenus + authentification parent + API IA côté serveur. Ne jamais exposer de clé API dans le navigateur.

## IA enfant — exigences de base
- Prompt système par personnage et tranche d'âge
- Filtrage/modération entrée + sortie
- Interdiction de collecte volontaire d'adresse, téléphone, école, nom complet ou secrets
- Parent gate pour les réglages
- Pas de messagerie entre enfants
- Journalisation minimale et politique de rétention claire
- Bouton de signalement / demander à un adulte
- Tests de sécurité avant mise en ligne
