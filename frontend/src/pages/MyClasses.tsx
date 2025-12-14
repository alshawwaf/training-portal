import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, RefreshCw } from 'lucide-react';

interface ClassModel {
    id: number;
    name: string;
    max_users: number;
    status: string;
    start_date: string;
    end_date: string;
    instructor_id: number;
}

const MyClasses: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [classes, setClasses] = useState<ClassModel[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchClasses = async () => {
        setLoading(true);
        try {
            const res = await api.get('/classes/');
            const data = Array.isArray(res.data) ? res.data : [];
            const myClasses = data.filter((cls: ClassModel) => 
                cls.instructor_id === user?.id
            );
            setClasses(myClasses);
        } catch (err) {
            showToast('Failed to fetch classes', 'error');
            setClasses([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClasses();
    }, []);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-primary flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-xl">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        My Classes
                    </h1>
                    <p className="text-secondary mt-1">Classes you've created</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchClasses()}
                        className="flex items-center gap-2 px-4 py-2.5 bg-secondary/50 border border-theme rounded-lg text-sm text-primary hover:bg-secondary transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                    <Link
                        to="/classes/new"
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Class
                    </Link>
                </div>
            </div>

            <div className="card-elevated p-6">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                ) : classes.length === 0 ? (
                    <div className="text-center py-16">
                        <BookOpen className="w-12 h-12 text-secondary mx-auto mb-3" />
                        <p className="text-secondary mb-4">You haven't created any classes yet</p>
                        <Link to="/classes/new" className="text-blue-500 hover:text-blue-400 font-medium">
                            Create your first class →
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {classes.map(cls => (
                            <div key={cls.id} className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl border border-theme">
                                <div>
                                    <h4 className="font-medium text-primary">{cls.name}</h4>
                                    <p className="text-sm text-secondary">
                                        {formatDate(cls.start_date)} - {formatDate(cls.end_date)}
                                    </p>
                                </div>
                                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-sm">
                                    {cls.status}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyClasses;
