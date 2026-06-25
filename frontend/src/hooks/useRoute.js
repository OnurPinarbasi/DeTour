import { useState, useCallback } from 'react';

/**
 * Custom hook providing functions to communicate with the routing backend.
 * Manages the fetched route geometry state and any error messages.
 */
export function useRoute() {
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRoute = useCallback(async (startPoint, endPoint) => {
    if (!startPoint || !endPoint) {
      setRouteGeometry(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const payload = {
      start_lat: startPoint.lat,
      start_lng: startPoint.lng,
      end_lat: endPoint.lat,
      end_lng: endPoint.lng
    };

    try {
      const response = await fetch('http://localhost:8000/api/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Route response from backend:', data);
      setRouteGeometry(data);
    } catch (err) {
      console.error('Failed to fetch route:', err);
      setError(err.message);
      setRouteGeometry(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { fetchRoute, routeGeometry, setRouteGeometry, error, setError, isLoading };
}
