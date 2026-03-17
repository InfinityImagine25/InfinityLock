/**
 * Admins Management Page for Infinity Lock Admin Panel (Super Admin Only)
 */
import { useState, useEffect } from 'react';
import { adminAPI, authAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    UserPlus,
    Shield,
    ShieldCheck,
    RefreshCw,
    Loader2,
    Copy,
    CheckCircle,
    Eye,
    EyeOff,
    KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

const roleColors = {
    super_admin: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    admin: 'bg-primary/10 text-primary border-primary/20',
};

const statusColors = {
    active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    suspended: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    deactivated: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export default function AdminsPage() {
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Create admin dialog
    const [createDialog, setCreateDialog] = useState(false);
    const [creating, setCreating] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        role: 'admin',
        status: 'active',
    });
    
    // Success dialog with TOTP info
    const [successDialog, setSuccessDialog] = useState({
        open: false,
        admin: null,
    });
    const [copied, setCopied] = useState(false);

    const fetchAdmins = async () => {
        try {
            const response = await adminAPI.listAdmins();
            setAdmins(response.data);
        } catch (error) {
            console.error('Failed to fetch admins:', error);
            toast.error('Failed to load admin list');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchAdmins();
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchAdmins();
    };

    const generatePassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < 16; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setFormData(prev => ({ ...prev, password }));
        toast.success('Password generated');
    };

    const handleCreateAdmin = async () => {
        if (!formData.email || !formData.password) {
            toast.error('Email and password are required');
            return;
        }

        if (formData.password.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }

        setCreating(true);
        try {
            const response = await adminAPI.createAdmin(formData);
            toast.success('Admin account created successfully');
            
            // Show success dialog with instructions
            setSuccessDialog({
                open: true,
                admin: {
                    ...response.data,
                    password: formData.password, // Include password for display
                },
            });
            
            setCreateDialog(false);
            setFormData({ email: '', password: '', role: 'admin', status: 'active' });
            fetchAdmins();
        } catch (error) {
            console.error('Failed to create admin:', error);
            const message = error.response?.data?.detail || 'Failed to create admin';
            toast.error(message);
        } finally {
            setCreating(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in" data-testid="admins-loading">
                <div className="flex justify-between items-center">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-10 w-32" />
                </div>
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in" data-testid="admins-page">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-heading font-bold tracking-tight">Admin Management</h1>
                    <p className="text-slate-400">Manage administrator accounts (Super Admin only)</p>
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="border-white/10"
                        data-testid="refresh-admins-btn"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    
                    <Dialog open={createDialog} onOpenChange={setCreateDialog}>
                        <DialogTrigger asChild>
                            <Button className="glow-blue" data-testid="create-admin-btn">
                                <UserPlus className="w-4 h-4 mr-2" />
                                Create Admin
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-card border-white/10 max-w-md">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-primary" />
                                    Create New Admin
                                </DialogTitle>
                                <DialogDescription>
                                    Create a new administrator account. They will need to set up TOTP for MFA.
                                </DialogDescription>
                            </DialogHeader>
                            
                            <div className="space-y-4 py-4">
                                {/* Email */}
                                <div className="space-y-2">
                                    <Label htmlFor="admin-email">Email Address</Label>
                                    <Input
                                        id="admin-email"
                                        type="email"
                                        placeholder="admin@example.com"
                                        value={formData.email}
                                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                        className="bg-black/20 border-white/10"
                                        data-testid="admin-email-input"
                                    />
                                </div>
                                
                                {/* Password */}
                                <div className="space-y-2">
                                    <Label htmlFor="admin-password">Password</Label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Input
                                                id="admin-password"
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="Minimum 8 characters"
                                                value={formData.password}
                                                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                                className="bg-black/20 border-white/10 pr-10"
                                                data-testid="admin-password-input"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="w-4 h-4 text-slate-400" />
                                                ) : (
                                                    <Eye className="w-4 h-4 text-slate-400" />
                                                )}
                                            </Button>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={generatePassword}
                                            className="border-white/10 shrink-0"
                                            data-testid="generate-password-btn"
                                        >
                                            <KeyRound className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        Click the key icon to generate a secure password
                                    </p>
                                </div>
                                
                                {/* Role */}
                                <div className="space-y-2">
                                    <Label>Role</Label>
                                    <Select
                                        value={formData.role}
                                        onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
                                    >
                                        <SelectTrigger className="bg-black/20 border-white/10" data-testid="admin-role-select">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-white/10">
                                            <SelectItem value="admin">Admin</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500">
                                        Only Admin role can be created. Super Admin is restricted.
                                    </p>
                                </div>
                                
                                {/* Status */}
                                <div className="space-y-2">
                                    <Label>Initial Status</Label>
                                    <Select
                                        value={formData.status}
                                        onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                                    >
                                        <SelectTrigger className="bg-black/20 border-white/10" data-testid="admin-status-select">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-white/10">
                                            <SelectItem value="active">Active</SelectItem>
                                            <SelectItem value="suspended">Suspended</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => setCreateDialog(false)}
                                    className="border-white/10"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleCreateAdmin}
                                    disabled={creating}
                                    data-testid="confirm-create-admin-btn"
                                >
                                    {creating ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <UserPlus className="w-4 h-4 mr-2" />
                                    )}
                                    Create Admin
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Admins Table */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardHeader className="border-b border-white/5">
                    <CardTitle className="text-base flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-slate-400" />
                        Administrators ({admins.length})
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-white/5 hover:bg-transparent">
                                    <TableHead className="text-slate-400">Email</TableHead>
                                    <TableHead className="text-slate-400">Role</TableHead>
                                    <TableHead className="text-slate-400">Status</TableHead>
                                    <TableHead className="text-slate-400">TOTP</TableHead>
                                    <TableHead className="text-slate-400">Last Login</TableHead>
                                    <TableHead className="text-slate-400">Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {admins.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-slate-400">
                                            No administrators found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    admins.map((admin) => (
                                        <TableRow 
                                            key={admin.id} 
                                            className="border-white/5 hover:bg-white/2"
                                            data-testid={`admin-row-${admin.id}`}
                                        >
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium">{admin.email}</p>
                                                    <p className="text-xs text-slate-500 font-mono">
                                                        {admin.id.slice(0, 12)}...
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={roleColors[admin.role]}>
                                                    {admin.role === 'super_admin' ? (
                                                        <Shield className="w-3 h-3 mr-1" />
                                                    ) : (
                                                        <ShieldCheck className="w-3 h-3 mr-1" />
                                                    )}
                                                    {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={statusColors[admin.status]}>
                                                    <span className={`status-dot ${admin.status} mr-2`} />
                                                    {admin.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {admin.totp_enabled ? (
                                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                        Enabled
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                                                        Pending Setup
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-400">
                                                {admin.last_login 
                                                    ? new Date(admin.last_login).toLocaleDateString()
                                                    : 'Never'
                                                }
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-400">
                                                {new Date(admin.created_at).toLocaleDateString()}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Success Dialog with Credentials */}
            <Dialog open={successDialog.open} onOpenChange={(open) => setSuccessDialog({ open, admin: null })}>
                <DialogContent className="bg-card border-white/10 max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-emerald-500">
                            <CheckCircle className="w-5 h-5" />
                            Admin Created Successfully
                        </DialogTitle>
                        <DialogDescription>
                            Share these credentials securely with the new admin. They will need to set up TOTP on first login.
                        </DialogDescription>
                    </DialogHeader>
                    
                    {successDialog.admin && (
                        <div className="space-y-4 py-4">
                            {/* Credentials Box */}
                            <div className="p-4 rounded-lg bg-black/30 border border-white/10 space-y-3">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Email</p>
                                        <p className="font-mono text-sm">{successDialog.admin.email}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => copyToClipboard(successDialog.admin.email)}
                                        className="h-8 w-8"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Password</p>
                                        <p className="font-mono text-sm">{successDialog.admin.password}</p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => copyToClipboard(successDialog.admin.password)}
                                        className="h-8 w-8"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 uppercase tracking-wider">Role</p>
                                    <p className="font-mono text-sm capitalize">{successDialog.admin.role}</p>
                                </div>
                            </div>
                            
                            {/* TOTP Instructions */}
                            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                                <h4 className="font-medium text-primary mb-2 flex items-center gap-2">
                                    <Shield className="w-4 h-4" />
                                    TOTP Setup Required
                                </h4>
                                <p className="text-sm text-slate-300">
                                    The new admin must set up Two-Factor Authentication on their first login:
                                </p>
                                <ol className="text-sm text-slate-400 mt-2 space-y-1 list-decimal list-inside">
                                    <li>Login with the credentials above</li>
                                    <li>Scan the QR code with Google Authenticator or Authy</li>
                                    <li>Enter the 6-digit code to enable TOTP</li>
                                </ol>
                            </div>
                            
                            {/* Security Warning */}
                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                <p className="text-xs text-amber-500">
                                    <strong>Security Note:</strong> Share these credentials securely (not via email). 
                                    The admin should change their password after first login.
                                </p>
                            </div>
                        </div>
                    )}
                    
                    <DialogFooter>
                        <Button
                            onClick={() => {
                                if (successDialog.admin) {
                                    const text = `Email: ${successDialog.admin.email}\nPassword: ${successDialog.admin.password}`;
                                    copyToClipboard(text);
                                }
                            }}
                            variant="outline"
                            className="border-white/10"
                        >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy All
                        </Button>
                        <Button onClick={() => setSuccessDialog({ open: false, admin: null })}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
