# Budgetia

Budgetia permet à une personne de suivre ses dépenses seule et de gérer, en parallèle, des finances communes avec d’autres personnes sans mélanger les données.

## Language

**Espace budgétaire**:
Le périmètre qui regroupe un budget mensuel, des catégories, des dépenses et ses membres.
_Avoid_: Compte, portefeuille

**Espace personnel**:
L’espace budgétaire privé créé automatiquement pour une seule personne.
_Avoid_: Compte personnel

**Espace partagé**:
Un espace budgétaire commun auquel plusieurs membres peuvent contribuer, par exemple le budget d’un couple.
_Avoid_: Compte joint, groupe

**Membre**:
Une personne autorisée à consulter et gérer les données d’un espace partagé.
_Avoid_: Utilisateur partagé, collaborateur

**Invitation**:
Une proposition d’accès adressée à une adresse e-mail et qui ne devient une appartenance qu’après acceptation par le compte correspondant.
_Avoid_: Partage automatique

**Catégorie de secours**:
L’unique catégorie permanente d’un espace budgétaire qui accueille les dépenses sans classement explicite. Son libellé initial est « Non classée » et peut être renommé, mais la catégorie ne peut pas être supprimée.
_Avoid_: Catégorie système, catégorie supprimable

**Transfert de catégorie**:
Le reclassement de toutes les dépenses d’une catégorie vers une autre catégorie du même espace budgétaire.
_Avoid_: Fusion inter-budgets, déplacement partiel

**Plafond de catégorie**:
Le montant cible maximal attribué à une catégorie pour un mois donné dans un espace budgétaire.
_Avoid_: Limite bancaire, blocage de paiement

**Position budgétaire**:
L’état calculé d’un plafond de catégorie : dépensé, restant ou dépassement pour la période.
_Avoid_: Solde bancaire, argent disponible

**Écart mensuel**:
La différence signée entre le plafond d’une catégorie et les dépenses du mois, conservée pour l’analyse sans modifier automatiquement le plafond du mois suivant.
_Avoid_: Dette, report automatique

**Fait financier**:
Une mesure déterministe calculée par Budgetia à partir des données autorisées d’un espace, par exemple un dépassement ou une variation hebdomadaire.
_Avoid_: Avis IA, intuition

**Conseil budgétaire**:
Une recommandation explicative produite à partir de faits financiers référencés, sans pouvoir modifier les données ni déclencher une opération financière.
_Avoid_: Conseil en investissement, décision autonome

**Bilan**:
Une synthèse hebdomadaire ou mensuelle regroupant positions budgétaires, évolutions et conseils validés pour un espace.
_Avoid_: Conversation IA, prompt
