# Colas AM — Optimiseur de transport | Contexte projet

## Infos générales

- Étudiant : Matteo Pacini — Ingénieur Bâtiments Durables et Intelligents
- Entreprise : Colas Alpes-Maritimes (agences Carros + Cannes)
- Deadline : 19 juin 2026
- Stack : React + Vite, Leaflet, JSON
- GitHub : https://github.com/pacelalli/colas-optimizer

## Livrables

- Application web fonctionnelle
- Support de soutenance (slides)
- Pas de rapport écrit

## Fichiers créés

- src/data/centrales.json ✅ (5 centrales avec GPS)
- src/data/type_camions.json ✅ (4x2, 8x4, semi — temps_sur_chantier, pas temps_dechargement)
- src/data/flotte_camions_colasAM.json ✅ (11 véhicules réels Colas AM)
- src/data/zones_am.json ✅ (zones AM alignées avec clés matrices distances)
- src/data/distances.json ✅ (temps VL de jour — SCERM complète, autres à compléter)
- src/components/Carte.jsx ✅ (carte Leaflet avec centrales)
- src/components/FormulaireChantier.jsx ✅ (formulaire complet)
- src/utils/optimisation.js ✅ (algorithme complet)
- src/App.jsx ✅ (navigation + récap + journal de calcul)

## Ce qui fonctionne

- Carte Leaflet avec 5 centrales
- Formulaire de saisie complet :
  - Conducteur de travaux
  - Date + type jour/nuit
  - Adresse + coordonnées GPS copier-coller
  - Détection automatique de zone (Haversine)
  - Centrale imposée ou suggérée automatiquement
  - Type enrobé, tonnage, horaires
  - Type de camion
- Algorithme d'optimisation :
  - Calcul rotations totales nécessaires
  - Calcul rotations max par camion (temps disponible ÷ temps cycle)
  - Calcul nb camions = ceil(rotations totales / rotations max)
  - Gestion passage minuit
  - Gestion pauses chauffeur (45 min) + repas (1h si jour)
  - Priorité camions Colas sur locatiers
  - Cadençage flux continu (décalage entre camions = temps_sur_chantier)
  - Suggestion centrale automatique (priorité Colas + distance)
- Récapitulatif journalier avec planning des rotations
- Journal de calcul (panneau latéral droit) sur pages saisie et récap

## Points importants de l'algorithme

- heureDebut = arrivée sur chantier (pas départ centrale)
- temps_sur_chantier remplace temps_dechargement (plus réaliste)
- Matrices distances en minutes VL, coefficient par type camion appliqué
- Deux matrices : jour et nuit (coefficient 0.7 la nuit)
- zoneId détecté automatiquement via Haversine depuis coordonnées GPS

## Prochaine étape

- Équilibrage rotations entre camions (ceil(rotations_totales/nb_camions))
- Affichage chantiers sur la carte (pins oranges)
- Planning Gantt visuel
- Indicateur CO₂ économisé
- Coût à la tonne journalier
- Compléter distances.json pour SECA, SAME, SOMECA, CEB

## Questions en suspens pour Colas

- Coût journalier camion interne vs locatier
- Fraisat accepté : SECA, SAME, SOMECA, CEB ?
- Système GPS télématique existant ?
- Locatiers habituels (noms, contacts, types camions) ?
- Valider les temps sur chantier dans type_camions.json

## Règles métier importantes

- SCERM prioritaire (Colas 100%)
- Centrale imposée = respectée par l'algorithme
- Centrale suggérée = algorithme optimise (priorité Colas + distance)
- Camions Colas priorité 1, locatiers priorité 2
- Chantier jour : pause repas 1h si chevauchement 12h-13h
- Chantier nuit : pause chauffeur 45 min uniquement
