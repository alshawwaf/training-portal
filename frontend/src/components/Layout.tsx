import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NotificationBell } from '../context/ToastContext';
import { LogOut, User, LayoutDashboard, Settings, BookOpen, Layers, Moon, Sun, Activity, Monitor, Server, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

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

  const NavLink = ({ item, colorClass }: { item: { label: string; path: string; icon: React.ElementType }, colorClass: string }) => (
    <Link
      to={item.path}
      className={clsx(
        "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 group relative overflow-hidden",
        collapsed ? "justify-center" : "",
        location.pathname === item.path
          ? "text-white"
          : "text-secondary hover:text-primary hover:bg-secondary/40"
      )}
      title={collapsed ? item.label : undefined}
    >
      {location.pathname === item.path && (
        <div className={clsx("absolute inset-0 shadow-lg", colorClass)} />
      )}
      <item.icon className={clsx(
        "w-5 h-5 relative z-10 transition-transform duration-300 group-hover:scale-110 flex-shrink-0",
        location.pathname === item.path ? "text-white" : ""
      )} />
      {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
    </Link>
  );

  return (
    <div className="min-h-screen h-screen bg-primary flex overflow-hidden">
      <aside className={clsx(
        "bg-secondary/30 backdrop-blur-xl border-r border-theme flex flex-col h-screen transition-all duration-300 ease-in-out flex-shrink-0",
        collapsed ? "w-20" : "w-64"
      )}>
        {/* Header */}
        <div className={clsx("p-4 flex items-center", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <Link to="/" className="flex items-center group transition-transform duration-300 hover:scale-105 gap-3">
              <div className="relative w-8 h-8 flex-shrink-0">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg shadow-lg flex items-center justify-center">
                   <span className="text-white font-bold text-xs tracking-tighter">TP</span>
                </div>
              </div>
              <span className="font-bold text-lg text-white tracking-tight">Training Portal</span>
            </Link>
          )}
          <div className={clsx("flex items-center gap-2", collapsed ? "flex-col" : "")}>
            {collapsed && (
              <Link to="/" className="mb-2 flex justify-center">
                 <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-xs tracking-tighter">TP</span>
                 </div>
              </Link>
            )}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl bg-secondary/50 hover:bg-secondary text-secondary hover:text-primary border border-theme hover:border-blue-500/30 transition-all duration-300"
              title={darkMode ? 'Light Mode' : 'Dark Mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <NotificationBell />
          </div>
        </div>

        {/* Navigation - scrollable middle section */}
        <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto custom-scrollbar min-h-0">
          {/* Platform Section */}
          {!isStudent && (
            <div>
              {!collapsed && <p className="px-3 mb-2 text-[10px] font-bold text-secondary/60 uppercase tracking-[0.2em]">Platform</p>}
              <div className="space-y-1">
                {mainNavItems.map(item => (
                  <NavLink key={item.path} item={item} colorClass="bg-gradient-to-r from-blue-600 to-indigo-600" />
                ))}
              </div>
            </div>
          )}

          {/* Student Section */}
          {isStudent && (
            <div>
              {!collapsed && <p className="px-3 mb-2 text-[10px] font-bold text-blue-400/80 uppercase tracking-[0.2em]">Learning</p>}
              <div className="space-y-1">
                <NavLink item={{ label: 'My Workspace', path: '/student/class', icon: Monitor }} colorClass="bg-gradient-to-r from-blue-600 to-indigo-600" />
              </div>
            </div>
          )}

          {/* Workspace Section */}
          {!isStudent && isInstructor && (
            <div>
              {!collapsed && <p className="px-3 mb-2 text-[10px] font-bold text-fuchsia-400/80 uppercase tracking-[0.2em]">Workspace</p>}
              <div className="space-y-1">
                {workspaceItems.map(item => (
                  <NavLink key={item.path} item={item} colorClass="bg-gradient-to-r from-fuchsia-600 to-pink-600" />
                ))}
              </div>
            </div>
          )}

          {/* Monitoring Section */}
          {isAdmin && (
            <div>
              {!collapsed && <p className="px-3 mb-2 text-[10px] font-bold text-purple-400/80 uppercase tracking-[0.2em]">Monitoring</p>}
              <div className="space-y-1">
                {monitoringItems.map(item => (
                  <NavLink key={item.path} item={item} colorClass="bg-gradient-to-r from-purple-600 to-pink-600" />
                ))}
              </div>
            </div>
          )}

          {/* Management Section */}
          {isAdmin && (
            <div>
              {!collapsed && <p className="px-3 mb-2 text-[10px] font-bold text-blue-400/80 uppercase tracking-[0.2em]">Management</p>}
              <div className="space-y-1">
                {adminItems.map(item => (
                  <NavLink key={item.path} item={item} colorClass="bg-gradient-to-r from-blue-500 to-cyan-500" />
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Footer - fixed at bottom */}
        <div className="border-t border-theme p-3 space-y-2 flex-shrink-0">
          {/* Settings */}
          {user && (
            <NavLink item={settingsItem} colorClass="bg-gradient-to-r from-slate-600 to-slate-800" />
          )}
          
          {/* Collapse Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={clsx(
              "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-secondary hover:text-primary hover:bg-secondary/40 transition-all",
              collapsed ? "justify-center" : ""
            )}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            {!collapsed && <span>Collapse</span>}
          </button>

          {/* Logout */}
          <button 
            onClick={logout} 
            className={clsx(
              "w-full flex items-center gap-3 px-4 py-2.5 text-secondary hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm font-medium",
              collapsed ? "justify-center" : ""
            )}
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-primary">
        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
