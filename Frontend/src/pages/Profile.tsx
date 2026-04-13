import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { User, Mail, Phone, Clock, Briefcase, Building, Shield, Activity, Edit2, Save, X, Camera } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';

type Department = {
  id: string;
  name: string;
  color?: string;
  description?: string;
};

export default function Profile() {
  const { profile, refreshProfile } = useAuth();
  const [department, setDepartment] = useState<Department | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'permissions' | 'activity'>('personal');
  const [formData, setFormData] = useState({
    full_name: '',
    designation: '',
    contact: '',
    employee_id: '',
    working_hours: '',
    responsibilities: '',
    avatar_url: ''
  });
  const [loadingDept, setLoadingDept] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  async function authFetch(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem('token');
    const headers: any = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    return fetch(url, { ...options, headers });
  }

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: (profile as any).full_name || '',
        designation: (profile as any).designation || '',
        contact: (profile as any).contact || '',
        employee_id: (profile as any).employee_id || '',
        working_hours: (profile as any).working_hours || '',
        responsibilities: (profile as any).responsibilities || '',
        avatar_url: (profile as any).avatar_url || ''
      });
      setAvatarError('');

      if ((profile as any).department_id) {
        loadDepartment((profile as any).department_id);
      } else {
        setDepartment(null);
      }
    }
  }, [profile]);

  const loadDepartment = async (deptId: string) => {
    try {
      setLoadingDept(true);
      const res = await authFetch(`${API_URL}/api/departments`);
      if (!res.ok) return;
      const data: Department[] = await res.json();
      const found = data.find((d) => d.id === deptId || (d as any)._id === deptId);
      setDepartment(found || null);
    } catch (err) {
      console.error('Error loading department', err);
    } finally {
      setLoadingDept(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    try {
      const payload = {
        full_name: formData.full_name,
        designation: formData.designation,
        contact: formData.contact,
        employee_id: formData.employee_id,
        working_hours: formData.working_hours,
        responsibilities: formData.responsibilities,
        avatar_url: formData.avatar_url
      };

      const res = await authFetch(`${API_URL}/api/profile/me`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to save profile');

      // Update formData from response immediately
      setFormData({
        full_name: data.full_name || '',
        designation: data.designation || '',
        contact: data.contact || '',
        employee_id: data.employee_id || '',
        working_hours: data.working_hours || '',
        responsibilities: data.responsibilities || '',
        avatar_url: data.avatar_url || ''
      });

      setIsEditing(false);

      // Refresh context so header/avatar update everywhere
      await refreshProfile();
    } catch (err) {
      console.error('Error saving profile', err);
      alert((err as any).message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setFormData({
        full_name: (profile as any).full_name || '',
        designation: (profile as any).designation || '',
        contact: (profile as any).contact || '',
        employee_id: (profile as any).employee_id || '',
        working_hours: (profile as any).working_hours || '',
        responsibilities: (profile as any).responsibilities || '',
        avatar_url: (profile as any).avatar_url || ''
      });
    }
    setAvatarError('');
    setIsEditing(false);
  };

  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Please choose an image smaller than 2MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({
        ...prev,
        avatar_url: typeof reader.result === 'string' ? reader.result : prev.avatar_url,
      }));
      setAvatarError('');
    };
    reader.onerror = () => {
      setAvatarError('Failed to read the selected image.');
    };
    reader.readAsDataURL(file);
  };

  if (!profile) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white dark:bg-slate-950 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="h-32 bg-gradient-to-r from-blue-400 to-blue-600 dark:bg-gradient-to-r dark:from-blue-600 dark:to-blue-400"></div>

            <div className="px-8 pb-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between -mt-16 mb-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
                  {formData.avatar_url ? (
                    <img
                      src={formData.avatar_url}
                      alt={formData.full_name}
                      className="w-32 h-32 rounded-full border-4 border-white dark:border-slate-950 shadow-lg object-cover"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-full border-4 border-white dark:border-slate-950 shadow-lg bg-blue-600 dark:bg-blue-400 flex items-center justify-center">
                      <span className="text-white dark:text-gray-950 text-4xl font-bold">
                        {formData.full_name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                  )}
                  <div className="mb-2">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{formData.full_name}</h1>
                    <p className="text-gray-600 dark:text-gray-400">{formData.designation || 'User'}</p>
                    {isEditing && (
                      <div className="mt-4">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center space-x-2 rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-slate-950 bg-white px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 dark:hover:bg-gray-900 hover:bg-gray-50 transition-colors"
                        >
                          <Camera className="w-4 h-4" />
                          <span>{formData.avatar_url ? 'Change Photo' : 'Add Photo'}</span>
                        </button>
                        {avatarError && (
                          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{avatarError}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 dark:bg-blue-400 dark:text-slate-950 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-300 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Edit Profile</span>
                  </button>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 dark:bg-green-400 dark:text-slate-950 text-white rounded-lg hover:bg-green-700 dark:bg-green-300 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      <span>{saving ? 'Saving...' : 'Save'}</span>
                    </button>
                    <button
                      onClick={handleCancel}
                      className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-2 bg-gray-200 dark:bg-gray-800 dark:text-gray-300 text-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      <span>Cancel</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="border-b border-gray-200 dark:border-gray-800 mb-6">
                <div className="flex flex-wrap gap-4">
                  {(['personal', 'permissions', 'activity'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab
                          ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                          : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                      }`}
                    >
                      {tab === 'personal' && 'Personal Info'}
                      {tab === 'permissions' && 'Permissions & Roles'}
                      {tab === 'activity' && 'Activity Log'}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === 'personal' && (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4" />
                        <span>Full Name</span>
                      </div>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100 px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg">{formData.full_name}</p>
                    )}
                  </div>

                  {/* Email — always read-only */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center space-x-2">
                        <Mail className="w-4 h-4" />
                        <span>Email</span>
                      </div>
                    </label>
                    <p className="text-gray-900 dark:text-gray-100 px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg">{(profile as any).email}</p>
                  </div>

                  {/* Designation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center space-x-2">
                        <Briefcase className="w-4 h-4" />
                        <span>Designation</span>
                      </div>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.designation}
                        onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100 px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg">{formData.designation || 'Not specified'}</p>
                    )}
                  </div>

                  {/* Department — read-only */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center space-x-2">
                        <Building className="w-4 h-4" />
                        <span>Department</span>
                      </div>
                    </label>
                    <p className="text-gray-900 dark:text-gray-100 px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      {loadingDept ? 'Loading...' : department?.name || 'Not assigned'}
                    </p>
                  </div>

                  {/* Contact */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4" />
                        <span>Contact Number</span>
                      </div>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.contact}
                        onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100 px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg">{formData.contact || 'Not specified'}</p>
                    )}
                  </div>

                  {/* Working Hours */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4" />
                        <span>Working Hours</span>
                      </div>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.working_hours}
                        onChange={(e) => setFormData({ ...formData, working_hours: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100 px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg">{formData.working_hours || 'Not specified'}</p>
                    )}
                  </div>

                  {/* Employee ID — read-only */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4" />
                        <span>Employee ID</span>
                      </div>
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.employee_id}
                        onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100 px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg">{formData.employee_id || 'Not assigned'}</p>
                    )}
                  </div>

                  {/* Last Login — read-only */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center space-x-2">
                        <Activity className="w-4 h-4" />
                        <span>Last Login</span>
                      </div>
                    </label>
                    <p className="text-gray-900 dark:text-gray-100 px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      {(profile as any).last_login
                        ? new Date((profile as any).last_login).toLocaleString()
                        : 'Not available'}
                    </p>
                  </div>

                  {/* Responsibilities */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <div className="flex items-center space-x-2">
                        <Briefcase className="w-4 h-4" />
                        <span>Assigned Responsibilities</span>
                      </div>
                    </label>
                    {isEditing ? (
                      <textarea
                        value={formData.responsibilities}
                        onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
                        rows={4}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100 px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg whitespace-pre-wrap">
                        {formData.responsibilities || 'No responsibilities assigned'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'permissions' && (
                <div>
                  <div className="bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
                    <div className="flex items-start space-x-3">
                      <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400 mt-1" />
                      <div>
                        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">User Permissions</h3>
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          Your current role grants you access to documents within your department and any documents explicitly shared with you.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {['View Documents', 'Upload Documents', 'Share Documents'].map((perm) => (
                      <div key={perm} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{perm}</p>
                        </div>
                        <span className="px-3 py-1 bg-green-100 dark:bg-green-900/70 text-green-800 dark:text-green-200 rounded-full text-sm font-medium">
                          Enabled
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'activity' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Activity</h3>
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900 dark:text-gray-100">Logged into the system</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {(profile as any).last_login
                            ? new Date((profile as any).last_login).toLocaleString()
                            : 'Not available'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900 dark:text-gray-100">Profile created</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date((profile as any).created_at || (profile as any).createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
