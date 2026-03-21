/**
 * Users Management Page for Infinity Lock Admin Panel
 * With Pagination (25 per page)
 */
import { useState, useEffect, useCallback } from 'react';
import { usersAPI, exportAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Search,
    MoreVertical,
    UserX,
    UserMinus,
    UserCheck,
    Crown,
    RefreshCw,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Download,
} from 'lucide-react';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 25;

const statusColors = {
    active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    suspended: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    deactivated: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const planColors = {
    classic: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    premium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

export default function UsersPage() {
    const { isSuperAdmin } = useAuth();
    const [users, setUsers] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [planFilter, setPlanFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    
    // Action dialog state
    const [actionDialog, setActionDialog] = useState({
        open: false,
        user: null,
        action: null,
    });
    const [actionLoading, setActionLoading] = useState(false);

    const fetchUsers = useCallback(async () => {
        try {
            const params = {
                skip: (currentPage - 1) * ITEMS_PER_PAGE,
                limit: ITEMS_PER_PAGE,
            };
            if (planFilter !== 'all') params.plan = planFilter;
            if (statusFilter !== 'all') params.status = statusFilter;
            
            const [usersRes, countRes] = await Promise.all([
                usersAPI.listUsers(params),
                usersAPI.getUserCounts(),
            ]);
            setUsers(usersRes.data);
            setTotalCount(countRes.data.total);
        } catch (error) {
            console.error('Failed to fetch users:', error);
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [planFilter, statusFilter, currentPage]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchUsers();
    };

    const handleExportCSV = async () => {
        if (!isSuperAdmin) {
            toast.error('Export is available for Super Admin only');
            return;
        }
        setExporting(true);
        try {
            const response = await exportAPI.downloadUsersCSV();
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `users_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success('Users exported successfully');
        } catch (error) {
            console.error('Export failed:', error);
            toast.error('Failed to export users');
        } finally {
            setExporting(false);
        }
    };

    const openActionDialog = (user, action) => {
        setActionDialog({ open: true, user, action });
    };

    const handleAction = async () => {
        const { user, action } = actionDialog;
        setActionLoading(true);

        try {
            await usersAPI.userAction(user.id, action);
            toast.success(`User ${action}ed successfully`);
            setActionDialog({ open: false, user: null, action: null });
            fetchUsers();
        } catch (error) {
            console.error('Action failed:', error);
            toast.error(`Failed to ${action} user`);
        } finally {
            setActionLoading(false);
        }
    };

    const filteredUsers = users.filter(user => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            user.email?.toLowerCase().includes(query) ||
            user.device_id.toLowerCase().includes(query) ||
            user.id.toLowerCase().includes(query)
        );
    });

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in" data-testid="users-loading">
                <div className="flex justify-between items-center">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-10 w-24" />
                </div>
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in" data-testid="users-page">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-heading font-bold tracking-tight">User Management</h1>
                    <p className="text-slate-400">Manage mobile app users and their accounts</p>
                </div>
                <div className="flex gap-2">
                    {isSuperAdmin && (
                        <Button
                            variant="outline"
                            onClick={handleExportCSV}
                            disabled={exporting}
                            className="border-white/10"
                            data-testid="export-users-btn"
                        >
                            <Download className={`w-4 h-4 mr-2 ${exporting ? 'animate-pulse' : ''}`} />
                            Export CSV
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="border-white/10"
                        data-testid="refresh-users-btn"
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
                                placeholder="Search by email, device ID, or user ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-black/20 border-white/10"
                                data-testid="search-users-input"
                            />
                        </div>
                        <Select value={planFilter} onValueChange={setPlanFilter}>
                            <SelectTrigger className="w-full md:w-40 bg-black/20 border-white/10" data-testid="plan-filter">
                                <SelectValue placeholder="All Plans" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-white/10">
                                <SelectItem value="all">All Plans</SelectItem>
                                <SelectItem value="classic">Classic</SelectItem>
                                <SelectItem value="premium">Premium</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-full md:w-40 bg-black/20 border-white/10" data-testid="status-filter">
                                <SelectValue placeholder="All Status" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-white/10">
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="suspended">Suspended</SelectItem>
                                <SelectItem value="deactivated">Deactivated</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Users Table */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardHeader className="border-b border-white/5">
                    <CardTitle className="text-base">
                        Users ({filteredUsers.length})
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/5 hover:bg-transparent">
                                    <TableHead className="text-slate-400">User</TableHead>
                                    <TableHead className="text-slate-400">Device ID</TableHead>
                                    <TableHead className="text-slate-400">Plan</TableHead>
                                    <TableHead className="text-slate-400">Status</TableHead>
                                    <TableHead className="text-slate-400">Language</TableHead>
                                    <TableHead className="text-slate-400">Country</TableHead>
                                    <TableHead className="text-slate-400">Installed</TableHead>
                                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                                            No users found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredUsers.map((user) => (
                                        <TableRow 
                                            key={user.id} 
                                            className="border-white/5 hover:bg-white/2"
                                            data-testid={`user-row-${user.id}`}
                                        >
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium text-sm">
                                                        {user.email || 'No email'}
                                                    </p>
                                                    <p className="text-xs text-slate-500 font-mono">
                                                        {user.id.slice(0, 8)}...
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-slate-400">
                                                {user.device_id.slice(0, 16)}...
                                            </TableCell>
                                            <TableCell>
                                                <Badge 
                                                    variant="outline" 
                                                    className={`${planColors[user.plan]} font-medium`}
                                                >
                                                    {user.plan === 'premium' && <Crown className="w-3 h-3 mr-1" />}
                                                    {user.plan}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge 
                                                    variant="outline" 
                                                    className={statusColors[user.status]}
                                                >
                                                    <span className={`status-dot ${user.status} mr-2`} />
                                                    {user.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm uppercase">
                                                {user.language}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {user.country || '-'}
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-400">
                                                {new Date(user.installed_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            data-testid={`user-actions-${user.id}`}
                                                        >
                                                            <MoreVertical className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="bg-card border-white/10">
                                                        {user.status === 'active' && (
                                                            <>
                                                                <DropdownMenuItem
                                                                    onClick={() => openActionDialog(user, 'suspend')}
                                                                    className="text-amber-500 cursor-pointer"
                                                                >
                                                                    <UserMinus className="w-4 h-4 mr-2" />
                                                                    Suspend
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => openActionDialog(user, 'deactivate')}
                                                                    className="text-red-500 cursor-pointer"
                                                                >
                                                                    <UserX className="w-4 h-4 mr-2" />
                                                                    Deactivate
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                        {(user.status === 'suspended' || user.status === 'deactivated') && (
                                                            <DropdownMenuItem
                                                                onClick={() => openActionDialog(user, 'resume')}
                                                                className="text-emerald-500 cursor-pointer"
                                                            >
                                                                <UserCheck className="w-4 h-4 mr-2" />
                                                                Resume
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
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
                                    data-testid="users-prev-page"
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
                                    data-testid="users-next-page"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Action Confirmation Dialog */}
            <Dialog open={actionDialog.open} onOpenChange={(open) => !open && setActionDialog({ open: false, user: null, action: null })}>
                <DialogContent className="bg-card border-white/10">
                    <DialogHeader>
                        <DialogTitle className="capitalize">
                            {actionDialog.action} User
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to {actionDialog.action} this user?
                            {actionDialog.user && (
                                <span className="block mt-2 font-mono text-sm">
                                    {actionDialog.user.email || actionDialog.user.device_id}
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setActionDialog({ open: false, user: null, action: null })}
                            className="border-white/10"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAction}
                            disabled={actionLoading}
                            className={
                                actionDialog.action === 'resume'
                                    ? 'bg-emerald-500 hover:bg-emerald-600'
                                    : actionDialog.action === 'suspend'
                                    ? 'bg-amber-500 hover:bg-amber-600'
                                    : 'bg-red-500 hover:bg-red-600'
                            }
                            data-testid="confirm-action-btn"
                        >
                            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
