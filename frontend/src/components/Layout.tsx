import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, User, LayoutDashboard, Settings, Server, BookOpen, Layers, Moon, Sun, Monitor, FolderOpen, Activity } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const location = useLocation();

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'administrator';

  const mainNavItems = [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Classes', path: '/classes', icon: BookOpen },
      { label: 'Templates', path: '/templates', icon: Layers },
      { label: 'Settings', path: '/settings', icon: Settings },
  ];

  const monitoringItems = [
      { label: 'All Classes', path: '/monitoring/classes', icon: BookOpen },
      { label: 'All Environments', path: '/monitoring/environments', icon: Monitor },
  ];

  const workspaceItems = [
      { label: 'My Classes', path: '/my/classes', icon: FolderOpen },
      { label: 'My Environments', path: '/my/environments', icon: Activity },
  ];

  const renderNavItem = (item: { label: string; path: string; icon: React.ElementType }) => (
    <Link
      key={item.path}
      to={item.path}
      className={clsx(
        "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
        location.pathname === item.path
          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25"
          : "text-secondary hover:bg-secondary hover:text-primary"
      )}
    >
      <item.icon className={clsx(
        "w-5 h-5 transition-colors",
        location.pathname === item.path ? "text-white" : "text-secondary group-hover:text-primary"
      )} />
      <span>{item.label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-primary flex">
      <aside className="w-72 bg-elevated/50 backdrop-blur-xl border-r border-theme flex flex-col fixed h-full z-40">
        <div className="p-4 border-b border-theme">
            <div className="flex items-center justify-between">
                <Link to="/" className="flex items-center group">
                    <img src="/logo.png" alt="Check Point" className="h-10 object-contain rounded-lg bg-white p-1" />
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

        <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
            <div>
                <p className="px-4 mb-2 text-xs font-semibold text-secondary uppercase tracking-wider">Menu</p>
                <div className="space-y-1">{mainNavItems.map(renderNavItem)}</div>
            </div>

            {isAdmin && (
              <div className="pt-3 border-t border-theme">
                <p className="px-4 mb-2 text-xs font-semibold text-purple-400 uppercase tracking-wider">Monitoring</p>
                <div className="space-y-1">{monitoringItems.map(renderNavItem)}</div>
              </div>
            )}

            <div className="pt-3 border-t border-theme">
                <p className="px-4 mb-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">My Workspace</p>
                <div className="space-y-1">{workspaceItems.map(renderNavItem)}</div>
            </div>
        </nav>

        <div className="p-4 border-t border-theme">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-theme">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-inner">
                    <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{user?.name}</p>
                    <p className="text-xs text-secondary truncate capitalize">
                      {isAdmin ? <span className="text-purple-400">Admin</span> : user?.role}
                    </p>
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

      <main className="flex-1 ml-72 overflow-auto bg-primary z-10">
        <div className="p-8 max-w-7xl mx-auto">
            {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
