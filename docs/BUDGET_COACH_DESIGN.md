# Plafonds par catégorie et coach budgétaire — conception V1

Ce document transforme l’idée en une fonctionnalité livrable sans rendre Budgetia inutilement complexe. Il ne prétend pas que le coach IA est déjà implémenté : il fixe le modèle, les garde-fous et les critères d’acceptation avant de toucher aux données financières ou à une clé fournisseur.

## 1. Plafond mensuel par catégorie

Un plafond appartient à un **espace budgétaire**, une **catégorie** et un **mois civil**. Un couple voit donc exactement les mêmes plafonds dans son espace partagé, tandis que chacun conserve des plafonds distincts dans son espace personnel.

Chaque carte de catégorie affiche :

- le plafond du mois ;
- le montant dépensé ;
- le montant restant lorsque la position est positive ;
- le dépassement lorsque la position est négative ;
- le pourcentage consommé et une progression accessible sans dépendre uniquement de la couleur ;
- la comparaison avec le même moment du mois précédent.

États proposés : **dans les temps** avant 75 %, **à surveiller** entre 75 % et 100 %, **dépassé** au-delà de 100 %. Les seuils servent à l’interface et aux notifications, pas à bloquer une dépense.

La catégorie « Non classée » peut recevoir un plafond afin de rendre visible une accumulation de dépenses mal catégorisées. Lorsqu’une catégorie est supprimée ou fusionnée, ses plafonds historiques restent attachés aux périodes passées pour préserver les bilans ; le plafond futur de la catégorie de destination n’est jamais augmenté automatiquement.

### Décision sur le report

La V1 n’applique aucun report automatique du restant ou du dépassement au mois suivant. Le nouveau mois reprend le plafond configuré, tandis que l’écart du mois précédent apparaît dans le bilan et dans la comparaison. Une option explicite de report pourra être étudiée ensuite avec trois règles possibles : aucun report, report du restant uniquement, ou report signé plafonné. Elle devra afficher un aperçu avant activation.

### Données futures

Le schéma cible peut être représenté ainsi :

```text
budget_spaces
  └── categories
        └── category_budget_limits
              space_id + category_id + month = unique
              limit_cents, created_by, updated_by, created_at, updated_at

expenses ── agrégation déterministe ── category_budget_positions
```

`category_budget_positions` est une vue ou une fonction de lecture, pas une table modifiable. Les montants restent des entiers en centimes. La RLS vérifie l’appartenance à l’espace ; toute modification conserve l’auteur afin que les membres d’un budget commun comprennent qui a changé un plafond.

## 2. Moteur de faits financiers

Avant toute IA, Budgetia calcule des faits vérifiables :

- plafond, dépensé, restant et dépassement par catégorie ;
- rythme de dépense comparé au nombre de jours écoulés ;
- variation par rapport à la semaine et au mois précédents ;
- catégories expliquant le plus la variation totale ;
- dépenses récurrentes détectées avec une règle transparente ;
- marge potentielle si une catégorie revient à sa médiane récente.

Chaque fait possède un identifiant, une période, une formule, les identifiants de catégories concernés et les montants source. Le client peut ainsi afficher « Pourquoi ce conseil ? » sans demander au modèle de reconstruire le calcul.

## 3. Coach IA sans fenêtre de prompt

Le coach fonctionne en arrière-plan selon deux rythmes : un bilan hebdomadaire et un bilan mensuel. Un contrôle léger après ajout d’une dépense peut préparer une alerte de seuil, mais le moteur déterministe — pas le modèle — décide qu’un seuil est franchi et applique les délais anti-spam.

Le modèle reçoit uniquement un paquet minimal :

- faits financiers structurés et déjà calculés ;
- catégories remplacées par des alias opaques comme `C1` et `C2` ;
- préférences autorisées, telles que les notifications activées ou le niveau de prudence ;
- aucune note, aucun nom de commerçant, aucun libellé libre de catégorie et aucun contenu provenant d’un MCP.

Il n’a accès à aucun outil, aucune URL et aucune fonction d’écriture. Il produit un JSON conforme à un schéma fermé : type de conseil autorisé, importance, identifiants des faits justificatifs, action suggérée, confiance et courte explication. Le serveur rejette toute catégorie, tout montant ou tout fait absent du paquet d’entrée, puis remappe les alias vers les libellés uniquement après validation.

Cette frontière protège notamment contre un libellé de catégorie du type « ignore les règles » : ce texte n’atteint jamais le modèle. Elle limite aussi l’impact d’une sortie incorrecte, car le modèle ne peut pas créer, modifier ou supprimer une donnée.

## 4. Politique de conseils et notifications

Les conseils restent informatifs et centrés sur le budget quotidien. Ils peuvent proposer de réduire une catégorie, revoir un abonnement ou déplacer un objectif ; ils ne recommandent pas un titre financier, un crédit précis, un produit bancaire ou une opération automatique.

Règles V1 :

- une alerte immédiate au maximum par catégorie et par seuil sur sept jours ;
- un bilan hebdomadaire au jour et à l’heure choisis ;
- un bilan mensuel après clôture du mois ;
- aucune notification si les faits ne dépassent pas un seuil utile ;
- possibilité de désactiver le coach, les alertes de seuil ou chaque rythme séparément ;
- actions « utile », « pas utile », « masquer ce type » et « reporter » ;
- suppression des bilans et des données IA depuis les réglages.

## 5. Interface dédiée « Coach »

L’onglet contient quatre zones courtes :

1. **À retenir** : au plus trois cartes prioritaires et sourcées.
2. **Plafonds** : progression par catégorie, restant ou dépassement et réglage du mois.
3. **Bilan hebdomadaire** : évolution, catégories contributrices et actions possibles.
4. **Bilan mensuel** : résultat final, comparaison, écarts et objectifs du mois suivant.

Chaque conseil affiche son origine, par exemple « basé sur 128 € dépensés sur un plafond de 100 € du 1er au 18 août ». Le détail montre la formule déterministe et permet de corriger une catégorie avant de recalculer le bilan.

## 6. BYOK OpenAI sécurisé

La future page Réglages permet à chaque personne d’ajouter sa propre clé API OpenAI. La clé est envoyée une seule fois par HTTPS à une Edge Function authentifiée, validée auprès du fournisseur, puis chiffrée avec une clé d’application disponible uniquement côté serveur. La base conserve le chiffré, le vecteur d’initialisation, la version de chiffrement et les quatre derniers caractères ; elle ne renvoie jamais la clé au client.

La clé n’est placée ni dans `EXPO_PUBLIC_*`, ni dans SecureStore, ni dans l’APK, ni dans GitHub. L’utilisateur peut la remplacer ou la supprimer. Chaque traitement applique quota, limitation de débit, journal technique sans contenu financier et identifiant de sécurité pseudonymisé. Un abonnement ChatGPT ne fournit pas de crédits API OpenAI : la facturation API du détenteur de la clé reste séparée.

## 7. Ordre de livraison

### Lot A — plafonds sans IA

- migration, RLS et tests pgTAP ;
- réglage d’un plafond par mois et catégorie ;
- cartes de progression, dépassement et comparaison ;
- bilan hebdomadaire/mensuel entièrement déterministe ;
- préférences et notifications locales de seuil.

### Lot B — coffre BYOK

- saisie et remplacement de clé ;
- chiffrement serveur avec rotation ;
- quotas, suppression et journal d’audit sans secret ;
- tests prouvant qu’aucune réponse API ne révèle le chiffré ou la clé.

### Lot C — recommandations IA

- paquet de faits minimal et alias opaques ;
- sortie structurée et validation stricte ;
- écran Coach, bilans planifiés et notifications ;
- corpus d’évaluation incluant injections dans notes, catégories et réponses modèle ;
- activation progressive, arrêt global et suivi du coût.

## 8. Critères de sortie

La fonctionnalité n’est prête que si les montants affichés peuvent être recalculés sans IA, si une sortie modèle malformée ne produit aucune notification, si un membre ne voit jamais les faits d’un autre espace, si la clé fournisseur est absente des bundles et journaux, et si le coach peut être désactivé et supprimé sans affecter les dépenses.
