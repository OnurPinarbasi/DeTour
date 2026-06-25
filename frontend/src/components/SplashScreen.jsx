import React, { useState, useEffect } from 'react';

/**
 * SplashScreen component.
 * Displays a premium, purple-themed animated loading screen on application start.
 * Animates a custom SVG route path, displays DeTour branding with Outfit font,
 * and fills a sleek progress bar. Fades out smoothly after 2.5 seconds.
 */
function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Start fade-out animation after 2.6 seconds
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 2600);

    // Completely unmount/remove the component from DOM after 3.0 seconds
    const removeTimer = setTimeout(() => {
      setIsVisible(false);
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className={`splash-overlay ${isFading ? 'fade-out' : ''}`}>
      <div className="splash-content">
        {/* Animated SVG Route */}
        <div className="splash-svg-container">
          <svg
            viewBox="0 0 300 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="splash-route-svg"
            id="splash-route-illustration"
          >
            {/* Ambient glow underneath the path */}
            <path
              d="M 30,50 C 90,10 120,90 180,30 C 210,0 240,60 270,50"
              stroke="rgba(168, 85, 247, 0.15)"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Background dashed path */}
            <path
              d="M 30,50 C 90,10 120,90 180,30 C 210,0 240,60 270,50"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="6 6"
            />
            {/* Animated drawing path */}
            <path
              d="M 30,50 C 90,10 120,90 180,30 C 210,0 240,60 270,50"
              stroke="url(#purple-gradient)"
              strokeWidth="4"
              strokeLinecap="round"
              className="animated-path"
            />
            {/* Starting marker (glowing ring + dot) */}
            <circle cx="30" cy="50" r="8" fill="rgba(168, 85, 247, 0.2)" className="pulse-ring" />
            <circle cx="30" cy="50" r="4" fill="#a855f7" />

            {/* Ending marker (glowing ring + dot) */}
            <circle cx="270" cy="50" r="8" fill="rgba(236, 72, 153, 0.2)" className="pulse-ring-pink" />
            <circle cx="270" cy="50" r="4" fill="#ec4899" />

            {/* Gradients */}
            <defs>
              <linearGradient id="purple-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Brand Name */}
        <h1 className="splash-title" id="splash-app-title">DeTour</h1>
        <p className="splash-subtitle">premium route planner</p>
      </div>
    </div>
  );
}

export default SplashScreen;
