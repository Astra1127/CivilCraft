import { Bug } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { logActivity, setCmsState, uid } from "@/lib/cms/store";
import { useAuth } from "@/lib/auth";

const categories = ["Gameplay", "Graphics", "Performance", "Account", "Website", "Other"];

/** Player-facing bug report. Lands in the admin Bug Reports inbox. */
export function ReportBugDialog() {
  const { player } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(categories[0]!);
  const [description, setDescription] = useState("");

  const submit = () => {
    if (description.trim().length < 10) {
      toast.error("Please describe the issue in a little more detail.");
      return;
    }
    setCmsState((prev) => ({
      ...prev,
      bugs: [
        {
          id: uid(),
          player: player?.displayName ?? "Player",
          category,
          description: description.trim(),
          gameVersion: "—",
          device: typeof navigator !== "undefined" ? navigator.platform || "Unknown" : "Unknown",
          createdAt: new Date().toISOString(),
          status: "New" as const,
        },
        ...prev.bugs,
      ],
    }));
    logActivity({ area: "Messages", action: "Bug reported", target: category });
    setDescription("");
    setOpen(false);
    toast.success("Thanks! Your report was sent to the team.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:inline-flex">
          <Bug className="mr-1 h-4 w-4" aria-hidden="true" />
          Report a Bug
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Report a bug</DialogTitle>
          <DialogDescription>
            Tell us what went wrong and the team will take a look.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bug-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="bug-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bug-description">What happened?</Label>
            <Textarea
              id="bug-description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue and the steps that led to it."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="gold" onClick={submit}>
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
