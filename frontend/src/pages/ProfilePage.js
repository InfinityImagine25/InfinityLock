/**
 * Profile/Account Page for Infinity Lock Admin Panel
 * Includes Password Change, TOTP Management, and Super Admin Email Change
 */
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authAPI, changeEmailAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import {
    User,
    Shield,
    Key,
    Lock,
    Eye,
    EyeOff,
    Loader2,
    CheckCircle,
    AlertTriangle,
    QrCode,
    Smartphone,
    Mail,
    ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilePage() {
    const { user, isSuperAdmin, logout } = useAuth();
    
    // Password change state
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false,
    });
    const [changingPassword, setChangingPassword] = useState(false);
    
    // TOTP setup state
    const [totpDialog, setTotpDialog] = useState(false);
    const [totpSetup, setTotpSetup] = useState(null);
    const [totpCode, setTotpCode] = useState('');
    const [enablingTotp, setEnablingTotp] = useState(false);
    const [loadingTotp, setLoadingTotp] = useState(false);

    // Email change state (Super Admin)
    const [emailForm, setEmailForm] = useState({
        newEmail: '',
        currentPassword: '',
    });
    const [emailChangeStep, setEmailChangeStep] = useState('form'); // 'form' | 'totp'
    const [changeToken, setChangeToken] = useState('');
    const [emailTotpCode, setEmailTotpCode] = useState('');
    const [changingEmail, setChangingEmail] = useState(false);

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (passwordForm.newPassword.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }
        if (passwordForm.currentPassword === passwordForm.newPassword) {
            toast.error('New password must be different from current password');
            return;
        }
        
        setChangingPassword(true);
        try {
            await authAPI.changePassword(
                passwordForm.currentPassword,
                passwordForm.newPassword
            );
            toast.success('Password changed successfully');
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            const message = error.response?.data?.detail || 'Failed to change password';
            toast.error(message);
        } finally {
            setChangingPassword(false);
        }
    };

    const handleOpenTotpSetup = async () => {
        setLoadingTotp(true);
        setTotpDialog(true);
        try {
            const response = await authAPI.getTotpSetup();
            setTotpSetup(response.data);
        } catch (error) {
            toast.error('Failed to load TOTP setup');
            setTotpDialog(false);
        } finally {
            setLoadingTotp(false);
        }
    };

    const handleEnableTotp = async () => {
        if (totpCode.length !== 6) {
            toast.error('Please enter a 6-digit code');
            return;
        }
        setEnablingTotp(true);
        try {
            await authAPI.enableTotp(totpCode);
            toast.success('TOTP enabled successfully');
            setTotpDialog(false);
            setTotpCode('');
            window.location.reload();
        } catch (error) {
            const message = error.response?.data?.detail || 'Invalid code. Please try again.';
            toast.error(message);
            setTotpCode('');
        } finally {
            setEnablingTotp(false);
        }
    };

    // Email change handlers
    const handleEmailVerify = async (e) => {
        e.preventDefault();
        if (!emailForm.newEmail || !emailForm.currentPassword) {
            toast.error('Please fill in all fields');
            return;
        }
        setChangingEmail(true);
        try {
            const res = await changeEmailAPI.verify(emailForm.newEmail, emailForm.currentPassword);
            setChangeToken(res.data.change_token);
            if (res.data.requires_totp) {
                setEmailChangeStep('totp');
                toast.info('Verify your identity with TOTP to confirm the change');
            } else {
                toast.success('Email changed successfully');
                resetEmailForm();
            }
        } catch (error) {
            const message = error.response?.data?.detail || 'Failed to verify email change';
            toast.error(message);
        } finally {
            setChangingEmail(false);
        }
    };

    const handleEmailConfirm = async () => {
        if (emailTotpCode.length !== 6) return;
        setChangingEmail(true);
        try {
            await changeEmailAPI.confirm(emailTotpCode, changeToken);
            toast.success('Email changed! TOTP has been reset. Please log in again and set up TOTP.');
            resetEmailForm();
            setTimeout(() => logout(), 1500);
        } catch (error) {
            const message = error.response?.data?.detail || 'Failed to confirm email change';
            toast.error(message);
            setEmailTotpCode('');
        } finally {
            setChangingEmail(false);
        }
    };

    const resetEmailForm = () => {
        setEmailForm({ newEmail: '', currentPassword: '' });
        setEmailChangeStep('form');
        setChangeToken('');
        setEmailTotpCode('');
    };

    return (
        <div className="space-y-6 animate-fade-in" data-testid="profile-page">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-heading font-bold tracking-tight">Account Settings</h1>
                <p className="text-slate-400">Manage your account security and preferences</p>
            </div>

            {/* Profile Info */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardHeader className="border-b border-white/5">
                    <CardTitle className="text-base flex items-center gap-2">
                        <User className="w-5 h-5 text-slate-400" />
                        Profile Information
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Email</p>
                            <p className="font-medium">{user?.email}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Role</p>
                            <Badge 
                                variant="outline" 
                                className={user?.role === 'super_admin' 
                                    ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                                    : 'bg-primary/10 text-primary border-primary/20'
                                }
                            >
                                <Shield className="w-3 h-3 mr-1" />
                                {user?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                            </Badge>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Account Status</p>
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Active
                            </Badge>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Two-Factor Auth</p>
                            {user?.totp_enabled ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Enabled
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Not Configured
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Change Email (Super Admin Only) */}
            {isSuperAdmin && (
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardHeader className="border-b border-white/5">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Mail className="w-5 h-5 text-slate-400" />
                            Change Super Admin Email
                        </CardTitle>
                        <CardDescription>
                            Update the primary Super Admin email address. You will be logged out after the change.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                        {emailChangeStep === 'form' ? (
                            <form onSubmit={handleEmailVerify} className="space-y-4 max-w-md">
                                <div className="space-y-2">
                                    <Label htmlFor="new-email">New Email Address</Label>
                                    <Input
                                        id="new-email"
                                        type="email"
                                        value={emailForm.newEmail}
                                        onChange={(e) => setEmailForm(p => ({ ...p, newEmail: e.target.value }))}
                                        className="bg-black/20 border-white/10"
                                        placeholder="new-admin@example.com"
                                        data-testid="change-email-input"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email-password">Current Password</Label>
                                    <Input
                                        id="email-password"
                                        type="password"
                                        value={emailForm.currentPassword}
                                        onChange={(e) => setEmailForm(p => ({ ...p, currentPassword: e.target.value }))}
                                        className="bg-black/20 border-white/10"
                                        placeholder="Verify your identity"
                                        data-testid="change-email-password-input"
                                    />
                                </div>
                                <Button
                                    type="submit"
                                    disabled={changingEmail || !emailForm.newEmail || !emailForm.currentPassword}
                                    data-testid="change-email-verify-btn"
                                >
                                    {changingEmail ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <ArrowRight className="w-4 h-4 mr-2" />
                                    )}
                                    Continue
                                </Button>
                            </form>
                        ) : (
                            <div className="space-y-4 max-w-md">
                                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                                    <p className="text-sm text-slate-300">
                                        Changing email to: <span className="font-medium text-white">{emailForm.newEmail}</span>
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    <Label>Enter TOTP code to confirm</Label>
                                    <div className="flex justify-center">
                                        <InputOTP maxLength={6} value={emailTotpCode} onChange={setEmailTotpCode} data-testid="change-email-totp-input">
                                            <InputOTPGroup className="gap-2">
                                                {[0,1,2,3,4,5].map((i) => (
                                                    <InputOTPSlot key={i} index={i} className="w-10 h-12 text-lg font-mono bg-black/20 border-white/10" />
                                                ))}
                                            </InputOTPGroup>
                                        </InputOTP>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <Button variant="outline" onClick={resetEmailForm} className="border-white/10">
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleEmailConfirm}
                                        disabled={changingEmail || emailTotpCode.length !== 6}
                                        data-testid="change-email-confirm-btn"
                                    >
                                        {changingEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                                        Confirm Change
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Change Password */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardHeader className="border-b border-white/5">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Key className="w-5 h-5 text-slate-400" />
                        Change Password
                    </CardTitle>
                    <CardDescription>
                        Update your password regularly for better security
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                    <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                        <div className="space-y-2">
                            <Label htmlFor="current-password">Current Password</Label>
                            <div className="relative">
                                <Input
                                    id="current-password"
                                    type={showPasswords.current ? 'text' : 'password'}
                                    value={passwordForm.currentPassword}
                                    onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                                    className="bg-black/20 border-white/10 pr-10"
                                    placeholder="Enter current password"
                                    data-testid="current-password-input"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                    onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                                >
                                    {showPasswords.current ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-password">New Password</Label>
                            <div className="relative">
                                <Input
                                    id="new-password"
                                    type={showPasswords.new ? 'text' : 'password'}
                                    value={passwordForm.newPassword}
                                    onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                                    className="bg-black/20 border-white/10 pr-10"
                                    placeholder="Minimum 8 characters"
                                    data-testid="new-password-input"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                    onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                                >
                                    {showPasswords.new ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirm New Password</Label>
                            <div className="relative">
                                <Input
                                    id="confirm-password"
                                    type={showPasswords.confirm ? 'text' : 'password'}
                                    value={passwordForm.confirmPassword}
                                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                    className="bg-black/20 border-white/10 pr-10"
                                    placeholder="Re-enter new password"
                                    data-testid="confirm-password-input"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                    onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                                >
                                    {showPasswords.confirm ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                                </Button>
                            </div>
                        </div>
                        <Button 
                            type="submit" 
                            disabled={changingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                            data-testid="change-password-btn"
                        >
                            {changingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                            Change Password
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* TOTP Management */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardHeader className="border-b border-white/5">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Smartphone className="w-5 h-5 text-slate-400" />
                        Two-Factor Authentication
                    </CardTitle>
                    <CardDescription>
                        Secure your account with TOTP-based two-factor authentication
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                    {user?.totp_enabled ? (
                        <div className="flex items-center gap-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <CheckCircle className="w-8 h-8 text-emerald-500" />
                            <div>
                                <p className="font-medium text-emerald-500">TOTP is enabled</p>
                                <p className="text-sm text-slate-400">
                                    Your account is protected with two-factor authentication
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                <AlertTriangle className="w-8 h-8 text-amber-500" />
                                <div>
                                    <p className="font-medium text-amber-500">TOTP not configured</p>
                                    <p className="text-sm text-slate-400">
                                        Enable two-factor authentication for enhanced security
                                    </p>
                                </div>
                            </div>
                            <Button onClick={handleOpenTotpSetup} data-testid="setup-totp-btn">
                                <QrCode className="w-4 h-4 mr-2" />
                                Set Up TOTP
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* TOTP Setup Dialog */}
            <Dialog open={totpDialog} onOpenChange={setTotpDialog}>
                <DialogContent className="bg-card border-white/10 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-primary" />
                            Set Up Two-Factor Authentication
                        </DialogTitle>
                        <DialogDescription>
                            Scan the QR code with Google Authenticator, Authy, or any TOTP app
                        </DialogDescription>
                    </DialogHeader>
                    
                    {loadingTotp ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : totpSetup && (
                        <div className="space-y-6 py-4">
                            <div className="flex justify-center">
                                <div className="p-4 bg-white rounded-xl">
                                    <img
                                        src={`data:image/png;base64,${totpSetup.qr_code_base64}`}
                                        alt="TOTP QR Code"
                                        className="w-48 h-48"
                                    />
                                </div>
                            </div>
                            <div className="p-3 rounded-lg bg-black/30 border border-white/10">
                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Manual Entry Code</p>
                                <p className="font-mono text-sm break-all select-all">{totpSetup.secret}</p>
                            </div>
                            <div className="space-y-3">
                                <Label>Enter the 6-digit code from your app</Label>
                                <div className="flex justify-center">
                                    <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode} data-testid="totp-setup-input">
                                        <InputOTPGroup className="gap-2">
                                            {[0,1,2,3,4,5].map((index) => (
                                                <InputOTPSlot key={index} index={index} className="w-10 h-12 text-lg font-mono bg-black/20 border-white/10" />
                                            ))}
                                        </InputOTPGroup>
                                    </InputOTP>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setTotpDialog(false); setTotpCode(''); }} className="border-white/10">
                            Cancel
                        </Button>
                        <Button onClick={handleEnableTotp} disabled={enablingTotp || totpCode.length !== 6} data-testid="confirm-totp-btn">
                            {enablingTotp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Enable TOTP
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
