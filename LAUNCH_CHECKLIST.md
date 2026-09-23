# Checklist avant ouverture publique

## 1. Marque et domaine
- [ ] Choisir le nom public définitif de la plateforme.
- [ ] Acheter/configurer le domaine définitif.
- [ ] Remplacer le nom temporaire `UNIVERS` dans l'interface.

## 2. OVHcloud
- [ ] Préparer un VPS/Public Cloud Linux maintenu à jour.
- [ ] Installer Docker Engine et Docker Compose.
- [ ] Déployer le dépôt selon `DEPLOY_OVH.md`.
- [ ] N'exposer publiquement que 80/443 ; limiter SSH aux clés et aux adresses autorisées si possible.
- [ ] Activer HTTPS et redirection HTTP → HTTPS.
- [ ] Activer HSTS seulement après validation complète de HTTPS.
- [ ] Activer MFA sur les comptes OVH administrateurs.

## 3. Secrets
- [ ] Copier `.env.example` vers `.env` uniquement sur le serveur.
- [ ] Générer des secrets différents et aléatoires pour PostgreSQL, l'application, les sessions et les PIN.
- [ ] Ne jamais committer `.env` ou une clé API.
- [ ] Ajouter la clé OpenAI uniquement si ZaniChat doit être activé.

## 4. Emails parents
- [ ] Choisir/configurer le fournisseur SMTP.
- [ ] Configurer SPF, DKIM et DMARC pour le domaine d'envoi.
- [ ] Tester inscription, vérification d'email et réinitialisation du mot de passe.

## 5. Comptes enfants
- [ ] Tester demande de profil enfant avec code famille.
- [ ] Vérifier qu'un profil reste `pending` sans approbation du parent.
- [ ] Tester le PIN enfant.
- [ ] Tester suppression, export, progression et favoris.
- [ ] Vérifier que ZaniChat reste désactivé par défaut.

## 6. ZaniChat
- [ ] Valider le modèle et la clé API côté serveur uniquement.
- [ ] Tester les filtres PII et la modération en entrée/sortie.
- [ ] Tester des tentatives de prompt injection et de demande de secrets.
- [ ] Vérifier qu'aucun outil d'administration, GitHub, OVH ou base de données n'est accessible au modèle.
- [ ] Faire une revue spécifique à la sécurité des mineurs avant activation publique.

## 7. Juridique / RGPD
- [ ] Compléter l'email officiel, le téléphone et la TVA si applicable.
- [ ] Ajouter les coordonnées juridiques exactes de l'entité OVH d'hébergement.
- [ ] Compléter la liste exacte des sous-traitants (SMTP, IA, éventuels outils statistiques).
- [ ] Définir et documenter les durées de conservation et de sauvegarde.
- [ ] Faire valider CGU, mentions légales et politique de confidentialité avant ouverture publique.
- [ ] Vérifier le mécanisme de consentement parental applicable au service pour mineurs.

## 8. GitHub
- [ ] Passer le dépôt en privé pendant le développement si souhaité.
- [ ] Créer un Ruleset pour `main` : interdire force-push et suppression, exiger les checks Backend CI + CodeQL.
- [ ] Activer Secret Scanning / Push Protection si disponible sur le compte.
- [ ] Garder Dependabot actif.

## 9. Contenus
- [ ] Fournir les fichiers/URLs définitifs des clips pour remplacer les états « bientôt disponible ».
- [ ] Vérifier les droits de diffusion de toutes les musiques, vidéos, images et polices utilisées.
- [ ] Ajouter les futurs jeux au catalogue et tester leur niveau par tranche d'âge.

## 10. Tests finaux
- [ ] Tester ordinateur, tablette, iPhone et Android.
- [ ] Tester français, anglais, arabe RTL, espagnol, chinois et japonais.
- [ ] Vérifier accessibilité clavier, contraste et textes alternatifs.
- [ ] Tester sauvegarde ET restauration PostgreSQL.
- [ ] Effectuer un scan de vulnérabilités et, idéalement, un test d'intrusion avant ouverture des inscriptions.
