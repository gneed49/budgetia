# Budgetia

Budgetia est une application Expo / React Native pour saisir des dépenses, créer ses catégories et comprendre son budget sans complexité inutile. Chaque personne conserve un budget privé et peut rejoindre, en parallèle, des budgets communs. L’app mobile et ChatGPT travaillent sur les mêmes données Supabase avec une isolation RLS par espace budgétaire.

## Fonctionnalités

- authentification e-mail / mot de passe et synchronisation multi-appareils ;
- espace personnel automatique et espaces communs pour un couple ou un foyer ;
- invitation par adresse e-mail, acceptation explicite et sélecteur de budget ;
- thème clair ou sombre persistant ;
- accents Émeraude, Bleu, Violet ou Corail pour les actions principales ;
- dépense avec montant, catégorie, note et date ;
- catégories personnalisées avec couleur, modification et impact chiffré ;
- transfert atomique des dépenses lors d’une modification ou d’une suppression ;
- suppression d’une catégorie avec transfert ou suppression explicite de ses dépenses ;
- catégorie permanente « Non classée », aussi utilisable comme « Autre » ;
- budget mensuel, reste disponible et dépenses récentes ;
- vues semaine, mois et année ;
- graphiques anneau, barres et courbe interchangeables ;
- filtres multi-catégories sur les périodes passées ;
- vue annuelle avec détail cliquable de chaque mois ;
- historique filtrable et suppression d’une dépense ;
- MCP privé pour ajouter, lister et analyser les dépenses depuis ChatGPT ;
- OAuth 2.1 Supabase avec PKCE et écran de consentement Budgetia.

## Architecture

```text
App Expo / React Native ── Supabase Auth JWT ──┐
                                               ├── Data API ── PostgreSQL
ChatGPT ── OAuth 2.1 ── Edge Function MCP ─────┘               │
                                                               ├── espaces + membres
                                                               └── RLS par space_id

App web Expo /oauth/consent ── approuve ou refuse l’accès ChatGPT
```

PostgreSQL est la source de vérité. Les règles RLS rendent les catégories, dépenses et réglages visibles uniquement aux membres de l’espace concerné. Une invitation en attente révèle seulement son libellé au destinataire ; elle n’ouvre aucun accès aux données avant acceptation. L’Edge Function transmet le JWT OAuth de l’utilisateur à la Data API : elle n’utilise ni `service_role` ni contournement de la RLS.

Le MCP Supabase officiel reste un outil d’administration pour développer le projet. Il n’est volontairement pas exposé aux utilisateurs ni à ChatGPT ; Budgetia fournit son propre MCP métier limité à huit outils.

## Démarrage local

Prérequis : Node.js 24+, npm et Docker.

```bash
npm install
npm run supabase:start
npx supabase status -o env
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env
```

Dans `.env` et `apps/mobile/.env`, copiez l’URL locale dans `EXPO_PUBLIC_SUPABASE_URL` et la clé publique locale (`ANON_KEY` ou publishable key) dans `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Le premier fichier sert au smoke test MCP, le second à Expo. Ces valeurs identifient le projet mais ne remplacent jamais la RLS. Ne copiez jamais une secret key ou une clé `service_role` dans l’app.

Lancez ensuite :

```bash
npm run dev
```

L’app web est disponible sur `http://localhost:8081`. Créez un compte : le déclencheur de base ajoute automatiquement un espace personnel, six catégories usuelles, la catégorie permanente « Non classée » et un budget mensuel initial de 2 000 €.

Dans **Réglages → Catégories**, touchez une ligne pour ouvrir son gestionnaire. Une modification peut conserver les dépenses dans la catégorie ou toutes les transférer. Une suppression demande soit une catégorie de destination, soit une confirmation explicite de suppression des dépenses. « Non classée » peut être renommée et recolorée, mais jamais supprimée.

Dans **Réglages → Budgets partagés**, créez un espace commun puis saisissez l’adresse du partenaire. L’invitation est enregistrée dans Budgetia ; elle n’envoie pas encore d’e-mail externe. Lorsque la personne crée ou ouvre un compte avec cette adresse, elle voit l’invitation et peut la rejoindre.

Pour Expo Go ou un émulateur :

```bash
npm run start --workspace @budgetia/mobile
# ou
npm run android --workspace @budgetia/mobile
```

Sur un téléphone physique, remplacez `127.0.0.1` par une URL Supabase accessible depuis le téléphone. Le projet Supabase local reste surtout destiné au navigateur et aux émulateurs correctement configurés.

## Déploiement Supabase

Créez d’abord un projet Supabase, puis liez ce checkout sans partager vos identifiants dans le chat :

```bash
npx supabase login
npx supabase link --project-ref votre_ref_projet
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy budgetia-mcp --no-verify-jwt
```

`verify_jwt = false` est intentionnel pour le point d’entrée MCP : la fonction doit pouvoir renvoyer elle-même une réponse OAuth `401` avec `WWW-Authenticate`. Elle vérifie ensuite chaque Bearer token avec Supabase Auth avant tout accès, et les requêtes PostgreSQL restent soumises à la RLS.

Avant `npx supabase config push`, remplacez dans `supabase/config.toml` :

- `auth.site_url` par l’origine HTTPS qui héberge le build web Expo ;
- `auth.additional_redirect_urls` par cette même origine suivie de `/oauth/consent`.
- `auth.email.enable_confirmations` par `true` et configurez un SMTP de production.

Puis poussez la configuration :

```bash
npx supabase config push
```

En production, activez les confirmations e-mail, configurez un SMTP fiable et, si vous demandez le scope `openid`, migrez les JWT vers une clé asymétrique. Budgetia ne demande actuellement que le scope standard `email`, car Supabase Auth ne prend pas encore en charge les scopes OAuth métier personnalisés.

## Déploiement de l’écran OAuth

Le chemin `/oauth/consent` fait partie de l’app web Expo. Un hébergeur SPA doit réécrire ce chemin vers `index.html`. `apps/mobile/vercel.json` contient déjà la règle pour Vercel.

Build :

```bash
npm run build:web --workspace @budgetia/mobile
```

Déployez `apps/mobile/dist`, avec les deux variables `EXPO_PUBLIC_SUPABASE_*` du projet de production.

## APK Android et GitHub Actions

Chaque push sur `main` exécute le workflow **Android APK**. Il vérifie les contrats TypeScript, génère le projet Android Expo puis publie un APK de debug signé, installable sur un appareil Android. Le lien de téléchargement et le SHA-256 apparaissent dans le résumé du run GitHub Actions ; l’artefact est conservé 30 jours. Le build reste disponible même avant la configuration de Supabase : l’app affiche alors explicitement qu’elle doit être configurée, au lieu de se connecter à une base par défaut.

Pour que l’APK accède au projet Supabase de production, ajoutez ces deux valeurs dans **GitHub → Settings → Secrets and variables → Actions → Secrets** du dépôt, puis relancez le workflow ou poussez un commit :

| Secret GitHub | Valeur autorisée |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | URL HTTPS publique du projet Supabase |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publishable Supabase (ou `anon` legacy à privilèges faibles) |

Une URL de projet et une clé publishable sont intégrées dans l’APK par conception : elles ne donnent pas accès aux dépenses sans session utilisateur et politiques RLS. Ne stockez jamais `service_role`, `sb_secret_*`, `SUPABASE_DB_URL`, une chaîne PostgreSQL, un mot de passe, ni une clé de signature Android dans ces secrets ou dans le dépôt.

## Connexion à ChatGPT

Après déploiement, l’URL MCP est :

```text
https://VOTRE_REF.supabase.co/functions/v1/budgetia-mcp
```

1. Activez le mode développeur dans ChatGPT.
2. Créez une app/connexion MCP et collez cette URL.
3. Connectez-vous sur l’écran Budgetia, vérifiez le compte et autorisez l’accès.
4. Testez une lecture avant une écriture explicite.

Les menus ChatGPT peuvent évoluer. Référez-vous à la documentation OpenAI actuelle sur [les serveurs MCP](https://developers.openai.com/plugins/build/mcp-server), [la conception des outils](https://developers.openai.com/plugins/plan/tools) et [OAuth](https://developers.openai.com/plugins/build/auth).

Exemples :

- « Quelles sont mes catégories Budgetia ? »
- « Quels budgets personnels et partagés sont disponibles ? »
- « Ajoute 18,50 € de transport aujourd’hui, note : taxi. »
- « Ajoute 9 € sans catégorie, note : petite dépense. »
- « Ajoute 42 € d’alimentation dans le budget du couple. »
- « Renomme Loisirs en Sorties et transfère ses dépenses vers Non classée. »
- « Supprime Sorties et transfère ses dépenses vers Loisirs. »
- « Combien ai-je dépensé en alimentation ce mois-ci ? »
- « Compare cette semaine à la semaine précédente. »
- « Détaille janvier uniquement pour Logement et Abonnements. »

### Outils MCP

| Outil | Effet |
| --- | --- |
| `list_budget_spaces` | Liste les budgets personnels et partagés accessibles |
| `list_categories` | Liste les catégories actives d’un budget |
| `create_category` | Crée ou retrouve une catégorie dans le budget ciblé |
| `update_category` | Renomme/recolore une catégorie et peut transférer toutes ses dépenses |
| `delete_category` | Supprime une catégorie après choix explicite : transfert ou suppression des dépenses |
| `add_expense` | Ajoute une dépense, avec `request_id` pour un retry sûr |
| `list_expenses` | Liste les dépenses d’un budget, d’une période et de catégories précises |
| `get_spending_summary` | Renvoie total, budget restant, comparaison, catégories et série temporelle |

Les sept outils portant sur les données acceptent `budget_space_id`. Sans ce paramètre, ils ciblent le budget personnel. Pour un budget partagé, ChatGPT doit d’abord appeler `list_budget_spaces`, lever toute ambiguïté avec l’utilisateur puis transmettre explicitement l’identifiant. `add_expense` accepte une catégorie omise et classe alors la dépense dans la catégorie de secours du budget.

Le serveur accepte le protocole MCP `2025-11-25` et la révision stateless `2026-07-28`.

## Validation

```bash
npm run check
npm run build
npm run supabase:test
```

- Vitest couvre les calculs de période et le contrat MCP.
- pgTAP couvre le provisioning, l’idempotence, les agrégats, les invitations, l’adhésion, les transferts/suppressions atomiques, la catégorie de secours, les index et l’isolation personnelle/partagée par RLS.
- Le build web vérifie l’intégration Expo.

Un build local et des tests protocole ne prouvent pas une connexion réelle depuis ChatGPT ni un lancement sur téléphone physique. Ces deux validations nécessitent le projet Supabase déployé, une URL HTTPS et une autorisation interactive.

## Structure

```text
apps/mobile/                     application Expo, auth et écran OAuth
packages/domain/                 périodes, montants et types partagés
supabase/migrations/             schéma PostgreSQL, fonctions et RLS
supabase/functions/budgetia-mcp/ MCP HTTP pour ChatGPT
supabase/tests/database/         tests pgTAP de sécurité et données
docs/design/                     concepts visuels
```
