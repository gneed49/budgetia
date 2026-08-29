---
status: accepted
---

# Isoler le coach IA derrière des faits financiers déterministes

Le coach Budgetia ne reçoit ni prompt utilisateur, ni note de dépense, ni accès direct à PostgreSQL ou à un outil d’écriture. Le serveur calcule d’abord des faits financiers structurés et référencés, remplace les libellés libres par des identifiants opaques, puis demande au modèle une sortie JSON stricte qu’il valide avant affichage ou notification ; ce choix réduit fortement l’injection de prompt et les hallucinations au prix de conseils moins conversationnels.

## Consequences

Le moteur déterministe reste la source des montants, seuils, comparaisons et niveaux d’alerte. Le modèle peut uniquement reformuler, prioriser et proposer une action parmi une liste autorisée ; il ne peut ni inventer un montant, ni lire une clé fournisseur, ni écrire une dépense, ni décider seul d’envoyer une notification. Une clé OpenAI apportée par l’utilisateur est stockée dans Supabase Vault, jamais dans l’app, et jamais renvoyée après enregistrement. Une erreur fournisseur ou une sortie rejetée conserve le rapport déterministe.
