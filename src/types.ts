export type UserRole = 'student' | 'professor' | 'admin' | 'super_admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  initials: string;
  status: 'active' | 'inactive' | 'pending';
  sections: string[];
  joinDate: string;
}

export interface ActivityItem {
  id: string;
  user: {
    name: string;
    initials: string;
    section: string;
  };
  action: string;
  score: number;
  maxScore: number;
  timestamp: string;
}

export interface Project {
  id: string;
  name: string;
  crewCount: number;
  rating: number;
  activeCount: number;
  color: string;
}
