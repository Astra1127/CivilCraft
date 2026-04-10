import { useAuth } from '../context/AuthContext';
import StudentDashboard from './StudentDashboard';
import ProfessorDashboard from './ProfessorDashboard';
import AdminDashboard from './AdminDashboard';
import SuperAdminDashboard from './SuperAdminDashboard';

interface DashboardProps {
  onNavigate: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { user } = useAuth();

  if (user?.role === 'super_admin') {
    return <SuperAdminDashboard onNavigate={onNavigate} />;
  }

  if (user?.role === 'admin') {
    return <AdminDashboard onNavigate={onNavigate} />;
  }

  if (user?.role === 'professor') {
    return <ProfessorDashboard onNavigate={onNavigate} />;
  }

  // student (with or without section)
  return <StudentDashboard onNavigate={onNavigate} />;
}
