# Comptes enfants & protection des données — architecture cible

## Objectif
Permettre aux enfants de créer un profil et de rejoindre la communauté tout en minimisant au maximum les données personnelles collectées. La base « fan/community » doit mesurer l'engagement et les préférences, pas servir de fichier marketing nominatif de mineurs.

## Modèle de compte recommandé

### 1) Compte parent/tuteur (compte principal)
- Email du parent/tuteur
- Authentification forte (mot de passe robuste + MFA/passkey recommandé)
- Consentements datés et versionnés
- Gestion des profils enfants
- Export, suppression et révocation des consentements

### 2) Profil enfant
- Identifiant interne aléatoire (UUID)
- Pseudo choisi dans des règles strictes
- Tranche d'âge uniquement si possible (ex. 6-8, 9-11, 12-14, 15-17)
- Avatar choisi dans une bibliothèque interne
- Personnage favori
- Progression, badges, jeux/clips favoris
- Préférences pédagogiques

### 3) Données à ne pas demander par défaut à l'enfant
- Nom de famille
- Adresse postale
- Numéro de téléphone
- École / classe / établissement
- Position GPS
- Photo réelle / biométrie
- Réseaux sociaux personnels
- Email personnel si non nécessaire

## Parcours d'inscription

### Enfant de moins de 15 ans (France)
1. L'enfant commence son profil avec un pseudo.
2. Le système demande l'adresse email d'un parent/tuteur, jamais celle de l'enfant si elle n'est pas nécessaire.
3. Le parent reçoit une demande d'autorisation.
4. Le profil reste limité tant que l'autorisation n'est pas validée.
5. Consentements enfant + parent enregistrés avec date, version et finalité.

### 15-17 ans
Même si certains traitements fondés sur le consentement peuvent être acceptés par le mineur à partir de 15 ans en France, la plateforme choisit par sécurité un modèle avec parent/tuteur associé pour tous les moins de 18 ans, sauf décision juridique contraire lors de la mise en production.

## Fan base / communauté
La base communautaire doit être pseudonymisée :
- nombre de membres actifs
- personnage favori
- jeux préférés
- clips préférés
- progression
- badges
- fréquence d'utilisation
- centres d'intérêt éducatifs

Les communications promotionnelles doivent être envoyées au parent/tuteur, avec opt-in séparé et révocable.

## Sécurité technique
- HTTPS obligatoire
- Chiffrement des sauvegardes
- Secrets uniquement côté serveur
- Mots de passe hachés avec Argon2id ou équivalent moderne
- MFA/passkeys pour les comptes parents et administrateurs
- Rate limiting et anti-bot à la création de compte
- Sessions courtes et rotation des tokens
- Cookies Secure + HttpOnly + SameSite
- Aucun identifiant séquentiel exposé
- Journalisation des actions sensibles
- Base inaccessible directement depuis Internet
- Séparation logique des données parent, enfant, progression et consentements
- Règles d'autorisation serveur sur chaque lecture/écriture
- Backups chiffrés et test de restauration

## ZaniChat / IA
- Aucun accès direct de l'IA aux données complètes du compte
- L'IA reçoit un identifiant pseudonyme et seulement le contexte minimal nécessaire
- Pas d'accès à l'email parent, à l'adresse IP historique, aux secrets ou aux données administratives
- Filtrage/modération des entrées et sorties
- Détection des demandes de données personnelles
- Blocage des tentatives de prompt injection et d'exfiltration
- Pas de mémoire longue durée sans option parentale explicite
- Pas de messagerie enfant-enfant

## Droits et transparence
- Notice enfant en langage simple
- Notice parent complète
- Tableau de bord : voir, télécharger, corriger et supprimer les données
- Retrait du consentement aussi simple que son activation
- Politique de rétention définie (suppression ou anonymisation après inactivité)

## À valider avant mise en production
- Analyse juridique RGPD / loi Informatique et Libertés
- Registre des traitements
- Analyse d'impact (AIPD/DPIA) à envisager fortement vu le public mineur, le profilage d'usage et l'IA
- Politique de conservation
- Procédure de violation de données
- DPA avec les sous-traitants
- Hébergement et transferts internationaux vérifiés
