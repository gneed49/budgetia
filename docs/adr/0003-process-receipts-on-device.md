# ADR 0003 — Analyser les tickets sur l’appareil

## Statut

Accepté.

## Décision

L’app mobile photographie ou sélectionne le ticket, puis reconnaît son texte localement avec Google ML Kit sur Android et Vision sur iOS. Un analyseur déterministe Budgetia propose les lignes et leurs pôles produit. La personne doit vérifier et corriger cette proposition avant l’enregistrement.

Budgetia enregistre une dépense globale, un commerçant facultatif et les lignes validées. La photo et le texte OCR brut ne sont ni envoyés à Supabase ni conservés. Le MCP reçoit lui aussi uniquement des lignes structurées que ChatGPT doit présenter à la personne avant de demander une confirmation d’écriture.

## Conséquences

- le scan mobile fonctionne sans clé OpenAI et limite la circulation de données sensibles ;
- l’OCR natif exige un vrai build Android ou iOS et n’est pas disponible dans Expo Go ou sur le Web ;
- la classification est explicable, modifiable et commune à toutes les interfaces ;
- la somme des lignes est contrôlée côté base afin qu’un ticket et sa dépense ne puissent pas diverger ;
- l’ajout futur d’un moteur de classement plus avancé devra préserver la validation humaine et ne pourra jamais écrire directement dans les données financières.
