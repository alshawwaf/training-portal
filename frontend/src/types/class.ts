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
    join_token?: string;  // Shareable link token
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
    connection_id?: number;
}

/**
 * Class Status Configuration
 * 
 * Statuses are automatically updated by the backend scheduler based on dates:
 * - draft: Manual - class created but not provisioned
 * - upcoming: Auto - provisioned, start_date in future  
 * - active: Auto - current time between start_date and end_date
 * - completed: Auto - end_date has passed
 * - cancelled: Manual only - class was cancelled
 * - postponed: Manual only - class is on hold
 */
export const statusConfig: Record<string, { 
    label: string; 
    color: string; 
    bgColor: string;
    description?: string;
}> = {
    draft: { 
        label: 'Draft', 
        color: 'text-slate-500', 
        bgColor: 'bg-slate-500/10 border-slate-500/20',
        description: 'Not yet provisioned'
    },
    upcoming: { 
        label: 'Upcoming', 
        color: 'text-blue-500', 
        bgColor: 'bg-blue-500/10 border-blue-500/20',
        description: 'Waiting for start date'
    },
    active: { 
        label: 'Active', 
        color: 'text-emerald-500', 
        bgColor: 'bg-emerald-500/10 border-emerald-500/20',
        description: 'Class in session'
    },
    completed: { 
        label: 'Completed', 
        color: 'text-violet-500', 
        bgColor: 'bg-violet-500/10 border-violet-500/20',
        description: 'Class has ended'
    },
    cancelled: { 
        label: 'Cancelled', 
        color: 'text-red-500', 
        bgColor: 'bg-red-500/10 border-red-500/20',
        description: 'Class was cancelled'
    },
    postponed: { 
        label: 'Postponed', 
        color: 'text-amber-500', 
        bgColor: 'bg-amber-500/10 border-amber-500/20',
        description: 'Class is on hold'
    },
};

// Status categories for UI logic
export const autoUpdatedStatuses = ['upcoming', 'active', 'completed'];
export const manualOnlyStatuses = ['draft', 'cancelled', 'postponed'];
