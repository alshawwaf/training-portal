import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/TrainingClasses';
import CreateClass from './pages/CreateClass';
import EditClass from './pages/EditClass';
import Settings from './pages/Settings';
import Templates from './pages/Templates';
import AllClasses from './pages/monitoring/AllClasses';
import AllEnvironments from './pages/monitoring/AllEnvironments';
import MyClasses from './pages/MyClasses';
import MyEnvironments from './pages/MyEnvironments';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Logs from './pages/monitoring/Logs';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-secondary">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          <p className="text-secondary">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = user.role === 'admin' || user.role === 'super_admin' || user.role === 'administrator';
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
};

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/classes" element={<ProtectedRoute><Classes /></ProtectedRoute>} />
            <Route path="/classes/new" element={<ProtectedRoute><CreateClass /></ProtectedRoute>} />
            <Route path="/classes/edit/:id" element={<ProtectedRoute><EditClass /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/monitoring/classes" element={<AdminRoute><AllClasses /></AdminRoute>} />
            <Route path="/monitoring/environments" element={<AdminRoute><AllEnvironments /></AdminRoute>} />
            <Route path="/monitoring/logs" element={<AdminRoute><Logs /></AdminRoute>} />
            <Route path="/my/classes" element={<ProtectedRoute><MyClasses /></ProtectedRoute>} />
            <Route path="/my/environments" element={<ProtectedRoute><MyEnvironments /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
