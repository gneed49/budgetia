# Unifier les budgets personnels et partagés en espaces budgétaires

Budgetia représente le budget privé et les budgets communs avec le même concept d’espace budgétaire, puis attache catégories, dépenses, réglages et membres à `space_id`. Ce choix évite deux modèles de données divergents et permet aux mêmes écrans, agrégats et outils MCP de fonctionner partout ; son coût est que toute nouvelle requête et toute politique RLS doivent désormais vérifier l’appartenance à l’espace ciblé.
