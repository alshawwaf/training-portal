import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, User, LayoutDashboard, Settings, Server, BookOpen, Layers, Moon, Sun } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const location = useLocation();

  const navItems = [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Classes', path: '/classes', icon: BookOpen },
      { label: 'Templates', path: '/templates', icon: Layers },
      { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-primary flex">
      {/* Sidebar */}
      <aside className="w-72 bg-elevated/50 backdrop-blur-xl border-r border-theme flex flex-col fixed h-full">
        {/* Logo & Theme Toggle */}
        <div className="p-6 border-b border-theme">
            <div className="flex items-center justify-between">
                <Link to="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
                        <Server className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-primary tracking-tight">SE Portal</h2>
                        <p className="text-xs text-secondary">Training Platform</p>
                    </div>
                </Link>
                <button
                    onClick={toggleDarkMode}
                    className="p-2 rounded-lg bg-secondary/30 hover:bg-secondary text-secondary hover:text-primary transition-all"
                    title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
            </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
            <div className="px-4 mb-2">
                <p className="text-xs font-semibold text-secondary uppercase tracking-wider">Menu</p>
            </div>
            {navItems.map((item) => (
                <Link
                    key={item.path}
                    to={item.path}
                    className={clsx(
                        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                        location.pathname === item.path
                            ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25"
                            : "text-secondary hover:bg-secondary hover:text-primary"
                    )}
                >
                    <item.icon className={clsx(
                        "w-5 h-5 transition-colors relative z-10",
                        location.pathname === item.path ? "text-white" : "text-secondary group-hover:text-primary"
                    )} />
                    <span className="relative z-10">{item.label}</span>
                    {location.pathname === item.path && (
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                </Link>
            ))}
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-theme">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-theme">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-inner">
                    <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{user?.name}</p>
                    <p className="text-xs text-secondary truncate capitalize">{user?.role}</p>
                </div>
                <button 
                    onClick={logout} 
                    className="p-2 text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Logout"
                >
                    <LogOut className="w-4 h-4" />
                </button>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-72 overflow-auto bg-primary">
        <div className="p-8 max-w-7xl mx-auto animate-fade-in">
            {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
