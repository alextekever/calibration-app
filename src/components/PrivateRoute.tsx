// src/components/PrivateRoute.tsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const PrivateRoute: React.FC = () => {
  const token = localStorage.getItem("access_token");
  console.log("PrivateRoute token:", token); // Debug log
  return token ? <Outlet /> : <Navigate to="/" />;
};

export default PrivateRoute;
