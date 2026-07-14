import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, Users, Clock, CheckCircle2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface StaffMember {
  id: number;
  clerk_user_id: string | null;
  role: "owner" | "staff";
  invited_email: string;
  status: "pending" | "active";
  created_at: string;
}

export default function SettingsTeamPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: members = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ["team"],
    queryFn: () => apiFetch<StaffMember[]>("/team"),
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) =>
      apiFetch("/team/invite", { method: "POST", body: JSON.stringify({ email }) }),
    onSuccess: () => {
      toast({ title: "Invitation sent!", description: `An invite was sent to ${inviteEmail}.` });
      setInviteEmail("");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err: Error) => {
      toast({ title: "Could not invite", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/team/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Staff member removed" });
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err: Error) => {
      toast({ title: "Could not remove", description: err.message, variant: "destructive" });
    },
  });

  const activeMembers  = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");

  return (
    <div className="p-8 max-w-3xl space-y-6">
      {/* Back link */}
      <Link href="/settings">
        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </button>
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team</h1>
          <p className="text-muted-foreground mt-1">
            Invite staff to access bookings, the AI inbox, and customers.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Invite staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a staff member</DialogTitle>
              <DialogDescription>
                They'll receive an email to join your PulseFlow workspace. Staff can access
                bookings, AI inbox, and customers — but not billing or team settings.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="staff@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inviteEmail.includes("@")) {
                    inviteMutation.mutate(inviteEmail);
                  }
                }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => inviteMutation.mutate(inviteEmail)}
                disabled={!inviteEmail.includes("@") || inviteMutation.isPending}
              >
                {inviteMutation.isPending ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Active members */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Active members
              </CardTitle>
              <CardDescription>Members who have accepted their invitation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No active staff yet. Invite someone below.
                </p>
              ) : (
                activeMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">{m.invited_email}</p>
                        <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                      </div>
                    </div>
                    {m.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeMutation.mutate(m.id)}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Pending invites */}
          {pendingMembers.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Pending invitations
                </CardTitle>
                <CardDescription>Awaiting the recipient to sign up.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{m.invited_email}</p>
                        <Badge className="text-xs bg-yellow-100 text-yellow-800 mt-0.5">Pending</Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeMutation.mutate(m.id)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
