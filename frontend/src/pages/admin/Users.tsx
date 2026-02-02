import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { UserPlus, Shield, Trash2, Search, X, Edit2, Users, Layers, ShieldAlert, Key, ChevronDown, ChevronRight, Check, User, Mail, Lock, AlertTriangle } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
    is_active: boolean;
    is_email_confirmed: boolean;
    must_change_password: boolean;
    group_ids?: number[];
    groups?: { id: number; name: string }[];
    last_login?: string;
    invited_at?: string;
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
    const [activeTab, setActiveTab] = useState<'users' | 'groups' | 'invitations'>('users');
    
    const [users, setUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
    const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);

    // Modal States
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [showEditUserModal, setShowEditUserModal] = useState(false);
    const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
    const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
    const [isGroupsDropdownOpen, setIsGroupsDropdownOpen] = useState(false);

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
        if (!window.confirm('Are you sure you want to delete this user?')) return;
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
        setEditGroups(user.groups?.map(g => g.id) || []);
        setIsGroupsDropdownOpen(false);
        setShowEditUserModal(true);
    };

    const openResetPassword = (user: User) => {
        setResetPasswordUser(user);
        setNewPassword('');
        setConfirmPassword('');
        setShowResetPasswordModal(true);
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetPasswordUser) return;
        
        if (newPassword !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }
        if (newPassword.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        
        setIsSubmitting(true);
        try {
            await api.put(`/users/${resetPasswordUser.id}`, { password: newPassword });
            showToast('Password reset successfully', 'success');
            setShowResetPasswordModal(false);
            setResetPasswordUser(null);
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'Failed to reset password', 'error');
        } finally {
            setIsSubmitting(false);
        }
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
         if (!window.confirm('Are you sure? Users in this group will lose associated permissions.')) return;
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

    const getRoleBadge = (role: string) => {
        const colors: Record<string, string> = {
            admin: 'bg-violet-500/20 text-violet-400',
            super_admin: 'bg-rose-500/20 text-rose-400',
            administrator: 'bg-rose-500/20 text-rose-400',
            instructor: 'bg-blue-500/20 text-blue-400',
            student: 'bg-emerald-500/20 text-emerald-400',
        };
        return colors[role] || 'bg-slate-500/20 text-slate-400';
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            {/* Compact Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500">
                        <Users className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-primary">Users & Groups</h1>
                </div>
                <div className="flex gap-2">
                    {activeTab === 'users' ? (
                        <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors">
                            <UserPlus className="w-4 h-4" /> Invite
                        </button>
                    ) : (
                        <button onClick={openCreateGroup} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
                            <Layers className="w-4 h-4" /> New Group
                        </button>
                    )}
                </div>
            </div>

            {/* Compact Tabs + Search */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex gap-1 p-1 bg-secondary/30 rounded-lg border border-theme">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                            activeTab === 'users' ? 'bg-violet-600 text-white' : 'text-secondary hover:text-primary'
                        }`}
                    >
                        Users ({users.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('groups')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                            activeTab === 'groups' ? 'bg-emerald-600 text-white' : 'text-secondary hover:text-primary'
                        }`}
                    >
                        Groups ({groups.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('invitations')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                            activeTab === 'invitations' ? 'bg-amber-600 text-white' : 'text-secondary hover:text-primary'
                        }`}
                    >
                        Invitations ({users.filter(u => u.invited_at && !u.last_login).length})
                    </button>
                </div>
                
                {activeTab === 'users' && (
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                        />
                    </div>
                )}
            </div>

            {/* USERS TABLE */}
            {activeTab === 'users' && (
                <div className="border border-theme rounded-xl overflow-hidden bg-secondary/20 min-h-[400px]">
                    <table className="w-full">
                        <thead className="bg-secondary/40">
                            <tr>
                                <th className="text-left p-3 text-xs font-semibold text-secondary uppercase w-8"></th>
                                <th className="text-left p-3 text-xs font-semibold text-secondary uppercase">User</th>
                                <th className="text-left p-3 text-xs font-semibold text-secondary uppercase">Role</th>
                                <th className="text-left p-3 text-xs font-semibold text-secondary uppercase">Status</th>
                                <th className="text-right p-3 text-xs font-semibold text-secondary uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-theme">
                            {isLoading ? (
                                <tr><td colSpan={5} className="p-8 text-center text-secondary">Loading...</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-secondary">No users found</td></tr>
                            ) : filteredUsers.map(user => (
                                <React.Fragment key={user.id}>
                                    <tr className="hover:bg-secondary/30 transition-colors">
                                        <td className="p-2 pl-3">
                                            <button onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)} className="p-1 text-secondary hover:text-primary">
                                                {expandedUserId === user.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </button>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getRoleBadge(user.role).replace('text-', 'to-').replace('/20', '')} flex items-center justify-center text-white text-xs font-bold`}>
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-primary text-sm flex items-center gap-2">
                                                        {user.name}
                                                        {user.id === currentUser?.id && <span className="text-[9px] bg-violet-500/30 text-violet-300 px-1 rounded">YOU</span>}
                                                    </div>
                                                    <div className="text-xs text-secondary">{user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 text-xs font-medium rounded ${getRoleBadge(user.role)} capitalize`}>
                                                {user.role.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                <span className="text-xs text-secondary">{user.is_active ? 'Active' : 'Disabled'}</span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => openEditUser(user)} className="p-1.5 text-secondary hover:text-blue-400 hover:bg-blue-400/10 rounded transition-all" title="Edit User">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => openResetPassword(user)} className="p-1.5 text-secondary hover:text-amber-400 hover:bg-amber-400/10 rounded transition-all" title="Reset Password">
                                                    <Key className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDeleteUser(user.id)} className="p-1.5 text-secondary hover:text-red-400 hover:bg-red-400/10 rounded transition-all" title="Delete User">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {/* Expandable Detail Row */}
                                    {expandedUserId === user.id && (
                                        <tr className="bg-secondary/10">
                                            <td colSpan={5} className="p-4">
                                                <div className="grid grid-cols-4 gap-4 text-sm">
                                                    <div>
                                                        <span className="text-secondary text-xs">Email Verified</span>
                                                        <p className={user.is_email_confirmed ? 'text-emerald-400' : 'text-amber-400'}>
                                                            {user.is_email_confirmed ? 'Yes' : 'Pending'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-secondary text-xs">Password Reset</span>
                                                        <p className={user.must_change_password ? 'text-amber-400' : 'text-primary'}>
                                                            {user.must_change_password ? 'Required' : 'No'}
                                                        </p>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <span className="text-secondary text-xs">Groups</span>
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {user.groups && user.groups.length > 0 ? user.groups.map(g => (
                                                                <span key={g.id} className="px-2 py-0.5 text-xs bg-secondary/50 rounded text-primary">{g.name}</span>
                                                            )) : <span className="text-secondary text-xs italic">None</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* INVITATIONS TABLE */}
            {activeTab === 'invitations' && (
                <div className="border border-theme rounded-xl overflow-hidden bg-secondary/20 min-h-[400px]">
                    <table className="w-full">
                        <thead className="bg-secondary/40">
                            <tr>
                                <th className="text-left p-3 text-xs font-semibold text-secondary uppercase">Invitee</th>
                                <th className="text-left p-3 text-xs font-semibold text-secondary uppercase">Role</th>
                                <th className="text-left p-3 text-xs font-semibold text-secondary uppercase">Sent</th>
                                <th className="text-right p-3 text-xs font-semibold text-secondary uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-theme">
                            {users.filter(u => u.invited_at && !u.last_login).length === 0 ? (
                                <tr><td colSpan={4} className="p-20 text-center">
                                    <div className="flex flex-col items-center gap-4 opacity-50">
                                        <div className="p-4 rounded-full bg-secondary/20">
                                            <Mail className="w-10 h-10 text-secondary" />
                                        </div>
                                        <div>
                                            <p className="text-primary font-medium">No pending invitations</p>
                                            <p className="text-secondary text-sm">All invited users have joined or none have been sent.</p>
                                        </div>
                                        <button onClick={() => setShowInviteModal(true)} className="mt-2 px-4 py-2 bg-violet-600/20 text-violet-400 border border-violet-500/30 rounded-lg text-sm font-medium hover:bg-violet-600/30 transition-all">
                                            Send New Invitation
                                        </button>
                                    </div>
                                </td></tr>
                            ) : users.filter(u => u.invited_at && !u.last_login).map(user => (
                                <tr key={user.id} className="hover:bg-secondary/30 transition-colors text-sm">
                                    <td className="p-3">
                                        <div className="font-medium text-primary">{user.name}</div>
                                        <div className="text-xs text-secondary">{user.email}</div>
                                    </td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${getRoleBadge(user.role)} uppercase whitespace-nowrap`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-primary">{user.invited_at ? new Date(user.invited_at).toLocaleDateString() : 'Unknown'}</span>
                                            <span className="text-[10px] text-secondary">{user.invited_at ? new Date(user.invited_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button 
                                                onClick={() => {
                                                    setInviteFirstName(user.name.split(' ')[0]);
                                                    setInviteLastName(user.name.split(' ').slice(1).join(' '));
                                                    setInviteEmail(user.email);
                                                    setInviteRole(user.role);
                                                    setShowInviteModal(true);
                                                }}
                                                className="p-2 text-secondary hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all"
                                                title="Resend Invitation"
                                            >
                                                <Mail className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteUser(user.id)}
                                                className="p-2 text-secondary hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                                title="Revoke Invitation"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* GROUPS - Compact Collapsible Cards */}
            {activeTab === 'groups' && (
                <div className="space-y-2">
                    {groups.map(group => (
                        <div key={group.id} className="border border-theme rounded-lg overflow-hidden bg-secondary/20">
                            <div className="flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors">
                                <button onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)} className="flex items-center gap-3 flex-1 text-left">
                                    {expandedGroupId === group.id ? <ChevronDown className="w-4 h-4 text-secondary" /> : <ChevronRight className="w-4 h-4 text-secondary" />}
                                    <Shield className="w-4 h-4 text-emerald-500" />
                                    <span className="font-medium text-primary">{group.name}</span>
                                    <span className="text-xs text-secondary">({group.permissions.length} permissions)</span>
                                </button>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => openEditGroup(group)} className="p-1.5 text-secondary hover:text-blue-400 rounded transition-all">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeleteGroup(group.id)} className="p-1.5 text-secondary hover:text-red-400 rounded transition-all">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            {expandedGroupId === group.id && (
                                <div className="border-t border-theme p-3 bg-secondary/10">
                                    <p className="text-sm text-secondary mb-2">{group.description || 'No description'}</p>
                                    <div className="flex flex-wrap gap-1">
                                        {group.permissions.map(p => (
                                            <span key={p.id} className="px-2 py-1 text-xs bg-emerald-500/10 text-emerald-400 rounded" title={p.description}>
                                                {p.name}
                                            </span>
                                        ))}
                                        {group.permissions.length === 0 && <span className="text-xs text-secondary italic">No permissions</span>}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    
                    {groups.length === 0 && (
                        <div className="text-center py-8 text-secondary">
                            <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p>No groups yet. Create one to organize user permissions.</p>
                        </div>
                    )}
                </div>
            )}

            {/* --- MODALS --- */}

            {/* Invite User Modal - Using Portal */}
            {showInviteModal && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-200 dark:bg-slate-900">
                    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl w-full max-w-md shadow-xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Invite User</h2>
                            <button onClick={() => setShowInviteModal(false)} className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleInvite} className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <input type="text" required value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} className="px-3 py-2 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm placeholder:text-gray-500 dark:placeholder:text-slate-400" placeholder="First Name" />
                                <input type="text" required value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} className="px-3 py-2 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm placeholder:text-gray-500 dark:placeholder:text-slate-400" placeholder="Last Name" />
                            </div>
                            <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm placeholder:text-gray-500 dark:placeholder:text-slate-400" placeholder="Email" />
                            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm">
                                <option value="student">Student</option>
                                <option value="instructor">Instructor</option>
                                <option value="admin">Administrator</option>
                            </select>
                            <button type="submit" disabled={isSubmitting} className="w-full py-2.5 bg-violet-600 text-white font-medium rounded-lg disabled:opacity-50 hover:bg-violet-700 transition-colors">
                                {isSubmitting ? 'Sending...' : 'Send Invitation'}
                            </button>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Edit User Modal - Premium Redesign */}
            <Modal
                isOpen={showEditUserModal && !!editingUser}
                onClose={() => setShowEditUserModal(false)}
                title="Edit User"
                icon={<User className="w-5 h-5 text-blue-400" />}
                maxWidth="md"
            >
                <form onSubmit={handleUpdateUser} className="space-y-5">
                    {/* Personal Info Section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">
                            <User className="w-3 h-3" /> Personal Information
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-secondary uppercase">First Name</label>
                                <input
                                    type="text"
                                    required
                                    value={editFirstName}
                                    onChange={(e) => setEditFirstName(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white text-sm font-medium placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                                    placeholder="First Name"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-secondary uppercase">Last Name</label>
                                <input
                                    type="text"
                                    required
                                    value={editLastName}
                                    onChange={(e) => setEditLastName(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white text-sm font-medium placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                                    placeholder="Last Name"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-secondary uppercase">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                                <input
                                    type="email"
                                    required
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white text-sm font-medium placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                                    placeholder="email@example.com"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Role & Groups Section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">
                            <Shield className="w-3 h-3" /> Role & Access
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-secondary uppercase">Role</label>
                                <div className="relative group">
                                    <select
                                        value={editRole}
                                        onChange={(e) => setEditRole(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white text-sm font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    >
                                        <option value="student">Student</option>
                                        <option value="instructor">Instructor</option>
                                        <option value="admin">Administrator</option>
                                        <option value="super_admin">Super Admin</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary pointer-events-none" />
                                    {/* Role Description Tooltip */}
                                    <div className="absolute left-full top-0 ml-2 w-48 p-2 bg-slate-900 dark:bg-slate-700 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg">
                                        <div className="font-bold mb-1 text-blue-400">Role Permissions:</div>
                                        <ul className="space-y-1 text-slate-300">
                                            <li>• <span className="text-emerald-400">Student:</span> Access classes, view VMs</li>
                                            <li>• <span className="text-blue-400">Instructor:</span> Manage own classes</li>
                                            <li>• <span className="text-violet-400">Admin:</span> Manage all users/classes</li>
                                            <li>• <span className="text-rose-400">Super Admin:</span> Full system access</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-secondary uppercase">Groups</label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsGroupsDropdownOpen(!isGroupsDropdownOpen)}
                                        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl text-sm font-medium text-left focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    >
                                        <span className={editGroups.length > 0 ? 'text-primary' : 'text-secondary/50'}>
                                            {editGroups.length > 0 ? `${editGroups.length} selected` : 'None'}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-secondary transition-transform ${isGroupsDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isGroupsDropdownOpen && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="max-h-40 overflow-y-auto p-1">
                                                {groups.map(group => (
                                                    <button
                                                        key={group.id}
                                                        type="button"
                                                        onClick={() => {
                                                            if (editGroups.includes(group.id)) {
                                                                setEditGroups(editGroups.filter(id => id !== group.id));
                                                            } else {
                                                                setEditGroups([...editGroups, group.id]);
                                                            }
                                                        }}
                                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                                                            editGroups.includes(group.id) 
                                                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' 
                                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                                                        }`}
                                                    >
                                                        <span>{group.name}</span>
                                                        {editGroups.includes(group.id) && <Check className="w-4 h-4" />}
                                                    </button>
                                                ))}
                                                {groups.length === 0 && (
                                                    <div className="px-3 py-2 text-sm text-secondary text-center">No groups available</div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* Selected Groups Tags */}
                        {editGroups.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {editGroups.map(gId => {
                                    const group = groups.find(g => g.id === gId);
                                    return group ? (
                                        <span
                                            key={gId}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-500 rounded-lg text-xs font-medium"
                                        >
                                            {group.name}
                                            <button
                                                type="button"
                                                onClick={() => setEditGroups(editGroups.filter(id => id !== gId))}
                                                className="hover:bg-blue-500/20 rounded p-0.5"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ) : null;
                                })}
                            </div>
                        )}
                    </div>

                    {/* Account Status Section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black text-secondary uppercase tracking-[0.2em]">
                            <ShieldAlert className="w-3 h-3" /> Account Status
                        </div>
                        <div className="flex gap-2">
                            <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl cursor-pointer transition-all border ${
                                editIsActive ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-secondary/10 border-theme/50'
                            }`}>
                                <input
                                    type="checkbox"
                                    checked={editIsActive}
                                    onChange={(e) => setEditIsActive(e.target.checked)}
                                    className="w-4 h-4 accent-emerald-500 rounded"
                                />
                                <span className={`text-xs font-medium ${editIsActive ? 'text-emerald-500' : 'text-secondary'}`}>
                                    Active
                                </span>
                            </label>
                            <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl cursor-pointer transition-all border ${
                                editIsConfirmed ? 'bg-blue-500/10 border-blue-500/30' : 'bg-secondary/10 border-theme/50'
                            }`}>
                                <input
                                    type="checkbox"
                                    checked={editIsConfirmed}
                                    onChange={(e) => setEditIsConfirmed(e.target.checked)}
                                    className="w-4 h-4 accent-blue-500 rounded"
                                />
                                <span className={`text-xs font-medium ${editIsConfirmed ? 'text-blue-500' : 'text-secondary'}`}>
                                    Verified
                                </span>
                            </label>
                            <label className={`flex-1 flex items-center gap-2 p-3 rounded-xl cursor-pointer transition-all border ${
                                editMustChangePass ? 'bg-amber-500/10 border-amber-500/30' : 'bg-secondary/10 border-theme/50'
                            }`}>
                                <input
                                    type="checkbox"
                                    checked={editMustChangePass}
                                    onChange={(e) => setEditMustChangePass(e.target.checked)}
                                    className="w-4 h-4 accent-amber-500 rounded"
                                />
                                <span className={`text-xs font-medium ${editMustChangePass ? 'text-amber-500' : 'text-secondary'}`}>
                                    Reset Pass
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Self-edit Warning */}
                    {editingUser?.id === currentUser?.id && (
                        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 text-xs font-medium">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            You are editing your own account. Be careful with role changes.
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-3 border-t border-theme/50">
                        <button
                            type="button"
                            onClick={() => setShowEditUserModal(false)}
                            className="px-4 py-2.5 text-sm font-medium text-secondary hover:text-primary transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    Save Changes
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Reset Password Modal */}
            <Modal
                isOpen={showResetPasswordModal && !!resetPasswordUser}
                onClose={() => setShowResetPasswordModal(false)}
                title="Reset Password"
                icon={<Lock className="w-5 h-5 text-amber-400" />}
                maxWidth="sm"
            >
                <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="p-3 bg-gray-100 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white font-bold">
                                {resetPasswordUser?.name.charAt(0)}
                            </div>
                            <div>
                                <div className="text-sm font-bold text-primary">{resetPasswordUser?.name}</div>
                                <div className="text-xs text-secondary">{resetPasswordUser?.email}</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-secondary uppercase">New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white text-sm font-medium placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                                    placeholder="Enter new password"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-secondary uppercase">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white text-sm font-medium placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                                    placeholder="Confirm new password"
                                    required
                                />
                            </div>
                        </div>
                        {newPassword && confirmPassword && newPassword !== confirmPassword && (
                            <div className="flex items-center gap-2 text-red-500 text-xs">
                                <AlertTriangle className="w-3 h-3" />
                                Passwords do not match
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3 pt-3 border-t border-theme/50">
                        <button
                            type="button"
                            onClick={() => setShowResetPasswordModal(false)}
                            className="px-4 py-2.5 text-sm font-medium text-secondary hover:text-primary transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !newPassword || newPassword !== confirmPassword}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-amber-500/20 hover:scale-[1.02] transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Resetting...
                                </>
                            ) : (
                                <>
                                    <Key className="w-4 h-4" />
                                    Reset Password
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Group Modal - Using Portal */}
            {showGroupModal && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-200 dark:bg-slate-900">
                    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editingGroup ? 'Edit Group' : 'Create Group'}</h2>
                            <button onClick={() => setShowGroupModal(false)} className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleSaveGroup} className="p-5 space-y-4">
                            <input type="text" required value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm placeholder:text-gray-500 dark:placeholder:text-slate-400" placeholder="Group Name" />
                            <textarea required value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} className="w-full px-3 py-2 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white text-sm h-20 resize-none placeholder:text-gray-500 dark:placeholder:text-slate-400" placeholder="Description" />
                            
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600 dark:text-slate-400">Permissions</label>
                                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                                    {permissions.map(perm => (
                                        <label key={perm.id} className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer text-sm ${groupPermissions.includes(perm.id) ? 'bg-emerald-100 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/40' : 'bg-gray-100 dark:bg-slate-700 border border-transparent'}`}>
                                            <input type="checkbox" checked={groupPermissions.includes(perm.id)} onChange={(e) => {
                                                if (e.target.checked) setGroupPermissions([...groupPermissions, perm.id]);
                                                else setGroupPermissions(groupPermissions.filter(id => id !== perm.id));
                                            }} className="mt-0.5 w-4 h-4 accent-emerald-600" />
                                            <div>
                                                <div className={groupPermissions.includes(perm.id) ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}>{perm.name}</div>
                                                <div className="text-xs text-gray-500 dark:text-slate-500">{perm.description}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            
                            <button type="submit" disabled={isSubmitting} className="w-full py-2.5 bg-emerald-600 text-white font-medium rounded-lg disabled:opacity-50 hover:bg-emerald-700 transition-colors">
                                {isSubmitting ? 'Saving...' : (editingGroup ? 'Update Group' : 'Create Group')}
                            </button>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default AdminUsers;
