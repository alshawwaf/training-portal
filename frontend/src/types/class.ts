export interface ClassModel {
    id: number;
    name: string;
    blueprint_id: string;
    template_id?: number;
    template?: {
        id: number;
        name: string;
        icon: string;
        provider: string;
    };
    max_users: number;
    passcode: string;
    start_date: string;
    end_date: string;
    instructor_id: number;
    status: string;
    description?: string;
    created_at?: string;
    updated_at?: string;
}

export interface EnvironmentVM {
    id: number;
    name: string;
    moid: string;
    ip_address?: string;
    power_state: string; // poweredOn, poweredOff, suspended
    access_url?: string;
}

export interface ClassEnvironment {
    id: number;
    name: string;
    user_id?: number;
    created_at: string;
    vms: EnvironmentVM[];
}

export interface Template {
    id: number;
    name: string;
    description: string;
    icon: string;
    provider: string;
}

export const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    draft: { label: 'Draft', color: 'text-gray-400', bgColor: 'bg-gray-500/10 border-gray-500/20' },
    upcoming: { label: 'Upcoming', color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20' },
    active: { label: 'Active', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/20' },
    completed: { label: 'Completed', color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/20' },
    cancelled: { label: 'Cancelled', color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20' },
    postponed: { label: 'Postponed', color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/20' },
};
