import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppSidebar";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Send, Users, Mail, Trophy } from "lucide-react";

interface Winner {
  name: string;
  phone: string;
  city: string;
  email?: string;
}

export default function Broadcasts() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingWinners, setFetchingWinners] = useState(true);
  const { toast } = useToast();

  // Fetch current winners from database
  useEffect(() => {
    const fetchWinners = async () => {
      try {
        setFetchingWinners(true);
        const response = await fetch('http://localhost:3001/api/stats');
        if (response.ok) {
          const data = await response.json();
          setWinners(data.winnersSelected || []);
        }
      } catch (error) {
        console.error('Error fetching winners:', error);
        toast({
          title: "Error",
          description: "Failed to fetch winners data.",
          variant: "destructive"
        });
      } finally {
        setFetchingWinners(false);
      }
    };

    fetchWinners();
  }, [toast]);

  const sendWinnerEmails = async () => {
    if (winners.length === 0) {
      toast({
        title: "No winners available",
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

  return (
    <AppLayout>
      <Header title="Broadcast Messages" />
      <main className="p-4 space-y-6">
        <h1 className="sr-only">Broadcast Messages</h1>
        
        {/* Winner Email Broadcasting Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Send Winner Congratulations Emails
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fetchingWinners ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground">Loading winners...</p>
              </div>
            ) : winners.length === 0 ? (
              <div className="text-center py-8">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">No winners selected yet</p>
                <p className="text-sm text-muted-foreground">
                  Please select winners from the dashboard first to send congratulations emails.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {winners.length} Winner{winners.length !== 1 ? 's' : ''}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    Ready to Send
                  </Badge>
                </div>

                <div>
                  <Label className="text-sm font-medium">Selected Winners:</Label>
                  <ScrollArea className="h-32 mt-2 rounded-md border p-3">
                    <div className="space-y-2">
                      {winners.map((winner, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-medium">{winner.name}</span>
                            <span className="text-muted-foreground ml-2">• {winner.city}</span>
                          </div>
                          <Badge variant="outline">#{idx + 1}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <div>
                  <Label className="text-sm font-medium">Email Template Preview:</Label>
                  <div className="mt-2 p-4 bg-muted/30 rounded-lg border">
                    <div className="text-sm space-y-2">
                      <p className="font-medium">Subject: 🎉 Congratulations! You're a Winner - Maidan 72 Club</p>
                      <Separator />
                      <div className="text-muted-foreground">
                        <p>• Personalized congratulations message</p>
                        <p>• Winner details (name, code, city)</p>
                        <p>• Instructions to claim prize</p>
                        <p>• Professional HTML email template</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button 
                    onClick={sendWinnerEmails} 
                    disabled={loading}
                    className="flex items-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {loading ? "Sending Emails..." : `Send Emails to ${winners.length} Winner${winners.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* General Broadcast Section (Future Feature) */}
        <Card className="opacity-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              General Broadcast Messages
              <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4 items-center">
              <Label htmlFor="subject" className="sm:text-right">Subject</Label>
              <div className="sm:col-span-3">
                <Input id="subject" placeholder="Promo update" disabled />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4 items-start">
              <Label htmlFor="message" className="sm:text-right">Message</Label>
              <div className="sm:col-span-3">
                <Textarea id="message" placeholder="Write your broadcast..." rows={6} disabled />
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" disabled>Send Broadcast</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </AppLayout>
  );
}
