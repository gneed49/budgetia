# Budgetia

Budgetia est une application Expo / React Native pour saisir des dépenses, créer ses catégories et comprendre son budget sans complexité inutile. Chaque personne conserve un budget privé et peut rejoindre, en parallèle, des budgets communs. L’app mobile et ChatGPT travaillent sur les mêmes données Supabase avec une isolation RLS par espace budgétaire.

## Fonctionnalités

- authentification e-mail / mot de passe et synchronisation multi-appareils ;
- espace personnel automatique et espaces communs pour un couple ou un foyer ;
- invitation par adresse e-mail, acceptation explicite et sélecteur de budget ;
- gestion du foyer par le propriétaire : renommage, révocation d’invitation, retrait d’un membre, transfert de propriété et suppression protégée ;
- départ volontaire d’un membre sans effacer les dépenses communes ;
- thème clair ou sombre persistant ;
- accents Émeraude, Bleu, Violet ou Corail pour les actions principales ;
- dépense avec montant, catégorie, note et date ;
- catégories personnalisées avec couleur, modification et impact chiffré ;
- transfert atomique des dépenses lors d’une modification ou d’une suppression ;
- suppression d’une catégorie avec transfert ou suppression explicite de ses dépenses ;
- catégorie permanente « Non classée », aussi utilisable comme « Autre » ;
- budget mensuel, reste disponible et dépenses récentes ;
- plafonds mensuels par catégorie, partagés dans un budget commun ;
- onglet Coach avec restant, dépassement, projection et comparaison au mois précédent ;
- recommandations immédiates déterministes, calculées sans lire les notes libres ;
- bilans privés hebdomadaires et mensuels, alertes de seuil anti-spam et historique dédié ;
- agent IA sans fenêtre de prompt, avec faits bornés, catégories anonymisées et sortie JSON stricte ;
- clé OpenAI facultative apportée par chaque utilisateur, validée puis chiffrée dans Supabase Vault ;
- notifications Expo au contenu générique, activées explicitement sur un téléphone physique ;
- vues semaine, mois et année ;
- graphiques anneau, barres et courbe interchangeables ;
- filtres multi-catégories sur les périodes passées ;
- vue annuelle avec détail cliquable de chaque mois ;
- historique filtrable et suppression d’une dépense ;
- scan privé d’un ticket sur Android/iOS, avec OCR local et vérification humaine ;
- une dépense globale par ticket, détaillée en lignes et pôles produit (alimentation, hygiène, entretien, etc.) ;
- détail d’un ticket et répartition par pôle directement depuis l’historique ;
- export CSV complet du budget sélectionné et suppression autonome du compte ;
- MCP privé à seize outils pour ajouter, lister et analyser les dépenses, tickets, plafonds et bilans depuis ChatGPT ;
- OAuth 2.1 Supabase avec PKCE et écran de consentement Budgetia.

Le Coach fonctionne toujours sans clé grâce à son moteur déterministe. Une personne peut facultativement fournir sa propre clé API OpenAI dans **Réglages** pour reformuler et prioriser les mêmes faits bornés. Cette clé ne traverse jamais le dépôt, l’APK ou les tables publiques ; son fonctionnement et ses limites sont détaillés dans [`docs/BUDGET_COACH_DESIGN.md`](docs/BUDGET_COACH_DESIGN.md).

## Architecture

```text
App Expo / React Native ── Supabase Auth JWT ──┐
        │                                       │
        └── OCR local ML Kit / Vision           │
                                               ├── Data API ── PostgreSQL
ChatGPT ── OAuth 2.1 ── Edge Function MCP ─────┘               │
                                                               ├── espaces + membres
                                                               ├── plafonds + positions calculées
                                                               ├── rapports privés par user_id + space_id
                                                               └── RLS par space_id

pg_cron ── secret Vault ── Edge Function Coach ── faits bornés ──┬── moteur déterministe
                                                                 └── OpenAI BYOK facultatif

App web Expo /oauth/consent ── approuve ou refuse l’accès ChatGPT
```

PostgreSQL est la source de vérité. Les règles RLS rendent les catégories, dépenses et réglages visibles uniquement aux membres de l’espace concerné. Une invitation en attente révèle seulement son libellé au destinataire ; elle n’ouvre aucun accès aux données avant acceptation. L’Edge Function transmet le JWT OAuth de l’utilisateur à la Data API : elle n’utilise ni `service_role` ni contournement de la RLS.

Le MCP Supabase officiel reste un outil d’administration pour développer le projet. Il n’est volontairement pas exposé aux utilisateurs ni à ChatGPT ; Budgetia fournit son propre MCP métier limité à seize outils.

Un ticket est rattaché à une seule dépense. Sa catégorie reste celle choisie dans le budget, tandis que ses lignes utilisent des pôles produit analytiques communs. Sur mobile, l’image est lue sur l’appareil avec ML Kit (Android) ou Vision (iOS), puis oubliée. Supabase reçoit uniquement le commerçant et les lignes corrigées dont la somme est vérifiée côté base.

## Démarrage local

Prérequis : Node.js 24+, npm et Docker.

```bash
npm install
npm run supabase:start
npx supabase status -o env
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env
```

Dans `.env` et `apps/mobile/.env`, copiez l’URL locale dans `EXPO_PUBLIC_SUPABASE_URL`, la clé publique locale (`ANON_KEY` ou publishable key) dans `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, et l’origine HTTPS publique de votre propre déploiement dans `EXPO_PUBLIC_BUDGETIA_WEB_URL`. Le premier fichier sert aux smokes, le second à Expo. Ces valeurs identifient des surfaces publiques mais ne remplacent jamais la RLS. Ne copiez jamais une secret key ou une clé `service_role` dans l’app.

Lancez ensuite :

```bash
npm run dev
```

L’app web est disponible sur `http://localhost:8081`. Créez un compte : le déclencheur de base ajoute automatiquement un espace personnel, six catégories usuelles, la catégorie permanente « Non classée » et un budget mensuel initial de 2 000 €.

Dans **Réglages → Catégories**, touchez une ligne pour ouvrir son gestionnaire. Une modification peut conserver les dépenses dans la catégorie ou toutes les transférer. Une suppression demande soit une catégorie de destination, soit une confirmation explicite de suppression des dépenses. « Non classée » peut être renommée et recolorée, mais jamais supprimée.

Dans **Réglages → Budgets partagés**, créez un espace commun puis saisissez l’adresse du partenaire. L’invitation est enregistrée dans Budgetia ; elle n’envoie pas encore d’e-mail externe. Lorsque la personne crée ou ouvre un compte avec cette adresse, elle voit l’invitation et peut la rejoindre.

Dans **Coach**, choisissez un mois, une catégorie et un montant. Le plafond appartient au budget sélectionné : deux membres d’un budget commun voient et modifient la même valeur. Les dépenses ne sont jamais bloquées ; la jauge passe à « à surveiller » à 75 % et à « dépassé » au-delà de 100 %. Supprimer un plafond ne supprime ni la catégorie ni ses dépenses.

Les cartes **Bilans intelligents** produisent un point hebdomadaire ou mensuel à la demande. Dans **Réglages → Coach intelligent privé**, activez séparément les alertes, les rythmes automatiques et les notifications, choisissez le jour, l’heure et le ton, puis masquez les types de conseils non souhaités. Sans clé OpenAI, le résultat reste entièrement déterministe. Avec une clé, celle-ci est envoyée une seule fois à l’Edge Function, validée, chiffrée dans Vault et immédiatement effacée du champ mobile. Un abonnement ChatGPT et la facturation de l’API OpenAI sont distincts.

Pour le Web ou un émulateur :

```bash
npm run start --workspace @budgetia/mobile
# ou
npm run android --workspace @budgetia/mobile
```

Le scan OCR utilise un module natif local et demande donc un build Android/iOS (`npm run android`, APK GitHub ou EAS). Il n’est pas disponible dans Expo Go ni dans le build Web ; la saisie manuelle des lignes reste proposée. Aucun compte ou aucune clé OpenAI n’est nécessaire pour analyser un ticket.

Sur un téléphone physique, remplacez `127.0.0.1` par une URL Supabase accessible depuis le téléphone. Le projet Supabase local reste surtout destiné au navigateur et aux émulateurs correctement configurés.

## Déploiement Supabase

Pour une configuration guidée qui garde les secrets hors du dépôt et de l’APK, lancez :

```bash
./scripts/configure-production.sh
```

Le script écrit uniquement les deux valeurs clientes publiques dans les fichiers `.env` ignorés par Git. Les mots de passe et jetons sont envoyés directement vers les coffres GitHub lorsqu’ils sont fournis, sans être enregistrés localement.

Créez d’abord un projet Supabase, puis liez ce checkout sans partager vos identifiants dans le chat :

```bash
npx supabase login
npx supabase link --project-ref votre_ref_projet
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy budgetia-mcp --no-verify-jwt
npx supabase functions deploy delete-account
npx supabase functions deploy budgetia-ai-coach --no-verify-jwt
npx supabase db query --linked \
  "select public.configure_ai_coach_cron_for_worker('https://VOTRE_REF.supabase.co');"
```

`verify_jwt = false` est intentionnel pour le point d’entrée MCP : la fonction doit pouvoir renvoyer elle-même une réponse OAuth `401` avec `WWW-Authenticate`. Elle vérifie ensuite chaque Bearer token avec Supabase Auth avant tout accès, et les requêtes PostgreSQL restent soumises à la RLS.

Le workflow **Supabase production** active le serveur OAuth 2.1, l’enregistrement dynamique et `/oauth/consent` avec la variable GitHub `BUDGETIA_WEB_URL`. Il appelle `scripts/configure-supabase-oauth.mjs`, qui modifie uniquement ces champs Auth ciblés via l’API de gestion. N’exécutez pas `supabase config push` avec les valeurs localhost de `supabase/config.toml` contre la production : cela remplacerait d’autres réglages Auth. Les confirmations e-mail et le SMTP restent à configurer séparément dans le Dashboard.

Vérifiez ensuite l’endpoint officiel avant de connecter ChatGPT :

```text
https://VOTRE_REF.supabase.co/.well-known/oauth-authorization-server/auth/v1
```

Le smoke test accepte également l’ancien chemin local pour rester compatible avec la pile Supabase CLI. En production, le chemin officiel ci-dessus doit renvoyer le document JSON. L’écran de consentement HTTPS doit aussi être accessible ; l’activation du serveur seule ne suffit pas.

En production, activez les confirmations e-mail, configurez un SMTP fiable et, si vous demandez le scope `openid`, migrez les JWT vers une clé asymétrique. Budgetia ne demande actuellement que le scope standard `email`, car Supabase Auth ne prend pas encore en charge les scopes OAuth métier personnalisés.

## Déploiement de l’écran OAuth

`.github/workflows/web-pages.yml` exporte l’app Expo et déploie automatiquement l’écran de consentement à chaque push `main`. Pour ce dépôt, les URLs sont :

- `https://gneed49.github.io/budgetia/` ;
- `https://gneed49.github.io/budgetia/oauth/consent`.

Le chemin de base `/budgetia` est défini dans `apps/mobile/app.json`. Un fork renommé doit l’adapter au nom de son dépôt GitHub Pages et définir sa propre variable `BUDGETIA_WEB_URL`. Les secrets et variables Actions ne sont jamais copiés dans un fork : chaque déploiement doit fournir ses propres URLs et sa propre clé publishable.

Build :

```bash
npm run build:web --workspace @budgetia/mobile
```

Pour un autre hébergeur, déployez `apps/mobile/dist` avec une réécriture SPA de `/oauth/consent` et les deux variables `EXPO_PUBLIC_SUPABASE_*` de votre propre projet.

## Android avec Expo EAS et GitHub Actions

Budgetia est bien une application React Native, pilotée par Expo. Deux chemins de build coexistent :

- **Android APK** construit gratuitement un APK autonome de préversion avec Expo Prebuild et Gradle Release à chaque push sur `main`. Le lien permanent, le lien temporaire du run et le SHA-256 apparaissent dans le résumé GitHub Actions ;
- **Android EAS release** utilise Expo EAS Build. Le profil `preview` produit un APK installable sur `main` et le profil `production` produit un AAB signé pour Google Play sur un tag `vX.Y.Z`.

Le premier chemin reste un secours fonctionnel. Le second est la voie de distribution production : Expo conserve la clé de signature Android à distance et GitHub ne reçoit jamais le keystore. Le workflow EAS reste volontairement désactivé tant que le compte Expo et les credentials Android n’ont pas été initialisés.

### Initialisation EAS, une seule fois

Ces actions nécessitent la connexion humaine au compte Expo ; ne partagez jamais le jeton dans un message ou dans le dépôt.

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile preview
```

Le premier build interactif crée ou sélectionne les credentials Android distants. Dans les environnements EAS `preview` et `production`, ajoutez ensuite :

| Variable EAS | Valeur |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | URL HTTPS publique du projet Supabase |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé publishable Supabase à faibles privilèges |
| `EXPO_PUBLIC_BUDGETIA_WEB_URL` | origine HTTPS publique de ce déploiement, sans slash final |

Ajoutez enfin dans **GitHub → Settings → Secrets and variables → Actions** :

| Type | Nom | Valeur |
| --- | --- | --- |
| Secret | `EXPO_TOKEN` | jeton d’accès personnel Expo, jamais commité |
| Variable | `EAS_PROJECT_ID` | UUID public du projet affiché après `eas init` |
| Variable | `EAS_PRODUCTION_ENABLED` | `true` uniquement après un premier build EAS réussi |

Le workflow relie temporairement le projet avec `EAS_PROJECT_ID`, attend la fin du build, télécharge le binaire puis publie à la fois le lien GitHub et le lien EAS dans le résumé. Un tag `v1.0.0` doit correspondre à `expo.version: 1.0.0` pour créer la GitHub Release.

Chaque build `main` crée une GitHub Release marquée **préversion**, avec l’APK renommé `Budgetia-main-<commit>.apk` et `SHA256SUMS.txt`. Le JavaScript est embarqué : l’application n’a pas besoin du serveur Metro pour démarrer. Cette préversion est signée avec la clé Android de développement générée par Expo ; elle ne doit pas être confondue avec l’AAB EAS signé par la clé de production destinée au Play Store.

### APK Gradle de secours

Pour que l’APK accède au projet Supabase de production, ajoutez ces deux valeurs dans **GitHub → Settings → Secrets and variables → Actions → Secrets** du dépôt et la variable publique ci-dessous dans **Variables**, puis relancez le workflow ou poussez un commit :

| Secret GitHub | Valeur autorisée |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | URL HTTPS publique du projet Supabase |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publishable Supabase (ou `anon` legacy à privilèges faibles) |

| Variable GitHub | Valeur autorisée |
| --- | --- |
| `BUDGETIA_WEB_URL` | origine HTTPS publique de votre déploiement, par exemple `https://compte.github.io/budgetia` |

Une URL de projet et une clé publishable sont intégrées dans l’APK par conception : elles ne donnent pas accès aux dépenses sans session utilisateur et politiques RLS. Ne stockez jamais `service_role`, `sb_secret_*`, `SUPABASE_DB_URL`, une chaîne PostgreSQL, un mot de passe, une clé de signature Android ou `EXPO_TOKEN` dans l’application ou dans le dépôt.

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
- « Lis ce ticket, montre-moi les lignes et leurs pôles, puis attends ma confirmation avant de l’ajouter. »
- « Combien ai-je dépensé en hygiène et entretien ce mois-ci d’après mes tickets ? »
- « Mets un plafond de 350 € pour Alimentation ce mois-ci. »
- « Quels plafonds risquent d’être dépassés dans le budget du couple ? »
- « Supprime le plafond Transport de septembre, sans toucher aux dépenses. »

### Outils MCP

| Outil | Effet |
| --- | --- |
| `list_budget_spaces` | Liste les budgets personnels et partagés accessibles |
| `list_categories` | Liste les catégories actives d’un budget |
| `create_category` | Crée ou retrouve une catégorie dans le budget ciblé |
| `update_category` | Renomme/recolore une catégorie et peut transférer toutes ses dépenses |
| `delete_category` | Supprime une catégorie après choix explicite : transfert ou suppression des dépenses |
| `add_expense` | Ajoute une dépense, avec `request_id` pour un retry sûr |
| `add_receipt_expense` | Ajoute, après confirmation explicite, une dépense et les lignes validées d’un ticket |
| `get_receipt_details` | Renvoie le commerçant et les lignes d’un ticket à partir de l’identifiant de dépense |
| `get_product_breakdown` | Analyse les tickets par pôle produit, période et catégories filtrées |
| `get_category_budget_positions` | Calcule plafonds, dépensé, restant, dépassement, projection et comparaison mensuelle |
| `set_category_budget_limit` | Crée ou modifie le plafond mensuel d’une catégorie après demande explicite |
| `delete_category_budget_limit` | Retire uniquement un plafond mensuel après confirmation explicite |
| `list_expenses` | Liste les dépenses d’un budget, d’une période et de catégories précises |
| `get_spending_summary` | Renvoie total, budget restant, comparaison, catégories et série temporelle |
| `list_financial_coach_reports` | Lit les bilans privés de l’utilisateur dans le budget ciblé |
| `generate_financial_coach_report` | Génère un bilan borné semaine/mois, sans accepter de prompt libre |

Les quinze outils portant sur les données acceptent `budget_space_id`. Sans ce paramètre, ils ciblent le budget personnel. Pour un budget partagé, ChatGPT doit d’abord appeler `list_budget_spaces`, lever toute ambiguïté avec l’utilisateur puis transmettre explicitement l’identifiant. `add_expense` et `add_receipt_expense` acceptent une catégorie omise et classent alors la dépense dans la catégorie de secours du budget. Pour un ticket, ChatGPT doit montrer la proposition structurée et attendre une confirmation explicite avant l’écriture. La suppression d’un plafond exige elle aussi une confirmation et ne touche jamais aux dépenses. Les outils Coach n’exposent ni saisie de clé ni prompt libre.

Le serveur accepte le protocole MCP `2025-11-25` et la révision stateless `2026-07-28`.

## Validation

```bash
npm run check
npm run build
npm run supabase:test
npm run smoke:local
```

- Vitest couvre les calculs de période, l’analyse déterministe des tickets, la frontière anti-injection du Coach et le contrat des seize outils MCP.
- pgTAP exécute 167 assertions couvrant aussi les rapports privés, la file planifiée, Vault, le secret Cron, les alertes anti-spam et l’isolation par utilisateur dans un budget partagé.
- Le build web vérifie l’intégration Expo.

Un build local et des tests protocole ne prouvent pas une connexion réelle depuis ChatGPT ni un lancement sur téléphone physique. Ces deux validations nécessitent le projet Supabase déployé, une URL HTTPS et une autorisation interactive.

## Structure

```text
apps/mobile/                     application Expo, auth, OCR local et écran OAuth
packages/domain/                 périodes, montants, analyse de tickets et types partagés
supabase/migrations/             schéma PostgreSQL, fonctions et RLS
supabase/functions/budgetia-mcp/ MCP HTTP pour ChatGPT
supabase/functions/budgetia-ai-coach/ agent borné, BYOK, planification et push
supabase/functions/delete-account/ suppression authentifiée du compte
supabase/tests/database/         tests pgTAP de sécurité et données
apps/mobile/eas.json             profils APK de test et AAB de production
docs/PRODUCTION_CHECKLIST.md     portes de mise en production
docs/design/                     concepts visuels
```
