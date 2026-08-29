# Budgetia V1 — checklist de mise en production

Cette checklist sépare ce qui est prouvé par le dépôt de ce qui nécessite un compte externe ou un appareil réel. Une case ne doit être cochée que sur preuve actuelle, pas sur intention.

## 1. Qualité du produit

- [x] Saisie, édition et suppression des dépenses.
- [x] Catégories personnalisées, catégorie « Non classée », transfert ou suppression contrôlée des dépenses.
- [x] Analyses semaine, mois et année, filtres par catégorie et trois formes de graphique.
- [x] Mode sombre et quatre couleurs principales.
- [x] Budget personnel et budgets partagés avec rôles propriétaire/membre.
- [x] Gestion propriétaire : invitations, retrait, transfert de propriété, renommage et suppression.
- [x] Export CSV et suppression du compte avec aperçu d’impact.
- [x] MCP métier authentifié par JWT/RLS, ciblage explicite du budget et écritures idempotentes.
- [x] Tickets détaillés : OCR local, validation humaine, somme atomique et pôles produit.
- [x] Outils MCP de ticket avec confirmation d’écriture et analyses filtrées.
- [x] Plafonds mensuels par catégorie, calcul des dépassements et onglet Coach déterministe.
- [x] Trois outils MCP de plafond avec ciblage du budget et suppression confirmée sans effet sur les dépenses.
- [x] Bilans Coach hebdomadaires/mensuels persistés, alertes anti-spam et préférences privées.
- [x] Coffre BYOK Vault, sortie IA structurée, repli déterministe et suppression autonome ; aucune clé OpenAI globale n’est nécessaire.
- [x] Écran d’accès web validé en desktop et en `390×844` : aucun débordement, aucune erreur console, champs nommés pour les lecteurs d’écran et erreur de validation exposée comme alerte.
- [x] Chaque champ de saisie mobile possède un nom accessible explicite ; un contrat Vitest empêche l’ajout futur d’un `TextInput` non nommé.
- [ ] Parcours visuel complet validé sur un téléphone Android physique.
- [ ] Parcours accessibilité vérifié avec TalkBack et taille de police agrandie.

## 2. Supabase production

- [x] Migrations rejouables sur une base locale vierge.
- [x] Tests pgTAP RLS et cycle de vie des espaces/comptes.
- [x] Smoke tests HTTP des seize outils MCP, du Coach sans clé, des tickets, des plafonds et de la suppression de compte avec un compte éphémère nettoyé.
- [x] Audit npm relu : aucune alerte haute ou critique. Les alertes modérées actuelles viennent de `uuid@7` via l’outil de build Expo `xcode`; le correctif forcé imposerait un downgrade incompatible et n’est pas appliqué.
- [x] Projet Supabase de production `Budgetia` créé en région `eu-west-3`.
- [x] Dixième migration Coach rejouée sur une base locale vierge, prouvée par 172 tests pgTAP et appliquée au projet distant.
- [x] Edge Functions `budgetia-mcp` v8, `delete-account` v4 et `budgetia-ai-coach` v2 déployées et actives.
- [x] Secret Edge Function `BUDGETIA_PUBLIC_SUPABASE_URL` configuré avec l’URL publique réelle.
- [x] URL et clé publishable configurées dans les secrets GitHub du build APK ; aucune clé privilégiée n’est injectée dans Expo.
- [x] Audit automatique des fichiers suivis, de l’historique Git, du bundle web et de l’APK compilé contre les formats de secrets à haut niveau de confiance.
- [x] Linter Supabase local sur `public,private` sans erreur ; les avertissements Security Advisor distants sur les RPC `SECURITY DEFINER` authentifiées sont attendus, revus et documentés dans `SECURITY.md` au lieu d’être masqués.
- [x] SSL imposé aux connexions PostgreSQL externes et état vérifié en production.
- [x] Cron Coach actif toutes les cinq minutes avec secret worker généré et chiffré dans Vault.
- [ ] Push Expo validé sur un téléphone physique avec `EAS_PROJECT_ID` ; le jeton de sécurité push serveur reste facultatif.
- [x] Serveur OAuth 2.1 Supabase et enregistrement dynamique activés ; découverte officielle vérifiée en production avec une réponse `200`.
- [x] URL HTTPS GitHub Pages enregistrée comme Site URL Auth et `/oauth/consent` configuré comme chemin d’autorisation.
- [ ] Confirmations e-mail activées et SMTP de production testé.
- [x] Protection CAPTCHA et limites Auth évaluées : inscriptions anonymes désactivées, limites Auth conservées, CAPTCHA non activé sans flux de jeton client et fournisseur configuré.
- [ ] Fournisseur CAPTCHA, clé de site et secret configurés avant toute inscription commerciale publique.
- [x] État des sauvegardes audité : archivage WAL indiqué actif, mais aucune sauvegarde restaurable ni PITR disponible sur l’offre actuelle.
- [ ] Politique de sauvegarde/PITR choisie et restauration testée dans un projet isolé.

Le workflow `Supabase production` peut automatiser migrations et fonctions après création de :

- secret `SUPABASE_ACCESS_TOKEN` ;
- secret `SUPABASE_DB_PASSWORD` ;
- variable `SUPABASE_PROJECT_REF` ;
- variable `BUDGETIA_WEB_URL` ;
- variable `SUPABASE_PRODUCTION_ENABLED=true` seulement après une exécution manuelle contrôlée.

Ces accès d’administration ne doivent jamais être placés dans Expo, l’APK, les variables `EXPO_PUBLIC_*` ou le dépôt.

Le script `./scripts/configure-production.sh` guide la configuration reproductible d’un nouveau clone sans afficher ni commiter les secrets.

## 3. Expo et Android

- [x] Configuration Expo SDK 57 et identifiant Android `com.budgetia.mobile`.
- [x] Diagnostic Expo officiel : 21 contrôles sur 21 réussis.
- [x] Profils EAS : APK `preview`, AAB `production` et version Android distante auto-incrémentée.
- [x] Workflow Gradle Release de secours produisant un APK autonome sur chaque push `main`.
- [x] Préversion GitHub permanente avec APK nommé, checksum et lien direct à chaque push `main`.
- [x] APK local généré avec JDK 21 / Android 36 et signature APK v2 vérifiée.
- [ ] Projet EAS créé avec `eas init` et `EAS_PROJECT_ID` enregistré comme variable GitHub.
- [ ] Premier build `preview` interactif réussi et credentials Android distants créés.
- [ ] Variables `EXPO_PUBLIC_SUPABASE_*` et `EXPO_PUBLIC_BUDGETIA_WEB_URL` configurées dans les environnements EAS `preview` et `production`.
- [ ] `EXPO_TOKEN` ajouté comme secret GitHub et workflow EAS activé avec `EAS_PRODUCTION_ENABLED=true`.
- [ ] APK EAS installé et testé sur un appareil réel.
- [ ] Trois tickets réels (net, froissé et faible lumière) scannés, corrigés puis rouverts sur appareil.
- [ ] AAB `production` accepté par la piste de test interne Google Play.
- [ ] Fiche Play Store, captures, icône, classification du contenu et formulaire sécurité des données finalisés.

## 4. Web, OAuth et ChatGPT

- [x] Build web Expo déployé sur GitHub Pages ; racine, route `/budgetia/oauth/consent` et bundle JavaScript vérifiés en `200`.
- [x] Découverte OAuth, enregistrement dynamique d’un client public et redirection PKCE `302` vers l’écran de consentement vérifiés en production.
- [x] Smoke public sans identifiant privilégié configuré chaque jour et après le déploiement web : app, pages légales, OAuth et refus des fonctions sans authentification.
- [ ] Connexion, consentement, refus et révocation OAuth validés sur l’URL de production.
- [ ] MCP ajouté dans ChatGPT et appels réels validés avec deux comptes et un budget commun.
- [ ] Première clé OpenAI utilisateur validée depuis l’app ; volontairement non testée pendant l’implémentation à la demande du propriétaire.
- [ ] Test de lecture, ajout avec confirmation, retry idempotent, filtre et synthèse effectué.
- [x] Audit agrégé Auth/API/Edge Functions des dernières 24 h : aucun Bearer token, secret privilégié, champ financier, mot de passe/URL PostgreSQL ou `5xx` détecté ; aucun journal brut n’a été affiché.

## 5. Légal, support et exploitation

- [x] Pages de confidentialité, conditions et support intégrées au même artefact GitHub Pages que l’application.
- [ ] Identité légale du responsable du traitement ajoutée aux pages.
- [x] Aucun utilisateur n’est invité à publier ses finances dans une issue publique ; la page support bloque explicitement cet usage.
- [ ] Adresse de contact privée dédiée ajoutée.
- [ ] Durées de conservation, région d’hébergement et sous-traitants confirmés dans la politique finale.
- [x] Procédures techniques d’incident, publication et rollback documentées dans `docs/OPERATIONS.md`.
- [ ] Canal support privé et procédure d’escalade testés.
- [ ] Compte de test et responsable de publication identifiés.

## 6. Validation avant tag

```bash
npm ci
npm run check
npm run build
npm run supabase:test
npm run smoke:local
```

Puis :

1. exécuter `npm run audit:secrets` puis vérifier silencieusement l’historique Git et l’artefact Android contre les secrets (`service_role`, `sb_secret_`, mots de passe, URL PostgreSQL, jetons Expo) ;
2. pousser sur `main` et ouvrir les résumés des workflows Supabase CI, Android APK et Android EAS ;
3. télécharger et installer l’APK exact produit par le run ;
4. créer le tag correspondant exactement à `expo.version`, par exemple `v1.0.0` ;
5. vérifier l’AAB EAS, la GitHub Release et la piste interne Play Store avant toute promotion publique.
