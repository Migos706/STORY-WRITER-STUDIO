import React, { useEffect, useState } from 'react';
import { useAuth } from '../App';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Shield, Users, BookOpen, Check, X, AlertTriangle, Loader2, Lock, Filter, BarChart3, PenTool, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import AuthorPanel from './AuthorPanel';
import { getApiUrl } from '../utils/api';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AdminPanel() {
  const { profile } = useAuth();

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
    if (profile?.role !== 'admin') return;
    fetchData();
  }, [profile, activeTab]);

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
      const response = await fetch(getApiUrl('/api/ai/run-security-check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId, content })
      });

      if (!response.ok) {
        throw new Error("Failed to run security check from server.");
      }

      const result = await response.json();
      
      await updateDoc(doc(db, 'stories', storyId), {
        safetyStatus: result.isSafe ? 'safe' : 'flagged',
        safetyReason: result.reason || ''
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-4xl font-black text-slate-900 dark:text-white">Admin Dashboard</h1>
        
        <div className="flex bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-1.5 overflow-x-auto transition-colors">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-6 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            <Shield size={16} /> Dashibodi
          </button>
          <button 
            onClick={() => setActiveTab('management')}
            className={`px-6 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'management' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            <BookOpen size={16} /> Udhibiti wa Hadithi
          </button>
          <button 
            onClick={() => setActiveTab('insights')}
            className={`px-6 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'insights' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            <BarChart3 size={16} /> Takwimu
          </button>
          <button 
            onClick={() => setActiveTab('write')}
            className={`px-6 py-2.5 rounded-xl text-sm font-black whitespace-nowrap transition-all flex items-center gap-2 ${activeTab === 'write' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            <Sparkles size={16} /> Mwandishi AI
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-6 transition-colors">
              <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center shadow-inner">
                <Users size={36} />
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">Jumla ya Watumiaji</p>
                <p className="text-4xl font-black text-slate-900 dark:text-white">{stats.users}</p>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-6 transition-colors">
              <div className="w-20 h-20 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 rounded-3xl flex items-center justify-center shadow-inner">
                <BookOpen size={36} />
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">Jumla ya Hadithi</p>
                <p className="text-4xl font-black text-slate-900 dark:text-white">{stats.stories}</p>
              </div>
            </div>
          </div>

          {/* Author Requests */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-8 flex items-center gap-3">
              <Users className="text-indigo-600 dark:text-indigo-400" /> Maombi ya Waandishi Mapya
            </h2>
            
            {pendingAuthors.length === 0 ? (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/50 rounded-3xl border border-slate-100 dark:border-slate-800 border-dashed">
                Hakuna maombi mapya kwa sasa.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {pendingAuthors.map((author) => (
                  <div key={author.id} className="p-8 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-sm space-y-6 hover:border-indigo-200 dark:hover:border-indigo-900/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-black text-slate-900 dark:text-white text-xl">{author.displayName}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{author.email}</p>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-500 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/30">Inasubiri</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Jina la Kalamu</p>
                        <p className="text-sm font-black text-indigo-600 dark:text-indigo-400">{author.authorApplication?.pseudonym || 'N/A'}</p>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Kundi</p>
                        <p className="text-sm font-black text-slate-700 dark:text-slate-300">{author.authorApplication?.authorType || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Maelezo ya Nia</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 italic whitespace-pre-line leading-relaxed">
                        "{author.authorApplication?.bio || 'Hajatoa maelezo'}"
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide">
                      <Check size={14} className={author.authorApplication?.agreedToCompliance ? "text-emerald-500" : "text-red-500"} />
                      Akubali Sheria & Kanuni
                    </div>

                    <div className="flex gap-4 pt-2">
                      <button 
                        onClick={() => handleAuthorAction(author.id, 'approved')}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 px-4 rounded-2xl transition-all shadow-lg shadow-emerald-600/20 text-sm flex items-center justify-center gap-2 active:scale-95"
                      >
                        <Check size={18} /> Kubali
                      </button>
                      <button 
                        onClick={() => handleAuthorAction(author.id, 'none')}
                        className="flex-1 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 font-black py-4 px-4 rounded-2xl transition-all text-sm flex items-center justify-center gap-2 active:scale-95"
                      >
                        <X size={18} /> Kataa
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
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 animate-in fade-in duration-300 transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <BookOpen className="text-indigo-600 dark:text-indigo-400" /> Story Management
            </h2>
            
            <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950 p-2 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Filter size={18} className="text-slate-400 ml-2" />
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent border-none text-sm font-black text-slate-700 dark:text-slate-300 focus:ring-0 outline-none cursor-pointer"
              >
                <option value="all">Sura Zote</option>
                <option value="pending">Zinasubiri</option>
                <option value="approved">Zilizokubalika</option>
                <option value="rejected">Zilizokataliwa</option>
              </select>
              <div className="w-px h-6 bg-slate-300 dark:bg-slate-700"></div>
              <select 
                value={safetyFilter} 
                onChange={(e) => setSafetyFilter(e.target.value)}
                className="bg-transparent border-none text-sm font-black text-slate-700 dark:text-slate-300 focus:ring-0 outline-none cursor-pointer"
              >
                <option value="all">Usalama Wote</option>
                <option value="unchecked">Hazijakaguliwa</option>
                <option value="safe">Salama</option>
                <option value="flagged">Yenye Mashaka</option>
              </select>
            </div>
          </div>
          
          {filteredStories.length === 0 ? (
            <div className="text-center py-20 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/50 rounded-3xl border border-slate-100 dark:border-slate-800 border-dashed">
              Hakuna hadithi inayolingana na vigezo vilivyochaguliwa.
            </div>
          ) : (
            <div className="space-y-8">
              {filteredStories.map((story) => (
                <div key={story.id} className="p-8 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all group">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-6">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 dark:text-white leading-tight mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{story.title}</h3>
                      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Na {story.authorName} • {story.genre}</p>
                    </div>
                    <div className="flex flex-wrap items-center sm:flex-col sm:items-end gap-3 shrink-0">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border shadow-sm ${
                        story.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30' :
                        story.status === 'rejected' ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30' :
                        'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-500 border-amber-100 dark:border-amber-900/30'
                      }`}>
                        {story.status}
                      </span>
                      
                      {story.safetyStatus === 'unchecked' && (
                        <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-4 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
                          Safety: Hazjakaguliwa
                        </span>
                      )}
                      {story.safetyStatus === 'safe' && (
                        <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-4 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-1.5">
                          <Check size={12} /> Salama
                        </span>
                      )}
                      {story.safetyStatus === 'flagged' && (
                        <span className="text-[10px] font-black uppercase tracking-widest bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 px-4 py-1.5 rounded-full border border-red-100 dark:border-red-900/30 flex items-center gap-1.5">
                          <AlertTriangle size={12} /> Yenye Mashaka
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl mb-6 max-h-60 overflow-y-auto text-lg text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-800 font-serif leading-relaxed italic opacity-80 group-hover:opacity-100 transition-opacity">
                    {story.content}
                  </div>

                  {story.safetyReason && story.safetyStatus === 'flagged' && (
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-2xl text-sm text-red-700 dark:text-red-400 flex items-start gap-3">
                      <AlertTriangle size={20} className="shrink-0" />
                      <p><strong className="font-black">Sababu ya AI:</strong> {story.safetyReason}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <button 
                      onClick={() => runSecurityCheck(story.id, story.content)}
                      disabled={checkingStoryId === story.id}
                      className="bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 font-black py-3 px-6 rounded-2xl transition-all text-sm flex items-center gap-2 active:scale-95 border border-indigo-100 dark:border-indigo-900/30"
                    >
                      {checkingStoryId === story.id ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} />}
                      {story.safetyStatus === 'unchecked' ? 'Kagua Usalama (AI)' : 'Kagua Tena (AI)'}
                    </button>
                    
                    <div className="flex-1"></div>
                    
                    <div className="flex items-center gap-3">
                      {story.status !== 'approved' && (
                        <button 
                          onClick={() => handleStoryAction(story.id, 'approved')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 px-8 rounded-2xl transition-all text-sm shadow-lg shadow-emerald-600/20 active:scale-95"
                        >
                          Kubali
                        </button>
                      )}
                      {story.status !== 'rejected' && (
                        <button 
                          onClick={() => handleStoryAction(story.id, 'rejected')}
                          className="bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30 font-black py-3 px-8 rounded-2xl transition-all text-sm active:scale-95"
                        >
                          Kataa
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-8">Hadithi kwa Genre</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={genreChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="opacity-10" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#1e293b', color: '#fff' }} />
                    <Bar dataKey="value" fill="#4f46e5" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-8">Mgawanyo wa Hali (Status)</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={8}
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="stroke-white dark:stroke-slate-900 stroke-2" />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#1e293b', color: '#fff' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontWeight: 900, fontSize: '10px', paddingTop: '20px', textTransform: 'uppercase' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'write' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-8 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 p-6 rounded-[1.5rem] text-indigo-800 dark:text-indigo-300 text-sm font-black flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-600/20">
              <Shield size={20} />
            </div>
            Hadithi zinazoandikwa na Wasimamizi (Admins) zinakubaliwa na kuchapishwa moja kwa moja bila uhakiki.
          </div>
          <AuthorPanel />
        </div>
      )}
    </div>
  );
}
