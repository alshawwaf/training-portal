import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, User, LayoutDashboard, Settings, BookOpen, Layers, Moon, Sun, Activity, Monitor, Server } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const location = useLocation();

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'administrator';
  const isInstructor = isAdmin || user?.role === 'instructor';
  const isStudent = user?.role === 'student' || (!user && !!sessionStorage.getItem('guest_token'));

  const mainNavItems = [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  ];

  const monitoringItems = [
    { label: 'Instructor Console', path: '/monitoring/console', icon: Monitor },
    { label: 'Infrastructure', path: '/infrastructure', icon: Server },
    { label: 'Active Sessions', path: '/monitoring/sessions', icon: User },
    { label: 'Logs', path: '/monitoring/logs', icon: Activity },
  ];

  const adminItems = [
    { label: 'Users & Groups', path: '/admin/users', icon: User },
  ];

  const workspaceItems = [
      { label: 'Classes', path: '/classes', icon: BookOpen },
      { label: 'Templates', path: '/templates', icon: Layers },
  ];

  const settingsItem = { label: 'Settings', path: '/settings', icon: Settings };


  return (
    <div className="min-h-screen bg-primary flex">
      <aside className="w-72 bg-secondary/30 backdrop-blur-xl border-r border-theme flex flex-col fixed h-full z-40">
        <div className="p-6">
            <div className="flex items-center justify-between">
                <Link to="/" className="flex items-center group transition-transform duration-300 hover:scale-105">
                    <div className="relative">
                        <div className="absolute -inset-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-25 group-hover:opacity-40 transition-opacity" />
                        <img src="/logo.png" alt="Check Point" className="relative h-9 object-contain rounded-lg bg-white p-1 shadow-sm" />
                    </div>
                </Link>
                <button
                    onClick={toggleDarkMode}
                    className="p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary text-secondary hover:text-primary border border-theme hover:border-blue-500/30 transition-all duration-300"
                    title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
            </div>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-7 overflow-y-auto custom-scrollbar">
            {/* Standard Platform Section - Hidden for students */}
            {!isStudent && (
              <div>
                <p className="px-4 mb-3 text-[10px] font-bold text-secondary/60 uppercase tracking-[0.2em]">Platform</p>
                <div className="space-y-1.5">{mainNavItems.map(item => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 group relative overflow-hidden",
                            location.pathname === item.path
                                ? "text-white"
                                : "text-secondary hover:text-primary hover:bg-secondary/40"
                        )}
                    >
                        {location.pathname === item.path && (
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_4px_12px_rgba(37,99,235,0.3)]" />
                        )}
                        <item.icon className={clsx(
                            "w-5 h-5 relative z-10 transition-transform duration-300 group-hover:scale-110",
                            location.pathname === item.path ? "text-white" : "text-blue-500/70 group-hover:text-blue-500"
                        )} />
                        <span className="relative z-10">{item.label}</span>
                    </Link>
                ))}</div>
              </div>
            )}

            {/* Student Section - My Class */}
            {isStudent && (
                <div>
                    <p className="px-4 mb-3 text-[10px] font-bold text-blue-400/80 uppercase tracking-[0.2em]">Learning</p>
                    <div className="space-y-1.5">
                        <Link
                            to="/student/class"
                            className={clsx(
                                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 group relative overflow-hidden",
                                location.pathname === "/student/class"
                                    ? "text-white"
                                    : "text-secondary hover:text-primary hover:bg-secondary/40"
                            )}
                        >
                            {location.pathname === "/student/class" && (
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600" />
                            )}
                            <Monitor className={clsx(
                                "w-5 h-5 relative z-10",
                                location.pathname === "/student/class" ? "text-white" : "text-blue-500/70"
                            )} />
                            <span className="relative z-10">My Workspace</span>
                        </Link>
                    </div>
                </div>
            )}

            {!isStudent && isInstructor && (
                <div className="pt-2">
                    <p className="px-4 mb-3 text-[10px] font-bold text-emerald-400/80 uppercase tracking-[0.2em]">Workspace</p>
                    <div className="space-y-1.5">{workspaceItems.map(item => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 group relative overflow-hidden",
                            location.pathname === item.path
                                ? "text-white"
                                : "text-secondary hover:text-primary hover:bg-secondary/40"
                        )}
                    >
                        {location.pathname === item.path && (
                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-600 shadow-[0_4px_12px_rgba(16,185,129,0.3)]" />
                        )}
                        <item.icon className={clsx(
                            "w-5 h-5 relative z-10 transition-transform duration-300 group-hover:scale-110",
                            location.pathname === item.path ? "text-white" : "text-emerald-500/70 group-hover:text-emerald-500"
                        )} />
                        <span className="relative z-10">{item.label}</span>
                    </Link>
                ))}</div>
            </div>
            )}

            {/* Monitoring section - Admin only */}
            {isAdmin && (
                <div className="pt-2">
                  <p className="px-4 mb-3 text-[10px] font-bold text-purple-400/80 uppercase tracking-[0.2em]">Monitoring</p>
                  <div className="space-y-1.5">{monitoringItems.map(item => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 group relative overflow-hidden",
                            location.pathname === item.path
                                ? "text-white"
                                : "text-secondary hover:text-primary hover:bg-secondary/40"
                        )}
                    >
                        {location.pathname === item.path && (
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 shadow-[0_4px_12px_rgba(147,51,234,0.3)]" />
                        )}
                        <item.icon className={clsx(
                            "w-5 h-5 relative z-10 transition-transform duration-300 group-hover:scale-110",
                            location.pathname === item.path ? "text-white" : "text-purple-500/70 group-hover:text-purple-500"
                        )} />
                        <span className="relative z-10">{item.label}</span>
                    </Link>
                  ))}</div>
                </div>
            )}

            {/* Management section - Admin only */}
            {isAdmin && (
                <div className="pt-2">
                  <p className="px-4 mb-3 text-[10px] font-bold text-blue-400/80 uppercase tracking-[0.2em]">Management</p>
                  <div className="space-y-1.5">{adminItems.map(item => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={clsx(
                            "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 group relative overflow-hidden",
                            location.pathname === item.path
                                ? "text-white"
                                : "text-secondary hover:text-primary hover:bg-secondary/40"
                        )}
                    >
                        {location.pathname === item.path && (
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 shadow-[0_4px_12px_rgba(59,130,246,0.3)]" />
                        )}
                        <item.icon className={clsx(
                            "w-5 h-5 relative z-10 transition-transform duration-300 group-hover:scale-110",
                            location.pathname === item.path ? "text-white" : "text-blue-400/70 group-hover:text-blue-400"
                        )} />
                        <span className="relative z-10">{item.label}</span>
                    </Link>
                  ))}</div>
                </div>
            )}

            {/* Settings - Hidden for guests */}
            {user && (
                <div className="pt-2">
                    <div className="space-y-1.5">
                        <Link
                            to={settingsItem.path}
                            className={clsx(
                                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 group relative overflow-hidden",
                                location.pathname === settingsItem.path
                                    ? "text-white"
                                    : "text-secondary hover:text-primary hover:bg-secondary/40"
                            )}
                        >
                            {location.pathname === settingsItem.path && (
                                <div className="absolute inset-0 bg-gradient-to-r from-slate-600 to-slate-800 shadow-lg shadow-slate-900/20" />
                            )}
                            <settingsItem.icon className={clsx(
                                "w-5 h-5 relative z-10 transition-transform duration-300 group-hover:rotate-45",
                                location.pathname === settingsItem.path ? "text-white" : "text-secondary group-hover:text-primary"
                            )} />
                            <span className="relative z-10">{settingsItem.label}</span>
                        </Link>
                    </div>
                </div>
            )}

        </nav>

        <div className="p-4 mt-auto border-t border-theme">
            <button 
                onClick={logout} 
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-secondary hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm font-medium"
                title="Logout"
            >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
            </button>
        </div>
      </aside>

      <main className="flex-1 ml-72 overflow-auto bg-primary z-10">
        <div className="p-8 max-w-7xl mx-auto">
            {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
