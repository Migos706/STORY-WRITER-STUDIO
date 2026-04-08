import React, { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { GoogleGenAI } from '@google/genai';
import { Shield, Users, BookOpen, Check, X, AlertTriangle, Loader2, Lock, Filter, BarChart3, PenTool } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import AuthorPanel from './AuthorPanel';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AdminPanel() {
  const { profile } = useAuth();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginError, setLoginError] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'management' | 'insights' | 'write'>('dashboard');

  const [pendingAuthors, setPendingAuthors] = useState<any[]>([]);
  const [allStories, setAllStories] = useState<any[]>([]);
  const [stats, setStats] = useState({ users: 0, stories: 0 });
  const [loading, setLoading] = useState(true);
  const [checkingStoryId, setCheckingStoryId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('pending');
  const [safetyFilter, setSafetyFilter] = useState('all');

  useEffect(() => {
    if (profile?.role !== 'admin' || !isUnlocked) return;
    fetchData();
  }, [profile, isUnlocked, activeTab]);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if ((adminUsername === 'migosking706@gmail.com' && adminPassword === 'dani4ody') || 
        (adminUsername === 'admin' && adminPassword === 'admin2026')) {
      setIsUnlocked(true);
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  const fetchData = async () => {
    try {
      // Fetch pending authors
      const authorsQ = query(collection(db, 'users'), where('authorStatus', '==', 'pending'));
      const authorsSnap = await getDocs(authorsQ);
      setPendingAuthors(authorsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Fetch all stories for filtering
      const storiesSnap = await getDocs(collection(db, 'stories'));
      const fetchedStories = storiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort by newest first
      fetchedStories.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllStories(fetchedStories);

      // Fetch stats
      const allUsersSnap = await getDocs(collection(db, 'users'));
      setStats({
        users: allUsersSnap.size,
        stories: fetchedStories.length
      });
    } catch (error) {
      console.error("Error fetching admin data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorAction = async (userId: string, action: 'approved' | 'none') => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        authorStatus: action,
        role: action === 'approved' ? 'author' : 'user'
      });
      fetchData();
    } catch (error) {
      console.error("Error updating author:", error);
    }
  };

  const handleStoryAction = async (storyId: string, action: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'stories', storyId), {
        status: action
      });
      fetchData();
    } catch (error) {
      console.error("Error updating story:", error);
    }
  };

  const runSecurityCheck = async (storyId: string, content: string) => {
    setCheckingStoryId(storyId);
    try {
      const prompt = `Analyze the following story for harsh, rough, offensive, or inappropriate language. Reply with ONLY a JSON object in this format: {"isSafe": boolean, "reason": "short explanation"}. Story:\n\n${content}`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      const text = response.text.trim().replace(/```json/g, '').replace(/```/g, '');
      const result = JSON.parse(text);
      
      await updateDoc(doc(db, 'stories', storyId), {
        safetyStatus: result.isSafe ? 'safe' : 'flagged',
        safetyReason: result.reason
      });
      fetchData();
    } catch (error) {
      console.error("Security check failed:", error);
    } finally {
      setCheckingStoryId(null);
    }
  };

  if (profile?.role !== 'admin') {
    return <div className="text-center p-12 text-red-600 font-bold">Admin access required.</div>;
  }

  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-3xl shadow-xl border border-slate-200 text-center animate-in fade-in zoom-in duration-300">
        <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Shield size={40} />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Admin Portal</h2>
        <p className="text-slate-500 mb-8">Please enter your master credentials to continue.</p>
        
        {loginError && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-bold mb-6">
            Invalid username or password.
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Username / Email</label>
            <input 
              type="text" 
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Enter master username"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Password</label>
            <input 
              type="password" 
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="••••••••"
              required
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 mt-6"
          >
            <Lock size={18} /> Unlock Dashboard
          </button>
        </form>
      </div>
    );
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-600" size={48} /></div>;

  const filteredStories = allStories.filter(story => {
    const matchesStatus = statusFilter === 'all' || story.status === statusFilter;
    const matchesSafety = safetyFilter === 'all' || story.safetyStatus === safetyFilter;
    return matchesStatus && matchesSafety;
  });

  // Prepare data for Insights
  const genreData = allStories.reduce((acc: any, story: any) => {
    const genre = story.genre || 'Unknown';
    acc[genre] = (acc[genre] || 0) + 1;
    return acc;
  }, {});
  const genreChartData = Object.keys(genreData).map(key => ({ name: key, value: genreData[key] }));

  const statusData = allStories.reduce((acc: any, story: any) => {
    const status = story.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const statusChartData = Object.keys(statusData).map(key => ({ name: key, value: statusData[key] }));

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold text-slate-900">Admin Dashboard</h1>
        
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Shield size={16} /> Overview
          </button>
          <button 
            onClick={() => setActiveTab('management')}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'management' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <BookOpen size={16} /> Story Management
          </button>
          <button 
            onClick={() => setActiveTab('insights')}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'insights' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <BarChart3 size={16} /> Insights
          </button>
          <button 
            onClick={() => setActiveTab('write')}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${activeTab === 'write' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <PenTool size={16} /> Write Story
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                <Users size={32} />
              </div>
              <div>
                <p className="text-slate-500 font-medium">Total Users</p>
                <p className="text-3xl font-bold text-slate-900">{stats.users}</p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-4">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                <BookOpen size={32} />
              </div>
              <div>
                <p className="text-slate-500 font-medium">Total Stories</p>
                <p className="text-3xl font-bold text-slate-900">{stats.stories}</p>
              </div>
            </div>
          </div>

          {/* Author Requests */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Users className="text-indigo-600" /> Pending Author Requests
            </h2>
            
            {pendingAuthors.length === 0 ? (
              <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                No pending author requests.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingAuthors.map((author) => (
                  <div key={author.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <p className="font-bold text-slate-900">{author.displayName}</p>
                    <p className="text-sm text-slate-500 mb-4">{author.email}</p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleAuthorAction(author.id, 'approved')}
                        className="flex-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold py-2 px-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-1"
                      >
                        <Check size={16} /> Approve
                      </button>
                      <button 
                        onClick={() => handleAuthorAction(author.id, 'none')}
                        className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold py-2 px-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-1"
                      >
                        <X size={16} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'management' && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="text-indigo-600" /> Story Management
            </h2>
            
            <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
              <Filter size={18} className="text-slate-400 ml-2" />
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <div className="w-px h-6 bg-slate-300"></div>
              <select 
                value={safetyFilter} 
                onChange={(e) => setSafetyFilter(e.target.value)}
                className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 outline-none cursor-pointer"
              >
                <option value="all">All Safety</option>
                <option value="unchecked">Unchecked</option>
                <option value="safe">Safe</option>
                <option value="flagged">Flagged</option>
              </select>
            </div>
          </div>
          
          {filteredStories.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
              No stories found matching the selected filters.
            </div>
          ) : (
            <div className="space-y-6">
              {filteredStories.map((story) => (
                <div key={story.id} className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{story.title}</h3>
                      <p className="text-sm text-slate-500">By {story.authorName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                        story.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        story.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {story.status}
                      </span>
                      
                      {story.safetyStatus === 'unchecked' && (
                        <span className="text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
                          Safety: Unchecked
                        </span>
                      )}
                      {story.safetyStatus === 'safe' && (
                        <span className="text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full flex items-center gap-1">
                          <Check size={12} /> Safe
                        </span>
                      )}
                      {story.safetyStatus === 'flagged' && (
                        <span className="text-xs font-bold uppercase tracking-wider bg-red-100 text-red-700 px-3 py-1 rounded-full flex items-center gap-1">
                          <AlertTriangle size={12} /> Flagged
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 p-4 rounded-xl mb-4 max-h-48 overflow-y-auto text-sm text-slate-700 border border-slate-100">
                    {story.content}
                  </div>

                  {story.safetyReason && story.safetyStatus === 'flagged' && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 flex items-start gap-2">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <p><strong>AI Flag:</strong> {story.safetyReason}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
                    <button 
                      onClick={() => runSecurityCheck(story.id, story.content)}
                      disabled={checkingStoryId === story.id}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-xl transition-colors text-sm flex items-center gap-2"
                    >
                      {checkingStoryId === story.id ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                      {story.safetyStatus === 'unchecked' ? 'Run AI Security Check' : 'Re-run Security Check'}
                    </button>
                    
                    <div className="flex-1"></div>
                    
                    {story.status !== 'approved' && (
                      <button 
                        onClick={() => handleStoryAction(story.id, 'approved')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-xl transition-colors text-sm"
                      >
                        Approve
                      </button>
                    )}
                    {story.status !== 'rejected' && (
                      <button 
                        onClick={() => handleStoryAction(story.id, 'rejected')}
                        className="bg-red-50 hover:bg-red-100 text-red-700 font-bold py-2 px-6 rounded-xl transition-colors text-sm"
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Stories by Genre</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={genreChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="value" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Story Status Distribution</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'write' && (
        <div className="animate-in fade-in duration-300">
          <div className="mb-6 bg-indigo-50 border border-indigo-100 p-4 rounded-2xl text-indigo-800 text-sm font-medium flex items-center gap-2">
            <Shield size={18} />
            Stories written by admins are automatically approved and published.
          </div>
          <AuthorPanel />
        </div>
      )}
    </div>
  );
}
