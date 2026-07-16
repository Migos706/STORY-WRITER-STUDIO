import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { doc, updateDoc, collection, getDocs, query, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Link } from 'react-router-dom';
import { User, BookOpen, Clock, CheckCircle2, Loader2, Bookmark, Sparkles, Trash2, Headphones, X, Shield } from 'lucide-react';
import { locales } from '../locales';
import AuthorPanel from './AuthorPanel';
import CharacterCreator from '../components/CharacterCreator';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function UserPanel() {
  const { user, profile, language } = useAuth();
  const t = locales[language || 'sw'];

  const [applying, setApplying] = useState(false);
  const [appForm, setAppForm] = useState({
    pseudonym: '',
    authorType: 'Novelist',
    bio: '',
    agreed: false
  });
  const [history, setHistory] = useState<any[]>([]);
  const [savedStories, setSavedStories] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'saved' | 'ai-writer' | 'characters'>('profile');
  const [readingStory, setReadingStory] = useState<any | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;
      const path = `users/${user.uid}/history`;
      try {
        const q = query(
          collection(db, path),
          orderBy('viewedAt', 'desc'),
          limit(10)
        );
        const snapshot = await getDocs(q);
        setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        // Fallback gracefully instead of throwing fatal errors on missing history
        console.warn("Could not fetch history:", error);
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    };

    const fetchSaved = async () => {
      if (!user) return;
      const path = `users/${user.uid}/savedStories`;
      try {
        const q = query(
          collection(db, path),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        setSavedStories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.warn("Could not fetch saved stories:", error);
        setSavedStories([]);
      } finally {
        setLoadingSaved(false);
      }
    };

    fetchHistory();
    fetchSaved();
  }, [user]);

  if (!profile) return null;

  const handleApplyAuthor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appForm.agreed) {
      alert(language === 'sw' ? "Lazima ukubaliane na sheria na kanuni ili uendelee." : "You must agree to the content guidelines to proceed.");
      return;
    }
    setApplying(true);
    const path = `users/${profile.uid}`;
    try {
      await updateDoc(doc(db, path), {
        authorStatus: 'pending',
        authorApplication: {
          pseudonym: appForm.pseudonym,
          authorType: appForm.authorType,
          bio: appForm.bio,
          agreedToCompliance: appForm.agreed,
          appliedAt: Date.now()
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setApplying(false);
    }
  };

  const handleRemoveSaved = async (storyId: string) => {
    if (!user) return;
    const path = `users/${user.uid}/savedStories/${storyId}`;
    try {
      await deleteDoc(doc(db, path));
      setSavedStories(prev => prev.filter(s => s.id !== storyId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      {/* Tabs */}
      <div className="flex flex-wrap bg-white dark:bg-slate-900 p-2 rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-800 w-fit mx-auto transition-all gap-1 justify-center">
        <button 
          onClick={() => setActiveTab('profile')}
          className={`px-8 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 ${activeTab === 'profile' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-55 dark:hover:bg-slate-800'}`}
        >
          <User size={20} /> {t.tabProfile}
        </button>
        <button 
          onClick={() => setActiveTab('saved')}
          className={`px-8 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 ${activeTab === 'saved' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-55 dark:hover:bg-slate-800'}`}
        >
          <Bookmark size={20} /> {t.tabSaved}
        </button>
        <button 
          onClick={() => setActiveTab('characters')}
          className={`px-8 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 ${activeTab === 'characters' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-55 dark:hover:bg-slate-800'}`}
        >
          <Sparkles size={20} /> {t.tabCharacters}
        </button>
        <button 
          onClick={() => setActiveTab('ai-writer')}
          className={`px-8 py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 ${activeTab === 'ai-writer' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-55 dark:hover:bg-slate-800'}`}
        >
          <BookOpen size={20} /> {t.tabAiWriter}
        </button>
      </div>

      {activeTab === 'profile' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center md:items-start gap-8 transition-colors">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-[2rem] flex items-center justify-center shadow-xl shadow-indigo-500/20 shrink-0">
              <User size={48} />
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-1">{profile.displayName}</h1>
              <p className="text-lg text-slate-500 dark:text-slate-400 mb-4">{profile.email}</p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-4 py-1.5 rounded-full border border-indigo-100 dark:border-indigo-900/30">
                  <User size={12} /> {t.roleLabel}: {profile.role}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 px-4 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-900/30">
                  <CheckCircle2 size={12} /> Active
                </span>
              </div>
            </div>
          </div>

          {profile.role === 'user' && (
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
              <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                <BookOpen className="text-indigo-600 dark:text-indigo-400" size={32} /> 
                {t.applyAuthorTitle}
              </h2>
              
              {profile.authorStatus === 'none' && (
                <form onSubmit={handleApplyAuthor} className="space-y-6">
                  <p className="text-slate-600 dark:text-slate-400">
                    {t.applyAuthorSubtitle}
                  </p>
                  
                  <div>
                    <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-widest">{t.penNameLabel}</label>
                    <input 
                      type="text" 
                      required
                      value={appForm.pseudonym}
                      onChange={e => setAppForm({...appForm, pseudonym: e.target.value})}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold dark:text-white transition-colors"
                      placeholder={t.penNamePlaceholder}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-widest">{t.authorTypeLabel}</label>
                    <select 
                      value={appForm.authorType}
                      onChange={e => setAppForm({...appForm, authorType: e.target.value})}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold dark:text-white transition-colors"
                    >
                      <option value="Novelist">Mtunzi wa Hadithi/Riwaya (Novelist)</option>
                      <option value="Educational">Muelimishaji (Educational)</option>
                      <option value="Poet">Mshairi (Poet)</option>
                      <option value="Journalist">Mwandishi wa Habari/Makala</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-widest">{t.shortBioLabel}</label>
                    <textarea 
                      required
                      value={appForm.bio}
                      onChange={e => setAppForm({...appForm, bio: e.target.value})}
                      className="w-full p-5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2rem] focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none font-medium dark:text-white transition-colors"
                      placeholder={t.shortBioPlaceholder}
                    />
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950/20 p-8 rounded-[2rem] border border-amber-100 dark:border-amber-900/40 shadow-inner">
                    <h4 className="font-black text-amber-900 dark:text-amber-500 mb-4 text-lg flex items-center gap-2">
                      <Shield size={20} /> {t.termsLabel}
                    </h4>
                    <div className="flex items-start gap-4">
                      <input 
                        type="checkbox" 
                        id="author-terms"
                        required
                        checked={appForm.agreed}
                        onChange={e => setAppForm({...appForm, agreed: e.target.checked})}
                        className="mt-1 w-6 h-6 text-indigo-600 border-indigo-200 rounded-lg focus:ring-indigo-500 cursor-pointer"
                      />
                      <label htmlFor="author-terms" className="text-sm text-amber-800 dark:text-amber-400/80 leading-relaxed font-bold">
                        {t.termsConsent}
                      </label>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={applying}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-12 py-5 rounded-[1.5rem] font-black transition-all shadow-2xl shadow-indigo-600/30 disabled:opacity-50 flex items-center justify-center gap-3 active:scale-95 text-lg"
                  >
                    {applying ? <Loader2 className="animate-spin" size={24} /> : <CheckCircle2 size={24} />}
                    {t.applyBtn}
                  </button>
                </form>
              )}
              
              {profile.authorStatus === 'pending' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center animate-pulse">
                    <Clock size={32} />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t.pendingStatus}</h3>
                  </div>
                </div>
              )}

              {profile.authorStatus === 'approved' && (
                <div className="flex items-center gap-3 text-emerald-600 bg-emerald-50 px-6 py-4 rounded-2xl font-bold border border-emerald-200">
                  <CheckCircle2 size={24} /> 
                  {t.approvedStatus}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'saved' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
              <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-4">
                <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-600/20">
                  <Bookmark size={32} />
                </div>
                {t.tabSaved}
              </h2>
              {savedStories.length > 0 && (
                <span className="px-6 py-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 rounded-full font-black text-sm border border-indigo-100 dark:border-indigo-900/40 shadow-sm">
                  {savedStories.length} {language === 'sw' ? 'Hadithi Zilizohifadhiwa' : 'Saved Stories'}
                </span>
              )}
            </div>

            {loadingSaved ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-600" size={48} /></div>
            ) : savedStories.length === 0 ? (
              <div className="text-center py-32 px-10 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/50 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-800 transition-all animate-in zoom-in duration-500">
                <div className="w-32 h-32 bg-white dark:bg-slate-900 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-2xl text-slate-200 dark:text-slate-800 ring-8 ring-slate-100 dark:ring-slate-900/50">
                  <Bookmark size={64} />
                </div>
                <p className="text-3xl font-black text-slate-900 dark:text-white mb-3">{language === 'sw' ? 'Maktaba yako ni tupu' : 'Your Library is empty'}</p>
                <Link to="/" className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-12 py-5 rounded-[1.5rem] font-black transition-all shadow-2xl shadow-indigo-600/30 inline-block active:scale-95 text-lg">
                  {language === 'sw' ? 'Gundua Hadithi Sasa' : 'Explore Stories Now'}
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {savedStories.map((story) => (
                  <div key={story.id} className="bg-white dark:bg-slate-900/50 rounded-[3rem] border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group relative shadow-sm">
                    <button 
                      onClick={() => handleRemoveSaved(story.id)}
                      className="absolute top-6 right-6 z-10 p-4 bg-white/90 dark:bg-slate-900/90 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-500 rounded-3xl shadow-xl transition-all opacity-0 group-hover:opacity-100 backdrop-blur-md active:scale-90"
                      title="Ondoa kwenye maktaba"
                    >
                      <Trash2 size={24} />
                    </button>
                    
                    <div className="flex flex-col lg:flex-row h-full">
                      <div className="lg:w-56 overflow-hidden shrink-0 relative aspect-[3/4] lg:aspect-auto">
                        <img 
                          src={story.imageUrl || 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&q=80&w=800'} 
                          alt={story.title} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent lg:hidden"></div>
                      </div>
                      
                      <div className="p-10 flex-1 flex flex-col">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900/40 shadow-sm">{story.genre}</span>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">{story.title}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10 font-bold">Na <span className="font-black text-slate-800 dark:text-slate-200">{story.authorName}</span></p>
                        
                        <div className="mt-auto pt-8 border-t border-slate-50 dark:border-slate-800 flex items-center gap-4">
                          <button 
                            onClick={() => setReadingStory(story)}
                            className="flex-1 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white font-black py-4 px-8 rounded-[1.8rem] transition-all text-sm shadow-xl shadow-indigo-600/30 active:scale-95"
                          >
                            {language === 'sw' ? 'Anza Kusoma' : 'Start Reading'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
      )}

      {activeTab === 'characters' && (
        <div className="animate-in fade-in duration-300">
          <CharacterCreator />
        </div>
      )}

      {activeTab === 'ai-writer' && (
        <div className="animate-in fade-in duration-300">
          <AuthorPanel />
        </div>
      )}

      {/* Reading Modal */}
      {readingStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between p-8 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white leading-tight">{readingStory.title}</h2>
                <p className="text-slate-500 dark:text-slate-400 font-bold mt-1">Na {readingStory.authorName} • {readingStory.genre}</p>
              </div>
              <button 
                onClick={() => setReadingStory(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 p-3 rounded-2xl transition-all"
              >
                <X size={28} />
              </button>
            </div>
            
            <div className="p-10 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-950 scrollbar-thin scrollbar-thumb-indigo-200 dark:scrollbar-thumb-indigo-900">
              {readingStory.imageUrl && (
                <img src={readingStory.imageUrl} alt={readingStory.title} className="w-full h-96 object-cover rounded-[2.5rem] mb-12 shadow-xl" />
              )}
              
              <div className="max-w-3xl mx-auto">
                <div className="prose prose-indigo dark:prose-invert max-w-none mb-16 text-slate-800 dark:text-slate-200">
                  {readingStory.content?.split('\n').map((paragraph: string, i: number) => (
                    <p key={i} className="mb-8 text-2xl leading-relaxed font-serif tracking-normal">{paragraph}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
