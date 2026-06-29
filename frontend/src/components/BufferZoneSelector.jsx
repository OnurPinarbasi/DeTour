import React from 'react';

/**
 * BufferZoneSelector component allows users to choose deviation distance.
 * Options: 10 km, 20 km, 30 km.
 */
function BufferZoneSelector({ value, onChange }) {
  const options = [10, 20, 30];
  const activeIndex = options.indexOf(value);

  return (
    <div className="buffer-selector-container">
      <span className="buffer-label">Max Deviation Distance</span>
      <div className="buffer-options">
        <div 
          className="buffer-active-indicator" 
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`buffer-option-btn ${value === option ? 'active' : ''}`}
            onClick={() => onChange(option)}
          >
            {option} km
          </button>
        ))}
      </div>
    </div>
  );
}

export default BufferZoneSelector;
