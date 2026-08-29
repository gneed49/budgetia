# Exploitation et rollback de Budgetia

Ce document décrit les actions techniques reproductibles. Il ne remplace pas les décisions du propriétaire indiquées comme gates dans `docs/PRODUCTION_CHECKLIST.md`.

## Surfaces et contrôles

- application et consentement : `https://gneed49.github.io/budgetia/` ;
- documents légaux : `https://gneed49.github.io/budgetia/legal/` ;
- MCP : `https://VOTRE_REF.supabase.co/functions/v1/budgetia-mcp` ;
- smoke public : `npm run smoke:production:public` avec `BUDGETIA_WEB_URL` et `EXPO_PUBLIC_SUPABASE_URL` ;
- audit des sources publiques : `npm run audit:secrets` ; le workflow Android ajoute l’historique Git et le contenu décompressé de l’APK.

Le workflow `Production public smoke` contrôle chaque jour et après un déploiement web : pages, documents légaux, découverte OAuth, challenge MCP et refus des appels non authentifiés au Coach et à la suppression de compte.

## Publication

1. Exécuter `npm ci`, `npm run check`, `npm run build` et les tests Supabase.
2. Relire les migrations et le diff staged.
3. Pousser sur `main` : le workflow Android crée une préversion APK permanente.
4. Attendre les workflows web et smoke public avant d’activer une nouvelle intégration ChatGPT.
5. Pour Google Play, publier uniquement l’AAB EAS signé avec la clé de production distante.

## Rollback applicatif et web

1. Identifier le dernier commit sain et l’incident associé.
2. Créer un commit de revert sur `main` ; ne jamais réécrire l’historique public.
3. Attendre le nouvel APK et le smoke public.
4. Pour un rollback web urgent sans modifier `main`, lancer manuellement `Budgetia web production` avec le commit ou tag sain dans l’entrée `ref`.
5. Une APK déjà distribuée n’est pas révocable : publier une nouvelle version et informer les utilisateurs concernés.

## Rollback Supabase

- Edge Functions : redéployer la version du dernier commit sain, puis tester les réponses `401` et le MCP avec un compte de test.
- Base : les migrations de production sont forward-only. Corriger avec une nouvelle migration revue ; ne jamais supprimer une migration déjà appliquée.
- Perte ou corruption : restaurer d’abord une sauvegarde dans un projet isolé, vérifier Auth/RLS et comparer les données avant toute décision de bascule.
- Suspicion de fuite : révoquer ou faire tourner le secret concerné, invalider les sessions si nécessaire, désactiver l’intégration touchée et conserver une chronologie minimale de l’incident.

## Réponse aux incidents

| Niveau | Exemple | Action immédiate |
| --- | --- | --- |
| P0 | accès croisé à un budget, clé privilégiée publiée | suspendre la surface concernée, révoquer les secrets, préserver les preuves et corriger avant réouverture |
| P1 | OAuth/MCP indisponible, suppression ou partage incorrect | désactiver la fonctionnalité touchée, revenir au commit sain et vérifier RLS/smokes |
| P2 | notification ou graphique incorrect sans perte de données | documenter, corriger et publier une nouvelle préversion |

Les journaux d’incident ne doivent contenir ni Bearer token, clé API, note de dépense, image de ticket ou export utilisateur. Les identifiants techniques doivent être réduits au strict nécessaire.

## Gates du propriétaire

Avant l’ouverture commerciale, renseigner dans les pages légales : identité légale, adresse de contact privée, durées de conservation et sous-traitants validés. Identifier aussi le responsable de publication, le canal d’astreinte, le compte de test et la politique Supabase de sauvegarde/PITR. Ces valeurs ne peuvent pas être inventées par le dépôt.
