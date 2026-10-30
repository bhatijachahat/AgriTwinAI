"""Advanced government scheme recommendation: rule engine over a farmer profile. Rules/amounts change; always verify."""
from datetime import date
from pydantic import BaseModel

class Profile(BaseModel):
    land_ha: float | None = None       # defaults to farm area
    category: str = "general"          # general / obc / sc / st
    owns_land: bool = True
    has_grid: bool = False             # grid electricity connection at the pump
    irrigation: str = "flood"          # flood / drip / sprinkler
    state: str = "Chhattisgarh"

BASE = ["Aadhaar", "Bank passbook", "Land record (khasra / B-1)", "Passport photo", "Mobile number"]
NOTIFIED = {"rice", "wheat", "gram", "maize"}  # tomato is horticulture, handled separately

def recommend(farm, p: Profile, lang="en"):
    hi = lang == "hi"; ha = p.land_ha if p.land_ha is not None else farm["area_ha"]
    small = ha <= 2; marginal = ha <= 1; tag = "marginal" if marginal else "small" if small else "medium/large"
    rabi = date.today().month >= 11 or date.today().month <= 3
    out = []
    def add(i, name, ok, prio, why, benefit, docs, where, link):
        out.append(dict(id=i, name=name, eligible=ok, priority=prio, why=why[1] if hi else why[0], benefit=benefit[1] if hi else benefit[0],
                        documents=docs, apply_at=where, link=link))
    add("pm_kisan", "PM-KISAN", p.owns_land, "medium",
        ("Land-owning farmer families are generally eligible (some exclusions apply).", "भूमि-स्वामी किसान परिवार सामान्यतः पात्र हैं (कुछ अपवाद लागू)।") if p.owns_land else ("Needs land ownership.", "भूमि स्वामित्व ज़रूरी है।"),
        ("Direct income support paid in instalments to the bank account.", "बैंक खाते में किस्तों में सीधी आय सहायता।"), BASE, "CSC / Patwari / pmkisan.gov.in", "https://pmkisan.gov.in")
    comp = "C (grid-connected pump solarisation)" if p.has_grid else "B (stand-alone off-grid solar pump)"
    add("pm_kusum", f"PM-KUSUM Component {comp}", True, "high",
        (f"Your farm already has a pump set up; Component {'C' if p.has_grid else 'B'} matches your grid status. Scheme period/quota may have changed.",
         f"आपके पास पंप है; ग्रिड स्थिति के अनुसार कंपोनेंट {'C' if p.has_grid else 'B'} उपयुक्त है। योजना अवधि/कोटा बदला हो सकता है।"),
        ("Central + state subsidy on solar pump cost (commonly ~30% + ~30%, farmer ~40%). Check current figures.", "सोलर पंप लागत पर केंद्र + राज्य सब्सिडी (आमतौर पर ~30% + ~30%, किसान ~40%)। वर्तमान आँकड़े जाँचें।"),
        BASE + (["Electricity connection proof"] if p.has_grid else ["Water-source proof (borewell/well)"]), "State nodal agency (CREDA for Chhattisgarh) / MNRE portal", "https://pmkusum.mnre.gov.in")
    flood = p.irrigation == "flood"
    add("pmksy", "PMKSY - Per Drop More Crop (micro-irrigation)", flood, "high" if flood and small else "medium",
        ("You use flood irrigation, so drip/sprinkler can cut water use." + (f" As a {tag} farmer you usually get higher subsidy." if small else ""),
         "आप बाढ़ सिंचाई करते हैं, ड्रिप/स्प्रिंकलर से पानी बचेगा।" + (" छोटे/सीमांत किसान को आमतौर पर अधिक सब्सिडी मिलती है।" if small else "")) if flood
        else ("You already use micro-irrigation. Not a priority.", "आप पहले से माइक्रो-सिंचाई करते हैं। प्राथमिकता नहीं।"),
        ("Subsidy on drip / sprinkler systems (percentage varies by state and farmer category).", "ड्रिप/स्प्रिंकलर पर सब्सिडी (प्रतिशत राज्य और श्रेणी पर निर्भर)।"),
        BASE + ["Quotation from approved supplier"], "District horticulture / agriculture office", "https://pmksy.gov.in")
    crop = farm["crop"]; okc = crop in NOTIFIED or crop == "tomato"
    prem = "5% (horticulture)" if crop == "tomato" else "1.5% of sum insured" if rabi else "2% of sum insured"
    add("pmfby", "PM Fasal Bima Yojana (crop insurance)", okc, "high",
        (f"{crop} is commonly covered; enrol before the cut-off date for the season.", f"{CROPHI.get(crop, crop)} सामान्यतः बीमा में शामिल है; सीज़न की अंतिम तारीख से पहले नामांकन करें।"),
        (f"Insurance against crop loss. Farmer premium about {prem} (verify).", f"फसल नुकसान पर बीमा। किसान प्रीमियम लगभग {prem} (जाँचें)।"),
        BASE + ["Sowing declaration"], "Bank / CSC / pmfby.gov.in", "https://pmfby.gov.in")
    add("kcc", "Kisan Credit Card", True, "medium", ("Low-interest crop loans for farmers, including tenants.", "किसानों (काश्तकारों सहित) के लिए कम ब्याज पर फसल ऋण।"),
        ("Revolving credit for seed, fertilizer, water.", "बीज, खाद, पानी के लिए रिवॉल्विंग ऋण।"), BASE, "Nearest bank branch", "https://www.pmkisan.gov.in")
    add("shc", "Soil Health Card", True, "medium", ("Free soil test gives exact fertilizer needs and improves the NPK advice here.", "मुफ़्त मिट्टी जाँच से सही खाद मात्रा पता चलती है।"),
        ("Soil report with crop-wise recommendations.", "फसल-वार सिफ़ारिशों के साथ मिट्टी रिपोर्ट।"), ["Aadhaar", "Land details"], "Agriculture department / KVK", "https://soilhealth.dac.gov.in")
    add("state", f"{p.state} state agriculture schemes", True, "medium",
        ("States run extra schemes (paddy support, subsidies, equipment). Ask the local agriculture office.", "राज्य अतिरिक्त योजनाएँ चलाते हैं। स्थानीय कृषि कार्यालय से पूछें।"),
        ("Varies by state and year.", "राज्य और वर्ष के अनुसार अलग।"), BASE, "District agriculture office / state agri portal", "https://agriportal.cg.nic.in" if p.state.lower().startswith("chhat") else "https://agricoop.nic.in")
    order = {"high": 0, "medium": 1}
    out.sort(key=lambda s: (not s["eligible"], order[s["priority"]]))
    return dict(farmer_type=tag, land_ha=ha, schemes=out,
                disclaimer=("योजनाओं के नियम, सब्सिडी और अंतिम तारीख बदलती रहती हैं। आवेदन से पहले आधिकारिक पोर्टल या कृषि कार्यालय से पुष्टि करें।" if hi
                            else "Scheme rules, subsidy amounts and deadlines change. Confirm on the official portal or at your agriculture office before applying."))

CROPHI = {"rice": "धान", "wheat": "गेहूं", "gram": "चना", "maize": "मक्का", "tomato": "टमाटर"}
