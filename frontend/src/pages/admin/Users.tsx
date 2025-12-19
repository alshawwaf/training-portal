import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, Trash2, Search, X, Edit2, Users, Layers, ShieldAlert, Key } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
    is_active: boolean;
    is_email_confirmed: boolean;
    must_change_password: boolean;
    group_ids?: number[];
}

interface Permission {
    id: number;
    name: string;
    description: string;
}

interface Group {
    id: number;
    name: string;
    description: string;
    permissions: Permission[];
}

const AdminUsers: React.FC = () => {
    const { showToast } = useToast();
    const { user: currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
    
    const [users, setUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal States
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [showEditUserModal, setShowEditUserModal] = useState(false);

    // Form States - Invite
    const [inviteFirstName, setInviteFirstName] = useState('');
    const [inviteLastName, setInviteLastName] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('instructor');
    const [inviteGroups, setInviteGroups] = useState<number[]>([]);
    
    // User Edit State
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editFirstName, setEditFirstName] = useState('');
    const [editLastName, setEditLastName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editRole, setEditRole] = useState('instructor');
    const [editIsActive, setEditIsActive] = useState(true);
    const [editIsConfirmed, setEditIsConfirmed] = useState(false);
    const [editMustChangePass, setEditMustChangePass] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [editGroups, setEditGroups] = useState<number[]>([]);

    // Group State
    const [groupName, setGroupName] = useState('');
    const [groupDesc, setGroupDesc] = useState('');
    const [groupPermissions, setGroupPermissions] = useState<number[]>([]);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [usersRes, groupsRes, permsRes] = await Promise.all([
                api.get('/users/'),
                api.get('/users/groups'),
                api.get('/users/permissions')
            ]);
            setUsers(usersRes.data);
            setGroups(groupsRes.data);
            setPermissions(permsRes.data);
        } catch (err) {
            showToast('Failed to fetch data', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- User Actions ---
    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await api.post('/users/invite', {
                first_name: inviteFirstName,
                last_name: inviteLastName,
                name: `${inviteFirstName} ${inviteLastName}`,
                email: inviteEmail,
                role: inviteRole,
                group_ids: inviteGroups,
                require_password_change: true
            });
            showToast('Invitation sent successfully', 'success');
            setShowInviteModal(false);
            setInviteFirstName('');
            setInviteLastName('');
            setInviteEmail('');
            setInviteRole('instructor');
            setInviteGroups([]);
            fetchData();
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'Failed to send invitation', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        
        // Password validation
        if (newPassword && newPassword !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }
        if (newPassword && newPassword.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        
        setIsSubmitting(true);
        try {
            const payload: any = {
                first_name: editFirstName,
                last_name: editLastName,
                name: `${editFirstName} ${editLastName}`,
                email: editEmail,
                role: editRole,
                is_active: editIsActive,
                is_email_confirmed: editIsConfirmed,
                password_reset_required: editMustChangePass,
                group_ids: editGroups
            };
            if (newPassword) {
                payload.password = newPassword;
            }
            await api.put(`/users/${editingUser.id}`, payload);
            showToast('User updated successfully', 'success');
            setShowEditUserModal(false);
            setEditingUser(null);
            setNewPassword('');
            setConfirmPassword('');
            setEditGroups([]);
            fetchData();
        } catch (err: any) {
             showToast(err.response?.data?.detail || 'Failed to update user', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
        try {
            await api.delete(`/users/${userId}`);
            showToast('User deleted', 'success');
            fetchData();
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'Failed to delete user', 'error');
        }
    };

    const openEditUser = (user: User) => {
        setEditingUser(user);
        const nameParts = user.name.split(' ');
        setEditFirstName(nameParts[0] || '');
        setEditLastName(nameParts.slice(1).join(' ') || '');
        setEditEmail(user.email);
        setEditRole(user.role);
        setEditIsActive(user.is_active);
        setEditIsConfirmed(user.is_email_confirmed);
        setEditMustChangePass(user.must_change_password);
        setNewPassword('');
        setConfirmPassword('');
        // Initialize user groups if available
        setEditGroups((user as any).groups?.map((g: any) => g.id) || []);
        setShowEditUserModal(true);
    };

    // --- Group Actions ---
    const handleSaveGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (editingGroup) {
                await api.put(`/users/groups/${editingGroup.id}`, {
                    name: groupName,
                    description: groupDesc,
                    permission_ids: groupPermissions
                });
                showToast('Group updated successfully', 'success');
            } else {
                await api.post('/users/groups', {
                    name: groupName,
                    description: groupDesc,
                    permission_ids: groupPermissions
                });
                showToast('Group created successfully', 'success');
            }
            setShowGroupModal(false);
            setGroupName('');
            setGroupDesc('');
            setGroupPermissions([]);
            setEditingGroup(null);
            fetchData();
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'Failed to save group', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteGroup = async (groupId: number) => {
         if (!window.confirm('Are you sure? Users assigned to this group will lose associated permissions.')) return;
         try {
             await api.delete(`/users/groups/${groupId}`);
             showToast('Group deleted', 'success');
             fetchData();
         } catch (err: any) {
             showToast(err.response?.data?.detail || 'Failed to delete group', 'error');
         }
    };

    const openEditGroup = (group: Group) => {
        setEditingGroup(group);
        setGroupName(group.name);
        setGroupDesc(group.description);
        setGroupPermissions(group.permissions.map(p => p.id));
        setShowGroupModal(true);
    };

    const openCreateGroup = () => {
        setEditingGroup(null);
        setGroupName('');
        setGroupDesc('');
        setGroupPermissions([]);
        setShowGroupModal(true);
    }

    const filteredUsers = users.filter(user => 
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Colorful Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 shadow-lg shadow-purple-500/25">
                        <Users className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-primary">Access Management</h1>
                        <p className="text-sm text-secondary">Manage users, groups, and permissions</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {activeTab === 'users' ? (
                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <UserPlus className="w-4 h-4" />
                            Invite User
                        </button>
                    ) : (
                        <button
                            onClick={openCreateGroup}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Layers className="w-4 h-4" />
                            Create Group
                        </button>
                    )}
                </div>
            </div>

            {/* Colorful Tabs */}
            <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl border border-theme w-fit">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
                        activeTab === 'users' 
                            ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg' 
                            : 'text-secondary hover:text-primary hover:bg-secondary/50'
                    }`}
                >
                    <Users className="w-4 h-4" />
                    Users <span className="px-1.5 py-0.5 text-xs bg-white/20 rounded-md">{users.length}</span>
                </button>
                <button
                    onClick={() => setActiveTab('groups')}
                    className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
                        activeTab === 'groups' 
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg' 
                            : 'text-secondary hover:text-primary hover:bg-secondary/50'
                    }`}
                >
                    <Shield className="w-4 h-4" />
                    Groups <span className="px-1.5 py-0.5 text-xs bg-white/20 rounded-md">{groups.length}</span>
                </button>
            </div>

            {/* TAB CONTENT: USERS */}
            {activeTab === 'users' && (
                <div className="animate-in slide-in-from-left-2 duration-300">
                    {/* Search Bar */}
                    <div className="relative group max-w-md mb-6">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary group-focus-within:text-purple-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search by name or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-800/80 dark:bg-slate-800/80 border border-slate-700 rounded-xl text-primary text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
                        />
                    </div>

                    {/* Users Grid - Modern Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {isLoading ? (
                            [1,2,3,4,5,6].map(i => (
                                <div key={i} className="glass rounded-2xl p-5 animate-pulse">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 bg-secondary/30 rounded-full" />
                                        <div className="flex-1">
                                            <div className="h-4 bg-secondary/30 rounded w-3/4 mb-2" />
                                            <div className="h-3 bg-secondary/30 rounded w-1/2" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : filteredUsers.map(user => {
                            const roleColors: Record<string, string> = {
                                admin: 'from-violet-500 to-purple-500',
                                super_admin: 'from-rose-500 to-pink-500',
                                administrator: 'from-rose-500 to-pink-500',
                                instructor: 'from-blue-500 to-cyan-500',
                                student: 'from-emerald-500 to-teal-500',
                            };
                            const gradient = roleColors[user.role] || 'from-slate-500 to-slate-600';
                            
                            return (
                                <div 
                                    key={user.id} 
                                    className="glass rounded-2xl p-5 border border-theme hover:border-purple-500/40 transition-all group"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                                                {user.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-primary flex items-center gap-2">
                                                    {user.name}
                                                    {user.id === currentUser?.id && (
                                                        <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">YOU</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-secondary">{user.email}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => openEditUser(user)}
                                                className="p-2 text-secondary hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.id)}
                                                className="p-2 text-secondary hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg bg-gradient-to-r ${gradient} text-white capitalize`}>
                                            {user.role.replace('_', ' ')}
                                        </span>
                                        <span className={`px-2 py-1 text-xs font-medium rounded-lg ${user.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                            {user.is_active ? '● Active' : '○ Disabled'}
                                        </span>
                                        {!user.is_email_confirmed && (
                                            <span className="px-2 py-1 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-400">
                                                Pending
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* TAB CONTENT: GROUPS */}
            {activeTab === 'groups' && (
                <div className="slide-in-up">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {groups.map(group => (
                            <div key={group.id} className="bg-secondary/30 border border-theme rounded-xl p-5 hover:border-emerald-500/50 transition-colors group relative flex flex-col">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                        <Shield className="w-5 h-5" />
                                    </div>
                                    <div className="flex gap-1 opacity-100 transition-opacity">
                                        <button onClick={() => openEditGroup(group)} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-700"><Edit2 className="w-4 h-4"/></button>
                                        <button onClick={() => handleDeleteGroup(group.id)} className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-slate-700"><Trash2 className="w-4 h-4"/></button>
                                    </div>
                                </div>
                                <h3 className="text-lg font-bold text-primary mb-1">{group.name}</h3>
                                <p className="text-sm text-secondary leading-relaxed mb-4 flex-1">{group.description || "No description provided."}</p>
                                
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Permissions</p>
                                    <div className="flex flex-wrap gap-1">
                                        {group.permissions.length > 0 ? group.permissions.slice(0, 5).map(p => (
                                            <span key={p.id} className="text-[10px] px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-300" title={p.description || ''}>
                                                {p.name}
                                            </span>
                                        )) : <span className="text-[10px] text-slate-600 italic">No permissions assigned</span>}
                                        {group.permissions.length > 5 && (
                                            <span className="text-[10px] px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-500">
                                                +{group.permissions.length - 5} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        {/* Empty State / Add New Card */}
                        <button 
                            onClick={openCreateGroup}
                            className="bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-slate-500 hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all min-h-[250px]"
                        >
                            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                                <UserPlus className="w-6 h-6" />
                            </div>
                            <span className="font-medium">Create New Group</span>
                        </button>
                    </div>
                </div>
            )}

            {/* --- MODALS --- */}

            {/* Invite User Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-primary border border-theme rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-theme bg-gradient-to-r from-violet-600/20 to-purple-600/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg shadow-purple-500/20">
                                    <UserPlus className="w-5 h-5 text-white" />
                                </div>
                                <h2 className="text-xl font-bold text-primary">Invite User</h2>
                            </div>
                            <button onClick={() => setShowInviteModal(false)} className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-secondary/50 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        {/* Form */}
                        <form onSubmit={handleInvite} className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-secondary mb-1.5">First Name</label>
                                    <input type="text" required value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} className="w-full px-4 py-3 bg-secondary/30 border border-theme rounded-xl text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all placeholder:text-secondary" placeholder="John" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-secondary mb-1.5">Last Name</label>
                                    <input type="text" required value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} className="w-full px-4 py-3 bg-secondary/30 border border-theme rounded-xl text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all placeholder:text-secondary" placeholder="Smith" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1.5">Email Address</label>
                                <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-full px-4 py-3 bg-secondary/30 border border-theme rounded-xl text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all placeholder:text-secondary" placeholder="user@company.com" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1.5">Role</label>
                                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full px-4 py-3 bg-secondary/30 border border-theme rounded-xl text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                                    <option value="student">Student</option>
                                    <option value="instructor">Instructor</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>
                            <button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-xl shadow-lg shadow-purple-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50">
                                {isSubmitting ? 'Sending Invitation...' : 'Send Invitation'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {showEditUserModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-primary border border-theme rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-theme bg-gradient-to-r from-blue-600/20 to-cyan-600/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/20">
                                    <Edit2 className="w-5 h-5 text-white" />
                                </div>
                                <h2 className="text-xl font-bold text-primary">Edit User</h2>
                            </div>
                            <button onClick={() => setShowEditUserModal(false)} className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-secondary/50 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        {/* Form - Scrollable */}
                        <form onSubmit={handleUpdateUser} className="p-6 space-y-5 overflow-y-auto flex-1">
                            {/* Name Fields */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-secondary mb-1.5">First Name</label>
                                    <input type="text" required value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} className="w-full px-4 py-3 bg-secondary/30 border border-theme rounded-xl text-primary text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-secondary" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-secondary mb-1.5">Last Name</label>
                                    <input type="text" required value={editLastName} onChange={(e) => setEditLastName(e.target.value)} className="w-full px-4 py-3 bg-secondary/30 border border-theme rounded-xl text-primary text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-secondary" />
                                </div>
                            </div>
                            
                            {/* Email */}
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1.5">Email Address</label>
                                <input type="email" required value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full px-4 py-3 bg-secondary/30 border border-theme rounded-xl text-primary text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-secondary" />
                            </div>
                            
                            {/* Role */}
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1.5">Role</label>
                                <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full px-4 py-3 bg-secondary/30 border border-theme rounded-xl text-primary text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                                    <option value="student">Student</option>
                                    <option value="instructor">Instructor</option>
                                    <option value="admin">Administrator</option>
                                    <option value="super_admin">Super Admin (All Permissions)</option>
                                </select>
                                {editRole === 'super_admin' && (
                                    <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Super Admins have full access to all features and permissions.</p>
                                )}
                            </div>

                            {/* Password Reset Section */}
                            <div className="p-4 bg-secondary/20 border border-theme rounded-xl space-y-4">
                                <div className="flex items-center gap-2">
                                    <Key className="w-4 h-4 text-blue-400" />
                                    <label className="text-sm font-semibold text-white">Reset Password</label>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-secondary mb-1">New Password</label>
                                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-4 py-2.5 bg-secondary/30 border border-theme rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-secondary" placeholder="New password" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-secondary mb-1">Confirm Password</label>
                                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-2.5 bg-secondary/30 border border-theme rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-secondary" placeholder="Confirm password" />
                                    </div>
                                </div>
                                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                                    <p className="text-xs text-red-400">Passwords do not match</p>
                                )}
                                <p className="text-xs text-secondary">Leave both fields blank to keep the current password.</p>
                            </div>

                            {/* User Groups/Permissions */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-secondary">Groups & Permissions</label>
                                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                                    {groups.map(group => (
                                        <label key={group.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-sm ${editGroups.includes(group.id) ? 'bg-blue-500/15 border-blue-500/40 text-blue-400' : 'bg-secondary/30 border-theme text-secondary hover:border-blue-500/30'}`}>
                                            <input 
                                                type="checkbox" 
                                                checked={editGroups.includes(group.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setEditGroups([...editGroups, group.id]);
                                                    else setEditGroups(editGroups.filter(id => id !== group.id));
                                                }}
                                                className="w-4 h-4 rounded border-theme bg-secondary/30 text-blue-500 focus:ring-blue-500" 
                                            />
                                            <span className="truncate">{group.name}</span>
                                        </label>
                                    ))}
                                </div>
                                {groups.length === 0 && (
                                    <p className="text-xs text-secondary italic">No groups available. Create groups in the Groups tab.</p>
                                )}
                            </div>

                            {/* Toggle Options */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-3 p-3 bg-secondary/20 rounded-xl border border-theme cursor-pointer hover:bg-secondary/30 transition-colors">
                                    <input type="checkbox" checked={editIsActive} onChange={(e) => setEditIsActive(e.target.checked)} className="w-5 h-5 rounded border-theme bg-secondary/30 text-blue-600 focus:ring-blue-500" />
                                    <div>
                                        <div className="text-sm font-medium text-primary">Account Active</div>
                                        <div className="text-xs text-secondary">Allow user to log in</div>
                                    </div>
                                </label>
                                
                                <label className="flex items-center gap-3 p-3 bg-secondary/20 rounded-xl border border-theme cursor-pointer hover:bg-secondary/30 transition-colors">
                                    <input type="checkbox" checked={editIsConfirmed} onChange={(e) => setEditIsConfirmed(e.target.checked)} className="w-5 h-5 rounded border-theme bg-secondary/30 text-blue-600 focus:ring-blue-500" />
                                    <div>
                                        <div className="text-sm font-medium text-primary">Email Confirmed</div>
                                        <div className="text-xs text-secondary">Bypass email verification</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 p-3 bg-secondary/20 rounded-xl border border-theme cursor-pointer hover:bg-secondary/30 transition-colors">
                                    <input type="checkbox" checked={editMustChangePass} onChange={(e) => setEditMustChangePass(e.target.checked)} className="w-5 h-5 rounded border-theme bg-secondary/30 text-blue-600 focus:ring-blue-500" />
                                    <div>
                                        <div className="text-sm font-medium text-primary">Require Password Reset</div>
                                        <div className="text-xs text-secondary">Force password change on next login</div>
                                    </div>
                                </label>
                            </div>

                            {editingUser?.id === currentUser?.id && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex gap-3 text-amber-400 text-sm items-start">
                                    <ShieldAlert className="w-5 h-5 shrink-0" />
                                    <p>Caution: You are editing your own account privileges.</p>
                                </div>
                            )}

                            <button type="submit" disabled={isSubmitting || (newPassword !== '' && newPassword !== confirmPassword)} className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100">
                                {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Group Modal */}
            {showGroupModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-primary border border-theme rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-theme bg-gradient-to-r from-emerald-600/20 to-teal-600/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20">
                                    <Layers className="w-5 h-5 text-white" />
                                </div>
                                <h2 className="text-xl font-bold text-primary">{editingGroup ? 'Edit Group' : 'Create Group'}</h2>
                            </div>
                            <button onClick={() => setShowGroupModal(false)} className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-secondary/50 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSaveGroup} className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-100px)]">
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1.5">Group Name</label>
                                <input type="text" required value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full px-4 py-3 bg-secondary/30 border border-theme rounded-xl text-primary text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-secondary" placeholder="e.g. Instructors" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-1.5">Description</label>
                                <textarea required value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} className="w-full px-4 py-3 bg-secondary/30 border border-theme rounded-xl text-primary text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all h-24 resize-none placeholder:text-secondary" placeholder="Brief description of this group..." />
                            </div>

                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-secondary">Permissions</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                                    {permissions.map(perm => (
                                        <label key={perm.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${groupPermissions.includes(perm.id) ? 'bg-emerald-500/15 border-emerald-500/40' : 'bg-secondary/30 border-theme hover:border-emerald-500/30'}`}>
                                            <input 
                                                type="checkbox" 
                                                checked={groupPermissions.includes(perm.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setGroupPermissions([...groupPermissions, perm.id]);
                                                    else setGroupPermissions(groupPermissions.filter(id => id !== perm.id));
                                                }}
                                                className="mt-0.5 w-4 h-4 rounded border-theme bg-secondary/30 text-emerald-500 focus:ring-emerald-500 shrink-0" 
                                            />
                                            <div>
                                                <div className={`text-sm font-semibold ${groupPermissions.includes(perm.id) ? 'text-emerald-400' : 'text-primary'}`}>{perm.name}</div>
                                                <div className="text-xs text-secondary">{perm.description}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50">
                                {isSubmitting ? 'Saving...' : (editingGroup ? 'Update Group' : 'Create Group')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminUsers;

