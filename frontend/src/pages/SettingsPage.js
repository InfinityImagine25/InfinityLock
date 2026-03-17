/**
 * Settings Page for Infinity Lock Admin Panel
 */
import { useState, useEffect } from 'react';
import { settingsAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs';
import {
    Settings,
    FileText,
    Shield,
    Save,
    Loader2,
    Lock,
    AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
    const { isSuperAdmin } = useAuth();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [privacyPolicy, setPrivacyPolicy] = useState('');
    const [termsOfService, setTermsOfService] = useState('');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await settingsAPI.getSettings();
                setSettings(response.data);
                setPrivacyPolicy(response.data.privacy_policy || '');
                setTermsOfService(response.data.terms_of_service || '');
            } catch (error) {
                console.error('Failed to fetch settings:', error);
                toast.error('Failed to load settings');
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async (type) => {
        if (!isSuperAdmin) {
            toast.error('Only Super Admin can modify settings');
            return;
        }

        setSaving(true);
        try {
            const data = type === 'privacy' 
                ? { privacy_policy: privacyPolicy }
                : { terms_of_service: termsOfService };
            
            await settingsAPI.updateSettings(data);
            toast.success(`${type === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} updated successfully`);
        } catch (error) {
            console.error('Failed to save:', error);
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in" data-testid="settings-loading">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in" data-testid="settings-page">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-heading font-bold tracking-tight">Settings</h1>
                <p className="text-slate-400">Manage application policies and configuration</p>
            </div>

            {/* Super Admin Only Warning */}
            {!isSuperAdmin && (
                <Card className="bg-amber-500/10 border-amber-500/20">
                    <CardContent className="p-4 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        <p className="text-sm text-amber-500">
                            Only Super Admin can modify settings. You have read-only access.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Settings Tabs */}
            <Tabs defaultValue="privacy" className="space-y-4">
                <TabsList className="bg-card/50 border border-white/5">
                    <TabsTrigger value="privacy" className="data-[state=active]:bg-primary/10" data-testid="tab-privacy">
                        <Shield className="w-4 h-4 mr-2" />
                        Privacy Policy
                    </TabsTrigger>
                    <TabsTrigger value="terms" className="data-[state=active]:bg-primary/10" data-testid="tab-terms">
                        <FileText className="w-4 h-4 mr-2" />
                        Terms of Service
                    </TabsTrigger>
                </TabsList>

                {/* Privacy Policy Tab */}
                <TabsContent value="privacy">
                    <Card className="bg-card/50 backdrop-blur-md border-white/5">
                        <CardHeader className="border-b border-white/5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Shield className="w-5 h-5 text-slate-400" />
                                        Privacy Policy
                                    </CardTitle>
                                    <CardDescription>
                                        Displayed to users in the mobile app
                                    </CardDescription>
                                </div>
                                {settings?.updated_at && (
                                    <Badge variant="outline" className="text-xs border-white/10">
                                        Last updated: {new Date(settings.updated_at).toLocaleDateString()}
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <Textarea
                                value={privacyPolicy}
                                onChange={(e) => setPrivacyPolicy(e.target.value)}
                                placeholder="Enter privacy policy content (Markdown supported)..."
                                className="min-h-96 font-mono text-sm bg-black/20 border-white/10"
                                disabled={!isSuperAdmin}
                                data-testid="privacy-policy-textarea"
                            />
                            <div className="flex justify-end mt-4">
                                <Button
                                    onClick={() => handleSave('privacy')}
                                    disabled={saving || !isSuperAdmin}
                                    data-testid="save-privacy-btn"
                                >
                                    {saving ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-2" />
                                    )}
                                    Save Privacy Policy
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Terms of Service Tab */}
                <TabsContent value="terms">
                    <Card className="bg-card/50 backdrop-blur-md border-white/5">
                        <CardHeader className="border-b border-white/5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-slate-400" />
                                        Terms of Service
                                    </CardTitle>
                                    <CardDescription>
                                        Legal terms displayed to users
                                    </CardDescription>
                                </div>
                                {settings?.updated_at && (
                                    <Badge variant="outline" className="text-xs border-white/10">
                                        Last updated: {new Date(settings.updated_at).toLocaleDateString()}
                                    </Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <Textarea
                                value={termsOfService}
                                onChange={(e) => setTermsOfService(e.target.value)}
                                placeholder="Enter terms of service content (Markdown supported)..."
                                className="min-h-96 font-mono text-sm bg-black/20 border-white/10"
                                disabled={!isSuperAdmin}
                                data-testid="terms-textarea"
                            />
                            <div className="flex justify-end mt-4">
                                <Button
                                    onClick={() => handleSave('terms')}
                                    disabled={saving || !isSuperAdmin}
                                    data-testid="save-terms-btn"
                                >
                                    {saving ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-2" />
                                    )}
                                    Save Terms of Service
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Additional Info */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Lock className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-medium mb-1">Security Note</h3>
                            <p className="text-sm text-slate-400">
                                All settings changes are logged in the security audit trail. 
                                Only Super Admin accounts can modify these settings.
                                Changes are immediately reflected in the mobile application.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
