import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useRoute } from '../hooks/useRoute';
import 'leaflet/dist/leaflet.css';
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
 * MapView component that renders an interactive Leaflet map.
 * Manages startPoint and endPoint states based on map clicks,
 * displays red and blue markers for start and end positions,
 * and fetches routing data from the backend when both points are set.
 * Renders the route on the map using a blue Polyline.
 */
function MapView() {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [isFetchingStart, setIsFetchingStart] = useState(false);
  const [isFetchingEnd, setIsFetchingEnd] = useState(false);

  const { fetchRoute, routeGeometry, setRouteGeometry, error, setError, isLoading } = useRoute();

  const centerPosition = [39.9334, 32.8597];
  const defaultZoom = 6;

  // Fetch routing coordinates from the backend once both start and end points are specified
  useEffect(() => {
    if (startPoint && endPoint) {
      fetchRoute(startPoint, endPoint);
    }
  }, [startPoint, endPoint, fetchRoute]);

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
   * Handles map clicks to set start/end points or reset them.
   * @param {Object} latlng - The clicked coordinates containing lat and lng.
   */
  const handleMapClick = (latlng) => {
    if (startPoint === null) {
      setStartPoint(latlng);
    } else if (endPoint === null) {
      setEndPoint(latlng);
    } else {
      handleReset();
    }
  };

  /**
   * Resets all route data and coordinates.
   */
  const handleReset = () => {
    setStartPoint(null);
    setEndPoint(null);
    setStartAddress('');
    setEndAddress('');
    setRouteGeometry(null);
    setError(null);
  };

  // Convert GeoJSON longitude/latitude coordinates to Leaflet latitude/longitude format  

  const polylinePositions = routeGeometry && routeGeometry.geometry && routeGeometry.geometry.coordinates
    ? routeGeometry.geometry.coordinates.map(coord => [coord[1], coord[0]])
    : [];

  return (
    <div className="map-wrapper">
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

        {/* Error message display */}
        {error && (
          <div className="error-box">
            <span>⚠️ {error}</span>
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

      {/* Map Container */}
      <MapContainer
        center={centerPosition}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
            {/* Base Outer Glow */}
            <Polyline
              positions={polylinePositions}
              pathOptions={{ color: '#818cf8', weight: 10, opacity: 0.3 }}
            />
            {/* Core Route Line */}
            <Polyline
              positions={polylinePositions}
              pathOptions={{ color: '#4f46e5', weight: 5, opacity: 0.8 }}
            />
            {/* Flowing Glow Pulse */}
            <Polyline
              positions={polylinePositions}
              pathOptions={{ color: '#06b6d4', weight: 3, opacity: 1, className: 'route-flow-animation' }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}

export default MapView;
