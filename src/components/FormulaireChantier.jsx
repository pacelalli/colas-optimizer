// Import des fichiers base de données 
import { useState } from "react";  {/*Import de la fonction useState du react */}
import { trouverZone, comparerCentrales } from "../utils/optimisation";  {/*Import de plusieurs fonction du optimisation.js */}
import centrales from "../data/centrales.json";  {/*Import du fichier base de données centrales.json sous le nom : centrales */}
import formules from "../data/formules_enrobes.json";  {/*Import du fichier base de données formules_enrobes.json sous le nom : formules */}
import camions from "../data/type_camions.json"; {/*Import du fichier base de données types_camions.json sous le nom : camion */}

// Conducteur de travaux
const ctx = [
  "ANTONIN Baptiste",
  "AZAIEZ Wajdi",
  "BESSIERE Flavien",
  "BOISSIN Victor",
  "FAUCHEUX Sébastien",
  "LEFLOCH Marion",
  "PACINI Matteo",
  "SARRAZY Thomas",
];

function FormulaireChantier({ onAjoutChantier }) {
  const [form, setForm] = useState({
    conducteur: "",
    date: "",
    chantierNuit: false,
    nomChantier: "",
    adresseChantier: "",
    coordonnees: "",
    lat: "",
    lng: "",
    zoneId: "",
    centrale: "",
    centraleImposee: false,
    typeEnrobe: "",
    tonnage: "",
    heureDebut: "",
    heureFin: "",
    typeCamion: "8x4",
  });

  const [etape, setEtape] = useState("saisie"); {/*Etape du formulaire : saisie ou comparatif */}
  const [optionsComparatif, setOptionsComparatif] = useState([]); {/*Options du tableau comparatif */}
  const [nbColasParOption, setNbColasParOption] = useState({}); {/*Nb camions Colas par option, indexé par centraleId */}
  const [resultat, setResultat] = useState(null);
  const [zoneDetectee, setZoneDetectee] = useState(null);

  const handleChange = (e) => {
    const newForm = { ...form, [e.target.name]: e.target.value };
    setForm(newForm);

    if (e.target.name === "coordonnees") {
      const parts = e.target.value.split(",").map((v) => parseFloat(v.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const zone = trouverZone(parts[0], parts[1]);
        setZoneDetectee(zone);
        setForm({ ...newForm, lat: parts[0], lng: parts[1], zoneId: zone?.zoneId });
      }
    }
  };

  {/* Permet de valider les besoins, et vérifier la bonne saisie des informations */}
  const handleValider = () => {
    if (!form.conducteur || !form.date || !form.nomChantier || !form.tonnage) { {/* Si une ou plusieurs de ces values sont vides -->*/}
      alert("Merci de remplir tous les champs obligatoires (*)"); {/* Alors retourner un message d'alerte */}
      return;
    }
    if (!form.typeEnrobe) {
      alert("Merci de sélectionner une formule d'enrobé");
      return;
    }
    if (!form.heureDebut || !form.heureFin) {
      alert("Merci de renseigner les heures de début et de fin");
      return;
    }
    if (form.centraleImposee && !form.centrale) {
      alert("Merci de sélectionner une centrale (centrale imposée)");
      return;
    }
    if (!form.lat || !form.lng) {
      alert("Merci de renseigner les coordonnées GPS du chantier");
      return;
    }

    {/*Calcul des options comparatives */}
    const options = comparerCentrales({
      ...form,
      formule: form.typeEnrobe,
    }, 0);

    if (options.length === 0) {
      alert("Aucune centrale ne produit cette formule. Vérifiez votre sélection.");
      return;
    }

    {/*Initialiser le slider à 0 camions Colas pour chaque option */}
    const initColas = {};
    options.forEach((o) => { initColas[o.centraleId] = 0; });
    setNbColasParOption(initColas);
    setOptionsComparatif(options);
    setEtape("comparatif");
  };

  {/*Recalculer une option quand le slider change */}
  const handleSliderChange = (centraleId, nbColas) => {
    setNbColasParOption((prev) => ({ ...prev, [centraleId]: parseInt(nbColas) }));
    {/*Recalculer les options avec le nouveau nb de camions Colas */}
    const options = comparerCentrales({
      ...form,
      formule: form.typeEnrobe,
    }, parseInt(nbColas));
    setOptionsComparatif(options);
  };

  {/*Conducteur choisit une option → on soumet le chantier */}
  const handleChoisirOption = (option) => {
    const chantier = {
      ...form,
      id: Date.now(),
      centrale: option.centraleId,
      centraleImposee: true,
      formule: option.formuleId,
      nbCamionsColas: nbColasParOption[option.centraleId] ?? 0,
      prixTonneRetenu: option.prixTonne,
      coutTotalRetenu: option.coutTotal,
    };
    setResultat(chantier);
    if (onAjoutChantier) onAjoutChantier(chantier);
    setEtape("confirme");
  };

  const centraleTrouvee = centrales.find((c) => c.id === form.centrale);

  {/*─── ETAPE COMPARATIF ───────────────────────────────────────────────────── */}
  if (etape === "comparatif") {
    return (
      <div className="formulaire">
        <h2>CHOIX DE LA CENTRALE</h2>
        <p className="info-centrale">
          📍 <strong>{form.nomChantier}</strong> — {form.tonnage}t de {formules.find(f => f.id === form.typeEnrobe)?.nom}
        </p>

        <div className="comparatif-liste">
          {optionsComparatif.map((option) => {
            const nbColas = nbColasParOption[option.centraleId] ?? 0;
            {/*Recalculer le coût en temps réel selon le slider */}
            const nuit = form.chantierNuit ?? false;
            const typeCamion = camions.find(t => t.id === form.typeCamion);
            const nbLocatiers = option.nbCamions - nbColas;
            const prixCamion = nuit ? typeCamion?.prix_colas_nuit : typeCamion?.prix_colas_jour;
            const prixLocatier = nuit ? typeCamion?.prix_locatier_nuit : typeCamion?.prix_locatier_jour;
            const coutCamions = (nbColas * (prixCamion ?? 0)) + (nbLocatiers * (prixLocatier ?? 0));
            const coutTotal = option.detail.coutMatiere + coutCamions;
            const prixTonne = Math.round(coutTotal / parseFloat(form.tonnage));

            return (
              <div key={option.centraleId} className="comparatif-card">

                {/*En-tête de la carte */}
                <div className="comparatif-header">
                  <div>
                    <strong>{option.centraleNom}</strong>
                    <span className="comparatif-distance"> · {option.distanceKm} km</span>
                  </div>
                  <div className="comparatif-prix-tonne">{prixTonne}€/t</div>
                </div>

                {/*Détail formule */}
                <div className="comparatif-formule">
                  {option.numero && <span className="comparatif-numero">{option.numero}</span>}
                  {option.formuleNom}
                  <span className="comparatif-prix-matiere"> · {option.detail.prixTonneMatiere}€/t matière</span>
                </div>

                {/*Détail camions */}
                <div className="comparatif-camions">
                  <span>🚛 {option.nbCamions} camion(s) nécessaires</span>
                </div>

                {/*Slider camions Colas */}
                <div className="comparatif-slider">
                  <label>
                    Camions Colas : <strong>{nbColas}</strong> / {option.nbCamions}
                    <span style={{ marginLeft: "8px", opacity: 0.6 }}>
                      ({nbLocatiers} locatier{nbLocatiers > 1 ? "s" : ""})
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={option.nbCamions}
                    value={nbColas}
                    onChange={(e) => handleSliderChange(option.centraleId, e.target.value)}
                  />
                </div>

                {/*Détail des coûts */}
                <div className="comparatif-detail">
                  <div>Matière : <strong>{option.detail.coutMatiere.toLocaleString("fr-FR")}€</strong></div>
                  <div>Transport : <strong>{coutCamions.toLocaleString("fr-FR")}€</strong></div>
                  <div>Total : <strong>{coutTotal.toLocaleString("fr-FR")}€</strong></div>
                </div>

                {/*Bouton choisir */}
                <button className="btn-choisir" onClick={() => handleChoisirOption(option)}>
                  ✅ Choisir cette centrale
                </button>

              </div>
            );
          })}
        </div>

        {/*Bouton retour */}
        <button className="btn-retour" onClick={() => setEtape("saisie")}>
          ← Modifier la saisie
        </button>
      </div>
    );
  }

  {/*─── ETAPE CONFIRMATION ─────────────────────────────────────────────────── */}
  if (etape === "confirme") {
    return (
      <div className="formulaire">
        <h2>✅ BESOIN ENREGISTRÉ</h2>
        <div className="resultat">
          <p>📅 Date : <strong>{resultat.date}</strong></p>
          <p>👷 CdT : <strong>{resultat.conducteur}</strong></p>
          <p>📍 Chantier : <strong>{resultat.nomChantier}</strong></p>
          <p>🏭 Centrale : <strong>{centrales.find(c => c.id === resultat.centrale)?.nom}</strong></p>
          <p>📦 Tonnage : <strong>{resultat.tonnage}t</strong> de <strong>{formules.find(f => f.id === resultat.typeEnrobe)?.nom}</strong></p>
          <p>🚛 Camions : <strong>{resultat.typeCamion}</strong></p>
          <p>💰 Prix retenu : <strong>{resultat.prixTonneRetenu}€/t</strong> — Total : <strong>{resultat.coutTotalRetenu?.toLocaleString("fr-FR")}€</strong></p>
        </div>
        <button className="btn-valider" onClick={() => {
          setEtape("saisie");
          setForm({
            conducteur: "",
            date: "",
            chantierNuit: false,
            nomChantier: "",
            adresseChantier: "",
            coordonnees: "",
            lat: "", lng: "", zoneId: "",
            centrale: "", centraleImposee: false,
            typeEnrobe: "", tonnage: "",
            heureDebut: "", heureFin: "",
            typeCamion: "8x4",
          });
          setZoneDetectee(null);
          setResultat(null);
        }}>
          ➕ Ajouter un autre chantier
        </button>
      </div>
    );
  }

  {/*  ETAPE SAISIE  */}
  return (
    <div className="formulaire"> {/*Ensemble de la page HTML*/}
      <h2>SAISIE DES BESOINS</h2> {/*Création d'un sous titre de saisie*/}

      <div className="form-section"> {/*Boite de type form-section (pour personnalisation dans CSS)*/}
        <h3>Identification</h3> {/*Sous titre h3*/}

        <div className="form-row"> {/*Boite de type form-row*/}
          <label>Conducteur de travaux * </label> {/*Label = balise de texte*/}
          <select name="conducteur" value={form.conducteur} onChange={handleChange}> {/*Select = création liste déroulante */}
            <option value="">-- Sélectionner --</option> {/* Vide et "Sélectionner" par défaut */}
            {ctx.map((c) => (  
              <option key={c} value={c}>{c}</option>
            ))} {/* Permet de boucler sur le tableau const ctx pour faire un choix */}
          </select>
        </div>

        <div className="form-row">
          <label>Date du besoin * </label>
          <input type="date" name="date" value={form.date} onChange={handleChange} />
        </div>
      </div>

      <div className="form-section">
        <h3>Chantier</h3>

        <div className="form-row">
          <label>Nom du chantier * </label>
          <input
            type="text"
            name="nomChantier"
            value={form.nomChantier}
            onChange={handleChange}
            placeholder="Ex: RD6007 - Vallauris"
          />
        </div>

        <div className="form-row">
          <label>Adresse </label>
          <input
            type="text"
            name="adresseChantier"
            value={form.adresseChantier}
            onChange={handleChange}
            placeholder="Ex: Av. de la Liberté"
          />
        </div>

        <div className="form-row">
          <label>Coordonnées GPS (Google Maps) * </label>
          <input
            type="text"
            name="coordonnees"
            value={form.coordonnees}
            onChange={handleChange}
            placeholder="Ex: 43.6580, 7.1220"
          />
          {zoneDetectee && (
            <div className="info-centrale">
              📍 Zone détectée : <strong>{zoneDetectee.commune}</strong> — {zoneDetectee.secteur}
              <span style={{ float: "right", opacity: 0.6 }}>à {zoneDetectee.distanceKm} km</span>
            </div>
          )}
        </div>

        <div className="form-row">
          <label>Type de chantier</label>
          <div className="toggle-group">
            <button
              type="button"
              className={!form.chantierNuit ? "toggle-btn actif" : "toggle-btn"}
              onClick={() => setForm({ ...form, chantierNuit: false })}
            >
              ☀️ Chantier de jour
            </button>
            <button
              type="button"
              className={form.chantierNuit ? "toggle-btn actif" : "toggle-btn"}
              onClick={() => setForm({ ...form, chantierNuit: true })}
            >
              🌙 Chantier de nuit
            </button>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>Commande enrobés</h3>

        <div className="form-row">
          <label>Formule * </label> {/*Formule remontée avant centrale car toujours obligatoire*/}
          <select name="typeEnrobe" value={form.typeEnrobe} onChange={handleChange}>
            <option value="">-- Sélectionner --</option>
            {formules.map((f) => (
              <option key={f.id} value={f.id}>{f.nom}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Tonnage nécessaire (t) * </label>
          <input type="number" name="tonnage" value={form.tonnage} onChange={handleChange} placeholder="Ex: 80" min="1" />
        </div>

        <div className="form-row">
          <label>Heure de début </label>
          <input type="time" name="heureDebut" value={form.heureDebut} onChange={handleChange} />
        </div>

        <div className="form-row">
          <label>Heure de fin </label>
          <input type="time" name="heureFin" value={form.heureFin} onChange={handleChange} />
        </div>

        <div className="form-row">
          <label>Contrainte centrale</label>
          <div className="toggle-group">
            <button
              type="button"
              className={form.centraleImposee ? "toggle-btn actif" : "toggle-btn"}
              onClick={() => setForm({ ...form, centraleImposee: true })}
            >
              🔒 Centrale imposée
            </button>
            <button
              type="button"
              className={!form.centraleImposee ? "toggle-btn actif" : "toggle-btn"}
              onClick={() => setForm({ ...form, centraleImposee: false })}
            >
              💡 Centrale suggérée
            </button>
          </div>
          {form.centraleImposee
            ? <p className="info-centrale">⚠️ L'algorithme respectera cette centrale (formule spécifique)</p>
            : <p className="info-centrale">✅ L'algorithme optimisera la centrale via le tableau comparatif</p>
          }
        </div>

        {/* Select centrale visible uniquement si centrale imposée */}
        {form.centraleImposee && (
          <div className="form-row">
            <label>Centrale * </label>
            <select name="centrale" value={form.centrale} onChange={handleChange}>
              <option value="">-- Sélectionner --</option>
              {centrales.map((c) => (
                <option key={c.id} value={c.id}>{c.nom} — {c.localisation}</option>
              ))}
            </select>
          </div>
        )}

        {centraleTrouvee && (
          <div className="info-centrale">
            📍 {centraleTrouvee.adresse || centraleTrouvee.localisation} &nbsp;|&nbsp;
            Fraisat : {centraleTrouvee.fraisat === true ? "✅ Oui" : centraleTrouvee.fraisat === false ? "❌ Non" : "❓ Non renseigné"}
          </div>
        )}
      </div>

      <div className="form-section">
        <h3>Camions </h3>
        <div className="form-row">
          <label>Type de camion souhaité </label>
          <select name="typeCamion" value={form.typeCamion} onChange={handleChange}>
            {camions.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        {form.tonnage && (
          <div className="info-calcul">
            🚛 Rotations nécessaires : <strong>
              {Math.ceil(parseFloat(form.tonnage) / (camions.find(t => t.id === form.typeCamion)?.tonnage_utile ?? 1))}
            </strong> au total
            — l'algorithme calculera le nombre de camions optimal
          </div>
        )}
      </div>

      <button className="btn-valider" onClick={handleValider}>
        ➡️ Voir les options de centrale
      </button>

    </div>
  );
}

export default FormulaireChantier;