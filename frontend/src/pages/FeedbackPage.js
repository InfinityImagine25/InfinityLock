/**
 * Feedback Management Page for Infinity Lock Admin Panel
 */
import { useState, useEffect, useCallback } from 'react';
import { feedbackAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs';
import {
    MessageSquare,
    MessageCircle,
    CheckCircle,
    Clock,
    Send,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

const statusConfig = {
    new: { label: 'New', color: 'bg-primary/10 text-primary border-primary/20', icon: MessageSquare },
    reviewed: { label: 'Reviewed', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: Clock },
    responded: { label: 'Responded', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle },
    archived: { label: 'Archived', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: MessageCircle },
};

export default function FeedbackPage() {
    const [feedback, setFeedback] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    
    // Response dialog
    const [responseDialog, setResponseDialog] = useState({
        open: false,
        feedback: null,
        response: '',
    });
    const [responding, setResponding] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const params = activeTab !== 'all' ? { status: activeTab } : {};
            const [feedbackRes, statsRes] = await Promise.all([
                feedbackAPI.listFeedback(params),
                feedbackAPI.getFeedbackStats(),
            ]);
            setFeedback(feedbackRes.data);
            setStats(statsRes.data);
        } catch (error) {
            console.error('Failed to fetch feedback:', error);
            toast.error('Failed to load feedback');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeTab]);

    useEffect(() => {
        fetchData();
    }, [activeTab, fetchData]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const openResponseDialog = (item) => {
        setResponseDialog({
            open: true,
            feedback: item,
            response: item.admin_response || '',
        });
    };

    const handleRespond = async () => {
        if (!responseDialog.response.trim()) {
            toast.error('Please enter a response');
            return;
        }

        setResponding(true);
        try {
            await feedbackAPI.respondToFeedback(
                responseDialog.feedback.id,
                responseDialog.response
            );
            toast.success('Response sent successfully');
            setResponseDialog({ open: false, feedback: null, response: '' });
            fetchData();
        } catch (error) {
            console.error('Failed to respond:', error);
            toast.error('Failed to send response');
        } finally {
            setResponding(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in" data-testid="feedback-loading">
                <Skeleton className="h-8 w-32" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-24 rounded-xl" />
                    ))}
                </div>
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in" data-testid="feedback-page">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-heading font-bold tracking-tight">Feedback</h1>
                    <p className="text-slate-400">User feedback and suggestions management</p>
                </div>
                <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="border-white/10"
                    data-testid="refresh-feedback-btn"
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-4">
                        <p className="text-sm text-slate-400">Total</p>
                        <p className="text-2xl font-heading font-bold">{stats?.total || 0}</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-4">
                        <p className="text-sm text-slate-400">New</p>
                        <p className="text-2xl font-heading font-bold text-primary">{stats?.new || 0}</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-4">
                        <p className="text-sm text-slate-400">Reviewed</p>
                        <p className="text-2xl font-heading font-bold text-amber-500">{stats?.reviewed || 0}</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/50 backdrop-blur-md border-white/5">
                    <CardContent className="p-4">
                        <p className="text-sm text-slate-400">Responded</p>
                        <p className="text-2xl font-heading font-bold text-emerald-500">{stats?.responded || 0}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Feedback List */}
            <Card className="bg-card/50 backdrop-blur-md border-white/5">
                <CardHeader className="border-b border-white/5">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="bg-black/20">
                            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
                            <TabsTrigger value="new" data-testid="tab-new">New</TabsTrigger>
                            <TabsTrigger value="reviewed" data-testid="tab-reviewed">Reviewed</TabsTrigger>
                            <TabsTrigger value="responded" data-testid="tab-responded">Responded</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </CardHeader>
                <CardContent className="p-4">
                    {feedback.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No feedback found</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {feedback.map((item) => {
                                const config = statusConfig[item.status];
                                return (
                                    <div
                                        key={item.id}
                                        className="p-4 rounded-lg bg-black/20 border border-white/5 hover:border-white/10 transition-colors"
                                        data-testid={`feedback-item-${item.id}`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <Badge variant="outline" className={config.color}>
                                                        <config.icon className="w-3 h-3 mr-1" />
                                                        {config.label}
                                                    </Badge>
                                                    <span className="text-xs text-slate-500 font-mono">
                                                        {item.user_id.slice(0, 8)}...
                                                    </span>
                                                    <span className="text-xs text-slate-500">
                                                        {new Date(item.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <p className="text-sm mb-2">{item.message}</p>
                                                {item.admin_response && (
                                                    <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                                        <p className="text-xs text-emerald-500 mb-1">Admin Response:</p>
                                                        <p className="text-sm text-slate-300">{item.admin_response}</p>
                                                    </div>
                                                )}
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openResponseDialog(item)}
                                                className="border-white/10 shrink-0"
                                                data-testid={`respond-btn-${item.id}`}
                                            >
                                                <MessageCircle className="w-4 h-4 mr-2" />
                                                {item.admin_response ? 'Edit' : 'Respond'}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Response Dialog */}
            <Dialog 
                open={responseDialog.open} 
                onOpenChange={(open) => !open && setResponseDialog({ open: false, feedback: null, response: '' })}
            >
                <DialogContent className="bg-card border-white/10">
                    <DialogHeader>
                        <DialogTitle>Respond to Feedback</DialogTitle>
                        <DialogDescription>
                            {responseDialog.feedback?.message}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea
                            placeholder="Type your response..."
                            value={responseDialog.response}
                            onChange={(e) => setResponseDialog(prev => ({ ...prev, response: e.target.value }))}
                            className="min-h-32 bg-black/20 border-white/10"
                            data-testid="response-textarea"
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setResponseDialog({ open: false, feedback: null, response: '' })}
                            className="border-white/10"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRespond}
                            disabled={responding}
                            data-testid="send-response-btn"
                        >
                            {responding ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4 mr-2" />
                            )}
                            Send Response
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
