import React, { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import {
  Users,
  Monitor,
  BookOpen,
  Activity,
  Plus,
  Calendar,
  Clock,
  ArrowRight,
  Server,
  Zap,
  Link2,
} from "lucide-react";
import { Link } from "react-router-dom";
import clsx from "clsx";

interface DashboardStats {
  activeClasses: number;
  totalStudents: number;
  activeEnvironments: number;
  totalTemplates: number;
}

interface RecentClass {
  id: number;
  name: string;
  status: string;
  start_date: string;
  max_users: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'administrator';
  
  const [stats, setStats] = useState<DashboardStats>({
    activeClasses: 0,
    totalStudents: 0,
    activeEnvironments: 0,
    totalTemplates: 0,
  });

  const [recentClasses, setRecentClasses] = useState<RecentClass[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      // Fetch all data in parallel
      const [statsRes, classesRes, templatesRes, logsRes] = await Promise.all([
        api.get("/dashboard/stats?vendor=all"),
        api.get("/classes/"),
        api.get("/templates/"),
        api.get("/logs/?limit=5")
      ]);

      const data = statsRes.data || {};
      const classes = Array.isArray(classesRes.data) ? classesRes.data : [];
      const templates = Array.isArray(templatesRes.data) ? templatesRes.data : [];
      const logs = Array.isArray(logsRes.data) ? logsRes.data : [];

      setStats({
        activeClasses: classes.filter((c: any) => c.status === 'active').length,
        totalStudents: data.total_students ?? 0,
        activeEnvironments: data.active_environments ?? 0,
        totalTemplates: templates.length,
      });

      // Get recent classes sorted by start date
      const sortedClasses = classes
        .sort((a: any, b: any) => new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime())
        .slice(0, 5);
      setRecentClasses(sortedClasses);

      setRecentLogs(logs);

    } catch (err) {
      console.error("Dashboard refresh failed", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'No date';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const copyJoinLink = (e: React.MouseEvent, token: string) => {
    e.preventDefault();
    e.stopPropagation();
    const link = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(link);
    // You might want to add a toast here, but we need to hook into useToast
    // For now, let's just rely on the user knowing they clicked it or add a visual feedback
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Welcome Header - Rendered immediately for better LCP */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">
            {getGreeting()}, {user?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-secondary text-sm mt-1">
            Here's what's happening with your training platform today.
          </p>
        </div>
        {isAdmin && (
          <Link
            to="/classes"
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Class
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-28 bg-secondary/20 rounded-2xl"></div>)}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="h-80 bg-secondary/20 rounded-2xl"></div>
            <div className="h-80 bg-secondary/20 rounded-2xl"></div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard 
              label="Active Classes" 
              value={stats.activeClasses} 
              icon={BookOpen} 
              color="blue" 
            />
            <StatCard 
              label="Templates" 
              value={stats.totalTemplates} 
              icon={Server} 
              color="purple" 
            />
            <StatCard 
              label="Active Environments" 
              value={stats.activeEnvironments} 
              icon={Monitor} 
              color="emerald" 
            />
            <StatCard 
              label="Total Students" 
              value={stats.totalStudents} 
              icon={Users} 
              color="amber" 
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Classes */}
            <div className="glass rounded-2xl border border-theme p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                  <h2 className="font-bold text-primary">Recent Classes</h2>
                </div>
                <Link to="/classes" className="text-xs font-semibold text-blue-500 hover:text-blue-400 flex items-center gap-1">
                  View All <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              
              {recentClasses.length > 0 ? (
                <div className="space-y-3">
                  {recentClasses.map((cls: any) => (
                    <Link 
                      key={cls.id} 
                      to="/classes"
                      className="flex items-center justify-between p-3 bg-secondary/20 hover:bg-secondary/40 rounded-xl transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-primary truncate group-hover:text-blue-400 transition-colors">
                            {cls.name}
                          </h3>
                          {cls.status === 'active' && cls.join_token && (
                            <button
                              onClick={(e) => copyJoinLink(e, cls.join_token)}
                              className="p-1 text-emerald-500 hover:bg-emerald-500/20 rounded transition-colors"
                              title="Copy Student Join Link"
                            >
                              <Link2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-secondary">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(cls.start_date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {cls.max_users} seats
                          </span>
                        </div>
                      </div>
                      <span className={clsx(
                        "px-2 py-1 text-[10px] font-bold uppercase rounded",
                        cls.status === 'active' 
                          ? "bg-emerald-500/10 text-emerald-500" 
                          : cls.status === 'draft'
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-slate-500/10 text-slate-500"
                      )}>
                        {cls.status}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-secondary">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No classes yet</p>
                  <Link to="/classes" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
                    Create your first class
                  </Link>
                </div>
              )}
            </div>

        {/* Recent Activity */}
        <div className="glass rounded-2xl border border-theme p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-500" />
              <h2 className="font-bold text-primary">Recent Activity</h2>
            </div>
            {isAdmin && (
              <Link to="/monitoring/logs" className="text-xs font-semibold text-purple-500 hover:text-purple-400 flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
          
          {recentLogs.length > 0 ? (
            <div className="space-y-3">
              {recentLogs.map((log: any) => (
                <div 
                  key={log.id} 
                  className="flex items-start gap-3 p-3 bg-secondary/20 rounded-xl"
                >
                  <div className={clsx(
                    "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                    log.level === 'ERROR' ? "bg-red-500" 
                    : log.level === 'WARNING' ? "bg-amber-500" 
                    : "bg-blue-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">
                      {log.action}
                    </p>
                    <p className="text-xs text-secondary truncate">
                      {log.entity_name || 'System'}
                    </p>
                  </div>
                  <span className="text-[10px] text-secondary flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-secondary">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No recent activity</p>
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* Quick Actions */}
      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction 
            label="Manage Classes" 
            icon={BookOpen} 
            to="/classes" 
            color="blue" 
          />
          <QuickAction 
            label="Templates" 
            icon={Server} 
            to="/templates" 
            color="purple" 
          />
          <QuickAction 
            label="View Logs" 
            icon={Activity} 
            to="/monitoring/logs" 
            color="emerald" 
          />
          <QuickAction 
            label="Users" 
            icon={Users} 
            to="/admin/users" 
            color="amber" 
          />
        </div>
      )}
    </div>
  );
};

// --- Sub Components ---

const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ElementType;
  color: 'blue' | 'purple' | 'emerald' | 'amber';
}> = ({ label, value, icon: Icon, color }) => {
  const colors = {
    blue: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    purple: "text-purple-500 bg-purple-500/10 border-purple-500/20",
    emerald: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  };

  return (
    <div className="glass rounded-xl border border-theme p-4 hover:bg-secondary/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className={clsx("p-2 rounded-lg border", colors[color])}>
          <Icon className="w-4 h-4" />
        </div>
        <Zap className="w-4 h-4 text-secondary/30" />
      </div>
      <div>
        <p className="text-2xl font-bold text-primary">{value}</p>
        <p className="text-xs text-secondary font-medium">{label}</p>
      </div>
    </div>
  );
};

const QuickAction: React.FC<{
  label: string;
  icon: React.ElementType;
  to: string;
  color: 'blue' | 'purple' | 'emerald' | 'amber';
}> = ({ label, icon: Icon, to, color }) => {
  const colors = {
    blue: "text-blue-500 hover:bg-blue-500/10 border-blue-500/20",
    purple: "text-purple-500 hover:bg-purple-500/10 border-purple-500/20",
    emerald: "text-emerald-500 hover:bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-500 hover:bg-amber-500/10 border-amber-500/20",
  };

  return (
    <Link 
      to={to} 
      className={clsx(
        "flex items-center gap-3 p-4 rounded-xl border border-theme glass transition-all hover:-translate-y-0.5",
        colors[color]
      )}
    >
      <Icon className="w-5 h-5" />
      <span className="font-semibold text-primary text-sm">{label}</span>
    </Link>
  );
};

export default Dashboard;
