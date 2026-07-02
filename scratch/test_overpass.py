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

# Antalya to Afyon coordinates simplified (10 points)
points = [
    [30.7000, 36.9000],
    [30.6800, 37.1000],
    [30.6500, 37.3000],
    [30.6200, 37.5000],
    [30.5800, 37.7000],
    [30.5500, 37.9000],
    [30.5200, 38.1000],
    [30.5000, 38.3000],
    [30.4800, 38.5000],
    [30.4600, 38.7000]
]

around_str = ",".join(f"{p[1]:.6f},{p[0]:.6f}" for p in points)

# Bbox
lats = [p[1] for p in points]
lons = [p[0] for p in points]
south = min(lats) - 0.3
north = max(lats) + 0.3
west = min(lons) - 0.3
east = max(lons) + 0.3
bbox_str = f"{south:.6f},{west:.6f},{north:.6f},{east:.6f}"

# Fuel tight bbox
south_fuel = min(lats) - 0.01
north_fuel = max(lats) + 0.01
west_fuel = min(lons) - 0.01
east_fuel = max(lons) + 0.01
bbox_str_fuel = f"{south_fuel:.6f},{west_fuel:.6f},{north_fuel:.6f},{east_fuel:.6f}"

query = f"""[out:json][timeout:15];
(
  node["historic"]({bbox_str})(around:30000,{around_str});
  way["historic"]({bbox_str})(around:30000,{around_str});
  node["site"="archaeological"]({bbox_str})(around:30000,{around_str});
  way["site"="archaeological"]({bbox_str})(around:30000,{around_str});
  node["tourism"~"^(attraction|viewpoint|museum|gallery|zoo|aquarium|theme_park|artwork)$"]({bbox_str})(around:30000,{around_str});
  way["tourism"~"^(attraction|viewpoint|museum|gallery|zoo|aquarium|theme_park|artwork)$"]({bbox_str})(around:30000,{around_str});
  node["natural"~"^(cave_entrance|beach|spring|hot_spring|geyser|volcano|sinkhole|water|saddle|dune|cape)$"]({bbox_str})(around:30000,{around_str});
  way["natural"~"^(cave_entrance|beach|spring|hot_spring|geyser|volcano|sinkhole|water|saddle|dune|cape)$"]({bbox_str})(around:30000,{around_str});
  node["amenity"="fuel"]({bbox_str_fuel})(around:1000,{around_str});
  way["amenity"="fuel"]({bbox_str_fuel})(around:1000,{around_str});
);
out center;"""

data = urllib.parse.urlencode({'data': query}).encode('utf-8')

for endpoint in OVERPASS_ENDPOINTS:
    print(f"Trying endpoint: {endpoint}...")
    req = urllib.request.Request(endpoint, data=data, headers={'User-Agent': 'DeTour-Test/1.0'})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            res = json.loads(response.read().decode())
            duration = time.time() - t0
            print(f"  Status: Success | Time: {duration:.2f}s | Elements: {len(res.get('elements', []))}")
            break
    except Exception as e:
        duration = time.time() - t0
        print(f"  Status: Failed  | Time: {duration:.2f}s | Error: {str(e)}")
