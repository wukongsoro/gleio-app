import React from 'react';
import { Navigate } from '@remix-run/react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  isAuthenticated?: boolean;
  redirectTo?: string;
}

// Mock authentication check - replace with your actual auth logic
function useAuth() {
  // This should be replaced with your actual authentication logic
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  return { isAuthenticated };
}

export function ProtectedRoute({
  children,
  isAuthenticated: propIsAuthenticated,
  redirectTo = '/login'
}: ProtectedRouteProps) {
  // Use prop if provided, otherwise check auth state
  const { isAuthenticated: hookIsAuthenticated } = useAuth();
  const isAuthenticated = propIsAuthenticated ?? hookIsAuthenticated;

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

// Utility function to check authentication status
export function isUserAuthenticated(): boolean {
  return localStorage.getItem('isAuthenticated') === 'true';
}

// Utility function to set authentication status
export function setAuthenticationStatus(isAuthenticated: boolean): void {
  if (isAuthenticated) {
    localStorage.setItem('isAuthenticated', 'true');
  } else {
    localStorage.removeItem('isAuthenticated');
  }
}
