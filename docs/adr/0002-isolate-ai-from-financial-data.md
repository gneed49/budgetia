---
status: proposed
---

# Isoler le coach IA derrière des faits financiers déterministes

Le futur coach Budgetia ne recevra ni prompt utilisateur, ni note de dépense, ni accès direct à PostgreSQL ou à un outil d’écriture. Le serveur calculera d’abord des faits financiers structurés et référencés, remplacera les libellés libres par des identifiants opaques, puis demandera au modèle une sortie JSON stricte que le serveur validera avant affichage ou notification ; ce choix réduit fortement l’injection de prompt et les hallucinations au prix de conseils moins conversationnels.

## Consequences

Le moteur déterministe reste la source des montants, seuils, comparaisons et niveaux d’alerte. Le modèle peut uniquement reformuler, prioriser et proposer une action parmi une liste autorisée ; il ne peut ni inventer un montant, ni lire une clé fournisseur, ni écrire une dépense, ni décider seul d’envoyer une notification. Une clé OpenAI apportée par l’utilisateur sera chiffrée côté serveur, jamais stockée dans l’app et jamais renvoyée après enregistrement.
