import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { type Entry } from "./RecentActivityTable";

interface Winner {
  id: string;
  name: string;
  phone: string;
  city: string;
}

interface QuickActionsProps {
  winners: Winner[];
  setWinners: (winners: Winner[]) => void;
  onWinnersUpdated?: () => void;
}

export function QuickActions({ winners, setWinners, onWinnersUpdated }: QuickActionsProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [winnersOpen, setWinnersOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [count, setCount] = useState(3);
  const [selectedWinners, setSelectedWinners] = useState<Winner[]>([]);

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/recent-activity');
        if (response.ok) {
          const data = await response.json();
          setEntries(data.entries);
        }
      } catch (error) {
        console.error('Error fetching entries:', error);
      }
    };

    fetchEntries();
  }, []);

  // Fetch current winners from database when component mounts
  useEffect(() => {
    const fetchCurrentWinners = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/stats');
        if (response.ok) {
          const data = await response.json();
          // Update the winners state with current winners from database
          if (data.winnersSelected && data.winnersSelected.length > 0) {
            const formattedWinners = data.winnersSelected.map((winner: any, index: number) => ({
              id: `winner_${index}`, // Generate ID since API doesn't return it
              name: winner.name,
              phone: winner.phone,
              city: winner.city
            }));
            setWinners(formattedWinners);
          }
        }
      } catch (error) {
        console.error('Error fetching current winners:', error);
      }
    };

    fetchCurrentWinners();
  }, [setWinners]);

  const pickWinners = () => {
    if (entries.length === 0) {
      toast({ 
        title: "No users available", 
        description: "No registered users found to select winners from.",
        variant: "destructive"
      });
      return;
    }

    const chosen: Winner[] = [];
    const availableEntries = [...entries]; // Create a copy to avoid modifying original
    const n = Math.max(1, count);
    
    // If more winners requested than available users, show warning but proceed
    if (n > availableEntries.length) {
      toast({ 
        title: "Limited users available", 
        description: `Only ${availableEntries.length} users available. Selecting all of them.`,
        variant: "default"
      });
    }
    
    // Select random winners from available entries
    const winnersToSelect = Math.min(n, availableEntries.length);
    
    for (let i = 0; i < winnersToSelect; i++) {
      const randomIndex = Math.floor(Math.random() * availableEntries.length);
      const selectedEntry = availableEntries.splice(randomIndex, 1)[0];
      
      chosen.push({
        id: selectedEntry.id,
        name: selectedEntry.name,
        phone: selectedEntry.phone,
        city: selectedEntry.city
      });
    }
    
    setSelectedWinners(chosen);
  };

  const confirm = async () => {
    if (selectedWinners.length === 0) {
      toast({ 
        title: "No winners selected", 
        description: "Please pick winners first.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/update-winners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          winnerIds: selectedWinners.map(w => w.id)
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update winners');
      }

      const result = await response.json();
      console.log("result",result);
      setWinners(selectedWinners);
      
      // Trigger refresh of StatsCards to update winner count immediately
      if (onWinnersUpdated) {
        onWinnersUpdated();
      }
      
      // Small delay to ensure database is updated before refreshing stats
      setTimeout(() => {
        if (onWinnersUpdated) {
          onWinnersUpdated();
        }
      }, 100);
      
      toast({ 
        title: "Winners confirmed!", 
        description: `${result.updatedCount} winner(s) have been updated in the database.` 
      });
      
      setWinnersOpen(false);
    } catch (error) {
      console.error('Error updating winners:', error);
      toast({ 
        title: "Error", 
        description: "Failed to update winners in database.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBroadcast = () => {
    setBroadcastOpen(true);
  };

  const sendBroadcast = async () => {
    if (winners.length === 0) {
      toast({ 
        title: "No winners selected", 
        description: "Please select winners first before sending emails.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/send-winner-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send emails');
      }

      const result = await response.json();
      
      toast({ 
        title: "🎉 Emails sent successfully!", 
        description: result.message || `Congratulations emails sent to ${result.emailsSent} winner(s)!`
      });
      
      setBroadcastOpen(false);
    } catch (error) {
      console.error('Error sending winner emails:', error);
      toast({ 
        title: "Error sending emails", 
        description: error.message || "Failed to send winner emails. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const exportData = () => {
    if (entries.length === 0) {
      toast({ 
        title: "No data to export", 
        description: "No registered users found to export.",
        variant: "destructive"
      });
      return;
    }

    // Create CSV content with all relevant fields
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Name,Phone,Email,City,Status,Registration Date,Code,Is Winner\n"
      + entries.map(e => 
          `"${e.name}","${e.phone}","${e.email || 'N/A'}","${e.city}","${e.status}","${e.date}","${e.code || 'N/A'}","${e.isWinner ? 'Yes' : 'No'}"`
        ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `maidan72_registrations_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ 
      title: "Export completed", 
      description: `${entries.length} registration records exported successfully.` 
    });
  };

  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Select Winners Dialog */}
        <Dialog open={winnersOpen} onOpenChange={setWinnersOpen}>
          <DialogTrigger asChild>
            <Button className="hover-scale">
              <Sparkles className="h-4 w-4" />
              Select Winners
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Select Winners</DialogTitle>
              <DialogDescription>Pick a random set of winners from recent participants.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 items-center">
                <Label htmlFor="count">Number of winners</Label>
                <Input 
                  id="count" 
                  type="number" 
                  min={1} 
                  max={Math.max(entries.length, 1)} 
                  value={count} 
                  onChange={(e) => setCount(parseInt(e.target.value || "1", 10))} 
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {entries.length} registered users available
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={pickWinners}>Pick Randomly</Button>
              </div>
              {selectedWinners.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Selected winners</p>
                  <ScrollArea className="h-40 rounded-md border p-3">
                    <ul className="text-sm space-y-2">
                      {selectedWinners.map((w, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="text-muted-foreground">#{i + 1}</span>
                          <span>{w.name}</span>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setWinnersOpen(false)} disabled={loading}>Cancel</Button>
              <Button onClick={confirm} disabled={selectedWinners.length === 0 || loading}>
                {loading ? "Updating..." : "Confirm Selection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Broadcast Dialog */}
        <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
          <DialogTrigger asChild>
            <Button variant="success" onClick={handleBroadcast} className="hover-scale">
              <Send className="h-4 w-4" />
              Send Broadcast
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Winner Emails</DialogTitle>
              <DialogDescription>
                {winners.length === 0 
                  ? "Please select winners first before sending congratulations emails."
                  : "Send congratulations emails to all selected winners?"
                }
              </DialogDescription>
            </DialogHeader>
            
            {winners.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground">No winners selected yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Email Template</Label>
                  <Textarea 
                    readOnly 
                    value={`🎉 Congratulations {name}!

You've been selected as a winner in the Maidan 72 Club contest! 

Your winning code: {code}
Registration City: {city}

Please contact us to claim your prize. Thank you for participating!

Best regards,
Maidan 72 Club Team`}
                    className="mt-2"
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Email will be personalized with winner's name, code, and city.
                  </p>
                </div>
                <div>
                  <Label>Selected Winners ({winners.length})</Label>
                  <ScrollArea className="h-32 rounded-md border p-3 mt-2">
                    <ul className="text-sm space-y-1">
                       {winners.map((winner, i) => (
                         <li key={i} className="flex items-center gap-2">
                           <span className="text-muted-foreground">#{i + 1}</span>
                           <span>{winner.name}</span>
                         </li>
                       ))}
                    </ul>
                  </ScrollArea>
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="ghost" onClick={() => setBroadcastOpen(false)} disabled={loading}>
                {winners.length === 0 ? "Close" : "Cancel"}
              </Button>
              {winners.length > 0 && (
                <Button onClick={sendBroadcast} disabled={loading}>
                  {loading ? "Sending Emails..." : "Send Emails"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button variant="secondary" onClick={exportData} className="hover-scale">
          <Download className="h-4 w-4" />
          Export Data
        </Button>
      </div>
    </Card>
  );
}