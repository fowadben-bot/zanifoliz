# Politique de sécurité

Ce projet est conçu pour un public enfant et applique une politique de sécurité renforcée.

## Principes
- Aucun secret ou clé API dans le navigateur ou le dépôt GitHub.
- Les fonctions sensibles seront exécutées côté serveur uniquement.
- L’IA n’aura aucun accès direct en écriture au dépôt GitHub, à l’hébergement ou à la base de données.
- Les données parent/enfant seront isolées par autorisations strictes.
- Toute nouvelle fonction d’écriture devra passer par authentification, validation serveur, contrôle d’autorisation, journalisation et limitation de débit.

## IA
- Modération des entrées et sorties.
- Limites strictes de longueur et de fréquence.
- Instructions système séparées des entrées utilisateur.
- Aucune exécution de code fourni par un utilisateur.
- Aucun accès arbitraire à des URL, fichiers ou outils externes.
- Sorties structurées lorsqu’une action serveur est nécessaire.
- Listes blanches pour les actions autorisées.
- Refus des demandes de secrets, données personnelles ou contournement des règles.
- Tests adversariaux réguliers contre les prompt injections.

## Enfants
- Pas de messagerie publique entre enfants.
- Pas de publication libre de contenu.
- Pas de collecte volontaire de nom complet, adresse, école, téléphone ou mot de passe.
- Paramètres sensibles derrière un espace parent.
- Conservation des données minimale et documentée.

## Déploiement
- HTTPS uniquement.
- CSP et headers de sécurité stricts.
- Branche `main` à protéger par ruleset GitHub.
- Revue obligatoire avant fusion lorsque l’équipe grandira.
- Scan CodeQL automatique.
- Sauvegardes et journalisation des changements importants.
