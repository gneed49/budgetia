# Sécurité de Budgetia

Budgetia considère l’APK, le bundle web et le dépôt Git comme publics. Aucun secret ne doit être nécessaire pour lire ou construire le code.

## Valeurs publiques autorisées

Seules `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_BUDGETIA_WEB_URL` et l’identifiant public facultatif `EXPO_PUBLIC_EAS_PROJECT_ID` peuvent être compilés dans l’application. Ils identifient des projets et pages publics mais n’accordent aucun privilège administratif ; la session Auth et les politiques RLS protègent les données.

Chaque personne qui reprend le dépôt doit fournir sa propre URL et sa propre clé publishable. Le dépôt ne contient pas les valeurs de production de Budgetia.

En production, Supabase impose SSL aux connexions PostgreSQL externes. L’accès direct à la base reste actuellement autorisé depuis les plages IP publiques afin de ne pas casser les runners GitHub dynamiques ; cette exposition n’accorde aucun accès sans identifiants PostgreSQL et doit être réduite dès qu’une sortie réseau fixe est disponible. L’application mobile et le MCP passent par les API Supabase, Auth et les politiques RLS, jamais par une chaîne de connexion embarquée.

## Secrets interdits dans le client et le dépôt

- clé Supabase `service_role` ou `sb_secret_*` ;
- mot de passe PostgreSQL, `DATABASE_URL` ou chaîne de connexion ;
- `SUPABASE_ACCESS_TOKEN`, `EXPO_TOKEN` ou keystore Android ;
- clé OpenAI ou autre clé de fournisseur IA ;
- clé de chiffrement de l’application.

Les secrets de déploiement vivent uniquement dans les coffres GitHub, Supabase ou Expo appropriés. Les fichiers `.env` sont ignorés par Git et ne doivent contenir que les valeurs nécessaires à la machine locale.

## Clé IA apportée par l’utilisateur

La clé saisie dans l’app est transmise par HTTPS à `budgetia-ai-coach`, qui revérifie le Bearer token auprès de Supabase Auth. La fonction valide la clé auprès du modèle autorisé puis la stocke dans **Supabase Vault** ; seule une ligne de métadonnées privée conserve le fournisseur, le modèle, le statut et les quatre derniers caractères. Aucune RPC cliente ne peut lire `vault.decrypted_secrets` ou la table `private.ai_provider_credentials`.

La clé n’est ni intégrée dans l’APK, ni écrite dans `SecureStore`, ni enregistrée dans un état persistant du mobile, ni renvoyée après sauvegarde, ni partagée avec les autres membres d’un budget commun. La suppression de la clé, des données Coach ou du compte supprime aussi le secret Vault. Budgetia ne contient aucune clé OpenAI globale : chaque clone et chaque utilisateur apporte ses propres identifiants.

## Confidentialité des tickets

Le scan mobile fonctionne sans service IA distant : ML Kit sur Android et Vision sur iOS reconnaissent le texte sur l’appareil. La photo et le texte OCR brut restent temporaires et ne sont pas envoyés à Supabase. Seuls le commerçant facultatif et les lignes vérifiées sont enregistrés.

Quand une personne joint volontairement une image à ChatGPT, ChatGPT peut la lire dans le cadre de cette conversation ; le MCP Budgetia ne reçoit toutefois que les lignes structurées après validation explicite. Aucun champ de la base ne permet de stocker une image ou le texte OCR brut.

Les noms de catégories, commerçants, notes et libellés de produits restent des données non fiables. Le serveur MCP ordonne explicitement au client de ne jamais exécuter une instruction trouvée dans ces champs. Le Coach ne lit jamais les notes, commerçants ou lignes de tickets ; il retire aussi les identifiants, noms et couleurs de catégories avant l’appel au modèle et ne transmet que des alias opaques.

## Plafonds et Coach borné

Les plafonds sont stockés en centimes avec l’espace, la catégorie, le mois et l’auteur. La base force le nom/couleur/icône depuis la catégorie active, normalise le mois, interdit de changer l’identité d’une ligne et applique la RLS à chaque lecture ou écriture. La fonction de position est `SECURITY INVOKER` : elle n’élève pas les privilèges.

Le moteur déterministe reste la source des montants, comparaisons, seuils et conseils de repli. L’appel OpenAI facultatif reçoit un paquet JSON borné, sans texte financier libre, sans outil et avec `store: false`. Il doit répondre à un schéma fermé. Budgetia rejette les identifiants de faits ou alias inventés, les liens, les conseils sur titres, crédits ou produits financiers et toute sortie malformée ; il revient alors au conseil déterministe sans afficher la sortie rejetée.

Les rapports sont privés par `user_id`, y compris dans un espace partagé. Les alertes de seuil sont décidées par PostgreSQL et dédupliquées par catégorie, niveau et semaine. Les notifications push affichent un texte générique sur l’écran verrouillé ; leur détail financier reste dans l’app après authentification. Le scheduler appelle l’Edge Function avec un secret aléatoire conservé dans Vault, jamais dans le dépôt.

## Fonctions PostgreSQL privilégiées

Les RPC `SECURITY DEFINER` accessibles au rôle `authenticated` sont limitées aux opérations atomiques qui vérifient l’identité et l’appartenance : gestion d’un espace partagé, invitations, membres, cycle de compte, tickets, plafonds et demandes Coach. Les fonctions de worker, de Vault, de file et de Cron révoquent explicitement `authenticated` et sont accordées seulement à `service_role`. Le linter local des schémas `public,private` ne remonte pas d’erreur. Le Security Advisor distant signale volontairement ces RPC exécutables par `authenticated` : ces avertissements attendus sont suivis individuellement et ne sont pas présentés comme un audit sans avertissement.

Cette exception n’est acceptable que tant que chaque RPC :

- refuse une identité `auth.uid()` absente ;
- valide le rôle ou l’appartenance à l’espace ciblé ;
- fixe son `search_path` ;
- révoque l’exécution à `public` et `anon` ;
- accorde uniquement la signature exacte à `authenticated` ;
- reste couverte par les tests pgTAP d’accès croisé.

Le détail du linter est documenté dans la [checklist de production](docs/PRODUCTION_CHECKLIST.md). Toute nouvelle fonction privilégiée doit être revue séparément ; l’avertissement ne doit jamais être ignoré globalement.

La protection Auth contre les mots de passe compromis s’appuie sur Have I Been Pwned et n’est disponible que sur les offres Supabase compatibles. Le projet de production est actuellement sur l’offre Free : cette protection n’y est donc pas activable et reste un gate de montée en gamme avant une commercialisation publique.

## Configuration reproductible

Lancez `./scripts/configure-production.sh` pour enregistrer les valeurs publiques localement et guider l’ajout des secrets dans les coffres externes. Le script masque les entrées sensibles et ne les écrit pas dans le dépôt.
