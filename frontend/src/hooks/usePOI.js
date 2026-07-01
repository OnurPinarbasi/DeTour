import { useState, useCallback, useRef } from 'react';

/**
 * Custom hook providing functions to fetch Points of Interest (POIs) along a route.
 * Manages fetched POIs state and loading/error states.
 */
export function usePOI() {
  const [pois, setPois] = useState([]);
  const [error, setError] = useState(null);
  const [isLoadingPOI, setIsLoadingPOI] = useState(false);
  const abortControllerRef = useRef(null);

  const fetchPOIs = useCallback(async (routeGeometry, bufferDistanceKm) => {
    if (!routeGeometry || !routeGeometry.geometry || !routeGeometry.geometry.coordinates) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setPois([]);
      setError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoadingPOI(true);
    setError(null);

    const payload = {
      route_geometry: routeGeometry.geometry.coordinates,
      buffer_distance_km: bufferDistanceKm
    };

    try {
      const response = await fetch('http://localhost:8000/api/poi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('POIs response from backend:', data);
      console.log(`[usePOI] Total POIs found: ${data.poi_count}, Query duration: ${data.query_duration_seconds} seconds`);
      setPois(data.pois || []);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw err;
      }
      console.error('Failed to fetch POIs:', err);
      setError(err.message);
      setPois([]);
      throw err;
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoadingPOI(false);
      }
    }
  }, []);

  return { fetchPOIs, pois, setPois, error, setError, isLoadingPOI };
}
