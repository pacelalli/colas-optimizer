// Carte des chantiers validés — pins colorés par conducteur, sélecteur de date,
// panneau d'infos au clic. Agences (jaune) et centrales (gris) restent affichées.
import { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import centrales from "../data/centrales.json";
import { analyserCompatibilites } from "../utils/scoreCompatibilite";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ─── FABRIQUE D'ICÔNES (couleurs leaflet-color-markers) ──────────────────────
const cacheIcones = {};
function makeIcon(couleur) {
  if (cacheIcones[couleur]) return cacheIcones[couleur];
  const icon = new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${couleur}.png`,
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
  });
  cacheIcones[couleur] = icon;
  return icon;
}
const iconAgence = makeIcon("gold");
const iconCentrale = makeIcon("grey");

// Palette pour les conducteurs (on évite gold/grey, réservés agences/centrales)
const PALETTE = [
  { marqueur: "blue",   hex: "#2A81CB" },
  { marqueur: "red",    hex: "#CB2B3E" },
  { marqueur: "green",  hex: "#2AAD27" },
  { marqueur: "violet", hex: "#9C2BCB" },
  { marqueur: "orange", hex: "#CB8427" },
  { marqueur: "black",  hex: "#3D3D3D" },
];

// ─── AGENCES COLAS AM ────────────────────────────────────────────────────────
const agences = [
  { id: "carros",  nom: "Agence Carros",  lat: 43.7889, lng: 7.1856, adresse: "ZA de la Grave, 06510 Carros" },
  { id: "pegomas", nom: "Agence Pégomas", lat: 43.5953, lng: 6.9320, adresse: "Route de la Fénerie, 06580 Pégomas" },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const TYPES = {
  enrobes: "Mise en œuvre enrobés",
  beton: "Apport de béton sec",
  terrassement: "Terrassement / Évacuation",
  materiau: "Apport de matériau",
  rabotage: "Rabotage (Fraisat)",
  multiflux: "Chantier multi-flux",
};

function getCoords(c) {
  if (typeof c.lat === "number" && typeof c.lng === "number") return [c.lat, c.lng];
  if (typeof c.coordonnees === "string") {
    const [a, b] = c.coordonnees.split(",").map((s) => parseFloat(s.trim()));
    if (!isNaN(a) && !isNaN(b)) return [a, b];
  }
  return null;
}

function formatDateFr(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function nomCentrale(id) {
  const c = centrales.find((x) => x.id === id);
  return c ? c.nom : (id || "—");
}

// Libellés lisibles des codes matériaux / déblais (les codes déjà lisibles passent tels quels)
const LABELS_MATERIAUX = {
  enrobes: "Enrobés",
  enrobes_froids: "Enrobés froids",
  beton_bordures: "Béton bordures",
  sables_graves_recycles: "Sables & graves recyclés",
};
const LABELS_DEBLAIS = {
  fraisat: "Fraisat",
  croutes_enrobe: "Croûtes d'enrobé",
  beton_pierre: "Béton / pierre",
  fraisat_hap_recyclable_froid: "Fraisat HAP (recyclable froid)",
  terre_non_vegetale_non_pollue: "Terre non végétale non polluée",
};
const labelMateriau = (code) => LABELS_MATERIAUX[code] || code;
const labelDeblai = (code) => LABELS_DEBLAIS[code] || code;

// Ajuste la vue aux chantiers visibles
function AjusterVue({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points && points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
    }
  }, [points, map]);
  return null;
}

// ─── COMPOSANT ───────────────────────────────────────────────────────────────
function Carte({ chantiers = [], optimisationsAppliquees = [] }) {
  const [dateFiltre, setDateFiltre] = useState("all");
  const [selection, setSelection] = useState(null);

  // chantiers géolocalisables
  const chantiersGeo = useMemo(
    () => chantiers.map((c) => ({ ...c, _coords: getCoords(c) })).filter((c) => c._coords),
    [chantiers]
  );

  // couleur par conducteur (déterministe)
  const couleurParConducteur = useMemo(() => {
    const conducteurs = [...new Set(chantiersGeo.map((c) => c.conducteur).filter(Boolean))].sort();
    const map = {};
    conducteurs.forEach((cdt, i) => { map[cdt] = PALETTE[i % PALETTE.length]; });
    return map;
  }, [chantiersGeo]);

  // dates disponibles
  const datesDispo = useMemo(
    () => [...new Set(chantiersGeo.map((c) => c.date).filter(Boolean))].sort(),
    [chantiersGeo]
  );

  // chantiers visibles selon le filtre date
  const visibles = useMemo(
    () => (dateFiltre === "all" ? chantiersGeo : chantiersGeo.filter((c) => c.date === dateFiltre)),
    [chantiersGeo, dateFiltre]
  );

  const points = useMemo(() => visibles.map((c) => c._coords), [visibles]);

  // paires de chantiers compatibles (score ≥ 2) parmi les chantiers visibles → traits roses
  const relations = useMemo(() => analyserCompatibilites(visibles).pertinentes, [visibles]);

  const changerDate = (e) => { setDateFiltre(e.target.value); setSelection(null); };

  return (
    <div className="formulaire">
      <h2>Carte des chantiers</h2>

      {/* ─── Barre : sélecteur de date ─── */}
      <div className="carte-barre">
        <label htmlFor="carte-date">Date</label>
        <select id="carte-date" value={dateFiltre} onChange={changerDate}>
          <option value="all">Toutes les dates</option>
          {datesDispo.map((d) => (
            <option key={d} value={d}>{formatDateFr(d)}</option>
          ))}
        </select>
        <span className="carte-compte">
          {visibles.length} chantier{visibles.length > 1 ? "s" : ""} affiché{visibles.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* ─── Carte + panneau ─── */}
      <div className="carte-layout">
        <div className="carte-map">
          <MapContainer center={[43.7102, 7.262]} zoom={9} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap"
            />

            <AjusterVue points={points} />

            {/* RELATIONS DE COMPATIBILITÉ (traits roses, sous les pins) */}
            {relations.map((r, i) => {
              const estAppliquee =
                optimisationsAppliquees.includes(`${r.a.id}->${r.b.id}`) ||
                optimisationsAppliquees.includes(`${r.b.id}->${r.a.id}`);
              return (
                <Polyline
                  key={`rel-${i}`}
                  positions={[r.a._coords, r.b._coords]}
                  pathOptions={{
                    color: "#E6007E",
                    weight: estAppliquee ? 4 : r.score >= 4 ? 3 : 2,
                    opacity: estAppliquee ? 1 : 0.8,
                    dashArray: estAppliquee ? null : "6 5",
                  }}
                >
                  <Tooltip direction="center" className="label-relation">
                    {estAppliquee ? "✓ Appliquée · " : ""}Compatibilité {r.score}/4
                  </Tooltip>
                </Polyline>
              );
            })}

            {/* AGENCES (jaune) */}
            {agences.map((a) => (
              <Marker key={a.id} position={[a.lat, a.lng]} icon={iconAgence}>
                <Tooltip permanent direction="top" offset={[0, -38]} className="label-agence">{a.nom}</Tooltip>
                <Popup><strong>{a.nom}</strong><br />{a.adresse}</Popup>
              </Marker>
            ))}

            {/* CENTRALES (gris) */}
            {centrales.filter((c) => c.lat && c.lng).map((c) => {
              const estEnrobes = c.type === "enrobes_chaud" || (c.materiaux_disponibles || []).includes("enrobes");
              const mats = c.materiaux_disponibles || [];
              const deblais = c.deblais_acceptes || [];
              const accepteFraisat = deblais.some((x) => x.startsWith("fraisat"));
              return (
                <Marker key={c.id} position={[c.lat, c.lng]} icon={iconCentrale}>
                  <Popup>
                    <strong>{c.nom}</strong><br />{c.localisation}
                    {c.propriete ? <><br />{c.propriete}</> : null}
                    {estEnrobes ? (
                      <><br />Fraisat : {accepteFraisat ? "✓ Oui" : "✗ Non"}</>
                    ) : (
                      <>
                        <br />Matériaux : {mats.length ? mats.map(labelMateriau).join(", ") : "—"}
                        {deblais.length > 0 && (
                          <><br />Déblais acceptés : {deblais.map(labelDeblai).join(", ")}</>
                        )}
                      </>
                    )}
                  </Popup>
                </Marker>
              );
            })}

            {/* CHANTIERS (couleur par conducteur) */}
            {visibles.map((c) => {
              const couleur = couleurParConducteur[c.conducteur] || PALETTE[0];
              const estSelectionne = selection && selection.id === c.id;
              return (
                <Marker
                  key={c.id}
                  position={c._coords}
                  icon={makeIcon(couleur.marqueur)}
                  zIndexOffset={estSelectionne ? 1000 : 0}
                  eventHandlers={{ click: () => setSelection(c) }}
                >
                  <Tooltip permanent direction="top" offset={[0, -38]} className="label-chantier">
                    {c.nomChantier}
                  </Tooltip>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {/* ─── PANNEAU DROIT ─── */}
        <aside className="carte-panel">
          {selection ? (
            <>
              <button className="carte-retour" onClick={() => setSelection(null)}>← Retour</button>
              <div className="carte-panel-titre">{selection.nomChantier}</div>
              <div className="carte-panel-sous">
                <span
                  className="carte-pastille"
                  style={{ background: (couleurParConducteur[selection.conducteur] || PALETTE[0]).hex }}
                />
                {selection.conducteur}
              </div>

              <div className="carte-detail-ligne">
                <span className="carte-detail-label">Date</span>
                <span>{formatDateFr(selection.date)}</span>
              </div>
              <div className="carte-detail-ligne">
                <span className="carte-detail-label">Type</span>
                <span>{TYPES[selection.typeChantier] || selection.typeChantier}</span>
              </div>
              <div className="carte-detail-ligne">
                <span className="carte-detail-label">Période</span>
                <span>{selection.chantierNuit ? "Nuit" : "Jour"}{selection.heureDebut ? ` · ${selection.heureDebut} → ${selection.heureFin}` : ""}</span>
              </div>
              {selection.adresseChantier && (
                <div className="carte-detail-ligne">
                  <span className="carte-detail-label">Adresse</span>
                  <span>{selection.adresseChantier}</span>
                </div>
              )}
              <div className="carte-detail-ligne">
                <span className="carte-detail-label">Coordonnées</span>
                <span>{selection._coords[0].toFixed(4)}, {selection._coords[1].toFixed(4)}</span>
              </div>
              {selection.tonnage && (
                <div className="carte-detail-ligne">
                  <span className="carte-detail-label">Tonnage</span>
                  <span>{selection.tonnage} t</span>
                </div>
              )}
              {selection.typeCamion && (
                <div className="carte-detail-ligne">
                  <span className="carte-detail-label">Camion</span>
                  <span>{selection.typeCamion}</span>
                </div>
              )}
              <div className="carte-detail-ligne">
                <span className="carte-detail-label">Centrale</span>
                <span>{nomCentrale(selection.centrale)}</span>
              </div>
              {selection.prixTonneRetenu != null && (
                <div className="carte-detail-ligne">
                  <span className="carte-detail-label">Prix retenu</span>
                  <span>{selection.prixTonneRetenu} €/t{selection.coutTotalRetenu ? ` · ${selection.coutTotalRetenu.toLocaleString("fr-FR")} €` : ""}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="carte-legende-titre">Conducteurs de travaux</div>
              {Object.keys(couleurParConducteur).length === 0 ? (
                <p className="carte-panel-vide">Aucun chantier validé pour le moment. Saisissez un besoin pour le voir apparaître ici.</p>
              ) : (
                <>
                  {Object.entries(couleurParConducteur).map(([cdt, col]) => (
                    <div key={cdt} className="carte-legende-item">
                      <span className="carte-pastille" style={{ background: col.hex }} />
                      {cdt}
                    </div>
                  ))}
                  <div className="carte-legende-relation">
                    <span className="carte-trait-relation" />
                    Chantiers compatibles (score ≥ 2)
                  </div>
                  <p className="carte-panel-vide" style={{ marginTop: "0.9rem" }}>
                    Cliquez sur un pin pour voir les infos du chantier.
                  </p>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export default Carte;
