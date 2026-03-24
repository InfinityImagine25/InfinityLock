/**
 * Login Page for Infinity Lock Admin Panel
 * Includes Forgot Password multi-step flow
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { forgotPasswordAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Shield, Lock, AlertCircle, Loader2, ArrowLeft, Mail, KeyRound, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, verifyTotp } = useAuth();
    
    // 'credentials' | 'totp' | 'forgot-email' | 'forgot-otp' | 'forgot-totp' | 'forgot-reset' | 'forgot-success'
    const [step, setStep] = useState('credentials');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [tempToken, setTempToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Forgot password state
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotOtp, setForgotOtp] = useState('');
    const [forgotTotp, setForgotTotp] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [requiresTotp, setRequirestotp] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleCredentialsSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await login(email, password);
            
            if (result.requiresTotp) {
                setTempToken(result.tempToken);
                setStep('totp');
                toast.info('Enter your 6-digit authenticator code');
            } else {
                toast.success('Login successful');
                navigate('/dashboard');
            }
        } catch (err) {
            const message = err.response?.data?.detail || 'Login failed';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handleTotpSubmit = async (e) => {
        e.preventDefault();
        if (totpCode.length !== 6) return;
        
        setError('');
        setLoading(true);

        try {
            await verifyTotp(email, totpCode, tempToken);
            toast.success('Login successful');
            navigate('/dashboard');
        } catch (err) {
            const message = err.response?.data?.detail || 'Invalid code';
            setError(message);
            setTotpCode('');
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    // === Forgot Password Handlers ===

    const handleForgotEmailSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await forgotPasswordAPI.requestReset(forgotEmail);
            setRequirestotp(res.data.requires_totp);
            setStep('forgot-otp');
            toast.info('Check your email (or backend console) for the OTP code');
        } catch (err) {
            const message = err.response?.data?.detail || 'Failed to send reset email';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotOtpSubmit = async (e) => {
        e.preventDefault();
        if (forgotOtp.length !== 6) return;
        setError('');
        setLoading(true);
        try {
            const res = await forgotPasswordAPI.verifyOtp(forgotEmail, forgotOtp);
            setResetToken(res.data.reset_token);
            if (res.data.requires_totp) {
                setRequirestotp(true);
                setStep('forgot-totp');
            } else {
                setStep('forgot-reset');
            }
        } catch (err) {
            const message = err.response?.data?.detail || 'Invalid OTP';
            setError(message);
            setForgotOtp('');
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotTotpSubmit = async (e) => {
        e.preventDefault();
        if (forgotTotp.length !== 6) return;
        setError('');
        setLoading(true);
        try {
            const res = await forgotPasswordAPI.verifyTotp(forgotEmail, forgotTotp, resetToken);
            setResetToken(res.data.reset_token);
            setStep('forgot-reset');
        } catch (err) {
            const message = err.response?.data?.detail || 'Invalid TOTP code';
            setError(message);
            setForgotTotp('');
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPasswordSubmit = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await forgotPasswordAPI.resetPassword(forgotEmail, newPassword, resetToken);
            setStep('forgot-success');
            toast.success('Password reset successfully!');
        } catch (err) {
            const message = err.response?.data?.detail || 'Failed to reset password';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const resetForgotState = () => {
        setForgotEmail('');
        setForgotOtp('');
        setForgotTotp('');
        setResetToken('');
        setRequirestotp(false);
        setNewPassword('');
        setConfirmPassword('');
        setError('');
        setStep('credentials');
    };

    // Step indicator for forgot password
    const forgotSteps = ['Email', 'OTP', ...(requiresTotp ? ['TOTP'] : []), 'New Password'];
    const currentForgotStep = {
        'forgot-email': 0,
        'forgot-otp': 1,
        'forgot-totp': 2,
        'forgot-reset': requiresTotp ? 3 : 2,
        'forgot-success': requiresTotp ? 4 : 3,
    }[step] ?? 0;

    const renderStepIndicator = () => (
        <div className="flex items-center justify-center gap-2 mb-6">
            {forgotSteps.map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                        i < currentForgotStep ? 'bg-emerald-500 text-white' :
                        i === currentForgotStep ? 'bg-primary text-white' :
                        'bg-white/10 text-slate-500'
                    }`}>
                        {i < currentForgotStep ? <CheckCircle className="w-4 h-4" /> : i + 1}
                    </div>
                    {i < forgotSteps.length - 1 && (
                        <div className={`w-8 h-0.5 ${i < currentForgotStep ? 'bg-emerald-500' : 'bg-white/10'}`} />
                    )}
                </div>
            ))}
        </div>
    );

    const renderForgotForm = () => {
        if (step === 'forgot-email') {
            return (
                <>
                    <div className="text-center mb-6">
                        <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                            <Mail className="w-7 h-7 text-amber-500" />
                        </div>
                        <h2 className="font-heading text-2xl font-bold mb-2">Forgot Password</h2>
                        <p className="text-slate-400 text-sm">Enter your admin email to receive a reset code</p>
                    </div>
                    {renderStepIndicator()}
                    <form onSubmit={handleForgotEmailSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="forgot-email">Email Address</Label>
                            <Input
                                id="forgot-email"
                                type="email"
                                placeholder="admin@infinitylock.com"
                                value={forgotEmail}
                                onChange={(e) => setForgotEmail(e.target.value)}
                                className="bg-black/20 border-white/10 focus:border-primary/50"
                                required
                                data-testid="forgot-email-input"
                            />
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10" data-testid="forgot-error">
                                <AlertCircle className="w-4 h-4 shrink-0" />{error}
                            </div>
                        )}
                        <Button type="submit" className="w-full glow-blue" disabled={loading} data-testid="forgot-send-otp-btn">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                            {loading ? 'Sending...' : 'Send Reset Code'}
                        </Button>
                        <Button type="button" variant="ghost" className="w-full" onClick={resetForgotState} data-testid="forgot-back-btn">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Login
                        </Button>
                    </form>
                </>
            );
        }

        if (step === 'forgot-otp') {
            return (
                <>
                    <div className="text-center mb-6">
                        <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                            <KeyRound className="w-7 h-7 text-primary" />
                        </div>
                        <h2 className="font-heading text-2xl font-bold mb-2">Verify Email OTP</h2>
                        <p className="text-slate-400 text-sm">Enter the 6-digit code sent to <span className="text-white font-medium">{forgotEmail}</span></p>
                    </div>
                    {renderStepIndicator()}
                    <form onSubmit={handleForgotOtpSubmit} className="space-y-5">
                        <div className="flex justify-center">
                            <InputOTP maxLength={6} value={forgotOtp} onChange={setForgotOtp} data-testid="forgot-otp-input">
                                <InputOTPGroup className="gap-2">
                                    {[0,1,2,3,4,5].map((i) => (
                                        <InputOTPSlot key={i} index={i} className="w-12 h-14 text-xl font-mono bg-black/20 border-white/10" />
                                    ))}
                                </InputOTPGroup>
                            </InputOTP>
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
                                <AlertCircle className="w-4 h-4 shrink-0" />{error}
                            </div>
                        )}
                        <Button type="submit" className="w-full glow-blue" disabled={loading || forgotOtp.length !== 6} data-testid="forgot-verify-otp-btn">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {loading ? 'Verifying...' : 'Verify OTP'}
                        </Button>
                        <Button type="button" variant="ghost" className="w-full" onClick={resetForgotState} data-testid="forgot-cancel-btn">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                    </form>
                </>
            );
        }

        if (step === 'forgot-totp') {
            return (
                <>
                    <div className="text-center mb-6">
                        <div className="w-14 h-14 rounded-xl bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                            <Shield className="w-7 h-7 text-purple-500" />
                        </div>
                        <h2 className="font-heading text-2xl font-bold mb-2">Verify Authenticator</h2>
                        <p className="text-slate-400 text-sm">Enter the 6-digit code from your authenticator app</p>
                    </div>
                    {renderStepIndicator()}
                    <form onSubmit={handleForgotTotpSubmit} className="space-y-5">
                        <div className="flex justify-center">
                            <InputOTP maxLength={6} value={forgotTotp} onChange={setForgotTotp} data-testid="forgot-totp-input">
                                <InputOTPGroup className="gap-2">
                                    {[0,1,2,3,4,5].map((i) => (
                                        <InputOTPSlot key={i} index={i} className="w-12 h-14 text-xl font-mono bg-black/20 border-white/10" />
                                    ))}
                                </InputOTPGroup>
                            </InputOTP>
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
                                <AlertCircle className="w-4 h-4 shrink-0" />{error}
                            </div>
                        )}
                        <Button type="submit" className="w-full glow-blue" disabled={loading || forgotTotp.length !== 6} data-testid="forgot-verify-totp-btn">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {loading ? 'Verifying...' : 'Verify TOTP'}
                        </Button>
                        <Button type="button" variant="ghost" className="w-full" onClick={resetForgotState}>
                            <ArrowLeft className="w-4 h-4 mr-2" /> Cancel
                        </Button>
                    </form>
                </>
            );
        }

        if (step === 'forgot-reset') {
            return (
                <>
                    <div className="text-center mb-6">
                        <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                            <Lock className="w-7 h-7 text-emerald-500" />
                        </div>
                        <h2 className="font-heading text-2xl font-bold mb-2">Set New Password</h2>
                        <p className="text-slate-400 text-sm">Choose a strong new password for your account</p>
                    </div>
                    {renderStepIndicator()}
                    <form onSubmit={handleResetPasswordSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="new-pass">New Password</Label>
                            <Input
                                id="new-pass"
                                type="password"
                                placeholder="Minimum 8 characters"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="bg-black/20 border-white/10 focus:border-primary/50"
                                required
                                data-testid="forgot-new-password-input"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm-pass">Confirm Password</Label>
                            <Input
                                id="confirm-pass"
                                type="password"
                                placeholder="Re-enter new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="bg-black/20 border-white/10 focus:border-primary/50"
                                required
                                data-testid="forgot-confirm-password-input"
                            />
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10">
                                <AlertCircle className="w-4 h-4 shrink-0" />{error}
                            </div>
                        )}
                        <Button type="submit" className="w-full glow-blue" disabled={loading} data-testid="forgot-reset-btn">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                            {loading ? 'Resetting...' : 'Reset Password'}
                        </Button>
                    </form>
                </>
            );
        }

        if (step === 'forgot-success') {
            return (
                <div className="text-center space-y-6">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                    </div>
                    <div>
                        <h2 className="font-heading text-2xl font-bold mb-2">Password Reset Complete</h2>
                        <p className="text-slate-400">Your password has been changed successfully. You can now sign in with your new password.</p>
                    </div>
                    <Button className="w-full glow-blue" onClick={resetForgotState} data-testid="forgot-back-to-login-btn">
                        <Lock className="w-4 h-4 mr-2" /> Back to Sign In
                    </Button>
                </div>
            );
        }

        return null;
    };

    return (
        <div className="min-h-screen flex" data-testid="login-page">
            {/* Left Panel - Visual */}
            <div 
                className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
                style={{
                    background: 'linear-gradient(135deg, #0A0A0B 0%, #101020 100%)',
                }}
            >
                <div className="absolute inset-0 opacity-30">
                    <div 
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200')`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            filter: 'grayscale(100%) brightness(0.4)',
                        }}
                    />
                </div>
                <div className="relative z-10 flex flex-col justify-center items-center w-full p-12">
                    <div className="glass rounded-2xl p-8 max-w-md text-center">
                        <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-6">
                            <Shield className="w-10 h-10 text-primary" />
                        </div>
                        <h1 className="font-heading text-3xl font-bold text-white mb-4 tracking-tight">
                            INFINITY LOCK
                        </h1>
                        <p className="text-slate-400 text-lg">
                            Admin Command Center
                        </p>
                        <div className="mt-8 pt-8 border-t border-white/10">
                            <p className="text-slate-500 text-sm">
                                Secure access to user management, analytics, and system configuration
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel - Form */}
            <div className="flex-1 flex items-center justify-center p-8 bg-[#0A0A0B]">
                <div className="w-full max-w-md">
                    {/* Mobile Logo */}
                    <div className="lg:hidden text-center mb-8">
                        <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                            <Shield className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="font-heading text-2xl font-bold tracking-tight">INFINITY LOCK</h1>
                    </div>

                    <div className="glass rounded-2xl p-8">
                        {step === 'credentials' ? (
                            <>
                                <div className="text-center mb-8">
                                    <h2 className="font-heading text-2xl font-bold mb-2">Welcome Back</h2>
                                    <p className="text-slate-400">Sign in to access the admin panel</p>
                                </div>

                                <form onSubmit={handleCredentialsSubmit} className="space-y-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="admin@infinitylock.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="bg-black/20 border-white/10 focus:border-primary/50"
                                            required
                                            data-testid="login-email-input"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="password">Password</Label>
                                        <Input
                                            id="password"
                                            type="password"
                                            placeholder="Enter your password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="bg-black/20 border-white/10 focus:border-primary/50"
                                            required
                                            data-testid="login-password-input"
                                        />
                                    </div>

                                    {error && (
                                        <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10" data-testid="login-error">
                                            <AlertCircle className="w-4 h-4" />
                                            {error}
                                        </div>
                                    )}

                                    <Button 
                                        type="submit" 
                                        className="w-full glow-blue"
                                        disabled={loading}
                                        data-testid="login-submit-btn"
                                    >
                                        {loading ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : (
                                            <Lock className="w-4 h-4 mr-2" />
                                        )}
                                        {loading ? 'Signing in...' : 'Sign In'}
                                    </Button>

                                    <div className="text-center">
                                        <button
                                            type="button"
                                            className="text-sm text-primary hover:text-primary/80 transition-colors"
                                            onClick={() => { setError(''); setStep('forgot-email'); }}
                                            data-testid="forgot-password-link"
                                        >
                                            Forgot your password?
                                        </button>
                                    </div>
                                </form>
                            </>
                        ) : step === 'totp' ? (
                            <>
                                <div className="text-center mb-8">
                                    <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                                        <Shield className="w-8 h-8 text-primary" />
                                    </div>
                                    <h2 className="font-heading text-2xl font-bold mb-2">Two-Factor Authentication</h2>
                                    <p className="text-slate-400">Enter the 6-digit code from your authenticator app</p>
                                </div>

                                <form onSubmit={handleTotpSubmit} className="space-y-6">
                                    <div className="flex justify-center">
                                        <InputOTP
                                            maxLength={6}
                                            value={totpCode}
                                            onChange={setTotpCode}
                                            data-testid="totp-input"
                                        >
                                            <InputOTPGroup className="gap-2">
                                                {[0, 1, 2, 3, 4, 5].map((index) => (
                                                    <InputOTPSlot
                                                        key={index}
                                                        index={index}
                                                        className="w-12 h-14 text-xl font-mono bg-black/20 border-white/10"
                                                    />
                                                ))}
                                            </InputOTPGroup>
                                        </InputOTP>
                                    </div>

                                    {error && (
                                        <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10" data-testid="totp-error">
                                            <AlertCircle className="w-4 h-4" />
                                            {error}
                                        </div>
                                    )}

                                    <Button 
                                        type="submit" 
                                        className="w-full glow-blue"
                                        disabled={loading || totpCode.length !== 6}
                                        data-testid="totp-submit-btn"
                                    >
                                        {loading ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : null}
                                        {loading ? 'Verifying...' : 'Verify Code'}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full"
                                        onClick={() => {
                                            setStep('credentials');
                                            setTotpCode('');
                                            setError('');
                                        }}
                                        data-testid="back-to-login-btn"
                                    >
                                        Back to Login
                                    </Button>
                                </form>
                            </>
                        ) : (
                            renderForgotForm()
                        )}
                    </div>

                    <p className="text-center text-slate-500 text-sm mt-6">
                        Infinity Lock Admin Panel v1.0
                    </p>
                </div>
            </div>
        </div>
    );
}
