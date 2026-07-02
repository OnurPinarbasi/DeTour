import urllib.request
import urllib.parse
import json
import time

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
]

# Bounding box for missing Step 3
south = 35.80
north = 39.00
west = 35.20
east = 40.00

BLOCKED_TERMS = [
    "airbus", "su deposu", "water reservoir", "water tank", 
    "dalış noktası", "dalis noktasi", "dive site", "underwater", 
    "batık", "batigi", "wreck", "reef", "baz istasyonu", 
    "cell tower", "trafo", "transformer", "su kulesi", "water tower",
    "yangın söndürme", "yangin sondurme", "yangın havuzu", "yangin havuzu",
    "yangın göleti", "yangin goleti", "fire fighting pond", "fire fighting reservoir",
    "fire pond", "fire reservoir", "fire water",
    "sulama havuzu", "sulama havuzlari", "sulama goleti", "sulama göleti", "irrigation pond", "irrigation pool",
    "taş ocağı", "tas ocagi", "quarry", "quarries", "maden", "mine", "mines", "şantiye", "santiye", "construction site",
    "kuyu", "well", "wells",
    "boundary stone", "milestone", "sınır taşı", "sinir tasi", "kilometre taşı", "nirengi",
    "mezar", "mezarlık", "mezarligi", "mezarlığı", "grave", "cemetery", "cemeteries",
    "uncu", "bakkal", "manav", "kasap", "şarküteri", "sarkuteri", "terzi", "berber", "kuaför", "kuafor", 
    "tekel", "nalbur", "züccaciye", "zuccaciye", "tuhafiye", "tütüncü", "tutuncu", "fırın", "firin", "pastane", "eczane",
    "building", "house", "konut", "bina", "apartman", "apartment", " ev", "ev "
]

EXCEPTIONS = [
    "anıt", "anit", "mausoleum", "türbe", "turbe", 
    "müze", "muze", "museum", "tarihi", "tarih",
    "atatürk", "ataturk", "saray", "palace", 
    "konak", "kasır", "kasri", "kalesi", "kale"
]

def query_overpass_with_fallback(query):
    data = urllib.parse.urlencode({'data': query}).encode('utf-8')
    last_err = None
    
    for endpoint in OVERPASS_ENDPOINTS:
        time.sleep(1.0)
        try:
            req = urllib.request.Request(
                endpoint,
                data=data,
                headers={'User-Agent': 'DeTour-Downloader/1.0'}
            )
            with urllib.request.urlopen(req, timeout=45) as response:
                if response.status == 200:
                    return json.loads(response.read().decode())
        except Exception as e:
            last_err = e
            print(f"  Endpoint {endpoint} failed: {str(e)}. Retrying next...")
            
    raise Exception(f"All Overpass endpoints failed. Last error: {str(last_err)}")

def is_valid_poi(tags, name_lower):
    if tags.get("natural") == "peak":
        return False
    if tags.get("natural") == "water" and tags.get("water") in ["reservoir", "basin", "wastewater", "canal", "ditch"]:
        return False
    if name_lower == "ev" or name_lower == "house" or name_lower == "building" or any(term in name_lower for term in BLOCKED_TERMS):
        if any(exc in name_lower for exc in EXCEPTIONS):
            return True
        return False
    return True

def download_missing():
    print(f"Retrying download for Step 3 Box: Lat({south} to {north}), Lng({west} to {east})...")
    
    query = f"""[out:json][timeout:35];
(
  node["historic"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});
  way["historic"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});
  node["site"="archaeological"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});
  way["site"="archaeological"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});
  node["tourism"~"^(attraction|viewpoint|museum|gallery|zoo|aquarium|theme_park|artwork)$"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});
  way["tourism"~"^(attraction|viewpoint|museum|gallery|zoo|aquarium|theme_park|artwork)$"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});
  node["natural"~"^(cave_entrance|beach|spring|hot_spring|geyser|volcano|sinkhole|water|saddle|dune|cape)$"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});
  way["natural"~"^(cave_entrance|beach|spring|hot_spring|geyser|volcano|sinkhole|water|saddle|dune|cape)$"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});
  node["amenity"="fuel"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});
  way["amenity"="fuel"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});
);
out center;"""

    try:
        result = query_overpass_with_fallback(query)
        elements = result.get("elements", [])
        print(f"Success! Got {len(elements)} raw elements. Processing...")
        
        # Load existing pois.json
        try:
            with open("../backend/pois.json", "r", encoding="utf-8") as f:
                existing_pois = json.load(f)
        except Exception:
            with open("pois.json", "r", encoding="utf-8") as f:
                existing_pois = json.load(f)
                
        print(f"Loaded {len(existing_pois)} existing POIs from database.")
        
        # Build keys dictionary for deduplication
        pois_db = {}
        for p in existing_pois:
            key = (round(p["lat"], 5), round(p["lng"], 5), p["name"].lower())
            pois_db[key] = p
            
        new_count = 0
        for element in elements:
            tags = element.get("tags", {})
            
            if element.get("type") == "node":
                lat = element.get("lat")
                lng = element.get("lon")
            else:
                center = element.get("center", {})
                lat = center.get("lat")
                lng = center.get("lon")

            if lat is None or lng is None:
                continue

            poi_type = None
            default_name = "Point of Interest"

            if "historic" in tags or tags.get("site") == "archaeological":
                poi_type = "historic"
                subtype = tags.get("historic", "").replace('_', ' ').title()
                if tags.get("site") == "archaeological" or subtype == "Archaeological Site":
                    subtype = "Archaeological Site"
                elif not subtype:
                    subtype = "Historic Site"
                default_name = subtype
            elif "tourism" in tags:
                if "name" not in tags:
                    continue
                poi_type = "tourism"
                default_name = tags["tourism"].replace('_', ' ').title()
            elif "natural" in tags:
                if "name" not in tags:
                    continue
                poi_type = "natural"
                default_name = tags["natural"].replace('_', ' ').title()
            elif tags.get("amenity") == "fuel":
                poi_type = "fuel"
                default_name = "Gas Station"

            if not poi_type:
                continue

            name = tags.get("name", default_name)
            name_lower = name.lower()
            
            if not is_valid_poi(tags, name_lower):
                continue

            key = (round(lat, 5), round(lng, 5), name_lower)
            if key not in pois_db:
                pois_db[key] = {
                    "name": name,
                    "lat": lat,
                    "lng": lng,
                    "type": poi_type
                }
                new_count += 1
                
        # Write merged list back
        merged_pois = list(pois_db.values())
        try:
            with open("../backend/pois.json", "w", encoding="utf-8") as f:
                json.dump(merged_pois, f, ensure_ascii=False, indent=2)
        except Exception:
            with open("pois.json", "w", encoding="utf-8") as f:
                json.dump(merged_pois, f, ensure_ascii=False, indent=2)
                
        print(f"Success: Added {new_count} new POIs. Merged database size: {len(merged_pois)}")
        
    except Exception as e:
        print(f"Failed to retry Step 3: {str(e)}")

if __name__ == "__main__":
    download_missing()
