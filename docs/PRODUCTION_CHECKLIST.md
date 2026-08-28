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
- [x] MCP métier avec OAuth, ciblage explicite du budget et écritures idempotentes.
- [ ] Parcours visuel complet validé sur un téléphone Android physique.
- [ ] Parcours accessibilité vérifié avec TalkBack et taille de police agrandie.

## 2. Supabase production

- [x] Migrations rejouables sur une base locale vierge.
- [x] Tests pgTAP RLS et cycle de vie des espaces/comptes.
- [x] Smoke tests HTTP du MCP et de la suppression de compte.
- [x] Audit npm relu : aucune alerte haute ou critique. Les alertes modérées actuelles viennent de `uuid@7` via l’outil de build Expo `xcode`; le correctif forcé imposerait un downgrade incompatible et n’est pas appliqué.
- [x] Projet Supabase de production `Budgetia` créé en région `eu-west-3`.
- [x] Six migrations appliquées et listées sur le projet distant, dont les index couvrant toutes les clés étrangères.
- [x] Edge Functions `budgetia-mcp` et `delete-account` déployées et actives.
- [x] Secret Edge Function `BUDGETIA_PUBLIC_SUPABASE_URL` configuré avec l’URL publique réelle.
- [x] URL et clé publishable configurées dans les secrets GitHub du build APK ; aucune clé privilégiée n’est injectée dans Expo.
- [x] Advisories relus : aucun défaut RLS exposé ; douze avertissements `SECURITY DEFINER` correspondent aux RPC authentifiées explicitement contrôlées et documentées dans `SECURITY.md`.
- [ ] URL HTTPS du client OAuth déployée et ajoutée aux redirections Auth.
- [ ] Confirmations e-mail activées et SMTP de production testé.
- [ ] Protection CAPTCHA et limites Auth évaluées selon l’exposition publique.
- [ ] Sauvegardes et restauration Supabase testées selon le plan retenu.

Le workflow `Supabase production` peut automatiser migrations et fonctions après création de :

- secret `SUPABASE_ACCESS_TOKEN` ;
- secret `SUPABASE_DB_PASSWORD` ;
- variable `SUPABASE_PROJECT_REF` ;
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
- [ ] Variables `EXPO_PUBLIC_SUPABASE_*` configurées dans les environnements EAS `preview` et `production`.
- [ ] `EXPO_TOKEN` ajouté comme secret GitHub et workflow EAS activé avec `EAS_PRODUCTION_ENABLED=true`.
- [ ] APK EAS installé et testé sur un appareil réel.
- [ ] AAB `production` accepté par la piste de test interne Google Play.
- [ ] Fiche Play Store, captures, icône, classification du contenu et formulaire sécurité des données finalisés.

## 4. Web, OAuth et ChatGPT

- [ ] Build web Expo déployé sur une origine HTTPS avec réécriture SPA de `/oauth/consent`.
- [ ] Connexion, consentement, refus et révocation OAuth validés sur l’URL de production.
- [ ] MCP ajouté dans ChatGPT et appels réels validés avec deux comptes et un budget commun.
- [ ] Test de lecture, ajout avec confirmation, retry idempotent, filtre et synthèse effectué.
- [ ] Les journaux de production ne contiennent ni Bearer token, ni note de dépense, ni donnée financière inutile.

## 5. Légal, support et exploitation

- [x] Pages de confidentialité et conditions présentes et déployables avec GitHub Pages.
- [ ] Identité légale du responsable du traitement ajoutée aux pages.
- [ ] Adresse de contact privée dédiée ajoutée ; aucun utilisateur n’est invité à publier ses finances dans une issue publique.
- [ ] Durées de conservation, région d’hébergement et sous-traitants confirmés dans la politique finale.
- [ ] Procédure de réponse aux incidents et canal support testés.
- [ ] Compte de test, procédure de rollback et responsable de publication identifiés.

## 6. Validation avant tag

```bash
npm ci
npm run check
npm run build
npm run supabase:test
npm run smoke:local
```

Puis :

1. vérifier silencieusement les fichiers suivis contre les secrets (`service_role`, `sb_secret_`, mots de passe, URL PostgreSQL, jetons Expo) ;
2. pousser sur `main` et ouvrir les résumés des workflows Supabase CI, Android APK et Android EAS ;
3. télécharger et installer l’APK exact produit par le run ;
4. créer le tag correspondant exactement à `expo.version`, par exemple `v1.0.0` ;
5. vérifier l’AAB EAS, la GitHub Release et la piste interne Play Store avant toute promotion publique.
