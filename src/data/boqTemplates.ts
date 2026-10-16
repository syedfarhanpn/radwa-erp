/**
 * Sample BOQ line templates by project type.
 *
 * `ai*` values are **simulated demo suggestions** written into the seed data.
 * Nothing here was produced by a real AI model and the demo makes no claim
 * about model accuracy. The deltas between the AI column and the estimator
 * column exist purely to exercise the variance display.
 */

export interface BoqTemplateLine {
  itemCode: string;
  description: string;
  unit: string;
  aiQuantity: number | null;
  aiUnitRate: number | null;
  estimatorQuantity: number;
  estimatorUnitRate: number;
  note?: string;
}

const CIVIL: BoqTemplateLine[] = [
  { itemCode: "A-01", description: "Site clearance, grubbing and disposal of debris off site", unit: "m2", aiQuantity: 4200, aiUnitRate: 11.5, estimatorQuantity: 4450, estimatorUnitRate: 12.0, note: "Added 250 m2 for the eastern verge not shown on the drawings." },
  { itemCode: "A-02", description: "Excavation in ordinary soil for foundations, including shoring", unit: "m3", aiQuantity: 980, aiUnitRate: 42.0, estimatorQuantity: 1040, estimatorUnitRate: 46.5, note: "Rate uplift for dewatering allowance." },
  { itemCode: "A-03", description: "Backfilling with approved granular material, compacted in layers", unit: "m3", aiQuantity: 620, aiUnitRate: 38.0, estimatorQuantity: 640, estimatorUnitRate: 38.0 },
  { itemCode: "B-01", description: "Plain cement concrete blinding, 100mm thick, grade C15", unit: "m3", aiQuantity: 86, aiUnitRate: 320.0, estimatorQuantity: 88, estimatorUnitRate: 335.0 },
  { itemCode: "B-02", description: "Reinforced concrete to foundations, grade C40/20 sulphate resisting", unit: "m3", aiQuantity: 410, aiUnitRate: 505.0, estimatorQuantity: 426, estimatorUnitRate: 528.0 },
  { itemCode: "B-03", description: "High yield steel reinforcement, cut, bent and fixed", unit: "ton", aiQuantity: 52, aiUnitRate: 3250.0, estimatorQuantity: 55.5, estimatorUnitRate: 3480.0, note: "Market rate for rebar increased since the AI baseline was prepared." },
  { itemCode: "B-04", description: "Formwork to foundations and ground beams, including stripping", unit: "m2", aiQuantity: 1180, aiUnitRate: 74.0, estimatorQuantity: 1180, estimatorUnitRate: 78.0 },
  { itemCode: "C-01", description: "Precast concrete boundary wall panels, 2.4m high, incl. erection", unit: "m", aiQuantity: 340, aiUnitRate: 690.0, estimatorQuantity: 362, estimatorUnitRate: 712.0 },
  { itemCode: "C-02", description: "Blockwork, 200mm solid, in cement mortar incl. reinforcement", unit: "m2", aiQuantity: 760, aiUnitRate: 118.0, estimatorQuantity: 790, estimatorUnitRate: 122.0 },
  { itemCode: "D-01", description: "Interlock paving, 80mm, on compacted sand bed incl. kerbs", unit: "m2", aiQuantity: 1250, aiUnitRate: 135.0, estimatorQuantity: 1310, estimatorUnitRate: 141.0 },
  { itemCode: "D-02", description: "Storm water drainage, 300mm dia. uPVC incl. bedding and manholes", unit: "m", aiQuantity: 280, aiUnitRate: 395.0, estimatorQuantity: 295, estimatorUnitRate: 412.0 },
  { itemCode: "E-01", description: "Painting and protective coating to exposed concrete surfaces", unit: "m2", aiQuantity: 980, aiUnitRate: 29.0, estimatorQuantity: 1010, estimatorUnitRate: 31.0 },
  { itemCode: "P-01", description: "Site establishment, temporary facilities and site office", unit: "LS", aiQuantity: 1, aiUnitRate: 185000.0, estimatorQuantity: 1, estimatorUnitRate: 196000.0, note: "Includes the client-required separate inspection cabin." },
  { itemCode: "P-02", description: "As-built drawings, O&M manuals and handover dossier", unit: "LS", aiQuantity: null, aiUnitRate: null, estimatorQuantity: 1, estimatorUnitRate: 42000.0, note: "No AI suggestion available for this preliminaries item." },
];

const MECHANICAL: BoqTemplateLine[] = [
  { itemCode: "M-01", description: "Supply and install carbon steel pipe, 8in Sch 40, incl. fittings", unit: "m", aiQuantity: 640, aiUnitRate: 485.0, estimatorQuantity: 672, estimatorUnitRate: 512.0 },
  { itemCode: "M-02", description: "Supply and install stainless steel pipe, 4in Sch 10S", unit: "m", aiQuantity: 220, aiUnitRate: 740.0, estimatorQuantity: 228, estimatorUnitRate: 788.0 },
  { itemCode: "M-03", description: "Butt weld joints, 8in, incl. consumables and fit-up", unit: "no", aiQuantity: 185, aiUnitRate: 320.0, estimatorQuantity: 196, estimatorUnitRate: 345.0, note: "Weld count recounted from the isometrics." },
  { itemCode: "M-04", description: "Radiographic testing of welds, 10% coverage", unit: "no", aiQuantity: 19, aiUnitRate: 265.0, estimatorQuantity: 20, estimatorUnitRate: 280.0 },
  { itemCode: "M-05", description: "Supply and install gate valves, 8in, Class 150, flanged", unit: "no", aiQuantity: 14, aiUnitRate: 4850.0, estimatorQuantity: 14, estimatorUnitRate: 5120.0 },
  { itemCode: "M-06", description: "Pipe supports, fabricated and hot-dip galvanised", unit: "ton", aiQuantity: 9.5, aiUnitRate: 7400.0, estimatorQuantity: 10.2, estimatorUnitRate: 7850.0 },
  { itemCode: "M-07", description: "Surface preparation and three-coat epoxy painting system", unit: "m2", aiQuantity: 1450, aiUnitRate: 68.0, estimatorQuantity: 1520, estimatorUnitRate: 72.0 },
  { itemCode: "M-08", description: "Thermal insulation with aluminium cladding, 50mm", unit: "m2", aiQuantity: 780, aiUnitRate: 155.0, estimatorQuantity: 804, estimatorUnitRate: 162.0 },
  { itemCode: "M-09", description: "Hydrostatic testing, flushing and reinstatement", unit: "LS", aiQuantity: 1, aiUnitRate: 96000.0, estimatorQuantity: 1, estimatorUnitRate: 104000.0 },
  { itemCode: "M-10", description: "Mechanical completion, pre-commissioning and punch-list closeout", unit: "LS", aiQuantity: 1, aiUnitRate: 72000.0, estimatorQuantity: 1, estimatorUnitRate: 78000.0 },
  { itemCode: "M-11", description: "Scaffolding, erection, alteration and dismantling", unit: "m3", aiQuantity: 2100, aiUnitRate: 34.0, estimatorQuantity: 2340, estimatorUnitRate: 36.5, note: "Additional access required at the tank farm interface." },
  { itemCode: "M-12", description: "Shutdown standby crew and night-shift premium", unit: "LS", aiQuantity: null, aiUnitRate: null, estimatorQuantity: 1, estimatorUnitRate: 134000.0, note: "Client shutdown window is fixed; no AI baseline for this allowance." },
];

const ELECTRICAL: BoqTemplateLine[] = [
  { itemCode: "E-01", description: "Supply and install LV panel, 400A TPN, form 4 type 2", unit: "no", aiQuantity: 4, aiUnitRate: 26500.0, estimatorQuantity: 4, estimatorUnitRate: 28400.0 },
  { itemCode: "E-02", description: "XLPE/SWA/PVC cable, 4C x 95mm2, incl. glands and terminations", unit: "m", aiQuantity: 1850, aiUnitRate: 182.0, estimatorQuantity: 1940, estimatorUnitRate: 191.0 },
  { itemCode: "E-03", description: "Cable tray, 300mm hot-dip galvanised, incl. supports", unit: "m", aiQuantity: 920, aiUnitRate: 148.0, estimatorQuantity: 960, estimatorUnitRate: 155.0 },
  { itemCode: "E-04", description: "LED high-bay luminaire, 150W, IP65, incl. wiring", unit: "no", aiQuantity: 128, aiUnitRate: 1180.0, estimatorQuantity: 134, estimatorUnitRate: 1240.0 },
  { itemCode: "E-05", description: "Earthing and lightning protection system, complete", unit: "LS", aiQuantity: 1, aiUnitRate: 142000.0, estimatorQuantity: 1, estimatorUnitRate: 151000.0 },
  { itemCode: "E-06", description: "Fire alarm devices, addressable, incl. loop wiring", unit: "no", aiQuantity: 96, aiUnitRate: 740.0, estimatorQuantity: 102, estimatorUnitRate: 765.0 },
  { itemCode: "E-07", description: "Testing, commissioning and DEWA/authority inspection support", unit: "LS", aiQuantity: 1, aiUnitRate: 88000.0, estimatorQuantity: 1, estimatorUnitRate: 94000.0 },
  { itemCode: "E-08", description: "Containment and small power final circuits", unit: "point", aiQuantity: 240, aiUnitRate: 395.0, estimatorQuantity: 256, estimatorUnitRate: 410.0 },
];

const FIT_OUT: BoqTemplateLine[] = [
  { itemCode: "F-01", description: "Gypsum partition, 100mm, double skin, incl. insulation", unit: "m2", aiQuantity: 1120, aiUnitRate: 168.0, estimatorQuantity: 1165, estimatorUnitRate: 176.0 },
  { itemCode: "F-02", description: "Suspended mineral fibre ceiling, 600x600, incl. grid", unit: "m2", aiQuantity: 1480, aiUnitRate: 132.0, estimatorQuantity: 1510, estimatorUnitRate: 138.0 },
  { itemCode: "F-03", description: "Porcelain floor tiling, 600x600, incl. adhesive and grout", unit: "m2", aiQuantity: 980, aiUnitRate: 215.0, estimatorQuantity: 1010, estimatorUnitRate: 228.0 },
  { itemCode: "F-04", description: "Timber veneer doors, complete with frames and ironmongery", unit: "no", aiQuantity: 64, aiUnitRate: 2450.0, estimatorQuantity: 68, estimatorUnitRate: 2620.0 },
  { itemCode: "F-05", description: "Decorative painting to walls and ceilings, three coats", unit: "m2", aiQuantity: 3850, aiUnitRate: 34.0, estimatorQuantity: 3960, estimatorUnitRate: 36.0 },
  { itemCode: "F-06", description: "Joinery — reception counter and back wall feature", unit: "LS", aiQuantity: 1, aiUnitRate: 186000.0, estimatorQuantity: 1, estimatorUnitRate: 204000.0, note: "Client upgraded the stone selection during the site visit." },
  { itemCode: "F-07", description: "HVAC modification, ducting and diffuser relocation", unit: "LS", aiQuantity: 1, aiUnitRate: 265000.0, estimatorQuantity: 1, estimatorUnitRate: 279000.0 },
  { itemCode: "F-08", description: "Sanitary ware and associated plumbing connections", unit: "no", aiQuantity: 42, aiUnitRate: 1850.0, estimatorQuantity: 44, estimatorUnitRate: 1920.0 },
  { itemCode: "F-09", description: "Protection, progressive cleaning and final handover clean", unit: "LS", aiQuantity: null, aiUnitRate: null, estimatorQuantity: 1, estimatorUnitRate: 38500.0 },
];

const MAINTENANCE: BoqTemplateLine[] = [
  { itemCode: "S-01", description: "Mobilisation of shutdown crew, tools and consumables", unit: "LS", aiQuantity: 1, aiUnitRate: 118000.0, estimatorQuantity: 1, estimatorUnitRate: 126000.0 },
  { itemCode: "S-02", description: "Tank internal cleaning, sludge removal and gas freeing", unit: "m3", aiQuantity: 340, aiUnitRate: 420.0, estimatorQuantity: 368, estimatorUnitRate: 455.0, note: "Sludge volume revised after the site survey." },
  { itemCode: "S-03", description: "Blasting to SA 2.5 and recoating, internal floor and shell", unit: "m2", aiQuantity: 2250, aiUnitRate: 162.0, estimatorQuantity: 2340, estimatorUnitRate: 171.0 },
  { itemCode: "S-04", description: "Replacement of corroded shell plate sections, incl. NDT", unit: "ton", aiQuantity: 6.5, aiUnitRate: 9600.0, estimatorQuantity: 7.8, estimatorUnitRate: 10200.0, note: "Survey found more corrosion than the AI baseline assumed." },
  { itemCode: "S-05", description: "Valve overhaul, lapping and reinstatement", unit: "no", aiQuantity: 28, aiUnitRate: 2150.0, estimatorQuantity: 31, estimatorUnitRate: 2240.0 },
  { itemCode: "S-06", description: "Calibration of instruments and loop checks", unit: "no", aiQuantity: 46, aiUnitRate: 690.0, estimatorQuantity: 46, estimatorUnitRate: 720.0 },
  { itemCode: "S-07", description: "Waste disposal to approved facility with manifests", unit: "ton", aiQuantity: 120, aiUnitRate: 580.0, estimatorQuantity: 134, estimatorUnitRate: 605.0 },
  { itemCode: "S-08", description: "Demobilisation and site reinstatement", unit: "LS", aiQuantity: 1, aiUnitRate: 54000.0, estimatorQuantity: 1, estimatorUnitRate: 57000.0 },
];

const INFRASTRUCTURE: BoqTemplateLine[] = [
  { itemCode: "I-01", description: "Asphalt wearing course, 60mm, incl. tack coat", unit: "m2", aiQuantity: 8600, aiUnitRate: 78.0, estimatorQuantity: 8940, estimatorUnitRate: 82.0 },
  { itemCode: "I-02", description: "Aggregate base course, 200mm, compacted to 95% MDD", unit: "m3", aiQuantity: 1820, aiUnitRate: 115.0, estimatorQuantity: 1890, estimatorUnitRate: 121.0 },
  { itemCode: "I-03", description: "Precast concrete kerb and channel, incl. bedding", unit: "m", aiQuantity: 2240, aiUnitRate: 142.0, estimatorQuantity: 2310, estimatorUnitRate: 148.0 },
  { itemCode: "I-04", description: "Potable water main, 300mm dia. ductile iron, incl. fittings", unit: "m", aiQuantity: 1150, aiUnitRate: 685.0, estimatorQuantity: 1180, estimatorUnitRate: 712.0 },
  { itemCode: "I-05", description: "Sewer line, 400mm dia. GRP, incl. bedding and testing", unit: "m", aiQuantity: 940, aiUnitRate: 820.0, estimatorQuantity: 975, estimatorUnitRate: 865.0 },
  { itemCode: "I-06", description: "Precast manholes, 1200mm dia., incl. covers to authority spec", unit: "no", aiQuantity: 38, aiUnitRate: 7250.0, estimatorQuantity: 40, estimatorUnitRate: 7600.0 },
  { itemCode: "I-07", description: "Road marking, signage and street furniture", unit: "LS", aiQuantity: 1, aiUnitRate: 215000.0, estimatorQuantity: 1, estimatorUnitRate: 228000.0 },
  { itemCode: "I-08", description: "Traffic management and diversion during construction", unit: "LS", aiQuantity: 1, aiUnitRate: 165000.0, estimatorQuantity: 1, estimatorUnitRate: 182000.0, note: "Authority required an additional diversion phase." },
];

export const BOQ_TEMPLATES: Record<string, BoqTemplateLine[]> = {
  CIVIL_CONSTRUCTION: CIVIL,
  MECHANICAL,
  PIPELINE: MECHANICAL,
  FABRICATION: MECHANICAL,
  ELECTRICAL,
  FIT_OUT,
  MAINTENANCE,
  INFRASTRUCTURE,
};

/**
 * Starter BOQ lines for a project, given every discipline it covers.
 *
 * Disciplines are unioned so a civil + electrical package opens with both sets
 * of work items. Two details matter:
 *
 *  - Several project types share a template (pipeline and fabrication both use
 *    the mechanical one), so templates are de-duplicated by identity rather
 *    than by type — selecting both must not produce the lines twice.
 *  - Item codes are only unique *within* a template: civil "E-01" is painting,
 *    electrical "E-01" is an LV panel. A collision is suffixed rather than
 *    dropped, because losing a priced line would be far worse than an untidy
 *    code the estimator can edit.
 */
export function boqTemplateFor(projectTypes: readonly string[]): BoqTemplateLine[] {
  const templates = projectTypes.length === 0 ? [CIVIL] : projectTypes.map((type) => BOQ_TEMPLATES[type] ?? CIVIL);

  const seen = new Set<BoqTemplateLine[]>();
  const lines: BoqTemplateLine[] = [];
  for (const template of templates) {
    if (seen.has(template)) continue;
    seen.add(template);
    lines.push(...template);
  }

  const usedCodes = new Map<string, number>();
  return lines.map((line) => {
    const count = usedCodes.get(line.itemCode) ?? 0;
    usedCodes.set(line.itemCode, count + 1);
    return count === 0 ? line : { ...line, itemCode: `${line.itemCode}/${count + 1}` };
  });
}

/** Blank line used when the Estimator adds a row in the BOQ workspace. */
export const EMPTY_BOQ_LINE: Omit<BoqTemplateLine, "itemCode"> = {
  description: "",
  unit: "no",
  aiQuantity: null,
  aiUnitRate: null,
  estimatorQuantity: 0,
  estimatorUnitRate: 0,
};
