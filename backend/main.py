from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import urllib.request
import urllib.error
import urllib.parse
import json
import math

# Initialize the FastAPI application
app = FastAPI(title="DeTour API")

# Define allowed origins for CORS
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
]

# Add CORS middleware to the application
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RouteRequest(BaseModel):
    """
    Schema for route calculation requests.
    Contains coordinates for start and end points.
    """
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float

class PoiRequest(BaseModel):
    """
    Schema for POI search requests.
    Contains the route geometry coordinates list and buffer distance.
    """
    route_geometry: List[List[float]]
    buffer_distance_km: int

@app.get("/")
def read_root():
    """
    Root endpoint that provides a simple health check message.
    Returns a JSON object indicating the status of the backend.
    """
    return {"message": "EcoTraveller backend is running"}

@app.get("/health")
def read_health():
    """
    Health check endpoint to verify that the application is running normally.
    Returns a status indicator.
    """
    return {"status": "ok"}

@app.post("/api/route")
def get_route(route_request: RouteRequest):
    """
    POST endpoint to receive start and end coordinates.
    Fetches route geometry from OSRM demo server and returns it to the frontend.
    """
    url = (
        f"https://router.project-osrm.org/route/v1/driving/"
        f"{route_request.start_lng},{route_request.start_lat};"
        f"{route_request.end_lng},{route_request.end_lat}"
        f"?overview=full&geometries=geojson"
    )

    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'DeTour-App/1.0'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status != 200:
                raise HTTPException(status_code=502, detail="Failed to fetch route from OSRM server.")
            
            data = json.loads(response.read().decode())
            
            if data.get("code") != "Ok" or not data.get("routes"):
                raise HTTPException(status_code=400, detail="No route found between the specified points.")
                
            first_route = data["routes"][0]
            distance = first_route["distance"]

            if distance < 20000:
                raise HTTPException(
                    status_code=400,
                    detail="Route is too short, minimum distance is 20 km"
                )
            if distance > 600000:
                raise HTTPException(
                    status_code=400,
                    detail="Route is too long, maximum distance is 600 km"
                )

            return {
                "geometry": first_route["geometry"],
                "distance_meters": distance,
                "duration_seconds": first_route["duration"]
            }

    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"OSRM server is unreachable: {str(e)}")
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred while calling OSRM: {str(e)}")

def simplify_geometry(coords: List[List[float]], n: int = 10) -> List[List[float]]:
    """
    Simplifies coordinate list by taking every Nth point.
    Ensures that the first and last points are always kept for integrity.
    """
    if not coords or len(coords) <= 2:
        return coords
    
    simplified = [coords[i] for i in range(0, len(coords) - 1, n)]
    if coords[-1] not in simplified:
        simplified.append(coords[-1])
    return simplified

def min_distance_to_route(poi_lat: float, poi_lng: float, route_coords: List[List[float]], cos_lat: float) -> float:
    """
    Calculates the minimum distance in kilometers from a POI to the route coordinates
    using a fast flat-surface (equirectangular) approximation.
    """
    min_dist = float('inf')
    for coord in route_coords:
        # coord is [lng, lat]
        x = (coord[0] - poi_lng) * cos_lat
        y = coord[1] - poi_lat
        dist = math.sqrt(x*x + y*y) * 111.0
        if dist < min_dist:
            min_dist = dist
    return min_dist


@app.post("/api/poi")
def get_pois(poi_request: PoiRequest):
    """
    POST endpoint to retrieve POIs within a buffer zone around the route.
    Queries Overpass API and returns list of POIs with name, lat, lng, and type.
    """
    coords = poi_request.route_geometry
    
    print(f"--- [get_pois] Starting Bounding Box Calculation ---")
    print(f"Incoming Route Geometry point count: {len(coords) if coords else 0}")
    print(f"Incoming buffer_distance_km: {poi_request.buffer_distance_km}")

    if not coords:
        print(f"Warning: No coordinates provided in route geometry.")
        return {
            "pois": [],
            "poi_count": 0,
            "query_duration_seconds": 0.0
        }

    # Calculate bounding box using the full route coordinates for maximum precision
    simplified_dist_coords = simplify_geometry(coords, n=3)

    try:
        min_lat = min(c[1] for c in coords)
        max_lat = max(c[1] for c in coords)
        min_lng = min(c[0] for c in coords)
        max_lng = max(c[0] for c in coords)
    except Exception as e:
        print(f"Error calculating min/max bounds: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid route geometry format.")

    avg_lat = (min_lat + max_lat) / 2.0
    
    # Calculate degree offset based on buffer_distance_km (1 degree lat is approx 111 km)
    d_lat = poi_request.buffer_distance_km / 111.0
    cos_lat = math.cos(math.radians(avg_lat))
    d_lng = poi_request.buffer_distance_km / (111.0 * cos_lat) if cos_lat > 0 else d_lat

    south = min_lat - d_lat
    north = max_lat + d_lat
    west = min_lng - d_lng
    east = max_lng + d_lng

    # Calculate tight degree offset for fuel stations (only main road, 1.0 km buffer)
    d_lat_fuel = 1.0 / 111.0
    d_lng_fuel = 1.0 / (111.0 * cos_lat) if cos_lat > 0 else d_lat_fuel

    south_fuel = min_lat - d_lat_fuel
    north_fuel = max_lat + d_lat_fuel
    west_fuel = min_lng - d_lng_fuel
    east_fuel = max_lng + d_lng_fuel

    print(f"Calculated Bounding Box (Expanded):")
    print(f"  Min Lat (South): {south:.6f}, Max Lat (North): {north:.6f}")
    print(f"  Min Lng (West): {west:.6f}, Max Lng (East): {east:.6f}")
    print(f"Calculated Bounding Box (Fuel / Tight):")
    print(f"  Min Lat (South): {south_fuel:.6f}, Max Lat (North): {north_fuel:.6f}")
    print(f"  Min Lng (West): {west_fuel:.6f}, Max Lng (East): {east_fuel:.6f}")
    print(f"--- [get_pois] Bounding Box Calculation Complete ---")

    # Construct Overpass QL Query
    query_parts = []
    
    # Only query historic, tourism, and natural if buffer >= 5.0 km (active detour selections)
    if poi_request.buffer_distance_km >= 5.0:
        query_parts.extend([
            f"  node[\"historic\"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});",
            f"  way[\"historic\"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});",
            f"  node[\"site\"=\"archaeological\"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});",
            f"  way[\"site\"=\"archaeological\"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});",
            f"  node[\"tourism\"~\"^(attraction|viewpoint|museum|gallery|zoo|aquarium|theme_park|artwork)$\"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});",
            f"  way[\"tourism\"~\"^(attraction|viewpoint|museum|gallery|zoo|aquarium|theme_park|artwork)$\"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});",
            f"  node[\"natural\"~\"^(cave_entrance|beach|spring|hot_spring|geyser|volcano|sinkhole|water|saddle|dune|cape)$\"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});",
            f"  way[\"natural\"~\"^(cave_entrance|beach|spring|hot_spring|geyser|volcano|sinkhole|water|saddle|dune|cape)$\"]({south:.6f},{west:.6f},{north:.6f},{east:.6f});"
        ])
    
    # Always query fuel stations along the main route
    query_parts.extend([
        f"  node[\"amenity\"=\"fuel\"]({south_fuel:.6f},{west_fuel:.6f},{north_fuel:.6f},{east_fuel:.6f});",
        f"  way[\"amenity\"=\"fuel\"]({south_fuel:.6f},{west_fuel:.6f},{north_fuel:.6f},{east_fuel:.6f});"
    ])
    
    query_body = "\n".join(query_parts)
    overpass_query = (
        f"[out:json][timeout:15];\n"
        f"(\n"
        f"{query_body}\n"
        f");\n"
        f"out center;"
    )

    OVERPASS_ENDPOINTS = [
        "https://overpass-api.de/api/interpreter",
        "https://lz4.overpass-api.de/api/interpreter",
        "https://z.overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter"
    ]

    print(f"--- [get_pois] Sending Query to Overpass API ---")
    print(f"Overpass Query String:\n{overpass_query}\n")

    import time
    start_time = time.time()
    last_http_code = None
    last_error_msg = ""

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            print(f"--- [get_pois] Trying Overpass Endpoint: {endpoint} ---")
            data = urllib.parse.urlencode({"data": overpass_query}).encode("utf-8")
            req = urllib.request.Request(
                endpoint,
                data=data,
                headers={"User-Agent": "DeTour-App/1.0"}
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                end_time = time.time()
                duration = end_time - start_time
                print(f"Overpass Request Duration: {duration:.3f} seconds (using {endpoint})")
                
                if response.status != 200:
                    raise urllib.error.HTTPError(
                        req.full_url, response.status, "Non-200 response status", response.headers, None
                    )
                
                result = json.loads(response.read().decode())
                elements = result.get("elements", [])
                print(f"Overpass returned {len(elements)} raw elements.")
                
                pois = []
                for element in elements:
                    tags = element.get("tags", {})
                    
                    # Skip nameless items to prevent map clutter
                    name = tags.get("name", "")
                    if ("natural" in tags or "tourism" in tags) and not name:
                        continue
                    
                    # Skip peak tags
                    if tags.get("natural") == "peak":
                        continue

                    # Skip industrial/storage water reservoirs, wastewater basins, and canals
                    if tags.get("natural") == "water" and tags.get("water") in ["reservoir", "basin", "wastewater", "canal", "ditch"]:
                        continue

                    # Road-trip garbage name filter (excludes diving reefs, sunken planes, cell towers, water towers, transformers, etc.)
                    name_lower = name.lower()
                    blocked_terms = [
                        "airbus", "su deposu", "water reservoir", "water tank", 
                        "dalış noktası", "dalis noktasi", "dive site", "underwater", 
                        "batık", "batigi", "wreck", "reef", "baz istasyonu", 
                        "cell tower", "trafo", "transformer", "su kulesi", "water tower"
                    ]
                    if any(term in name_lower for term in blocked_terms):
                        continue
                    
                    # Determine lat/lng
                    if element.get("type") == "node":
                        lat = element.get("lat")
                        lng = element.get("lon")
                    else:
                        center = element.get("center", {})
                        lat = center.get("lat")
                        lng = center.get("lon")

                    if lat is None or lng is None:
                        continue

                    # Determine type and default name
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
                        # Require a valid name tag for tourism POIs to prevent nameless pins
                        if "name" not in tags:
                            continue
                        poi_type = "tourism"
                        default_name = tags["tourism"].replace('_', ' ').title()
                    elif "natural" in tags:
                        # Require a valid name tag for natural POIs to prevent nameless pins
                        if "name" not in tags:
                            continue
                        poi_type = "natural"
                        default_name = tags["natural"].replace('_', ' ').title()
                    elif tags.get("amenity") == "fuel":
                        poi_type = "fuel"
                        default_name = "Gas Station"

                    if not poi_type:
                        continue

                    # Precise corridor distance filter
                    max_allowed = 1.0 if poi_type == "fuel" else poi_request.buffer_distance_km
                    dist_to_route = min_distance_to_route(lat, lng, simplified_dist_coords, cos_lat)
                    if dist_to_route > max_allowed:
                        continue

                    name = tags.get("name", default_name)

                    pois.append({
                        "name": name,
                        "lat": lat,
                        "lng": lng,
                        "type": poi_type,
                        "distance_to_route": round(dist_to_route, 3)
                    })

                return {
                    "pois": pois,
                    "poi_count": len(pois),
                    "query_duration_seconds": round(duration, 3)
                }

        except urllib.error.HTTPError as e:
            print(f"Endpoint {endpoint} failed with HTTP Error {e.code}: {e.reason}")
            last_http_code = e.code
            last_error_msg = f"HTTP Error {e.code}: {e.reason}"
        except Exception as e:
            print(f"Endpoint {endpoint} failed: {str(e)}")
            last_error_msg = str(e)

    # If we get here, all endpoints failed
    print(f"All Overpass endpoints failed. Last error: {last_error_msg}")
    if last_http_code == 429:
        raise HTTPException(
            status_code=429, 
            detail="Overpass API is busy (Too Many Requests). Please wait a moment and try again."
        )
    raise HTTPException(
        status_code=504, 
        detail="POI search timed out, please try a smaller detour range"
    )
