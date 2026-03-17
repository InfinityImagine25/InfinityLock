/**
 * Login Page for Infinity Lock Admin Panel
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Shield, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
    const navigate = useNavigate();
    const { login, verifyTotp } = useAuth();
    
    const [step, setStep] = useState('credentials'); // 'credentials' | 'totp'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [tempToken, setTempToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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
                                </form>
                            </>
                        ) : (
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
