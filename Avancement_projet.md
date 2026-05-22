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
