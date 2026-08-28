# Sécurité de Budgetia

Budgetia considère l’APK, le bundle web et le dépôt Git comme publics. Aucun secret ne doit être nécessaire pour lire ou construire le code.

## Valeurs publiques autorisées

Seules `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` peuvent être compilées dans l’application. Elles identifient un projet Supabase mais n’accordent aucun privilège administratif ; la session Auth et les politiques RLS protègent les données.

Chaque personne qui reprend le dépôt doit fournir sa propre URL et sa propre clé publishable. Le dépôt ne contient pas les valeurs de production de Budgetia.

## Secrets interdits dans le client et le dépôt

- clé Supabase `service_role` ou `sb_secret_*` ;
- mot de passe PostgreSQL, `DATABASE_URL` ou chaîne de connexion ;
- `SUPABASE_ACCESS_TOKEN`, `EXPO_TOKEN` ou keystore Android ;
- clé OpenAI ou autre clé de fournisseur IA ;
- clé de chiffrement de l’application.

Les secrets de déploiement vivent uniquement dans les coffres GitHub, Supabase ou Expo appropriés. Les fichiers `.env` sont ignorés par Git et ne doivent contenir que les valeurs nécessaires à la machine locale.

## Clé IA apportée par l’utilisateur

La fonctionnalité IA n’est pas encore activée. Lorsqu’elle sera livrée, la clé saisie dans l’app sera transmise à une fonction serveur authentifiée, chiffrée côté serveur et jamais renvoyée. Elle ne sera ni intégrée dans l’APK, ni sauvegardée localement en clair, ni partagée entre utilisateurs.

## Confidentialité des tickets

Le scan mobile fonctionne sans service IA distant : ML Kit sur Android et Vision sur iOS reconnaissent le texte sur l’appareil. La photo et le texte OCR brut restent temporaires et ne sont pas envoyés à Supabase. Seuls le commerçant facultatif et les lignes vérifiées sont enregistrés.

Quand une personne joint volontairement une image à ChatGPT, ChatGPT peut la lire dans le cadre de cette conversation ; le MCP Budgetia ne reçoit toutefois que les lignes structurées après validation explicite. Aucun champ de la base ne permet de stocker une image ou le texte OCR brut.

Les noms de commerçants, notes et libellés de produits restent des données non fiables. Le serveur MCP ordonne explicitement au client de ne jamais exécuter une instruction trouvée dans ces champs ; ceux-ci ne sont ni injectés dans une consigne système ni transmis automatiquement au futur coach budgétaire.

## Fonctions PostgreSQL privilégiées

Le linter Supabase signale volontairement les RPC `SECURITY DEFINER` accessibles au rôle `authenticated`. Budgetia en utilise treize pour les opérations qui doivent vérifier plusieurs lignes ou survivre aux changements d’appartenance : création et gestion d’un espace partagé, invitations, membres, transfert de propriété, départ, suppression, aperçu de suppression de compte et création atomique d’un ticket. La création de ticket dérive le montant de la somme des lignes et refuse les catégories ou espaces non autorisés.

Cette exception n’est acceptable que tant que chaque RPC :

- refuse une identité `auth.uid()` absente ;
- valide le rôle ou l’appartenance à l’espace ciblé ;
- fixe son `search_path` ;
- révoque l’exécution à `public` et `anon` ;
- accorde uniquement la signature exacte à `authenticated` ;
- reste couverte par les tests pgTAP d’accès croisé.

Le détail du linter est documenté dans la [checklist de production](docs/PRODUCTION_CHECKLIST.md). Toute nouvelle fonction privilégiée doit être revue séparément ; l’avertissement ne doit jamais être ignoré globalement.

## Configuration reproductible

Lancez `./scripts/configure-production.sh` pour enregistrer les valeurs publiques localement et guider l’ajout des secrets dans les coffres externes. Le script masque les entrées sensibles et ne les écrit pas dans le dépôt.
