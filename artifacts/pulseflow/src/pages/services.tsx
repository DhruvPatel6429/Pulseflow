import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Scissors, Plus, Pencil, Trash2, Clock, IndianRupee, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Service {
  id: number;
  name: string;
  category?: string | null;
  price: number;
  durationMinutes: number;
  description?: string | null;
  requiresConsultation: boolean;
  requiresTokenAdvance: boolean;
  repeatReminderDays?: number | null;
  isActive: boolean;
}

type ServiceForm = Omit<Service, "id">;

const EMPTY_FORM: ServiceForm = {
  name: "",
  category: "",
  price: 0,
  durationMinutes: 30,
  description: "",
  requiresConsultation: false,
  requiresTokenAdvance: false,
  repeatReminderDays: null,
  isActive: true,
};

export default function Services() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: services = [], isLoading } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: () => apiFetch("/services"),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(s: Service) {
    const { id, ...rest } = s;
    setForm(rest);
    setEditingId(id);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name) return;
    setSaving(true);
    try {
      const cleanForm = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== null)
      );
      if (editingId !== null) {
        await apiFetch(`/services/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(cleanForm),
        });
        toast({ description: "Service updated" });
      } else {
        await apiFetch("/services", {
          method: "POST",
          body: JSON.stringify(cleanForm),
        });
        toast({ description: "Service created" });
      }
      qc.invalidateQueries({ queryKey: ["services"] });
      setDialogOpen(false);
    } catch (e: unknown) {
      toast({ description: e instanceof Error ? e.message : "Error saving service", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await apiFetch(`/services/${deleteId}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["services"] });
    setDeleteId(null);
    toast({ description: "Service deleted" });
  }

  async function toggleActive(s: Service) {
    await apiFetch(`/services/${s.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  const active = services.filter((s) => s.isActive);
  const inactive = services.filter((s) => !s.isActive);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Services</h1>
          <p className="text-muted-foreground text-sm">{active.length} active services</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Add Service</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Scissors className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No services yet</p>
          <p className="text-sm mt-1">Add your first service to start taking bookings</p>
          <Button className="mt-4" onClick={openCreate}>+ Add Service</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {services.map((s) => (
              <div key={s.id} className={`bg-card rounded-xl border p-5 space-y-3 ${s.isActive ? "border-border" : "border-border opacity-60"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    {s.category && <p className="text-xs text-muted-foreground capitalize">{s.category}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={s.isActive} onCheckedChange={() => toggleActive(s)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(s.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 font-semibold text-primary">
                    <IndianRupee className="w-3.5 h-3.5" />{s.price}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />{s.durationMinutes} min
                  </span>
                </div>
                {s.description && <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>}
                <div className="flex flex-wrap gap-1">
                  {s.requiresConsultation && <Badge variant="outline" className="text-[10px]">Consultation</Badge>}
                  {s.requiresTokenAdvance && <Badge variant="outline" className="text-[10px]">Token Required</Badge>}
                  {s.repeatReminderDays && <Badge variant="outline" className="text-[10px]">Remind in {s.repeatReminderDays}d</Badge>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Service" : "New Service"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Service Name *</Label>
              <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Haircut, Facial, etc." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price (₹) *</Label>
                <Input className="mt-1" type="number" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Duration (minutes) *</Label>
                <Input className="mt-1" type="number" min="15" step="15" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: parseInt(e.target.value) || 30 }))} />
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Input className="mt-1" value={form.category ?? ""} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="hair, skin, nails..." />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea className="mt-1" value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <Label>Repeat Reminder (days after service)</Label>
              <Input className="mt-1" type="number" min="1" placeholder="e.g. 30" value={form.repeatReminderDays ?? ""} onChange={(e) => setForm((f) => ({ ...f, repeatReminderDays: parseInt(e.target.value) || null }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Requires Consultation</Label>
              <Switch checked={form.requiresConsultation} onCheckedChange={(v) => setForm((f) => ({ ...f, requiresConsultation: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Requires Token Advance</Label>
              <Switch checked={form.requiresTokenAdvance} onCheckedChange={(v) => setForm((f) => ({ ...f, requiresTokenAdvance: v }))} />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the service. Existing bookings won't be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
