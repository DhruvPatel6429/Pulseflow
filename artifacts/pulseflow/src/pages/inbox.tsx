import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, CheckCircle, XCircle, Send, Bot, User, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface AiAction {
  id: number;
  actionType: string;
  inputSummary?: string | null;
  replyDraft?: string | null;
  confidenceScore?: number | null;
  status: string;
  requiresHumanReview: boolean;
  createdAt: string;
  customer: { id: number; name: string; phone: string } | null;
}

interface Conversation {
  id: number;
  status: string;
  lastMessageAt: string;
  customer: { name: string; phone: string } | null;
  lastMessage: { content: string; direction: string } | null;
  pendingAiAction: boolean;
}

interface Message {
  id: number;
  direction: string;
  content: string;
  aiGenerated: boolean;
  requiresApproval: boolean;
  createdAt: string;
}

const INTENT_LABELS: Record<string, string> = {
  booking_request: "Booking Request",
  price_inquiry: "Price Inquiry",
  availability_inquiry: "Availability",
  cancel_request: "Cancellation",
  reschedule_request: "Reschedule",
  location_inquiry: "Location",
  faq: "FAQ",
  unknown: "Unknown",
};

export default function Inbox() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<AiAction | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [editedReply, setEditedReply] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [sandboxMessage, setSandboxMessage] = useState("");
  const [sandboxPhone, setSandboxPhone] = useState("");
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<{ replyDraft: string; intent: string; confidence: number } | null>(null);

  const { data: actions = [], isLoading: actionsLoading } = useQuery<AiAction[]>({
    queryKey: ["ai-inbox"],
    queryFn: () => apiFetch("/ai/inbox"),
    refetchInterval: 10000,
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: () => apiFetch("/conversations"),
    refetchInterval: 15000,
  });

  const { data: convDetail } = useQuery<{ messages: Message[]; customer: { name: string; phone: string } | null }>(
    {
      queryKey: ["conversation", selectedConvId],
      queryFn: () => apiFetch(`/conversations/${selectedConvId}`),
      enabled: !!selectedConvId,
      refetchInterval: 10000,
    }
  );

  async function handleApprove(action: AiAction, edited?: string) {
    await apiFetch(`/ai/actions/${action.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ editedReply: edited ?? action.replyDraft }),
    });
    qc.invalidateQueries({ queryKey: ["ai-inbox"] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    setSelectedAction(null);
    toast({ description: "Reply sent!" });
  }

  async function handleReject(action: AiAction) {
    await apiFetch(`/ai/actions/${action.id}/reject`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["ai-inbox"] });
    setSelectedAction(null);
    toast({ description: "Action dismissed" });
  }

  async function handleSandboxSend() {
    if (!sandboxMessage || !sandboxPhone) return;
    setSandboxLoading(true);
    try {
      const result = await apiFetch<{ replyDraft: string; intent: string; confidence: number }>(
        "/sandbox/send-message",
        {
          method: "POST",
          body: JSON.stringify({ message: sandboxMessage, customerPhone: sandboxPhone, customerName: "Sandbox User" }),
        }
      );
      setSandboxResult(result);
      qc.invalidateQueries({ queryKey: ["ai-inbox"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e: unknown) {
      toast({ description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setSandboxLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Inbox</h1>
        <p className="text-muted-foreground text-sm">
          {actions.length} pending action{actions.length !== 1 ? "s" : ""} need your review
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Actions */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Pending Actions</h2>

          {actionsLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
          ) : actions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
              <Bot className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">All clear!</p>
              <p className="text-sm mt-1">No pending AI actions</p>
            </div>
          ) : (
            actions.map((action) => (
              <div key={action.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{action.customer?.name ?? "Unknown"}</p>
                      <Badge className="text-[10px] bg-amber-100 text-amber-800">
                        {INTENT_LABELS[action.actionType] ?? action.actionType}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{action.customer?.phone}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(action.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>

                <div className="space-y-2">
                  {action.inputSummary && (
                    <div className="flex gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-muted-foreground italic">"{action.inputSummary}"</p>
                    </div>
                  )}
                  {action.replyDraft && (
                    <div className="flex gap-2 text-sm">
                      <Bot className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p>{action.replyDraft}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="outline" className="text-[10px]">
                    {Math.round((action.confidenceScore ?? 0) * 100)}% confidence
                  </Badge>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setSelectedAction(action); setEditedReply(action.replyDraft ?? ""); setIsEditing(false); }}>
                      <Pencil className="w-3.5 h-3.5 mr-1" />Edit & Send
                    </Button>
                    <Button size="sm" onClick={() => handleApprove(action)}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />Send
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleReject(action)}>
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Recent Conversations */}
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide pt-2">Recent Conversations</h2>
          {conversations.slice(0, 5).map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setSelectedConvId(c.id)}
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                {(c.customer?.name ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{c.customer?.name ?? "Unknown"}</p>
                {c.lastMessage && (
                  <p className="text-xs text-muted-foreground truncate">
                    {c.lastMessage.direction === "outbound" ? "You: " : ""}{c.lastMessage.content}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(c.lastMessageAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>

        {/* Sandbox */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">🧪 AI Sandbox</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Simulate a WhatsApp message to test your AI replies</p>
              <div>
                <label className="text-xs font-medium">Phone Number</label>
                <input
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                  placeholder="+91 99999 00001"
                  value={sandboxPhone}
                  onChange={(e) => setSandboxPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Message</label>
                <Textarea
                  className="mt-1 text-sm"
                  placeholder="How much is a haircut? Can I book tomorrow at 11am?"
                  value={sandboxMessage}
                  onChange={(e) => setSandboxMessage(e.target.value)}
                  rows={3}
                />
              </div>
              <Button size="sm" className="w-full" onClick={handleSandboxSend} disabled={sandboxLoading || !sandboxMessage || !sandboxPhone}>
                <Send className="w-3.5 h-3.5 mr-1" />{sandboxLoading ? "Processing..." : "Simulate Message"}
              </Button>
              {sandboxResult && (
                <div className="p-3 bg-primary/5 rounded-lg text-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="text-[10px] bg-blue-100 text-blue-800">{INTENT_LABELS[sandboxResult.intent] ?? sandboxResult.intent}</Badge>
                    <span className="text-xs text-muted-foreground">{Math.round(sandboxResult.confidence * 100)}% confidence</span>
                  </div>
                  <p className="font-medium text-xs text-muted-foreground">AI Reply:</p>
                  <p className="text-sm">{sandboxResult.replyDraft}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit & Send Dialog */}
      <Dialog open={!!selectedAction} onOpenChange={() => setSelectedAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Reply</DialogTitle>
          </DialogHeader>
          {selectedAction && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="text-muted-foreground text-xs mb-1">Customer message:</p>
                <p className="italic">"{selectedAction.inputSummary}"</p>
              </div>
              <div>
                <label className="text-sm font-medium">Your Reply</label>
                <Textarea
                  className="mt-1"
                  value={editedReply}
                  onChange={(e) => setEditedReply(e.target.value)}
                  rows={5}
                />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => handleApprove(selectedAction, editedReply)}>
                  <Send className="w-4 h-4 mr-2" />Send
                </Button>
                <Button variant="outline" onClick={() => setSelectedAction(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Conversation Dialog */}
      <Dialog open={!!selectedConvId} onOpenChange={() => setSelectedConvId(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{convDetail?.customer?.name ?? "Conversation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto max-h-[400px] pr-1">
            {convDetail?.messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.direction === "outbound"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}>
                  {m.content}
                  {m.aiGenerated && (
                    <div className="mt-1 flex justify-end">
                      <span className={`text-[10px] ${m.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>AI</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
