import { useMemo, useState, type ChangeEvent } from 'react';
import { Search, Upload, UserPlus, MoreVertical, ChevronDown, Edit, Trash2, Eye, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, Mail } from 'lucide-react';
import * as XLSX from 'xlsx';
import BlueprintCard from '../components/BlueprintCard';
import type { User, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { isPlayFabConfigured, provisionPlayFabPlayer } from '../services/playfab';
import { hasEmailDeliveryConfig, sendOnboardingEmail } from '../services/onboardingEmail';

const demoUsers: User[] = [
  { id: '1', name: 'Emily Davis', email: 'emily.d@civilcraft.edu', role: 'student', initials: 'ED', status: 'active', sections: ['CE-101'], joinDate: '2026-01-15' },
  { id: '2', name: 'John Doe', email: 'john.d@civilcraft.edu', role: 'student', initials: 'JD', status: 'active', sections: ['CE-101'], joinDate: '2026-01-18' },
  { id: '3', name: 'Sarah Wilson', email: 'sarah.w@civilcraft.edu', role: 'student', initials: 'SW', status: 'active', sections: ['CE-101'], joinDate: '2026-01-20' },
  { id: '4', name: 'Michael Brown', email: 'michael.b@civilcraft.edu', role: 'student', initials: 'MB', status: 'inactive', sections: ['CE-202'], joinDate: '2026-02-01' },
  { id: '5', name: 'Prof. Lisa Park', email: 'lisa.p@civilcraft.edu', role: 'professor', initials: 'LP', status: 'active', sections: ['CE-101', 'CE-202'], joinDate: '2025-08-10' },
  { id: '6', name: 'Alex Johnson', email: 'alex.j@civilcraft.edu', role: 'student', initials: 'AJ', status: 'pending', sections: [], joinDate: '2026-03-05' },
  { id: '7', name: 'Dr. Rachel Kim', email: 'rachel.k@civilcraft.edu', role: 'professor', initials: 'RK', status: 'active', sections: ['CE-303'], joinDate: '2025-06-15' },
  { id: '8', name: 'Dr. Alex Morgan', email: 'admin@civilcraft.edu', role: 'super_admin', initials: 'AM', status: 'active', sections: [], joinDate: '2025-01-03' },
];

export default function UserManagement() {
  const { isPlayFabEnabled, user } = useAuth();
  const [users, setUsers] = useState<User[]>(demoUsers);
  const [activeTab, setActiveTab] = useState<'manage' | 'bulk'>('manage');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const filtered = users.filter((u) => {
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const statusStyles: Record<string, string> = {
    active: 'bg-cyber-green/10 text-cyber-green border-cyber-green/20',
    inactive: 'bg-steel-100 text-steel-500 border-steel-200',
    pending: 'bg-warning-orange/10 text-warning-orange border-warning-orange/20',
  };

  const roleStyles: Record<string, string> = {
    student: 'bg-earth-50 text-earth-700 border-earth-200/50',
    professor: 'bg-purple-50 text-purple-600 border-purple-200/50',
    admin: 'bg-danger-red/5 text-danger-red border-danger-red/20',
    super_admin: 'bg-[#0B3C5D]/10 text-[#0B3C5D] border-[#0B3C5D]/25',
  };

  const canManageRoles = user?.role === 'super_admin' || user?.role === 'admin';

  const updateUserRole = (id: string, role: UserRole) => {
    setUsers((prev) => prev.map((item) => (item.id === id ? { ...item, role } : item)));
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 animate-fade-in-up">
      {/* Tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setActiveTab('manage')}
          className={`flex items-center gap-2 px-5 py-3 rounded-[4px] text-sm font-semibold transition-all border ${
            activeTab === 'manage'
              ? 'bg-earth-800 text-white border-earth-600/30 shadow-lg shadow-earth-900/10'
              : 'bg-white text-steel-500 border-earth-200 hover:text-earth-700 hover:border-earth-300'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          Manage Users
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`flex items-center gap-2 px-5 py-3 rounded-[4px] text-sm font-semibold transition-all border ${
            activeTab === 'bulk'
              ? 'bg-earth-800 text-white border-earth-600/30 shadow-lg shadow-earth-900/10'
              : 'bg-white text-steel-500 border-earth-200 hover:text-earth-700 hover:border-earth-300'
          }`}
        >
          <Upload className="w-4 h-4" />
          Bulk Upload
        </button>
      </div>

      {activeTab === 'manage' ? (
        <>
          {/* Search & Filter Bar */}
          <BlueprintCard className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-400" />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-earth-50/50 border border-earth-200 rounded-[4px] text-sm text-earth-800 placeholder:text-steel-400 focus:outline-none focus:border-earth-400 focus:ring-1 focus:ring-earth-300/30 transition-all font-mono"
                />
              </div>
              <div className="relative">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="appearance-none pl-4 pr-10 py-2.5 bg-earth-50/50 border border-earth-200 rounded-[4px] text-sm text-earth-800 focus:outline-none focus:border-earth-400 focus:ring-1 focus:ring-earth-300/30 transition-all cursor-pointer font-medium min-w-[140px]"
                >
                  <option value="all">All Roles</option>
                  <option value="student">Student</option>
                  <option value="professor">Professor</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-400 pointer-events-none" />
              </div>
            </div>
          </BlueprintCard>

          {/* Table */}
          <BlueprintCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-earth-800">
                    <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">User</th>
                    <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">Role</th>
                    <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">Status</th>
                    <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">Sections</th>
                    <th className="text-left px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">Join Date</th>
                    <th className="text-center px-5 py-3 text-[11px] font-mono font-semibold text-earth-200 tracking-widest uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100/60">
                  {filtered.map((user) => (
                    <tr key={user.id} className="hover:bg-earth-50/50 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-earth-700 to-earth-500 flex items-center justify-center shrink-0">
                            <span className="text-[11px] font-bold text-white font-mono">{user.initials}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-earth-800">{user.name}</p>
                            <p className="text-[11px] text-steel-400 font-mono">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {canManageRoles ? (
                          <div className="relative">
                            <select
                              value={user.role}
                              onChange={(e) => updateUserRole(user.id, e.target.value as UserRole)}
                              className="appearance-none rounded border border-earth-200 bg-earth-50/60 px-2.5 py-1 pr-7 text-[11px] font-mono font-semibold text-earth-800"
                            >
                              <option value="student">student</option>
                              <option value="professor">professor</option>
                              <option value="admin">admin</option>
                              <option value="super_admin">super_admin</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-steel-400" />
                          </div>
                        ) : (
                          <span className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded border capitalize ${roleStyles[user.role]}`}>
                            {user.role}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded border capitalize ${statusStyles[user.status]}`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-1.5 flex-wrap">
                          {user.sections.length > 0 ? (
                            user.sections.map((s) => (
                              <span key={s} className="text-[10px] font-mono bg-earth-100 text-earth-700 px-2 py-0.5 rounded border border-earth-200/50">
                                {s}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-steel-300 italic">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono text-steel-500">
                          {new Date(user.joinDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="relative inline-block">
                          <button
                            onClick={() => setActionMenuId(actionMenuId === user.id ? null : user.id)}
                            className="p-1.5 rounded hover:bg-earth-100 transition-colors"
                          >
                            <MoreVertical className="w-4 h-4 text-steel-400" />
                          </button>
                          {actionMenuId === user.id && (
                            <div className="absolute right-0 top-8 w-36 bg-white border border-earth-200 rounded-[4px] shadow-lg z-10 py-1 animate-fade-in-up">
                              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-earth-50 text-steel-600 transition-colors">
                                <Eye className="w-3.5 h-3.5" /> View
                              </button>
                              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-earth-50 text-steel-600 transition-colors">
                                <Edit className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-danger-red/5 text-danger-red transition-colors">
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="px-5 py-3 border-t border-earth-100 flex items-center justify-between">
              <span className="text-[11px] font-mono text-steel-400">
                Showing {filtered.length} of {users.length} users
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((page) => (
                  <button
                    key={page}
                    className={`w-7 h-7 rounded text-xs font-mono transition-colors ${
                      page === 1 ? 'bg-earth-800 text-white' : 'text-steel-400 hover:bg-earth-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
            </div>
          </BlueprintCard>
        </>
      ) : (
        <BulkUploadPanel isPlayFabEnabled={isPlayFabEnabled} />
      )}
    </div>
  );
}

type BulkRole = 'student' | 'professor' | 'admin' | 'super_admin';

interface BulkCsvRow {
  line: number;
  firstName: string;
  lastName: string;
  email: string;
  role: BulkRole;
  username?: string;
}

interface BulkResult {
  line: number;
  email: string;
  username: string;
  role: BulkRole;
  status: 'success' | 'partial' | 'failed';
  message: string;
  defaultPassword?: string;
}

function createUsername(email: string) {
  const local = email.split('@')[0] ?? 'engineer';
  const clean = local.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) || 'engineer';
  return `${clean}${Math.floor(100 + Math.random() * 900)}`;
}

function createDefaultPassword() {
  const randomBlock = Math.random().toString(36).slice(2, 8);
  return `CivilCraft@${randomBlock}9`;
}

function getFullName(row: Pick<BulkCsvRow, 'firstName' | 'lastName'>) {
  return `${row.firstName} ${row.lastName}`.trim();
}

function parseBulkSpreadsheet(file: File): Promise<{ rows: BulkCsvRow[]; errors: string[] }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = reader.result;
        if (!(data instanceof ArrayBuffer)) {
          resolve({ rows: [], errors: ['Failed to read file buffer.'] });
          return;
        }

        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;

        if (!sheet) {
          resolve({ rows: [], errors: ['Spreadsheet is empty.'] });
          return;
        }

        const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
        if (!records.length) {
          resolve({ rows: [], errors: ['Spreadsheet has no data rows.'] });
          return;
        }

        const requiredHeaders = ['firstname', 'lastname', 'email', 'role'];
        const knownHeaders = new Set(
          records.flatMap((record) => Object.keys(record).map((key) => key.trim().toLowerCase()))
        );
        const firstNamePresent = knownHeaders.has('firstname') || knownHeaders.has('first name');
        const lastNamePresent = knownHeaders.has('lastname') || knownHeaders.has('last name');
        const missingHeaders = requiredHeaders.filter((header) => {
          if (header === 'firstname') return !firstNamePresent;
          if (header === 'lastname') return !lastNamePresent;
          return !knownHeaders.has(header);
        });

        if (missingHeaders.length) {
          resolve({ rows: [], errors: ['File must include headers: firstname, lastname, email, role (username optional).'] });
          return;
        }

        const rows: BulkCsvRow[] = [];
        const errors: string[] = [];

        const getText = (record: Record<string, unknown>, headerName: string) => {
          const key = Object.keys(record).find((item) => item.trim().toLowerCase() === headerName);
          return key ? String(record[key] ?? '').trim() : '';
        };

        records.forEach((record, index) => {
          const line = index + 2;
          const firstName = getText(record, 'firstname') || getText(record, 'first name');
          const lastName = getText(record, 'lastname') || getText(record, 'last name');
          const email = getText(record, 'email').toLowerCase();
          const roleRaw = getText(record, 'role').toLowerCase();
          const username = getText(record, 'username');

          if (!firstName || !lastName || !email || !roleRaw) {
            errors.push(`Line ${line}: firstname, lastname, email, and role are required.`);
            return;
          }

          if (!email.includes('@')) {
            errors.push(`Line ${line}: invalid email format.`);
            return;
          }

          if (!['student', 'professor', 'admin', 'super_admin', 'superadmin', 'super admin'].includes(roleRaw)) {
            errors.push(`Line ${line}: role must be student, professor, admin, or super_admin.`);
            return;
          }

          const normalizedRole =
            roleRaw === 'superadmin' || roleRaw === 'super admin' ? 'super_admin' : roleRaw;

          rows.push({
            line,
            firstName,
            lastName,
            email,
            role: normalizedRole as BulkRole,
            username: username || undefined,
          });
        });

        resolve({ rows, errors });
      } catch {
        resolve({ rows: [], errors: ['Could not parse spreadsheet. Use .xlsx, .xls, or .csv format.'] });
      }
    };

    reader.onerror = () => {
      resolve({ rows: [], errors: ['Failed to read the file.'] });
    };

    reader.readAsArrayBuffer(file);
  });
}

function BulkUploadPanel({ isPlayFabEnabled }: { isPlayFabEnabled: boolean }) {
  const [rows, setRows] = useState<BulkCsvRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const emailReady = useMemo(() => hasEmailDeliveryConfig(), []);
  const canRunProvision = isPlayFabEnabled || isPlayFabConfigured();

  const successCount = results.filter((item) => item.status === 'success').length;
  const partialCount = results.filter((item) => item.status === 'partial').length;
  const failedCount = results.filter((item) => item.status === 'failed').length;

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const parsed = await parseBulkSpreadsheet(file);
    setRows(parsed.rows);
    setParseErrors(parsed.errors);
    setResults([]);
    event.target.value = '';
  };

  const downloadTemplate = () => {
    const template = ['firstname,lastname,email,role,username', 'Jane,Rivera,jane.rivera@civilcraft.edu,student,jrivera001'].join('\n');
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'civilcraft_bulk_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const runProvision = async () => {
    if (!rows.length || isProcessing) return;
    setIsProcessing(true);
    const nextResults: BulkResult[] = [];

    for (const row of rows) {
      const username = row.username?.trim() || createUsername(row.email);
      const defaultPassword = createDefaultPassword();

      try {
        await provisionPlayFabPlayer({
            name: getFullName(row),
          email: row.email,
          role: row.role,
          username,
          defaultPassword,
        });

        const emailDelivery = await sendOnboardingEmail({
            toName: getFullName(row),
          toEmail: row.email,
          username,
          password: defaultPassword,
          role: row.role,
        });

        if (emailDelivery.ok) {
          nextResults.push({
            line: row.line,
            email: row.email,
            role: row.role,
            username,
            defaultPassword,
            status: 'success',
            message: 'PlayFab account created and onboarding email sent.',
          });
        } else {
          nextResults.push({
            line: row.line,
            email: row.email,
            role: row.role,
            username,
            defaultPassword,
            status: 'partial',
            message: `Account created, but email failed: ${emailDelivery.error}`,
          });
        }
      } catch (error) {
        nextResults.push({
          line: row.line,
          email: row.email,
          role: row.role,
          username,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Account provisioning failed.',
        });
      }
    }

    setResults(nextResults);
    setIsProcessing(false);
  };

  return (
    <BlueprintCard className="p-4 sm:p-8 space-y-5">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-xl bg-earth-100 border border-earth-200/50 flex items-center justify-center mb-4">
            <Upload className="w-8 h-8 text-earth-600" />
          </div>
          <h3 className="text-lg font-bold text-earth-800 mb-2">Bulk Upload Users</h3>
          <p className="text-sm text-steel-500 mb-4">Upload Excel or CSV with firstname, lastname, email, role, and optional username. Supported roles: student, professor, admin, super_admin.</p>

          <div className="flex flex-wrap justify-center gap-2">
            <span className={`text-[11px] px-2 py-1 rounded border font-mono ${canRunProvision ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/30' : 'bg-danger-red/10 text-danger-red border-danger-red/30'}`}>
              {canRunProvision ? 'PLAYFAB CONNECTED' : 'PLAYFAB NOT CONFIGURED'}
            </span>
            <span className={`text-[11px] px-2 py-1 rounded border font-mono ${emailReady ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/30' : 'bg-warning-orange/10 text-warning-orange border-warning-orange/30'}`}>
              {emailReady ? 'EMAIL DELIVERY READY' : 'EMAIL DELIVERY MISSING'}
            </span>
          </div>
        </div>

        <label className="block border-2 border-dashed border-earth-300/50 rounded-[4px] p-8 hover:border-earth-400 hover:bg-earth-50/30 transition-all cursor-pointer text-center">
          <FileSpreadsheet className="w-8 h-8 text-earth-400 mx-auto mb-2" />
          <p className="text-sm text-earth-700 font-medium">Click to upload Excel or CSV</p>
          <p className="text-[11px] font-mono text-steel-400 mt-1">Required headers: firstname,lastname,email,role (username optional)</p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <button
            className="text-sm font-mono text-earth-600 hover:text-earth-800 transition-colors underline underline-offset-2"
            onClick={downloadTemplate}
            type="button"
          >
            Download Template {'->'}
          </button>

          <button
            type="button"
            onClick={runProvision}
            disabled={!rows.length || isProcessing || !canRunProvision}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[4px] bg-earth-800 text-white text-sm font-semibold border border-earth-700 disabled:opacity-45 disabled:cursor-not-allowed hover:bg-earth-700 transition-colors"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {isProcessing ? 'Creating Accounts...' : 'Create PlayFab Accounts'}
          </button>
        </div>

        {!!parseErrors.length && (
          <div className="rounded-[4px] border border-warning-orange/30 bg-warning-orange/5 p-3 space-y-1">
            {parseErrors.map((error) => (
              <p key={error} className="text-xs text-warning-orange flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </p>
            ))}
          </div>
        )}

        {!!rows.length && (
          <div className="rounded-[4px] border border-earth-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-earth-50 border-b border-earth-200 flex items-center justify-between">
              <p className="text-xs font-mono text-earth-700">READY TO PROVISION: {rows.length} USERS</p>
              <p className="text-xs text-steel-500">Username defaults to email prefix + random digits</p>
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0">
                  <tr className="text-left text-[11px] font-mono text-steel-500 uppercase tracking-widest">
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">First Name</th>
                    <th className="px-3 py-2">Last Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Username</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100">
                  {rows.map((row) => (
                    <tr key={`${row.email}-${row.line}`}>
                      <td className="px-3 py-2 text-xs text-steel-400 font-mono">{row.line}</td>
                      <td className="px-3 py-2 text-earth-800">{row.firstName}</td>
                      <td className="px-3 py-2 text-earth-800">{row.lastName}</td>
                      <td className="px-3 py-2 text-steel-500 font-mono text-xs">{row.email}</td>
                      <td className="px-3 py-2 capitalize text-earth-700">{row.role}</td>
                      <td className="px-3 py-2 text-xs text-steel-500 font-mono">{row.username || 'auto-generate'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!!results.length && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-[4px] border border-cyber-green/30 bg-cyber-green/5 p-3">
                <p className="text-[11px] font-mono text-cyber-green">SUCCESS</p>
                <p className="text-2xl font-bold text-cyber-green">{successCount}</p>
              </div>
              <div className="rounded-[4px] border border-warning-orange/30 bg-warning-orange/5 p-3">
                <p className="text-[11px] font-mono text-warning-orange">PARTIAL</p>
                <p className="text-2xl font-bold text-warning-orange">{partialCount}</p>
              </div>
              <div className="rounded-[4px] border border-danger-red/30 bg-danger-red/5 p-3">
                <p className="text-[11px] font-mono text-danger-red">FAILED</p>
                <p className="text-2xl font-bold text-danger-red">{failedCount}</p>
              </div>
            </div>

            <div className="rounded-[4px] border border-earth-200 divide-y divide-earth-100 bg-white">
              {results.map((result) => (
                <div key={`${result.line}-${result.email}`} className="px-4 py-3 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-earth-800 font-medium">Line {result.line} - {result.email}</p>
                    <p className="text-xs text-steel-500 font-mono">username: {result.username}{result.defaultPassword ? ` | temp pass: ${result.defaultPassword}` : ''}</p>
                    <p className="text-xs mt-1 text-steel-500">{result.message}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border font-mono w-fit ${
                    result.status === 'success'
                      ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/30'
                      : result.status === 'partial'
                        ? 'bg-warning-orange/10 text-warning-orange border-warning-orange/30'
                        : 'bg-danger-red/10 text-danger-red border-danger-red/30'
                  }`}>
                    {result.status === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : result.status === 'partial' ? <Mail className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    {result.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BlueprintCard>
  );
}
