import { useState } from "react";
import centrales from "../data/centrales.json";
import { trouverZone, suggererCentrale } from "../utils/optimisation";

const ctx = [
  "ANTONIN Baptiste",
  "AZAIEZ Wajdi",
  "BESSIERE Flavien",
  "BOISSIN Victor",
  "FAUCHEUX Sébastien",
  "LEFLOCH Marion",
  "SARRAZY Thomas",
];

const typesCamions = [
  { id: "4x2", label: "Benne 4x2 (9t)", tonnage: 9 },
  { id: "8x4", label: "Benne 8x4 (17t)", tonnage: 17 },
  { id: "semi", label: "Semi-remorque (29t)", tonnage: 29 },
];

const typesEnrobes = ["BB0", "BB1", "BBSG", "EME", "GB", "Autre"];

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

  const handleSubmit = () => {
  if (!form.conducteur || !form.date || !form.nomChantier || !form.tonnage) {
    alert("Merci de remplir tous les champs obligatoires (*)");
    return;
  }
  if (form.centraleImposee && !form.centrale) {
    alert("Merci de sélectionner une centrale (centrale imposée)");
    return;
  }
  const chantier = { ...form, id: Date.now() };
  setResultat(chantier);
  if (onAjoutChantier) onAjoutChantier(chantier);
};

  const centraleTrouvee = centrales.find((c) => c.id === form.centrale);

  return (
    <div className="formulaire">
      <h2>Saisie des besoins</h2>

      <div className="form-section">
        <h3>Identification</h3>
        <div className="form-row">
          <label>Conducteur de travaux *</label>
          <select name="conducteur" value={form.conducteur} onChange={handleChange}>
            <option value="">-- Sélectionner --</option>
            {ctx.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Date du besoin *</label>
          <input type="date" name="date" value={form.date} onChange={handleChange} />
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
        <h3>Chantier</h3>
        <div className="form-row">
          <label>Nom du chantier *</label>
          <input
            type="text"
            name="nomChantier"
            value={form.nomChantier}
            onChange={handleChange}
            placeholder="Ex: RD6098 - Villeneuve-Loubet"
          />
        </div>
        <div className="form-row">
          <label>Adresse du chantier</label>
          <input
            type="text"
            name="adresseChantier"
            value={form.adresseChantier}
            onChange={handleChange}
            placeholder="Ex: RD6098, 06270 Villeneuve-Loubet"
          />
        </div>
        <div className="form-row">
          <label>Coordonnées GPS (copier-coller depuis Google Maps)</label>
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
      </div>

      <div className="form-section">
        <h3>Commande enrobés</h3>
        <div className="form-row">
          <label>Centrale *</label>
          <select name="centrale" value={form.centrale} onChange={handleChange}>
            <option value="">-- Sélectionner --</option>
            {centrales.map((c) => (
              <option key={c.id} value={c.id}>{c.nom} — {c.localisation}</option>
            ))}
          </select>
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
            : <p className="info-centrale">✅ L'algorithme pourra optimiser la centrale si nécessaire</p>
          }
        </div>
        {!form.centraleImposee && form.lat && form.lng && (
          <div className="info-centrale">
            💡 Centrale suggérée : <strong>
              {centrales.find(c => c.id === suggererCentrale(parseFloat(form.lat), parseFloat(form.lng)))?.nom}
            </strong>
          </div>
        )}
        {centraleTrouvee && (
          <div className="info-centrale">
            📍 {centraleTrouvee.adresse || centraleTrouvee.localisation} &nbsp;|&nbsp;
            Fraisat : {centraleTrouvee.fraisat === true ? "✅ Oui" : centraleTrouvee.fraisat === false ? "❌ Non" : "❓ Non renseigné"}
          </div>
        )}
        <div className="form-row">
          <label>Type d'enrobé</label>
          <select name="typeEnrobe" value={form.typeEnrobe} onChange={handleChange}>
            <option value="">-- Sélectionner --</option>
            {typesEnrobes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Tonnage nécessaire (t) *</label>
          <input type="number" name="tonnage" value={form.tonnage} onChange={handleChange} placeholder="Ex: 80" min="1" />
        </div>
        <div className="form-row">
          <label>Heure de début</label>
          <input type="time" name="heureDebut" value={form.heureDebut} onChange={handleChange} />
        </div>
        <div className="form-row">
          <label>Heure de fin</label>
          <input type="time" name="heureFin" value={form.heureFin} onChange={handleChange} />
        </div>
      </div>

      <div className="form-section">
        <h3>Camions</h3>
        <div className="form-row">
          <label>Type de camion souhaité</label>
          <select name="typeCamion" value={form.typeCamion} onChange={handleChange}>
            {typesCamions.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        {form.tonnage && (
          <div className="info-calcul">
            🚛 Rotations nécessaires : <strong>{Math.ceil(parseFloat(form.tonnage) / typesCamions.find(t => t.id === form.typeCamion).tonnage)}</strong> au total
            — l'algorithme calculera le nombre de camions optimal
          </div>
        )}
      </div>

      <button className="btn-valider" onClick={handleSubmit}>
        ✅ Valider le besoin
      </button>

      {resultat && (
        <div className="resultat">
          <h3>✅ Besoin enregistré</h3>
          <p>📅 Date : <strong>{resultat.date}</strong></p>
          <p>👷 CdT : <strong>{resultat.conducteur}</strong></p>
          <p>📍 Chantier : <strong>{resultat.nomChantier}</strong></p>
          <p>🏭 Centrale : <strong>{centrales.find(c => c.id === resultat.centrale)?.nom}</strong></p>
          <p>📦 Tonnage : <strong>{resultat.tonnage}t</strong> de <strong>{resultat.typeEnrobe || "?"}</strong></p>
          <p>🚛 Camions : <strong>{resultat.nbCamions} × {resultat.labelType}</strong></p>
          <p>🔄 Rotations : <strong>{resultat.nbRotations}</strong></p>
        </div>
      )}
    </div>
  );
}

export default FormulaireChantier;