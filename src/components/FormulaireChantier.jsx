// Import des fichiers base de données 
import { useState, useEffect } from "react";
import { trouverZone, comparerCentrales, comparerCentralesFraisat } from "../utils/optimisation";
import centrales from "../data/centrales.json";
import formules from "../data/formules_enrobes.json";
import camions from "../data/type_camions.json";
import typesDeblais from "../data/types_deblais.json";

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

// Types de chantiers disponibles
const typesChantiers = [
  { id: "enrobes",      label: "🟡 Mise en oeuvre enrobés" },
  { id: "beton",        label: "⚪ Apport de béton sec" },
  { id: "terrassement", label: "🟤 Terrassement / Évacuation déblais" },
  { id: "materiau",     label: "🟠 Apport de matériau" },
  { id: "fraisat",      label: "⚫ Rabotage de chaussée (Fraisat)" },
  { id: "multi_flux",   label: "🔀 Chantier multi-flux" },
];

const formInitial = {
  typeChantier: "",
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
  typeDeblai: "",
  tonnage: "",
  heureDebut: "",
  heureFin: "",
  typeCamion: "8x4",
  typeTrajet: "urbain",
  rotationsIllimitees: false,
  nbCamionsImpose: "",
  nbCamionsImposeActif: false,
};

function FormulaireChantier({ onAjoutChantier, chantierAModifier, onModifierChantier }) {
  const [form, setForm] = useState(chantierAModifier ?? formInitial);
  const [etape, setEtape] = useState("saisie");
  const [optionsComparatif, setOptionsComparatif] = useState([]);
  const [nbColasParOption, setNbColasParOption] = useState({});
  const [resultat, setResultat] = useState(null);
  const [zoneDetectee, setZoneDetectee] = useState(null);

  // Pré-remplir le formulaire si un chantier est à modifier
  useEffect(() => {
    if (chantierAModifier) {
      setForm(chantierAModifier);
      setEtape("saisie");
      setZoneDetectee(null);
    }
  }, [chantierAModifier]);

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

  const soumettre = (chantier) => {
    if (chantierAModifier && onModifierChantier) {
      onModifierChantier(chantier);
    } else if (onAjoutChantier) {
      onAjoutChantier(chantier);
    }
  };

  const handleValider = () => {
    if (!form.typeChantier) { alert("Merci de sélectionner un type de chantier"); return; }
    if (!form.conducteur || !form.date || !form.nomChantier || !form.tonnage) { alert("Merci de remplir tous les champs obligatoires (*)"); return; }
    if (!form.heureDebut || !form.heureFin) { alert("Merci de renseigner les heures de début et de fin"); return; }
    if (!form.lat || !form.lng) { alert("Merci de renseigner les coordonnées GPS du chantier"); return; }

    // Terrassement
    if (form.typeChantier === "terrassement") {
      if (!form.typeDeblai) { alert("Merci de sélectionner un type de déblai"); return; }
      if (!form.centrale) { alert("Merci de sélectionner une centrale de décharge"); return; }
      const chantier = { ...form, id: form.id ?? Date.now() };
      setResultat(chantier);
      soumettre(chantier);
      setEtape("confirme");
      return;
    }

    // Béton
    if (form.typeChantier === "beton") {
      if (!form.centrale) { alert("Merci de sélectionner une centrale béton"); return; }
      const chantier = {
        ...form,
        id: form.id ?? Date.now(),
        volumeM3: parseFloat(form.tonnage),
        tonnage: parseFloat(form.tonnage) * 2.5,
      };
      setResultat(chantier);
      soumettre(chantier);
      setEtape("confirme");
      return;
    }

    // Fraisat
    if (form.typeChantier === "fraisat") {
      if (form.centraleImposee && !form.centrale) { alert("Merci de sélectionner une centrale fraisat"); return; }
      const options = comparerCentralesFraisat({ ...form }, 0);
      if (options.length === 0) { alert("Aucune centrale disponible pour le fraisat dans cette zone."); return; }
      const initColas = {};
      options.forEach(o => { initColas[o.centraleId] = 0; });
      setNbColasParOption(initColas);
      setOptionsComparatif(options);
      setEtape("comparatif");
      return;
    }

    // Enrobés
    if (form.typeChantier === "enrobes") {
      if (!form.typeEnrobe) { alert("Merci de sélectionner une formule d'enrobé"); return; }
      if (form.centraleImposee && !form.centrale) { alert("Merci de sélectionner une centrale (centrale imposée)"); return; }
      const options = comparerCentrales({ ...form, formule: form.typeEnrobe }, 0);
      if (options.length === 0) { alert("Aucune centrale ne produit cette formule. Vérifiez votre sélection."); return; }
      const initColas = {};
      options.forEach((o) => { initColas[o.centraleId] = 0; });
      setNbColasParOption(initColas);
      setOptionsComparatif(options);
      setEtape("comparatif");
      return;
    }

    // Matériau
if (form.typeChantier === "materiau") {
  if (!form.centrale) {
    alert("Merci de sélectionner une centrale d'apport");
    return;
  }
  const chantier = { ...form, id: form.id ?? Date.now() };
  setResultat(chantier);
  soumettre(chantier);
  setEtape("confirme");
  return;
}

    // Autres types
    const chantier = { ...form, id: form.id ?? Date.now() };
    setResultat(chantier);
    soumettre(chantier);
    setEtape("confirme");
  };

  const handleSliderChange = (centraleId, nbColas) => {
    setNbColasParOption((prev) => ({ ...prev, [centraleId]: parseInt(nbColas) }));
    const options = form.typeChantier === "fraisat"
      ? comparerCentralesFraisat({ ...form }, parseInt(nbColas))
      : comparerCentrales({ ...form, formule: form.typeEnrobe }, parseInt(nbColas));
    setOptionsComparatif(options);
  };

  const handleChoisirOption = (option) => {
    const chantier = {
      ...form,
      id: form.id ?? Date.now(),
      centrale: option.centraleId,
      centraleImposee: true,
      formule: option.formuleId ?? null,
      nbCamionsColas: nbColasParOption[option.centraleId] ?? 0,
      prixTonneRetenu: option.prixTonne ?? option.coutTonneNet,
      coutTotalRetenu: option.coutTotal,
    };
    setResultat(chantier);
    soumettre(chantier);
    setEtape("confirme");
  };

  const resetForm = () => {
    setEtape("saisie");
    setForm(formInitial);
    setZoneDetectee(null);
    setResultat(null);
  };

  const centraleTrouvee = centrales.find((c) => c.id === form.centrale);

  // ─── ETAPE COMPARATIF ───────────────────────────────────────────────────────
  if (etape === "comparatif") {
    return (
      <div className="formulaire">
        <h2>CHOIX DE LA CENTRALE</h2>
        <p className="info-centrale">
          📍 <strong>{form.nomChantier}</strong> — {form.tonnage}t
          {form.typeChantier === "enrobes" && ` de ${formules.find(f => f.id === form.typeEnrobe)?.nom}`}
          {form.typeChantier === "fraisat" && " de fraisat à évacuer"}
        </p>

        <div className="comparatif-liste">
          {optionsComparatif.map((option) => {
            const nbColas = nbColasParOption[option.centraleId] ?? 0;
            const nuit = form.chantierNuit ?? false;
            const typeCamion = camions.find(t => t.id === form.typeCamion);
            const nbLocatiers = option.nbCamions - nbColas;
            const prixCamion = nuit ? typeCamion?.prix_colas_nuit : typeCamion?.prix_colas_jour;
            const prixLocatier = nuit ? typeCamion?.prix_locatier_nuit : typeCamion?.prix_locatier_jour;
            const coutCamions = (nbColas * (prixCamion ?? 0)) + (nbLocatiers * (prixLocatier ?? 0));
            const revenuFraisat = form.typeChantier === "fraisat"
              ? (parseFloat(form.tonnage) * Math.abs(option.prixRachatTonne ?? 0))
              : 0;
            const coutTotal = form.typeChantier === "fraisat"
              ? coutCamions - revenuFraisat
              : (option.detail?.coutMatiere ?? 0) + coutCamions;
            const prixTonne = form.typeChantier === "fraisat"
              ? option.coutTonneNet
              : Math.round(coutTotal / parseFloat(form.tonnage));

            return (
              <div key={option.centraleId} className="comparatif-card">
                <div className="comparatif-header">
                  <div>
                    <strong>{option.centraleNom}</strong>
                    <span className="comparatif-distance"> · {option.distanceKm} km</span>
                  </div>
                  <div className="comparatif-prix-tonne">{prixTonne}€/t</div>
                </div>
                <div className="comparatif-formule">
                  {form.typeChantier === "fraisat" ? (
                    <span>Rachat fraisat : <strong>{option.prixRachatTonne}€/t</strong></span>
                  ) : (
                    <>
                      {option.numero && <span className="comparatif-numero">{option.numero}</span>}
                      {option.formuleNom}
                      <span className="comparatif-prix-matiere"> · {option.detail?.prixTonneMatiere}€/t matière</span>
                    </>
                  )}
                </div>
                <div className="comparatif-camions">
                  <span>🚛 {option.nbCamions} camion(s) nécessaires</span>
                </div>
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
                <div className="comparatif-detail">
                  {form.typeChantier === "fraisat" ? (
                    <>
                      <div>Transport : <strong>{coutCamions.toLocaleString("fr-FR")}€</strong></div>
                      <div>Rachat fraisat : <strong>− {revenuFraisat.toLocaleString("fr-FR")}€</strong></div>
                      <div>Total net : <strong>{coutTotal.toLocaleString("fr-FR")}€</strong></div>
                    </>
                  ) : (
                    <>
                      <div>Matière : <strong>{(option.detail?.coutMatiere ?? 0).toLocaleString("fr-FR")}€</strong></div>
                      <div>Transport : <strong>{coutCamions.toLocaleString("fr-FR")}€</strong></div>
                      <div>Total : <strong>{coutTotal.toLocaleString("fr-FR")}€</strong></div>
                    </>
                  )}
                </div>
                <button className="btn-choisir" onClick={() => handleChoisirOption(option)}>
                  ✅ Choisir cette centrale
                </button>
              </div>
            );
          })}
        </div>
        <button className="btn-retour" onClick={() => setEtape("saisie")}>
          ← Modifier la saisie
        </button>
      </div>
    );
  }

  // ─── ETAPE CONFIRMATION ─────────────────────────────────────────────────────
  if (etape === "confirme") {
    return (
      <div className="formulaire">
        <h2>{chantierAModifier ? "✅ CHANTIER MODIFIÉ" : "✅ BESOIN ENREGISTRÉ"}</h2>
        <div className="resultat">
          <p>📅 Date : <strong>{resultat.date}</strong></p>
          <p>👷 CdT : <strong>{resultat.conducteur}</strong></p>
          <p>📍 Chantier : <strong>{resultat.nomChantier}</strong></p>
          <p>🏷️ Type : <strong>{typesChantiers.find(t => t.id === resultat.typeChantier)?.label}</strong></p>
          {resultat.typeChantier === "enrobes" && (
            <>
              <p>🏭 Centrale : <strong>{centrales.find(c => c.id === resultat.centrale)?.nom}</strong></p>
              <p>📦 Tonnage : <strong>{resultat.tonnage}t</strong> de <strong>{formules.find(f => f.id === resultat.typeEnrobe)?.nom}</strong></p>
              <p>💰 Prix retenu : <strong>{resultat.prixTonneRetenu}€/t</strong> — Total : <strong>{resultat.coutTotalRetenu?.toLocaleString("fr-FR")}€</strong></p>
            </>
          )}
          {resultat.typeChantier === "fraisat" && (
            <>
              <p>🏭 Centrale fraisat : <strong>{centrales.find(c => c.id === resultat.centrale)?.nom}</strong></p>
              <p>📦 Fraisat évacué : <strong>{resultat.tonnage}t</strong></p>
              <p>💰 Coût net retenu : <strong>{resultat.coutTotalRetenu?.toLocaleString("fr-FR")}€</strong></p>
            </>
          )}
          {resultat.typeChantier === "beton" && (
            <>
              <p>🏭 Centrale béton : <strong>{centrales.find(c => c.id === resultat.centrale)?.nom}</strong></p>
              <p>📦 Volume : <strong>{resultat.volumeM3}m³</strong> — <strong>{resultat.tonnage}t</strong></p>
            </>
          )}
          {resultat.typeChantier === "terrassement" && (
            <>
              <p>🏭 Centrale décharge : <strong>{centrales.find(c => c.id === resultat.centrale)?.nom}</strong></p>
              <p>🟤 Type déblai : <strong>{typesDeblais.find(t => t.id === resultat.typeDeblai)?.label}</strong></p>
              <p>📦 Tonnage : <strong>{resultat.tonnage}t</strong></p>
            </>
          )}
{resultat.typeChantier === "materiau" && (
  <>
    <p>🏭 Centrale : <strong>{centrales.find(c => c.id === resultat.centrale)?.nom}</strong></p>
    <p>📦 Tonnage : <strong>{resultat.tonnage}t</strong></p>
  </>
)}
          {resultat.typeChantier !== "enrobes" && resultat.typeChantier !== "fraisat" &&
           resultat.typeChantier !== "beton" && resultat.typeChantier !== "terrassement" && (
            <p>📦 Tonnage : <strong>{resultat.tonnage}t</strong></p>
          )}
          <p>🚛 Camions : <strong>{resultat.typeCamion}</strong></p>
        </div>
        {!chantierAModifier && (
          <button className="btn-valider" onClick={resetForm}>
            ➕ Ajouter un autre chantier
          </button>
        )}
      </div>
    );
  }

  // ─── ETAPE SAISIE ───────────────────────────────────────────────────────────
  return (
    <div className="formulaire">
      <h2>{chantierAModifier ? "✏️ MODIFIER LE CHANTIER" : "SAISIE DES BESOINS"}</h2>

      {/*─── TYPE DE CHANTIER ── */}
      <div className="form-section">
        <h3>Type de chantier *</h3>
        <div className="toggle-group" style={{ flexWrap: "wrap" }}>
          {typesChantiers.map((t) => (
            <button
              key={t.id}
              type="button"
              className={form.typeChantier === t.id ? "toggle-btn actif" : "toggle-btn"}
              onClick={() => setForm({ ...form, typeChantier: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!form.typeChantier && (
          <p className="info-centrale">Sélectionnez un type de chantier pour continuer</p>
        )}
        {form.typeChantier && 
         form.typeChantier !== "enrobes" && 
         form.typeChantier !== "fraisat" && 
         form.typeChantier !== "terrassement" && 
         form.typeChantier !== "beton" && (
          <p className="info-centrale">⚠️ Ce type de chantier est en cours de développement — seul le calcul de base sera effectué</p>
        )}
      </div>

      {form.typeChantier && (
        <>
          <div className="form-section">
            <h3>Identification</h3>
            <div className="form-row">
              <label>Conducteur de travaux * </label>
              <select name="conducteur" value={form.conducteur} onChange={handleChange}>
                <option value="">-- Sélectionner --</option>
                {ctx.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
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
              <input type="text" name="nomChantier" value={form.nomChantier} onChange={handleChange} placeholder="Ex: RD6007 - Vallauris" />
            </div>
            <div className="form-row">
              <label>Adresse </label>
              <input type="text" name="adresseChantier" value={form.adresseChantier} onChange={handleChange} placeholder="Ex: Av. de la Liberté" />
            </div>
            <div className="form-row">
              <label>Coordonnées GPS (Google Maps) * </label>
              <input type="text" name="coordonnees" value={form.coordonnees} onChange={handleChange} placeholder="Ex: 43.6580, 7.1220" />
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
                <button type="button" className={!form.chantierNuit ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, chantierNuit: false })}>
                  ☀️ Chantier de jour
                </button>
                <button type="button" className={form.chantierNuit ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, chantierNuit: true })}>
                  🌙 Chantier de nuit
                </button>
              </div>
            </div>
            <div className="form-row">
              <label>Type de trajet *</label>
              <div className="toggle-group">
                <button type="button" className={form.typeTrajet === "urbain" ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, typeTrajet: "urbain" })}>
                  🏙️ Urbain
                </button>
                <button type="button" className={form.typeTrajet === "montagne" ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, typeTrajet: "montagne" })}>
                  🏔️ Montagne
                </button>
                <button type="button" className={form.typeTrajet === "autoroute" ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, typeTrajet: "autoroute" })}>
                  🛣️ Autoroute
                </button>
              </div>
            </div>
          </div>

          {/*─── SECTION SPÉCIFIQUE ENROBÉS ─── */}
          {form.typeChantier === "enrobes" && (
            <div className="form-section">
              <h3>Commande enrobés</h3>
              <div className="form-row">
                <label>Formule * </label>
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
                  <button type="button" className={form.centraleImposee ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, centraleImposee: true })}>
                    🔒 Centrale imposée
                  </button>
                  <button type="button" className={!form.centraleImposee ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, centraleImposee: false })}>
                    💡 Centrale suggérée
                  </button>
                </div>
                {form.centraleImposee
                  ? <p className="info-centrale">⚠️ L'algorithme respectera cette centrale (formule spécifique)</p>
                  : <p className="info-centrale">✅ L'algorithme optimisera la centrale via le tableau comparatif</p>
                }
              </div>
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
          )}

          {/*─── SECTION SPÉCIFIQUE FRAISAT ─── */}
          {form.typeChantier === "fraisat" && (
            <div className="form-section">
              <h3>Rabotage — Évacuation fraisat</h3>
              <div className="form-row">
                <label>Tonnage de fraisat à évacuer (t) *</label>
                <input type="number" name="tonnage" value={form.tonnage} onChange={handleChange} placeholder="Ex: 150" min="1" />
              </div>
              <div className="form-row">
                <label>Heure de début rabotage *</label>
                <input type="time" name="heureDebut" value={form.heureDebut} onChange={handleChange} />
              </div>
              <div className="form-row">
                <label>Heure de fin *</label>
                <input type="time" name="heureFin" value={form.heureFin} onChange={handleChange} />
              </div>
              <div className="form-row">
                <label>Contrainte centrale fraisat</label>
                <div className="toggle-group">
                  <button type="button" className={form.centraleImposee ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, centraleImposee: true })}>
                    🔒 Centrale imposée
                  </button>
                  <button type="button" className={!form.centraleImposee ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, centraleImposee: false })}>
                    💡 Centrale suggérée
                  </button>
                </div>
              </div>
              {form.centraleImposee && (
                <div className="form-row">
                  <label>Centrale fraisat *</label>
                  <select name="centrale" value={form.centrale} onChange={handleChange}>
                    <option value="">-- Sélectionner --</option>
                    {centrales.filter(c => c.deblais_acceptes?.includes("fraisat")).map(c => (
                      <option key={c.id} value={c.id}>{c.nom} — {c.localisation}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/*─── SECTION SPÉCIFIQUE BÉTON ─── */}
          {form.typeChantier === "beton" && (
            <div className="form-section">
              <h3>Apport de béton sec</h3>
              <div className="form-row">
                <label>Volume / Cubage nécessaire (m³) *</label>
                <input type="number" name="tonnage" value={form.tonnage} onChange={handleChange} placeholder="Ex: 30" min="1" />
                {form.tonnage && (
                  <div className="info-centrale">
                    ⚖️ Équivalent : <strong>{Math.round(parseFloat(form.tonnage) * 2.5 * 10) / 10}t</strong> (densité béton = 2.5 t/m³)
                  </div>
                )}
              </div>
              <div className="form-row">
                <label>Heure de début *</label>
                <input type="time" name="heureDebut" value={form.heureDebut} onChange={handleChange} />
              </div>
              <div className="form-row">
                <label>Heure de fin *</label>
                <input type="time" name="heureFin" value={form.heureFin} onChange={handleChange} />
              </div>
              <div className="form-row">
                <label>Centrale béton *</label>
                <select name="centrale" value={form.centrale} onChange={handleChange}>
                  <option value="">-- Sélectionner --</option>
                  {centrales.filter(c => c.materiaux_disponibles?.includes("beton_bordures")).map(c => (
                    <option key={c.id} value={c.id}>{c.nom} — {c.localisation}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/*─── SECTION SPÉCIFIQUE TERRASSEMENT ─── */}
          {form.typeChantier === "terrassement" && (
            <div className="form-section">
              <h3>Terrassement / Évacuation déblais</h3>
              <div className="form-row">
                <label>Type de déblai *</label>
                <select name="typeDeblai" value={form.typeDeblai} onChange={handleChange}>
                  <option value="">-- Sélectionner --</option>
                  {typesDeblais.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>Tonnage nécessaire (t) *</label>
                <input type="number" name="tonnage" value={form.tonnage} onChange={handleChange} placeholder="Ex: 200" min="1" />
              </div>
              <div className="form-row">
                <label>Heure de début *</label>
                <input type="time" name="heureDebut" value={form.heureDebut} onChange={handleChange} />
              </div>
              <div className="form-row">
                <label>Heure de fin *</label>
                <input type="time" name="heureFin" value={form.heureFin} onChange={handleChange} />
              </div>
              {form.typeDeblai && (
                <div className="form-row">
                  <label>Centrale de décharge *</label>
                  <select name="centrale" value={form.centrale} onChange={handleChange}>
                    <option value="">-- Sélectionner --</option>
                    {centrales.filter(c => c.deblais_acceptes?.includes(form.typeDeblai)).map(c => (
                      <option key={c.id} value={c.id}>{c.nom} — {c.localisation}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

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

            {form.typeChantier === "materiau" && (
  <div className="form-section">
    <h3>Apport de matériau</h3>
    <div className="form-row">
      <label>Tonnage nécessaire (t) *</label>
      <input type="number" name="tonnage" value={form.tonnage} onChange={handleChange} placeholder="Ex: 200" min="1" />
    </div>
    <div className="form-row">
      <label>Heure de début *</label>
      <input type="time" name="heureDebut" value={form.heureDebut} onChange={handleChange} />
    </div>
    <div className="form-row">
      <label>Heure de fin *</label>
      <input type="time" name="heureFin" value={form.heureFin} onChange={handleChange} />
    </div>
    <div className="form-row">
      <label>Centrale d'apport *</label>
      <select name="centrale" value={form.centrale} onChange={handleChange}>
        <option value="">-- Sélectionner --</option>
        {centrales.map(c => (
          <option key={c.id} value={c.id}>{c.nom} — {c.localisation}</option>
        ))}
      </select>
    </div>
  </div>
)}

            {(form.typeChantier === "enrobes" || form.typeChantier === "fraisat" ||
  form.typeChantier === "beton" || form.typeChantier === "terrassement" ||
  form.typeChantier === "materiau") && (
              <div className="form-row">
                <label>Rotations par camion</label>
                <div className="toggle-group">
                  <button type="button" className={!form.rotationsIllimitees ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, rotationsIllimitees: false })}>
                    📊 Standard (max {form.typeChantier === "enrobes" || form.typeChantier === "fraisat" ? "3" : "4"})
                  </button>
                  <button type="button" className={form.rotationsIllimitees ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, rotationsIllimitees: true })}>
                    🔓 Illimité
                  </button>
                </div>
                {!form.rotationsIllimitees && (
                  <p className="info-centrale">
                    Maximum {form.typeChantier === "enrobes" || form.typeChantier === "fraisat" ? "3" : "4"} rotations/camion — sauf si centrale à moins de 15 min
                  </p>
                )}
              </div>
            )}

            <div className="form-row">
              <label>Nombre de camions</label>
              <div className="toggle-group">
                <button type="button" className={!form.nbCamionsImposeActif ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, nbCamionsImposeActif: false, nbCamionsImpose: "" })}>
                  🤖 Calculé automatiquement
                </button>
                <button type="button" className={form.nbCamionsImposeActif ? "toggle-btn actif" : "toggle-btn"} onClick={() => setForm({ ...form, nbCamionsImposeActif: true })}>
                  🔒 Imposé
                </button>
              </div>
              {form.nbCamionsImposeActif && (
                <input type="number" name="nbCamionsImpose" value={form.nbCamionsImpose} onChange={handleChange} placeholder="Ex: 2" min="1" style={{ marginTop: "0.5rem" }} />
              )}
            </div>

            {form.tonnage && (
              <div className="info-calcul">
                🚛 Rotations nécessaires : <strong>
                  {Math.ceil(
                    (form.typeChantier === "beton" ? parseFloat(form.tonnage) * 2.5 : parseFloat(form.tonnage))
                    / (camions.find(t => t.id === form.typeCamion)?.tonnage_utile ?? 1)
                  )}
                </strong> au total — l'algorithme calculera le nombre de camions optimal
              </div>
            )}
          </div>

          <button className="btn-valider" onClick={handleValider}>
            {form.typeChantier === "enrobes" || form.typeChantier === "fraisat"
              ? "➡️ Voir les options de centrale"
              : chantierAModifier ? "✅ Enregistrer les modifications" : "✅ Valider le besoin"}
          </button>
        </>
      )}
    </div>
  );
}

export default FormulaireChantier;
