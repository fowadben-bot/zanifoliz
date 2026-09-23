# Déploiement OVHcloud

Ce dépôt contient actuellement le frontend statique du projet.

## Cible recommandée
OVHcloud VPS ou Public Cloud sous Linux avec Docker.

## Flux conseillé
Internet → protection réseau OVH → HTTPS/reverse proxy → conteneur Nginx du site.

## Lancement du frontend
```bash
git clone <URL_DU_DEPOT>
cd zanifoliz
docker compose build --pull
docker compose up -d
```

Le conteneur écoute uniquement sur `127.0.0.1:8080`. Un reverse proxy HTTPS installé sur l’hôte doit publier le domaine vers ce port.

## Avant mise en ligne
1. Activer HTTPS et renouvellement automatique des certificats.
2. N’ouvrir publiquement que 80/443 ; limiter SSH par clé et pare-feu.
3. Utiliser un compte d’administration distinct avec MFA.
4. Ne jamais mettre les clés OpenAI, base de données ou email dans le dépôt ou le navigateur.
5. Installer le backend et la base dans des services séparés du frontend.
6. Mettre en place sauvegardes, logs de sécurité, rate limiting et surveillance.
7. Finaliser les mentions légales et la politique de confidentialité.
8. Tester mobile/tablette/desktop et les six langues avant ouverture.

## Important pour ZaniChat
L’IA ne doit pas avoir d’accès direct à GitHub, au serveur OVH, aux secrets, aux mots de passe ou à la base complète. Toute action autorisée doit être validée côté serveur par une liste blanche stricte.
