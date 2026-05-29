# Colas AM — Optimiseur de transport | Contexte projet

## Infos générales

- Étudiant : Matteo Pacini — Ingénieur Bâtiments Durables et Intelligents
- Entreprise : Colas Alpes-Maritimes (agences Carros + Cannes)
- Deadline : 19 juin 2026
- Stack : React + Vite, Leaflet, JSON

## Fichiers créés

- src/data/centrales.json ✅ (5 centrales avec GPS)
- src/data/types_camions.json ✅ (4x2 9t, 8x4 17t, semi 29t)
- src/data/flotte_camions_colasAM.json ✅ (11 véhicules réels)
- src/components/Carte.jsx ✅ (carte Leaflet fonctionnelle)
- src/components/FormulaireChantier.jsx ✅ (formulaire complet)
- src/utils/optimisation.js 🔲
- src/data/distances.json 🔲

## Ce qui fonctionne

- Carte avec les 5 centrales affichées
- Formulaire de saisie complet (CdT, date, chantier, centrale, enrobé, tonnage, horaires, camions)
- Calcul automatique du nombre de camions
- Récapitulatif journalier avec totaux (chantiers, tonnage, camions)
- Chantiers groupés par date

## Prochaine étape

- Matrice distances.json (zones AM + temps de trajet)
- Algorithme d'optimisation (src/utils/optimisation.js)
- Affichage des chantiers sur la carte (pins oranges)
- Planning Gantt

## Questions en suspens pour Colas

- Temps chargement/déchargement réels
- Coût journalier camion interne vs locatier
- Fraisat accepté : SECA, SAME, SOMECA, CEB ?
- Système GPS télématique existant ?
- Locatiers habituels ?

## 29/05/26

## Fichiers créés

- src/data/centrales.json ✅
- src/data/type_camions.json ✅
- src/data/flotte_camions_colasAM.json ✅
- src/data/zones_am.json ✅
- src/data/distances_jour.json ✅ (à compléter avec valeurs terrain)
- src/data/distances_nuit.json ✅ (à compléter avec valeurs terrain)
- src/components/Carte.jsx ✅
- src/components/FormulaireChantier.jsx ✅
- src/utils/optimisation.js ✅
- src/App.jsx ✅

## Prochaine étape

- Corriger erreur distances_jour.json (nom de fichier à vérifier)
- Tester l'algorithme avec des chantiers réels
- Affichage pins oranges chantiers sur la carte
- Planning Gantt
