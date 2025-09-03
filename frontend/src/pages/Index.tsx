import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/theme-provider";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { ChartsPanel } from "@/components/dashboard/ChartsPanel";
import { RecentActivityTable, type Entry } from "@/components/dashboard/RecentActivityTable";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthSession, setAuthSession } from "@/utils/auth";

interface Winner {
  id: string;
  name: string;
  phone: string;
  city: string;
}

function generateData() {
  const cities = ["Lagos", "Abuja", "Port Harcourt", "Kano", "Ibadan", "Benin City", "Enugu"];
  const first = ["Ayo", "Chioma", "Ifeanyi", "Kemi", "Sola", "Femi", "Ada", "Bola", "Tunde", "Ngozi"]; 
  const last = ["Okoro", "Adeyemi", "Balogun", "Eze", "Okafor", "Ojo", "Lawal", "Afolayan", "Ogunleye", "Ibrahim"]; 
  const entries: Entry[] = [];
  const total = 520;
  for (let i = 1; i <= total; i++) {
    const verified = Math.random() < 0.8;
    const status = verified ? "Verified" : Math.random() < 0.7 ? "Pending" : "Rejected";
    const city = cities[Math.floor(Math.random() * cities.length)];
    const name = `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
    const phone = `080${Math.floor(10000000 + Math.random() * 89999999)}`;
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
    entries.push({ id: String(i), name, phone, city, status, date });
  }

  // Aggregates
  const registrations = entries.length;
  const codeScansPerDay = Math.floor(Math.random() * 200) + 150; // Random daily scans

  // Daily
  const byDate = new Map<string, number>();
  entries.forEach((e) => byDate.set(e.date, (byDate.get(e.date) || 0) + 1));
  const daily = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date: date.slice(5), count }));

  // City
  const byCity = new Map<string, number>();
  entries.forEach((e) => byCity.set(e.city, (byCity.get(e.city) || 0) + 1));
  const city = Array.from(byCity.entries()).map(([name, value]) => ({ name, value }));

  // Performance
  const performance = [
    { contest: "Summer Promo", value: 340 },
    { contest: "Game Night", value: 280 },
    { contest: "Weekend Rush", value: 410 },
  ];

  return { entries, registrations, codeScansPerDay, daily, city, performance };
}

const Index = () => {
  const [loading, setLoading] = useState(true);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const data = useMemo(() => generateData(), []);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "pass@123") {
      setIsAuthenticated(true);
      setAuthSession(); // Store in session storage
      setPasswordError("");
    } else {
      setPasswordError("Invalid password. Please try again.");
      setPassword("");
    }
  };

  // Check authentication status on component mount
  useEffect(() => {
    const isAuth = getAuthSession();
    setIsAuthenticated(isAuth);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Password Protection Overlay */}
      {!isAuthenticated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Blurred Background */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
          
          {/* Password Card */}
          <Card className="relative z-10 w-full max-w-md mx-4">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Admin Access Required</CardTitle>
              <p className="text-muted-foreground">Please enter the password to access the dashboard</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full"
                    autoFocus
                  />
                  {passwordError && (
                    <p className="text-sm text-red-500">{passwordError}</p>
                  )}
                </div>
                <Button type="submit" className="w-full">
                  Access Dashboard
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Dashboard Content */}
      <div className={!isAuthenticated ? "blur-sm pointer-events-none" : ""}>
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-16 items-center justify-between px-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-heading font-semibold text-foreground">Admin Dashboard</h1>
              <p className="text-base text-muted-foreground">Maidan 72 Club</p>
            </div>
            <ModeToggle />
          </div>
        </header>
        
        <main className="container px-6 py-6 space-y-6">
          <StatsCards refreshTrigger={refreshTrigger} isAuthenticated={isAuthenticated} />
          <QuickActions 
            winners={winners} 
            setWinners={setWinners} 
            onWinnersUpdated={triggerRefresh} 
            isAuthenticated={isAuthenticated} 
          />
          <ChartsPanel isAuthenticated={isAuthenticated} />
          <RecentActivityTable isAuthenticated={isAuthenticated} />
        </main>
      </div>
    </div>
  );
};

export default Index;
