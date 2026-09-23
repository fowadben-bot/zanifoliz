# Verrouillage GitHub avant production

État constaté pendant la préparation : le dépôt est public et aucun repository Ruleset n'est actif.

Ces réglages sont administratifs et doivent être appliqués dans GitHub avant l'ouverture publique du service.

## 1. Rendre le dépôt privé pendant le développement

GitHub → dépôt → **Settings** → **General** → **Danger Zone** → **Change repository visibility** → **Private**.

Ne jamais considérer un dépôt privé comme un coffre à secrets : `.env`, mots de passe, clés SMTP, clés OpenAI et secrets OVH restent interdits dans Git.

## 2. Protéger `main`

GitHub → **Settings** → **Rules** → **Rulesets** → **New branch ruleset**.

Cible : branche `main`.

Activer au minimum :

- empêcher la suppression de la branche ;
- empêcher les force-push ;
- exiger une pull request avant fusion lorsque l'équipe comporte plusieurs personnes ;
- exiger les status checks avant fusion ;
- checks requis : `Backend CI` et `CodeQL Security Scan` ;
- exiger que la branche soit à jour avant fusion ;
- ne pas autoriser un bypass général aux comptes non administrateurs.

Pour un propriétaire travaillant seul, conserver un bypass administrateur limité évite de bloquer les interventions d'urgence, tout en gardant les protections actives pour les autres accès.

## 3. Sécurité automatisée

Dans **Settings → Security / Code security**, activer lorsqu'ils sont disponibles :

- Dependabot alerts ;
- Dependabot security updates ;
- Secret scanning ;
- Push protection.

Le dépôt contient déjà :

- `.github/workflows/backend-ci.yml` ;
- `.github/workflows/codeql.yml` ;
- `.github/dependabot.yml` ;
- `.github/CODEOWNERS`.

## 4. Accès

- MFA obligatoire pour les comptes administrateurs ;
- supprimer les collaborateurs qui n'ont plus besoin d'accès ;
- principe du moindre privilège ;
- ne jamais partager un token GitHub dans une messagerie, un prompt IA ou une variable frontend.

## 5. Avant chaque mise en production

Vérifier que :

1. Backend CI est vert ;
2. CodeQL est vert ;
3. aucun secret n'est présent dans les changements ;
4. les migrations PostgreSQL ont été testées ;
5. une sauvegarde exploitable existe ;
6. les dépendances ne présentent aucune vulnérabilité high/critical bloquante.
