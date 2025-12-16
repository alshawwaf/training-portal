import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api';
import { User, Mail, Lock, Save, ChevronRight, Eye, EyeOff, Edit3 } from 'lucide-react';
import Modal from '../components/Modal';

const Profile: React.FC = () => {
    const { user, isLoading, refreshUser } = useAuth();
    const { showToast } = useToast();
    
    // Profile Form State
    const [editing, setEditing] = useState(false);
    const [profileForm, setProfileForm] = useState({
        first_name: '',
        last_name: '',
        email: ''
    });
    const [savingProfile, setSavingProfile] = useState(false);
    
    // Password Modal State
    const [pwdModalOpen, setPwdModalOpen] = useState(false);
    const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
    const [pwdLoading, setPwdLoading] = useState(false);
    const [showCurrentPwd, setShowCurrentPwd] = useState(false);
    const [showNewPwd, setShowNewPwd] = useState(false);

    useEffect(() => {
        if (user) {
            // Parse name into first/last
            const nameParts = (user.name || '').split(' ');
            setProfileForm({
                first_name: nameParts[0] || '',
                last_name: nameParts.slice(1).join(' ') || '',
                email: user.email || ''
            });
        }
    }, [user]);

    const handleSaveProfile = async () => {
        setSavingProfile(true);
        try {
            await api.put('/auth/profile', {
                name: `${profileForm.first_name} ${profileForm.last_name}`.trim(),
                email: profileForm.email
            });
            showToast('Profile updated successfully', 'success');
            setEditing(false);
            if (refreshUser) refreshUser();
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to update profile', 'error');
        } finally {
            setSavingProfile(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pwdForm.new_password !== pwdForm.confirm_password) {
            showToast('New passwords do not match', 'error');
            return;
        }
        if (pwdForm.new_password.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        setPwdLoading(true);
        try {
            await api.post('/auth/change-password', {
                current_password: pwdForm.current_password,
                new_password: pwdForm.new_password
            });
            showToast('Password updated successfully', 'success');
            setPwdModalOpen(false);
            setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Failed to update password', 'error');
        } finally {
            setPwdLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (!user) {
        window.location.href = '/login';
        return null;
    }

    return (
        <div className="w-full max-w-4xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-primary">My Profile</h1>
                <p className="mt-1 text-secondary">Manage your personal information and account security</p>
            </div>

            {/* Profile Card */}
            <div className="card-elevated overflow-hidden mb-6">
                <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-b border-theme px-6 py-5">
                    <div className="flex items-center gap-5">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-2xl font-bold text-primary">{user?.name}</h2>
                            <p className="text-secondary">{user?.email}</p>
                            <span className="badge badge-info mt-2 inline-block capitalize">{user?.role}</span>
                        </div>
                        {!editing && (
                            <button 
                                onClick={() => setEditing(true)}
                                className="btn-secondary flex items-center gap-2"
                            >
                                <Edit3 className="w-4 h-4" />
                                Edit Profile
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-6">
                    {editing ? (
                        <div className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-secondary uppercase tracking-wider">First Name</label>
                                    <input 
                                        type="text" 
                                        className="input" 
                                        value={profileForm.first_name}
                                        onChange={(e) => setProfileForm(prev => ({...prev, first_name: e.target.value}))}
                                        placeholder="Enter first name"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-secondary uppercase tracking-wider">Last Name</label>
                                    <input 
                                        type="text" 
                                        className="input" 
                                        value={profileForm.last_name}
                                        onChange={(e) => setProfileForm(prev => ({...prev, last_name: e.target.value}))}
                                        placeholder="Enter last name"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-secondary uppercase tracking-wider">Email Address</label>
                                <input 
                                    type="email" 
                                    className="input" 
                                    value={profileForm.email}
                                    onChange={(e) => setProfileForm(prev => ({...prev, email: e.target.value}))}
                                    placeholder="Enter email address"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-theme">
                                <button 
                                    onClick={() => setEditing(false)}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleSaveProfile}
                                    disabled={savingProfile}
                                    className="btn-primary"
                                >
                                    {savingProfile ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            Save Changes
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 bg-secondary/10 rounded-xl">
                                    <p className="text-xs text-secondary uppercase tracking-wider mb-1">First Name</p>
                                    <p className="text-primary font-medium">{profileForm.first_name || '—'}</p>
                                </div>
                                <div className="p-4 bg-secondary/10 rounded-xl">
                                    <p className="text-xs text-secondary uppercase tracking-wider mb-1">Last Name</p>
                                    <p className="text-primary font-medium">{profileForm.last_name || '—'}</p>
                                </div>
                            </div>
                            <div className="p-4 bg-secondary/10 rounded-xl">
                                <p className="text-xs text-secondary uppercase tracking-wider mb-1">Email Address</p>
                                <p className="text-primary font-medium">{profileForm.email}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Security Section */}
            <div className="card-elevated overflow-hidden">
                <div className="flex items-center gap-3 border-b border-theme bg-emerald-500/5 p-5">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <Lock className="w-5 h-5 text-emerald-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-primary">Security</h2>
                </div>
                <div className="p-5">
                    <button 
                        onClick={() => setPwdModalOpen(true)} 
                        className="btn-secondary w-full justify-between group flex items-center"
                    >
                        <span className="flex items-center gap-2 text-primary">
                            <Lock className="w-4 h-4 text-secondary group-hover:text-primary transition-colors" />
                            Change Password
                        </span>
                        <ChevronRight className="w-4 h-4 text-secondary group-hover:text-primary transition-colors" />
                    </button>
                </div>
            </div>

            {/* Password Change Modal */}
            <Modal
                isOpen={pwdModalOpen}
                onClose={() => setPwdModalOpen(false)}
                title="Change Password"
                maxWidth="sm"
            >
                <form onSubmit={handlePasswordChange} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-secondary uppercase tracking-wider">Current Password</label>
                        <div className="relative">
                            <input 
                                type={showCurrentPwd ? "text" : "password"}
                                className="input pr-10" 
                                value={pwdForm.current_password}
                                onChange={(e) => setPwdForm(prev => ({...prev, current_password: e.target.value}))}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors"
                            >
                                {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-secondary uppercase tracking-wider">New Password</label>
                        <div className="relative">
                            <input 
                                type={showNewPwd ? "text" : "password"}
                                className="input pr-10" 
                                value={pwdForm.new_password}
                                onChange={(e) => setPwdForm(prev => ({...prev, new_password: e.target.value}))}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPwd(!showNewPwd)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors"
                            >
                                {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-secondary uppercase tracking-wider">Confirm New Password</label>
                        <input 
                            type="password"
                            className="input" 
                            value={pwdForm.confirm_password}
                            onChange={(e) => setPwdForm(prev => ({...prev, confirm_password: e.target.value}))}
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-theme">
                        <button type="button" onClick={() => setPwdModalOpen(false)} className="btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" disabled={pwdLoading} className="btn-primary">
                            {pwdLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                'Update Password'
                            )}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Profile;
