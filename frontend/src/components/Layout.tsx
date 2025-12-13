import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { 
    LogOut, User, LayoutDashboard, Settings, Server, BookOpen, Layers, 
    Moon, Sun, Monitor, ChevronDown, ChevronRight, Activity, FolderOpen 
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

interface NavItem {
    label: string;
    path: string;
    icon: React.ElementType;
}

interface NavSection {
    title: string;
    items: NavItem[];
    adminOnly?: boolean;
    defaultOpen?: boolean;
}

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, logout } = useAuth();
    const { darkMode, toggleDarkMode } = useTheme();
    const location = useLocation();

    // Check if user is admin
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'administrator';

    // Collapsible section state
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        monitoring: true,
        workspace: true,
        menu: true
    });

    const toggleSection = (section: string) => {
        setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const mainNavItems: NavItem[] = [
        { label: 'Dashboard', path: '/', icon: LayoutDashboard },
        { label: 'Classes', path: '/classes', icon: BookOpen },
        { label: 'Templates', path: '/templates', icon: Layers },
        { label: 'Settings', path: '/settings', icon: Settings },
    ];

    const monitoringItems: NavItem[] = [
        { label: 'All Classes', path: '/monitoring/classes', icon: BookOpen },
        { label: 'All Environments', path: '/monitoring/environments', icon: Monitor },
    ];

    const workspaceItems: NavItem[] = [
        { label: 'My Classes', path: '/my/classes', icon: FolderOpen },
        { label: 'My Environments', path: '/my/environments', icon: Activity },
    ];

    const renderNavItem = (item: NavItem) => {
        const isActive = location.pathname === item.path;
        return (
            <Link
                key={item.path}
                to={item.path}
                className={clsx(
                    "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                    isActive
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25"
                        : "text-secondary hover:bg-secondary hover:text-primary"
                )}
            >
                <item.icon className={clsx(
                    "w-4 h-4 transition-colors",
                    isActive ? "text-white" : "text-secondary group-hover:text-primary"
                )} />
                <span>{item.label}</span>
            </Link>
        );
    };

    const renderSection = (title: string, items: NavItem[], sectionKey: string, gradient?: string) => {
        const isOpen = openSections[sectionKey];
        const hasActiveItem = items.some(item => location.pathname === item.path);

        return (
            <div className="space-y-1">
                <button
                    onClick={() => toggleSection(sectionKey)}
                    className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-secondary uppercase tracking-wider hover:text-primary transition-colors"
                >
                    <span className={clsx(hasActiveItem && gradient)}>{title}</span>
                    {isOpen ? (
                        <ChevronDown className="w-3 h-3" />
                    ) : (
                        <ChevronRight className="w-3 h-3" />
                    )}
                </button>
                {isOpen && (
                    <div className="space-y-1 pl-2">
                        {items.map(renderNavItem)}
                    </div>
                )}
            </div>
        );
    };

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
                <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
                    {/* Main Menu */}
                    {renderSection('Menu', mainNavItems, 'menu')}

                    {/* Monitoring Section (Admin Only) */}
                    {isAdmin && (
                        <div className="pt-2 border-t border-theme">
                            {renderSection('Monitoring', monitoringItems, 'monitoring', 'text-purple-400')}
                        </div>
                    )}

                    {/* My Workspace Section */}
                    <div className="pt-2 border-t border-theme">
                        {renderSection('My Workspace', workspaceItems, 'workspace', 'text-emerald-400')}
                    </div>
                </nav>

                {/* User Section */}
                <div className="p-4 border-t border-theme">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-theme">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-inner">
                            <User className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-primary truncate">{user?.name}</p>
                            <p className="text-xs text-secondary truncate capitalize">
                                {isAdmin && <span className="text-purple-400">Admin</span>}
                                {!isAdmin && user?.role}
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

