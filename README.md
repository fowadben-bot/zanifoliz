# Projet enfant — nom public temporaire

Frontend responsive pour l’univers éducatif et ludique porté par REFLEX MEDIACOM, en coproduction avec BAD SON RECORDS.

## Version actuelle
- Accueil inspiré de la présentation visuelle validée
- Personnages originaux Lion, Taupe et Rihno utilisés comme fichiers du projet
- Jeux éducatifs + mini quiz
- Clips / histoires
- ZaniChat en démonstration locale sécurisée
- Espace Parents
- Préparation des profils enfants et du compte parent
- Pages À propos, Contact, Mentions légales, Confidentialité, Cookies et CGU
- 6 langues : français, anglais, arabe, espagnol, chinois et japonais
- Affichage RTL pour l’arabe
- Responsive ordinateur / tablette / mobile

## Hébergement
Le projet est préparé pour OVHcloud avec Docker + Nginx. `Dockerfile`, `docker-compose.yml` et `nginx.conf` sont inclus.

## Sécurité
- CSP restrictive
- Anti-clickjacking et no-sniff
- Aucun secret/API dans le frontend
- ZaniChat actuel sans connexion à une IA distante
- Les fonctions sensibles devront rester côté serveur
- CodeQL activé dans GitHub

## Avant ouverture publique
Le frontend ne remplace pas le backend de production. Il restera à connecter :
- authentification réelle parent/enfant ;
- base PostgreSQL et règles d’accès ;
- mécanisme de consentement parental ;
- API IA + modération + rate limiting ;
- email transactionnel ;
- HTTPS/domaine/pare-feu OVH ;
- coordonnées légales encore marquées « à compléter » ;
- revue juridique RGPD/mineurs avant ouverture des inscriptions.

Le nom `zanifoliz` du dépôt est historique et peut être changé lorsque le nom de marque définitif sera choisi.
