import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/TrainingClasses';

import Settings from './pages/Settings';
import Templates from './pages/Templates';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Logs from './pages/monitoring/Logs';
import ActiveSessions from './pages/monitoring/ActiveSessions';
import InstructorConsole from './pages/monitoring/InstructorConsole';
import Register from './pages/auth/Register';
import VerifyEmail from './pages/auth/VerifyEmail';
import AdminUsers from './pages/admin/Users';
import ClassView from './pages/classes/ClassView';
// import GuestJoin from './pages/classes/GuestJoin'; // Legacy join page
import JoinClass from './pages/JoinClass';
import StudentClassViewer from './pages/StudentClassViewer';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const { classId } = useParams<{ classId: string }>();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-slate-400">Verifying session...</p>
        </div>
      </div>
    );
  }
  
  // Check for guest access if not logged in
  const guestToken = classId ? sessionStorage.getItem(`guest_token_${classId}`) : null;
  
  if (!user && !guestToken) {
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
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            
            {/* Student Routes */}
            <Route path="/join/:token" element={<JoinClass />} />
            <Route path="/student/class" element={<StudentClassViewer />} />
            
            {/* Admin/Instructor Routes */}
            <Route path="/classes/:classId/view" element={<ProtectedRoute><ClassView /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/classes" element={<ProtectedRoute><Classes /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/monitoring/logs" element={<AdminRoute><Logs /></AdminRoute>} />
            <Route path="/monitoring/sessions" element={<AdminRoute><ActiveSessions /></AdminRoute>} />
            <Route path="/monitoring/console" element={<AdminRoute><InstructorConsole /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
