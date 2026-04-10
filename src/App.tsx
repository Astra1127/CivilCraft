import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import SectionsPage from './pages/SectionsPage';
import MySectionPage from './pages/MySectionPage';
import SuperAdminAnalytics from './pages/SuperAdminAnalytics';
import SuperAdminSettings from './pages/SuperAdminSettings';
import FeedbackPage from './pages/FeedbackPage';
import Placeholder from './pages/Placeholder';

const pageTitlesByRole: Record<string, Record<string, { title: string; subtitle?: string }>> = {
  admin: {
    dashboard: { title: 'Administration HQ', subtitle: 'System overview & controls' },
    users: { title: 'User Management', subtitle: 'Manage engineers & permissions' },
    sections: { title: 'Manage Sites', subtitle: 'All active construction sites' },
    leaderboard: { title: 'Leaderboard', subtitle: 'Top performers & rankings' },
    transactions: { title: 'Transactions', subtitle: 'Credits & activity log' },
    analytics: { title: 'System Analytics', subtitle: 'Platform metrics & insights' },
    feedback: { title: 'Feedback', subtitle: 'Reviews & ratings' },
    settings: { title: 'System Settings', subtitle: 'Platform configuration' },
    profile: { title: 'Profile', subtitle: 'Account settings' },
  },
  super_admin: {
    dashboard: { title: 'Super Admin Control Center', subtitle: 'System-wide command and governance' },
    users: { title: 'Account Management', subtitle: 'Bulk onboarding and role governance' },
    sections: { title: 'Section Governance', subtitle: 'Oversee all active and draft sections' },
    leaderboard: { title: 'Leaderboard', subtitle: 'Top performers & rankings' },
    transactions: { title: 'Transactions', subtitle: 'Credits & activity log' },
    analytics: { title: 'Global Analytics', subtitle: 'Cross-platform metrics and trends' },
    feedback: { title: 'Feedback', subtitle: 'Reviews & ratings' },
    settings: { title: 'Platform Configuration', subtitle: 'Scoring weights and difficulty controls' },
    profile: { title: 'Profile', subtitle: 'Account settings' },
  },
  professor: {
    dashboard: { title: 'Engineering Dashboard', subtitle: 'Project overview & activity' },
    sections: { title: 'My Projects', subtitle: 'Manage your course sections' },
    leaderboard: { title: 'Leaderboard', subtitle: 'Student rankings & scores' },
    transactions: { title: 'Transactions', subtitle: 'Credits & activity log' },
    analytics: { title: 'Analytics', subtitle: 'Class performance metrics' },
    feedback: { title: 'Feedback', subtitle: 'Reviews & ratings' },
    profile: { title: 'Profile', subtitle: 'Account settings' },
  },
  student: {
    dashboard: { title: "Engineer's Dashboard", subtitle: 'Your projects & progress' },
    'my-section': { title: 'My Projects', subtitle: 'Your assigned workspace' },
    leaderboard: { title: 'Leaderboard', subtitle: 'Rankings & top performers' },
    transactions: { title: 'Transactions', subtitle: 'Credits & activity log' },
    feedback: { title: 'Feedback', subtitle: 'Reviews & ratings' },
    profile: { title: 'Profile', subtitle: 'Account settings' },
  },
};

const fallbackTitles: Record<string, { title: string; subtitle?: string }> = {
  dashboard: { title: 'Engineering Dashboard', subtitle: 'Project overview & activity' },
  users: { title: 'User Management', subtitle: 'Manage crew & permissions' },
  sections: { title: 'Sections', subtitle: 'Course sections overview' },
  'my-section': { title: 'My Section', subtitle: 'Your assigned workspace' },
  leaderboard: { title: 'Leaderboard', subtitle: 'Top performers & rankings' },
  transactions: { title: 'Transactions', subtitle: 'Credits & activity log' },
  analytics: { title: 'System Analytics', subtitle: 'Performance metrics & insights' },
  feedback: { title: 'Feedback', subtitle: 'Reviews & ratings' },
  settings: { title: 'Settings', subtitle: 'Platform configuration' },
  profile: { title: 'Profile', subtitle: 'Account settings' },
};

type AppView = 'landing' | 'login' | 'app';

function AppContent() {
  const { isAuthenticated, user } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');
  const [view, setView] = useState<AppView>('landing');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated && view === 'login') {
      setView('app');
    }
  }, [isAuthenticated, view]);

  // Landing page
  if (view === 'landing') {
    return <LandingPage onEnterApp={() => setView('login')} />;
  }

  // Login page
  if (!isAuthenticated || view === 'login') {
    return <Login onBackToLanding={() => setView('landing')} />;
  }

  // Get role-aware page title
  const role = user?.role ?? 'student';
  const roleTitles = pageTitlesByRole[role] ?? {};
  const pageInfo = roleTitles[activePage] ?? fallbackTitles[activePage] ?? { title: activePage, subtitle: '' };

  const renderPage = () => {
    const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin';
    switch (activePage) {
      case 'dashboard':
        return <Dashboard onNavigate={setActivePage} />;
      case 'users':
        return <UserManagement />;
      case 'sections':
        return <SectionsPage />;
      case 'my-section':
        return <MySectionPage />;
      case 'analytics':
        return isSuperAdmin ? <SuperAdminAnalytics /> : <Placeholder page={activePage} />;
      case 'settings':
        return isSuperAdmin ? <SuperAdminSettings /> : <Placeholder page={activePage} />;
      case 'feedback':
        return <FeedbackPage />;
      default:
        return <Placeholder page={activePage} />;
    }
  };

  return (
    <div className="min-h-dvh flex">
      <Sidebar
        activePage={activePage}
        onNavigate={(page) => {
          setActivePage(page);
          setMobileSidebarOpen(false);
        }}
        onLogout={() => setView('landing')}
        isMobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col">
        <TopBar
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          onMenuToggle={() => setMobileSidebarOpen((prev) => !prev)}
        />
        <main className="flex-1 blueprint-bg overflow-auto overflow-x-hidden">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
