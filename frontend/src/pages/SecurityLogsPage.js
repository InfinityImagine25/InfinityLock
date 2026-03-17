/**
 * Security Logs Page for Infinity Lock Admin Panel (Super Admin Only)
 */
import { useState, useEffect } from 'react';
import { securityAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    FileText,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    UserX,
    Settings,
    Lock,
} from 'lucide-react';
import { toast } from 'sonner';

const eventTypeConfig = {
    LOGIN_SUCCESS: { label: 'Login Success', color: 'bg-emerald-500/10 text-emerald-500', icon: ShieldCheck },
    LOGIN_FAILED: { label: 'Login Failed', color: 'bg-red-500/10 text-red-500', icon: ShieldAlert },
    TOTP_VERIFICATION_FAILED: { label: 'TOTP Failed', color: 'bg-amber-500/10 text-amber-500', icon: Lock },
    TOTP_ENABLED: { label: 'TOTP Enabled', color: 'bg-primary/10 text-primary', icon: ShieldCheck },
    USER_SUSPENDED: { label: 'User Suspended', color: 'bg-amber-500/10 text-amber-500', icon: UserX },
    USER_DEACTIVATED: { label: 'User Deactivated', color: 'bg-red-500/10 text-red-500', icon: UserX },
    USER_RESUMED: { label: 'User Resumed', color: 'bg-emerald-500/10 text-emerald-500', icon: ShieldCheck },
    SETTINGS_UPDATED: { label: 'Settings Updated', color: 'bg-primary/10 text-primary', icon: Settings },
    SUPER_ADMIN_CREATED: { label: 'Super Admin Created', color: 'bg-purple-500/10 text-purple-500', icon: ShieldCheck },
    ADMIN_CREATED: { label: 'Admin Created', color: 'bg-primary/10 text-primary', icon: ShieldCheck },
};

export default function SecurityLogsPage() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [eventFilter, setEventFilter] = useState('all');

    const fetchLogs = async () => {
        try {
            const params = eventFilter !== 'all' ? { event_type: eventFilter } : {};
            const response = await securityAPI.getLogs(params);
            setLogs(response.data);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
            toast.error('Failed to load security logs');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [eventFilter]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchLogs();
    };

    const getEventConfig = (eventType) => {
        return eventTypeConfig[eventType] || {
            label: eventType,
            color: 'bg-slate-500/10 text-slate-400',
            icon: FileText,
        };
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in" data-testid="logs-loading">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in" data-testid="security-logs-page">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-heading font-bold tracking-tight">Security Logs</h1>
                    <p className="text-slate-400">Audit trail of security events (Super Admin only)</p>
                </div>
                <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="border-white/10"
                    data-testid="refresh-logs-btn"
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Filter */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardContent className="p-4">
                    <Select value={eventFilter} onValueChange={setEventFilter}>
                        <SelectTrigger className="w-full md:w-64 bg-black/20 border-white/10" data-testid="event-filter">
                            <SelectValue placeholder="All Events" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-white/10">
                            <SelectItem value="all">All Events</SelectItem>
                            <SelectItem value="LOGIN_SUCCESS">Login Success</SelectItem>
                            <SelectItem value="LOGIN_FAILED">Login Failed</SelectItem>
                            <SelectItem value="TOTP_VERIFICATION_FAILED">TOTP Failed</SelectItem>
                            <SelectItem value="USER_SUSPENDED">User Suspended</SelectItem>
                            <SelectItem value="SETTINGS_UPDATED">Settings Updated</SelectItem>
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* Logs Table */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardHeader className="border-b border-white/5">
                    <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-5 h-5 text-slate-400" />
                        Audit Log ({logs.length})
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/5 hover:bg-transparent">
                                    <TableHead className="text-slate-400">Event</TableHead>
                                    <TableHead className="text-slate-400">Admin</TableHead>
                                    <TableHead className="text-slate-400">User</TableHead>
                                    <TableHead className="text-slate-400">IP Address</TableHead>
                                    <TableHead className="text-slate-400">Details</TableHead>
                                    <TableHead className="text-slate-400">Timestamp</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                                            No security logs found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    logs.map((log) => {
                                        const config = getEventConfig(log.event_type);
                                        return (
                                            <TableRow 
                                                key={log.id} 
                                                className="border-white/5 hover:bg-white/2"
                                                data-testid={`log-row-${log.id}`}
                                            >
                                                <TableCell>
                                                    <Badge variant="outline" className={config.color}>
                                                        <config.icon className="w-3 h-3 mr-1" />
                                                        {config.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-slate-400">
                                                    {log.admin_id ? `${log.admin_id.slice(0, 12)}...` : '-'}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-slate-400">
                                                    {log.user_id ? `${log.user_id.slice(0, 8)}...` : '-'}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">
                                                    {log.ip_address || '-'}
                                                </TableCell>
                                                <TableCell className="max-w-48">
                                                    {log.details ? (
                                                        <span className="text-xs text-slate-400 truncate block">
                                                            {JSON.stringify(log.details).slice(0, 50)}...
                                                        </span>
                                                    ) : '-'}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-slate-400">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
