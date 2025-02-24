import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import CalibrationIndex from './pages/CalibrationIndex';
import CalibrationPage from './pages/CalibrationPage';
import PrivateRoute from './components/PrivateRoute';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route element={<PrivateRoute />}>
        <Route path="/dashboard" element={
          <ErrorBoundary>
            <CalibrationIndex />
          </ErrorBoundary>
        } />
        <Route path="/calibration/:id" element={
          <ErrorBoundary>
            <CalibrationPage />
          </ErrorBoundary>
        } />
      </Route>
    </Routes>
  );
};

export default App;