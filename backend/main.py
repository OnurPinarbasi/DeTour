from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import urllib.request
import urllib.error
import urllib.parse
import json
import math
import os

# Initialize the FastAPI application
app = FastAPI(title="DeTour API")

# Load local POIs database from poi_turkey.json
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
POIS_PATH = os.path.join(BASE_DIR, "poi_turkey.json")
LOCAL_POIS = []
try:
    with open(POIS_PATH, "r", encoding="utf-8") as f:
        LOCAL_POIS = json.load(f)
    print(f"Successfully loaded {len(LOCAL_POIS)} local POIs from {POIS_PATH}.")
except Exception as e:
    print(f"Warning: Failed to load local POIs: {str(e)}")

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
    cos_lat = math.cos(math.radians(avg_lat))
    
    # Calculate degree offset based on buffer_distance_km for the bounding box boundary
    d_lat = poi_request.buffer_distance_km / 111.0
    d_lng = poi_request.buffer_distance_km / (111.0 * cos_lat) if cos_lat > 0 else d_lat

    south = min_lat - d_lat
    north = max_lat + d_lat
    west = min_lng - d_lng
    east = max_lng + d_lng
    bbox_str = f"{south:.6f},{west:.6f},{north:.6f},{east:.6f}"

    # Calculate tight degree offset for fuel stations (only main road, 1.0 km buffer)
    d_lat_fuel = 1.0 / 111.0
    d_lng_fuel = 1.0 / (111.0 * cos_lat) if cos_lat > 0 else d_lat_fuel

    south_fuel = min_lat - d_lat_fuel
    north_fuel = max_lat + d_lat_fuel
    west_fuel = min_lng - d_lng_fuel
    east_fuel = max_lng + d_lng_fuel

    import time
    start_time = time.time()
    pois = []
    
    # Filter POIs in memory
    for poi in LOCAL_POIS:
        lat = poi["lat"]
        lng = poi["lng"]
        poi_type = poi["type"]
        
        # Check boundary box depending on type
        if poi_type == "fuel":
            if not (south_fuel <= lat <= north_fuel and west_fuel <= lng <= east_fuel):
                continue
            max_allowed = 1.0
        else:
            # Skip non-fuel categories if buffer_distance_km < 5.0 (active detour selection)
            if poi_request.buffer_distance_km < 5.0:
                continue
            if not (south <= lat <= north and west <= lng <= east):
                continue
            max_allowed = poi_request.buffer_distance_km
            
        # Precise corridor distance filter
        dist_to_route = min_distance_to_route(lat, lng, simplified_dist_coords, cos_lat)
        if dist_to_route <= max_allowed:
            pois.append({
                "name": poi["name"],
                "lat": lat,
                "lng": lng,
                "type": poi_type,
                "distance_to_route": round(dist_to_route, 3)
            })

    # Sort POIs by distance to route so closest ones are presented first
    pois.sort(key=lambda p: p["distance_to_route"])

    end_time = time.time()
    duration = end_time - start_time
    print(f"Local POI Search Duration: {duration:.6f} seconds. Found {len(pois)} POIs.")

    return {
        "pois": pois,
        "poi_count": len(pois),
        "query_duration_seconds": round(duration, 3)
    }

# Force reload for updated pois.json database
