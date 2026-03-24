/**
 * Security Logs Page for Infinity Lock Admin Panel (Super Admin Only)
 * With CSV Export and Pagination
 */
import { useState, useEffect, useCallback } from 'react';
import { securityAPI, exportAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
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
    Download,
    ChevronLeft,
    ChevronRight,
    Search,
    FileDown,
} from 'lucide-react';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 25;

const eventTypeConfig = {
    LOGIN_SUCCESS: { label: 'Login Success', color: 'bg-emerald-500/10 text-emerald-500', icon: ShieldCheck },
    LOGIN_FAILED: { label: 'Login Failed', color: 'bg-red-500/10 text-red-500', icon: ShieldAlert },
    TOTP_VERIFICATION_FAILED: { label: 'TOTP Failed', color: 'bg-amber-500/10 text-amber-500', icon: Lock },
    TOTP_ENABLED: { label: 'TOTP Enabled', color: 'bg-primary/10 text-primary', icon: ShieldCheck },
    PASSWORD_CHANGED: { label: 'Password Changed', color: 'bg-primary/10 text-primary', icon: Lock },
    EMAIL_VERIFIED: { label: 'Email Verified', color: 'bg-emerald-500/10 text-emerald-500', icon: ShieldCheck },
    USER_SUSPENDED: { label: 'User Suspended', color: 'bg-amber-500/10 text-amber-500', icon: UserX },
    USER_DEACTIVATED: { label: 'User Deactivated', color: 'bg-red-500/10 text-red-500', icon: UserX },
    USER_RESUMED: { label: 'User Resumed', color: 'bg-emerald-500/10 text-emerald-500', icon: ShieldCheck },
    SETTINGS_UPDATED: { label: 'Settings Updated', color: 'bg-primary/10 text-primary', icon: Settings },
    SUPER_ADMIN_CREATED: { label: 'Super Admin Created', color: 'bg-purple-500/10 text-purple-500', icon: ShieldCheck },
    ADMIN_CREATED: { label: 'Admin Created', color: 'bg-primary/10 text-primary', icon: ShieldCheck },
};

export default function SecurityLogsPage() {
    const [logs, setLogs] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [eventFilter, setEventFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const fetchLogs = useCallback(async () => {
        try {
            const params = {
                skip: (currentPage - 1) * ITEMS_PER_PAGE,
                limit: ITEMS_PER_PAGE,
            };
            if (eventFilter !== 'all') {
                params.event_type = eventFilter;
            }
            
            const [logsRes, countRes] = await Promise.all([
                securityAPI.getLogs(params),
                securityAPI.getLogsCount(eventFilter !== 'all' ? { event_type: eventFilter } : {}),
            ]);
            
            setLogs(logsRes.data);
            setTotalCount(countRes.data.total);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
            toast.error('Failed to load security logs');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [currentPage, eventFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchLogs();
    };

    const handleExportCSV = async (type) => {
        setExporting(true);
        try {
            let response;
            let filename;
            
            if (type === 'security') {
                response = await exportAPI.downloadSecurityLogsCSV();
                filename = `security_logs_${new Date().toISOString().slice(0,10)}.csv`;
            } else {
                response = await exportAPI.downloadIntrusionLogsCSV();
                filename = `intrusion_logs_${new Date().toISOString().slice(0,10)}.csv`;
            }
            
            // Create download link
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            toast.success(`${type === 'security' ? 'Security' : 'Intrusion'} logs exported successfully`);
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Failed to export logs');
        } finally {
            setExporting(false);
        }
    };

    const handleExportPDF = async () => {
        setExporting(true);
        try {
            const response = await exportAPI.downloadSecurityLogsPDF();
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `security_logs_${new Date().toISOString().slice(0,10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success('Security logs PDF exported successfully');
        } catch (error) {
            console.error('PDF export failed:', error);
            toast.error('Failed to export PDF');
        } finally {
            setExporting(false);
        }
    };

    const getEventConfig = (eventType) => {
        return eventTypeConfig[eventType] || {
            label: eventType,
            color: 'bg-slate-500/10 text-slate-400',
            icon: FileText,
        };
    };

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    // Filter logs by search query
    const filteredLogs = logs.filter(log => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            log.event_type?.toLowerCase().includes(query) ||
            log.admin_id?.toLowerCase().includes(query) ||
            log.user_id?.toLowerCase().includes(query) ||
            log.ip_address?.toLowerCase().includes(query) ||
            JSON.stringify(log.details)?.toLowerCase().includes(query)
        );
    });

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
                    <p className="text-slate-400">Audit trail of security events (10-day retention)</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button
                        variant="outline"
                        onClick={() => handleExportCSV('intrusion')}
                        disabled={exporting}
                        className="border-white/10"
                        data-testid="export-intrusion-btn"
                    >
                        <FileDown className="w-4 h-4 mr-2" />
                        Intrusion CSV
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => handleExportCSV('security')}
                        disabled={exporting}
                        className="border-white/10"
                        data-testid="export-security-btn"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        All Logs CSV
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleExportPDF}
                        disabled={exporting}
                        className="border-white/10"
                        data-testid="export-security-pdf-btn"
                    >
                        <FileText className="w-4 h-4 mr-2" />
                        Export PDF
                    </Button>
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
            </div>

            {/* Filters */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search logs by event, IP, user..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-black/20 border-white/10"
                                data-testid="search-logs-input"
                            />
                        </div>
                        <Select value={eventFilter} onValueChange={(val) => { setEventFilter(val); setCurrentPage(1); }}>
                            <SelectTrigger className="w-full md:w-64 bg-black/20 border-white/10" data-testid="event-filter">
                                <SelectValue placeholder="All Events" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-white/10">
                                <SelectItem value="all">All Events</SelectItem>
                                <SelectItem value="LOGIN_SUCCESS">Login Success</SelectItem>
                                <SelectItem value="LOGIN_FAILED">Login Failed</SelectItem>
                                <SelectItem value="TOTP_VERIFICATION_FAILED">TOTP Failed</SelectItem>
                                <SelectItem value="PASSWORD_CHANGED">Password Changed</SelectItem>
                                <SelectItem value="USER_SUSPENDED">User Suspended</SelectItem>
                                <SelectItem value="SETTINGS_UPDATED">Settings Updated</SelectItem>
                                <SelectItem value="ADMIN_CREATED">Admin Created</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Logs Table */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardHeader className="border-b border-white/5">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                            <FileText className="w-5 h-5 text-slate-400" />
                            Audit Log ({totalCount} total)
                        </CardTitle>
                        <span className="text-xs text-slate-500">
                            Page {currentPage} of {totalPages || 1}
                        </span>
                    </div>
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
                                    <TableHead className="text-slate-400">Date & Time</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                                            No security logs found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredLogs.map((log) => {
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
                                                        <span className="text-xs text-slate-400 truncate block" title={JSON.stringify(log.details)}>
                                                            {log.details.email || JSON.stringify(log.details).slice(0, 40)}...
                                                        </span>
                                                    ) : '-'}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-slate-400 whitespace-nowrap">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between p-4 border-t border-white/5">
                            <p className="text-sm text-slate-500">
                                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="border-white/10"
                                    data-testid="prev-page-btn"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }
                                        return (
                                            <Button
                                                key={pageNum}
                                                variant={currentPage === pageNum ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={currentPage === pageNum ? "" : "border-white/10"}
                                            >
                                                {pageNum}
                                            </Button>
                                        );
                                    })}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="border-white/10"
                                    data-testid="next-page-btn"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
