from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import urllib.request
import urllib.error
import json

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
            if distance > 800000:
                raise HTTPException(
                    status_code=400,
                    detail="Route is too long, maximum distance is 800 km"
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

@app.post("/api/poi")
def get_pois(poi_request: PoiRequest):
    """
    POST endpoint to retrieve POIs within a buffer zone around the route.
    For now, returns an empty list.
    """
    return []
