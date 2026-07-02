import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMapEvents, Marker, Popup, Polyline, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { useRoute } from '../hooks/useRoute';
import { usePOI } from '../hooks/usePOI';
import BufferZoneSelector from './BufferZoneSelector';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import '../App.css';

// Custom DivIcon for Start Point (From) - Modern SVG gradient pin with inner circle and label
const startIcon = L.divIcon({
  html: `
    <div class="modern-pin start-pin">
      <svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 42 15 42C15 42 30 26.25 30 15C30 6.71573 23.2843 0 15 0Z" fill="url(#startGrad)"/>
        <circle cx="15" cy="15" r="5" fill="white"/>
        <defs>
          <linearGradient id="startGrad" x1="0" y1="0" x2="30" y2="42" gradientUnits="userSpaceOnUse">
            <stop stop-color="#818cf8"/>
            <stop offset="1" stop-color="#4f46e5"/>
          </linearGradient>
        </defs>
      </svg>
      <span class="modern-marker-label">START</span>
    </div>
  `,
  className: 'custom-modern-marker',
  iconSize: [30, 42],
  iconAnchor: [15, 42],
  popupAnchor: [0, -42]
});

// Custom DivIcon for Destination Point (To) - Modern SVG gradient pin with inner circle and label
const endIcon = L.divIcon({
  html: `
    <div class="modern-pin end-pin">
      <svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 42 15 42C15 42 30 26.25 30 15C30 6.71573 23.2843 0 15 0Z" fill="url(#endGrad)"/>
        <circle cx="15" cy="15" r="5" fill="white"/>
        <defs>
          <linearGradient id="endGrad" x1="0" y1="0" x2="30" y2="42" gradientUnits="userSpaceOnUse">
            <stop stop-color="#22d3ee"/>
            <stop offset="1" stop-color="#0891b2"/>
          </linearGradient>
        </defs>
      </svg>
      <span class="modern-marker-label">END</span>
    </div>
  `,
  className: 'custom-modern-marker',
  iconSize: [30, 42],
  iconAnchor: [15, 42],
  popupAnchor: [0, -42]
});

// Helper to create POI marker icons dynamically
const createPoiIcon = (type) => {
  let gradStart, gradEnd;

  if (type === 'historic') {
    gradStart = '#b45309'; // Brown/Amber
    gradEnd = '#78350f';
  } else if (type === 'tourism') {
    gradStart = '#22d3ee'; // Cyan
    gradEnd = '#0891b2';
  } else if (type === 'natural') {
    gradStart = '#4ade80'; // Grass Green
    gradEnd = '#15803d';
  } else if (type === 'fuel') {
    gradStart = '#facc15'; // Yellow
    gradEnd = '#a16207';
  } else {
    gradStart = '#94a3b8'; // Default slate
    gradEnd = '#475569';
  }

  return L.divIcon({
    html: `
      <div class="modern-pin poi-pin-${type}">
        <svg width="24" height="34" viewBox="0 0 24 34" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.37258 0 0 5.37258 0 12C0 21 12 34 12 34C12 34 24 21 24 12C24 5.37258 18.6274 0 12 0Z" fill="url(#grad-${type})"/>
          <circle cx="12" cy="12" r="4" fill="white"/>
          <defs>
            <linearGradient id="grad-${type}" x1="0" y1="0" x2="24" y2="34" gradientUnits="userSpaceOnUse">
              <stop stop-color="${gradStart}"/>
              <stop offset="1" stop-color="${gradEnd}"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    `,
    className: 'custom-modern-marker',
    iconSize: [24, 34],
    iconAnchor: [12, 34],
    popupAnchor: [0, -34]
  });
};

const poiIcons = {
  historic: createPoiIcon('historic'),
  tourism: createPoiIcon('tourism'),
  natural: createPoiIcon('natural'),
  fuel: createPoiIcon('fuel'),
  default: createPoiIcon('default')
};

/**
 * Reverse geocodes coordinates to a human-readable address using Nominatim API.
 * @param {number} lat - Latitude of the coordinates.
 * @param {number} lng - Longitude of the coordinates.
 * @returns {Promise<string>} The address string.
 */
async function fetchAddress(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'DeTour-App/1.0'
        }
      }
    );
    if (!response.ok) throw new Error('Geocoding failed');
    const data = await response.json();
    return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

/**
 * ClickHandler component that listens to map click events.
 * Calls the onMapClick callback prop with the clicked coordinates.
 */
function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng);
    },
  });
  return null;
}

/**
 * Component that triggers Leaflet map size invalidation after mounting.
 * This resolves issues where map tiles are not fully loaded due to container resizing.
 */
function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    // Small timeout ensures the container is fully rendered and sized
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

/**
 * Formats duration in seconds into a human-readable string (hours and minutes).
 * @param {number} seconds - The duration in seconds.
 * @returns {string} The formatted duration string.
 */
const formatDuration = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins} mins`;
};

/**
 * Renders a dynamic, visual corridor (buffer zone) around the route.
 * Automatically scales its weight in pixels according to map zoom level and chosen detour limit.
 */
function BufferZone({ positions, distanceKm }) {
  const map = useMap();
  const [weight, setWeight] = useState(0);

  const calculateWeight = React.useCallback(() => {
    if (!positions || positions.length === 0) {
      setWeight(0);
      return;
    }

    const zoom = map.getZoom();

    // Average latitude of the route coordinates
    let sumLat = 0;
    for (let i = 0; i < positions.length; i++) {
      sumLat += positions[i][0];
    }
    const avgLat = sumLat / positions.length;

    // Meters per pixel at the current latitude and zoom level
    const metersPerPixel = (156543.03392 * Math.cos(avgLat * Math.PI / 180)) / Math.pow(2, zoom);

    // Total diameter of the corridor in pixels
    const weightPx = (2 * distanceKm * 1000) / metersPerPixel;
    setWeight(weightPx);
  }, [map, positions, distanceKm]);

  useEffect(() => {
    calculateWeight();

    map.on('zoomend', calculateWeight);
    map.on('viewreset', calculateWeight);

    return () => {
      map.off('zoomend', calculateWeight);
      map.off('viewreset', calculateWeight);
    };
  }, [map, calculateWeight]);

  if (!positions || positions.length === 0) return null;

  return (
    <Polyline
      positions={positions}
      interactive={false}
      pathOptions={{
        color: '#06b6d4',
        weight: weight === 0 ? 0.1 : weight,
        opacity: distanceKm === 0 ? 0.001 : 0.08,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'buffer-zone-bg'
      }}
    />
  );
}

/**
 * Custom POI Cluster component that uses leaflet.markercluster natively.
 */
function POICluster({ activePOIs, poiIcons, visibleCategories }) {
  const map = useMap();
  const clusterGroupRef = useRef(null);
  const markersMapRef = useRef(new Map()); // Key -> L.marker instance

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      disableClusteringAtZoom: 18,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `
            <div class="custom-cluster-icon">
              <span>${count}</span>
              <div class="cluster-pulse"></div>
            </div>
          `,
          className: 'custom-cluster-marker',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });
      }
    });

    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;

    return () => {
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current);
      }
    };
  }, [map]);

  useEffect(() => {
    const clusterGroup = clusterGroupRef.current;
    if (!clusterGroup) return;

    const currentMarkersMap = markersMapRef.current;
    const newKeys = new Set();

    activePOIs.forEach((poi) => {
      const isVisible = visibleCategories[poi.type];
      const key = `${poi.type}-${poi.lat}-${poi.lng}-${poi.name}`;

      if (isVisible) {
        newKeys.add(key);

        if (!currentMarkersMap.has(key)) {
          const marker = L.marker([poi.lat, poi.lng], {
            icon: poiIcons[poi.type] || poiIcons.default
          });

          marker.bindPopup(`
            <div style="font-family: system-ui, sans-serif;">
              <strong style="color: #0f172a;">${poi.name}</strong>
              <br />
              <span style="text-transform: capitalize; font-size: 0.75rem; color: #64748b; font-weight: bold;">
                Category: ${poi.type}
              </span>
              <br />
              <span style="font-size: 0.75rem; color: #8b5cf6; font-weight: 500;">
                Detour Distance: ${poi.distance_to_route.toFixed(2)} km
              </span>
            </div>
          `, {
            closeButton: false,
            offset: [0, -10]
          });

          clusterGroup.addLayer(marker);
          currentMarkersMap.set(key, marker);
        }
      }
    });

    // Clean up markers that are no longer active
    currentMarkersMap.forEach((marker, key) => {
      if (!newKeys.has(key)) {
        clusterGroup.removeLayer(marker);
        currentMarkersMap.delete(key);
      }
    });
  }, [activePOIs, poiIcons, visibleCategories]);

  return null;
}

/**
 * MapView component that renders an interactive Leaflet map.
 * Manages startPoint and endPoint states based on map clicks,
 * displays red and blue markers for start and end positions,
 * and fetches routing data from the backend when both points are set.
 * Renders the route on the map using a blue Polyline.
 */
function MapView() {
  const { fetchRoute, routeGeometry, setRouteGeometry, error, setError, isLoading } = useRoute();
  const { fetchPOIs, pois, setPois, error: poiError, setError: setPoiError, isLoadingPOI: isPoiLoading } = usePOI();

  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [isFetchingStart, setIsFetchingStart] = useState(false);
  const [isFetchingEnd, setIsFetchingEnd] = useState(false);
  const [bufferDistance, setBufferDistance] = useState(0);
  const [isResetting, setIsResetting] = useState(false);
  const [maxFetchedDistance, setMaxFetchedDistance] = useState(-1);
  const [visibleCategories, setVisibleCategories] = useState({
    historic: false,
    tourism: false,
    natural: false,
    fuel: false
  });
  const [poiProgress, setPoiProgress] = useState(0);


  const toggleCategory = (category) => {
    if (isLoading || isPoiLoading) return; // Prevent category toggling while loading

    setVisibleCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Simulate progress indicator for POI loading
  useEffect(() => {
    let interval;
    if (isPoiLoading) {
      setPoiProgress(0);
      interval = setInterval(() => {
        setPoiProgress(prev => {
          if (prev < 20) {
            return prev + 8;
          } else if (prev < 50) {
            return prev + 4;
          } else if (prev < 80) {
            return prev + 2;
          } else if (prev < 96) {
            return prev + 1;
          }
          return prev;
        });
      }, 400);
    } else {
      setPoiProgress(100);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPoiLoading]);





  const centerPosition = [39.9334, 32.8597];
  const defaultZoom = 6;



  // Fetch routing coordinates from the backend once both start and end points are specified
  useEffect(() => {
    if (startPoint && endPoint) {
      setBufferDistance(0); // Reset detour limit to 0 km when starting route calculation
      fetchRoute(startPoint, endPoint);
    }
  }, [startPoint, endPoint, fetchRoute, setBufferDistance]);

  // Reset POI states when route geometry changes and pre-fetch 1.0 km POIs for Gas Stations
  useEffect(() => {
    setPois([]);
    setMaxFetchedDistance(-1);
    setBufferDistance(0);

    if (routeGeometry) {
      fetchPOIs(routeGeometry, 1.0)
        .then((data) => {
          if (data) {
            setMaxFetchedDistance(1.0);
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.error("Failed to pre-fetch Gas Stations:", err);
            setMaxFetchedDistance(-1);
          }
        });
    }
  }, [routeGeometry, setPois, setBufferDistance, fetchPOIs]);

  // Fetch POIs on-demand when bufferDistance increases beyond what we have fetched
  useEffect(() => {
    if (routeGeometry && bufferDistance > 0 && bufferDistance > maxFetchedDistance) {
      fetchPOIs(routeGeometry, bufferDistance)
        .then((data) => {
          if (data) {
            setMaxFetchedDistance(bufferDistance);
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.error("Failed to fetch POIs for distance:", bufferDistance, err);
            setMaxFetchedDistance(-1); // Reset on failure to allow retry
          }
        });
    }
  }, [bufferDistance, routeGeometry, maxFetchedDistance, fetchPOIs]);

  // Fetch address for start point
  useEffect(() => {
    if (startPoint) {
      setIsFetchingStart(true);
      fetchAddress(startPoint.lat, startPoint.lng)
        .then(addr => {
          setStartAddress(addr);
          setIsFetchingStart(false);
        });
    } else {
      setStartAddress('');
    }
  }, [startPoint]);

  // Fetch address for end point
  useEffect(() => {
    if (endPoint) {
      setIsFetchingEnd(true);
      fetchAddress(endPoint.lat, endPoint.lng)
        .then(addr => {
          setEndAddress(addr);
          setIsFetchingEnd(false);
        });
    } else {
      setEndAddress('');
    }
  }, [endPoint]);

  /**
   * ClickHandler callback that updates the start or end coordinates.
   */
  const handleMapClick = (latlng) => {
    if (isResetting) return; // Prevent clicks during reset transition

    if (startPoint === null) {
      setStartPoint(latlng);
    } else if (endPoint === null) {
      setEndPoint(latlng);
    }
  };

  /**
   * Resets all route data and coordinates.
   */
  const handleReset = () => {
    setIsResetting(true);
    // Smoothly shrink the buffer zone corridor
    setBufferDistance(0);

    // Smoothly clear states after the fade-out/shrink animations finish (800ms)
    setTimeout(() => {
      setStartPoint(null);
      setEndPoint(null);
      setStartAddress('');
      setEndAddress('');
      setRouteGeometry(null);
      setError(null);
      setPoiError(null);
      setPois([]);
      setMaxFetchedDistance(-1);
      setIsResetting(false);
    }, 800);
  };

  // Convert GeoJSON longitude/latitude coordinates to Leaflet latitude/longitude format  

  const polylinePositions = routeGeometry && routeGeometry.geometry && routeGeometry.geometry.coordinates
    ? routeGeometry.geometry.coordinates.map(coord => [coord[1], coord[0]])
    : [];
  const filteredPOIs = (() => {
    // Dynamically scale the visible POI limit based on selected detour range (10km -> 200, 20km -> 300, 30km -> 400)
    // This ensures close POIs are not sacrificed, while still displaying further ones when detour range increases.
    const limit = bufferDistance <= 10 ? 200 : (bufferDistance <= 20 ? 300 : 400);

    const historicPOIs = pois
      .filter(poi => poi.type === 'historic' && poi.distance_to_route <= bufferDistance)
      .sort((a, b) => a.distance_to_route - b.distance_to_route)
      .slice(0, limit);

    const tourismPOIs = pois
      .filter(poi => poi.type === 'tourism' && poi.distance_to_route <= bufferDistance)
      .sort((a, b) => a.distance_to_route - b.distance_to_route)
      .slice(0, limit);

    const naturalPOIs = pois
      .filter(poi => poi.type === 'natural' && poi.distance_to_route <= bufferDistance)
      .sort((a, b) => a.distance_to_route - b.distance_to_route)
      .slice(0, limit);

    const fuelPOIs = pois
      .filter(poi => poi.type === 'fuel' && poi.distance_to_route <= 1.0);

    return [
      ...historicPOIs,
      ...tourismPOIs,
      ...naturalPOIs,
      ...fuelPOIs
    ];
  })();

  return (
    <div className={`map-wrapper ${isResetting ? 'map-resetting' : ''} ${!visibleCategories.historic ? 'hide-historic' : ''} ${!visibleCategories.tourism ? 'hide-tourism' : ''} ${!visibleCategories.natural ? 'hide-natural' : ''} ${!visibleCategories.fuel ? 'hide-fuel' : ''}`}>
      {/* Sidebar Panel */}
      <div className="sidebar">
        <h2>DeTour - Route Planner</h2>

        <div className="location-box">
          <div className="location-item">
            <span className="location-label">From</span>
            <span className={`location-value ${!startPoint ? 'empty' : ''} ${isFetchingStart ? 'pulse' : ''}`}>
              {isFetchingStart ? 'Locating address...' : (startAddress || 'Click map to select start...')}
            </span>
          </div>

          <div className="location-divider" />

          <div className="location-item">
            <span className="location-label">To</span>
            <span className={`location-value ${!endPoint ? 'empty' : ''} ${isFetchingEnd ? 'pulse' : ''}`}>
              {isFetchingEnd ? 'Locating address...' : (endAddress || 'Click map to select destination...')}
            </span>
          </div>
        </div>

        <BufferZoneSelector value={bufferDistance} onChange={setBufferDistance} disabled={isLoading || isPoiLoading} />

        {/* POI Category Filters */}
        {routeGeometry && (
          <div className={`poi-filters-container ${isLoading || isPoiLoading ? 'disabled' : ''}`}>
            <span className="poi-filters-title">Filter Points of Interest</span>
            <div className="poi-filters-grid">
              <button
                type="button"
                className={`filter-btn historic ${visibleCategories.historic ? 'active' : ''}`}
                onClick={() => toggleCategory('historic')}
                disabled={isLoading || isPoiLoading}
              >
                <div className="category-dot historic" />
                Historic Sites
              </button>
              <button
                type="button"
                className={`filter-btn tourism ${visibleCategories.tourism ? 'active' : ''}`}
                onClick={() => toggleCategory('tourism')}
                disabled={isLoading || isPoiLoading}
              >
                <div className="category-dot tourism" />
                Tourism
              </button>
              <button
                type="button"
                className={`filter-btn natural ${visibleCategories.natural ? 'active' : ''}`}
                onClick={() => toggleCategory('natural')}
                disabled={isLoading || isPoiLoading}
              >
                <div className="category-dot natural" />
                Nature
              </button>
              <button
                type="button"
                className={`filter-btn fuel ${visibleCategories.fuel ? 'active' : ''}`}
                onClick={() => toggleCategory('fuel')}
                disabled={isLoading || isPoiLoading}
              >
                <div className="category-dot fuel" />
                Gas Stations
              </button>
            </div>
          </div>
        )}



        {/* Error message display */}
        {error && (
          <div className="error-box">
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* POI error display */}
        {poiError && (
          <div className="error-box">
            <span>⚠️ {poiError}</span>
          </div>
        )}

        {/* Loading state indicator */}
        {isLoading && (
          <div className="loading-box pulse">
            <span>Calculating optimal route...</span>
          </div>
        )}

        {/* Route Info Cards */}
        {routeGeometry && !error && (
          <div className="route-details">
            <div className="detail-item">
              <span className="detail-label">Distance</span>
              <span className="detail-value">
                {(routeGeometry.distance_meters / 1000).toFixed(1)} km
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Duration</span>
              <span className="detail-value">
                {formatDuration(routeGeometry.duration_seconds)}
              </span>
            </div>
          </div>
        )}

        {/* Reset button shown if any point is set */}
        {(startPoint || endPoint) && (
          <button className="reset-btn" onClick={handleReset}>
            Reset Route
          </button>
        )}
      </div>

      {/* POI Loading Indicator Overlay */}
      {isPoiLoading && (
        <div className="poi-loader">
          <div className="poi-loader-spinner" />
          <div className="poi-loader-content">
            <span className="poi-loader-text">Loading nearby places... ({poiProgress}%)</span>
            <div className="poi-loader-bar-bg">
              <div className="poi-loader-bar-fill" style={{ width: `${poiProgress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Map Container */}
      <MapContainer
        center={centerPosition}
        zoom={defaultZoom}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <ClickHandler onMapClick={handleMapClick} />
        <MapInvalidator />

        {startPoint && (
          <Marker position={startPoint} icon={startIcon}>
            <Popup>{startAddress || 'Start Point'}</Popup>
          </Marker>
        )}

        {endPoint && (
          <Marker position={endPoint} icon={endIcon}>
            <Popup>{endAddress || 'Destination Point'}</Popup>
          </Marker>
        )}

        {polylinePositions.length > 0 && (
          <>
            {/* Deviation Buffer Zone (Search Corridor) */}
            <BufferZone positions={polylinePositions} distanceKm={bufferDistance} />

            {/* Base Outer Glow */}
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: '#818cf8',
                weight: isResetting ? 0.1 : 10,
                opacity: isResetting ? 0.001 : 0.3,
                className: 'route-line-transition'
              }}
            />
            {/* Core Route Line */}
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: '#4f46e5',
                weight: isResetting ? 0.1 : 5,
                opacity: isResetting ? 0.001 : 0.8,
                className: 'route-line-transition'
              }}
            />
            {/* Flowing Glow Pulse */}
            <Polyline
              positions={polylinePositions}
              pathOptions={{
                color: '#06b6d4',
                weight: isResetting ? 0.1 : 3,
                opacity: isResetting ? 0.001 : 1,
                className: isResetting ? 'route-line-transition' : 'route-flow-animation route-line-transition'
              }}
            />
          </>
        )}

        {/* Render Gas Stations directly (never clustered) */}
        {filteredPOIs.filter(poi => poi.type === 'fuel' && visibleCategories.fuel).map((poi) => {
          const key = `${poi.type}-${poi.lat}-${poi.lng}-${poi.name}`;
          return (
            <Marker
              key={key}
              position={[poi.lat, poi.lng]}
              icon={poiIcons.fuel}
            >
              <Popup>
                <div style={{ fontFamily: 'system-ui, sans-serif' }}>
                  <strong style={{ color: '#0f172a' }}>{poi.name}</strong>
                  <br />
                  <span style={{ textTransform: 'capitalize', fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold' }}>
                    Category: Gas Station
                  </span>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Render other POIs clustered using our custom POICluster component */}
        <POICluster 
          activePOIs={filteredPOIs.filter(poi => poi.type !== 'fuel')} 
          poiIcons={poiIcons} 
          visibleCategories={visibleCategories} 
        />
      </MapContainer>
    </div>
  );
}

export default MapView;
