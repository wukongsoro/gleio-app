import { useState, useEffect } from 'react';

export function useFloatingLogin() {
  const [isVisible, setIsVisible] = useState(false);

  // Show floating login after a delay when user is not authenticated
  useEffect(() => {
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';

    if (!isAuthenticated) {
      // Show floating login after 30 seconds of inactivity
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 30000); // 30 seconds

      return () => clearTimeout(timer);
    }
  }, []);

  const showFloatingLogin = () => setIsVisible(true);
  const hideFloatingLogin = () => setIsVisible(false);

  return {
    isVisible,
    showFloatingLogin,
    hideFloatingLogin
  };
}
