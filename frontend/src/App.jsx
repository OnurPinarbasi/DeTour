import MapView from './components/MapView';
import SplashScreen from './components/SplashScreen';

/**
 * Root component of the DeTour application.
 * Renders the main MapView component to display the interactive map.
 */
function App() {
  return (
    <>
      <SplashScreen />
      <MapView />
    </>
  );
}

export default App;
