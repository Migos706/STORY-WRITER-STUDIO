import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { doc, updateDoc, collection, getDocs, query, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, BookOpen, Clock, CheckCircle2, Loader2, Bookmark, Sparkles, Trash2, Headphones, X } from 'lucide-react';
import AuthorPanel from './AuthorPanel';

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
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
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
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function UserPanel() {
  const { user, profile } = useAuth();
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
  const [activeTab, setActiveTab] = useState<'profile' | 'saved' | 'ai-writer'>('profile');
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
        handleFirestoreError(error, OperationType.LIST, path);
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
        handleFirestoreError(error, OperationType.LIST, path);
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
      alert("Lazima ukubaliane na sheria na kanuni (Privacy & Terms) ili uendelee.");
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
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Tabs */}
      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200 w-fit mx-auto">
        <button 
          onClick={() => setActiveTab('profile')}
          className={`px-6 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'profile' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <User size={18} /> Profile
        </button>
        <button 
          onClick={() => setActiveTab('saved')}
          className={`px-6 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'saved' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Bookmark size={18} /> Saved Stories
        </button>
        <button 
          onClick={() => setActiveTab('ai-writer')}
          className={`px-6 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'ai-writer' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Sparkles size={18} /> AI Story Writer
        </button>
      </div>

      {activeTab === 'profile' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-6">
            <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
              <User size={40} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{profile.displayName}</h1>
              <p className="text-slate-500">{profile.email}</p>
              <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-3 py-1 rounded-full">
                Role: {profile.role}
              </div>
            </div>
          </div>

          {profile.role === 'user' && (
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
              <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <BookOpen className="text-indigo-600" /> Omba Kuwa Mwandishi (Author)
              </h2>
              
              {profile.authorStatus === 'none' && (
                <form onSubmit={handleApplyAuthor} className="space-y-6">
                  <p className="text-slate-600">
                    Unataka kuchapisha hadithi zako na kuzishirikisha duniani? Jaza fomu hii ili uweze kuwa mwandishi katika Story Studio.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Jina la Kalamu (Pseudonym / Pen Name)</label>
                      <input 
                        type="text" 
                        required
                        value={appForm.pseudonym}
                        onChange={e => setAppForm({...appForm, pseudonym: e.target.value})}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Mtumiaji atakuona kwa jina hili"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Aina ya Mwandishi (Author Type)</label>
                      <select 
                        value={appForm.authorType}
                        onChange={e => setAppForm({...appForm, authorType: e.target.value})}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="Novelist">Mtunzi wa Hadithi/Riwaya (Novelist)</option>
                        <option value="Educational">Muelimishaji (Educational)</option>
                        <option value="Poet">Mshairi (Poet)</option>
                        <option value="Journalist">Mwandishi wa Habari/Makala</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Kujihusu kwa ufupi (Short Bio)</label>
                    <textarea 
                      required
                      value={appForm.bio}
                      onChange={e => setAppForm({...appForm, bio: e.target.value})}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                      placeholder="Elezea uzoefu wako au kwanini unataka kujiunga..."
                    />
                  </div>

                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                    <h4 className="font-bold text-amber-900 mb-2 text-sm">Privacy & Terms Agreement</h4>
                    <div className="flex items-start gap-2">
                      <input 
                        type="checkbox" 
                        id="author-terms"
                        required
                        checked={appForm.agreed}
                        onChange={e => setAppForm({...appForm, agreed: e.target.checked})}
                        className="mt-1 w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="author-terms" className="text-xs text-amber-800 leading-relaxed">
                        Ninakubali masharti ya Story Studio. Nafahamu kuwa ni marufuku kabisa kutumia lugha chafu, matusi, kashfa, na maudhui yoyote ya kiutuuzima (adult content) au yasiyo na maadili. 
                        Ninakubali kuwa kazi zangu zitakaguliwa na admin.
                      </label>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={applying}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center gap-2"
                  >
                    {applying ? <Loader2 className="animate-spin" size={20} /> : null}
                    Tuma Maombi ya Kuwa Mwandishi
                  </button>
                </form>
              )}
              
              {profile.authorStatus === 'pending' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center animate-pulse">
                    <Clock size={32} />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-900">Maombi yanachakatwa</h3>
                    <p className="text-slate-500">Maombi yako yapo mezani kwa Admin. Utapokea taarifa hapa yakishakubaliwa.</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 max-w-md w-full">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-2">Taarifa zako:</p>
                    <p className="text-sm"><strong>Pseudonym:</strong> {profile.authorApplication?.pseudonym}</p>
                    <p className="text-sm"><strong>Type:</strong> {profile.authorApplication?.authorType}</p>
                  </div>
                </div>
              )}

              {profile.authorStatus === 'approved' && (
                <div className="flex items-center gap-3 text-emerald-600 bg-emerald-50 px-6 py-4 rounded-2xl font-bold border border-emerald-200">
                  <CheckCircle2 size={24} /> 
                  Hongera! Wewe ni mwandishi aliyeidhinishwa katika Story Studio.
                </div>
              )}
            </div>
          )}

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Clock className="text-indigo-600" /> Recently Read
            </h2>

            {loadingHistory ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600" /></div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-2xl border border-slate-100">
                You haven't read any stories yet.
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="w-16 h-16 rounded-xl object-cover" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-indigo-50 text-indigo-300 flex items-center justify-center">
                        <BookOpen size={24} />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900">{item.title}</h3>
                      <p className="text-sm text-slate-500">By {item.authorName}</p>
                    </div>
                    <div className="hidden sm:block text-right">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                        {item.genre}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'saved' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Bookmark className="text-indigo-600" /> Saved for Later
            </h2>

            {loadingSaved ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600" /></div>
            ) : savedStories.length === 0 ? (
              <div className="text-center py-16 text-slate-500 bg-slate-50 rounded-3xl border border-slate-100">
                <Bookmark size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-lg font-medium">You haven't saved any stories yet.</p>
                <p className="text-sm">Browse the home page and click the bookmark icon to save stories here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {savedStories.map((story) => (
                  <div key={story.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow group relative">
                    <button 
                      onClick={() => handleRemoveSaved(story.id)}
                      className="absolute top-2 right-2 z-10 p-2 bg-white/90 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-full shadow-sm transition-colors"
                      title="Remove from saved"
                    >
                      <Trash2 size={16} />
                    </button>
                    
                    {story.imageUrl ? (
                      <div className="h-40 overflow-hidden">
                        <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    ) : (
                      <div className="h-40 bg-indigo-50 flex items-center justify-center text-indigo-200">
                        <BookOpen size={40} />
                      </div>
                    )}
                    
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{story.genre}</span>
                        {story.status === 'draft' && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">AI Draft</span>
                        )}
                      </div>
                      <h3 className="font-bold text-slate-900 mb-1 line-clamp-1">{story.title}</h3>
                      <p className="text-xs text-slate-500 mb-4">By {story.authorName}</p>
                      
                      <div className="mt-auto flex items-center gap-2">
                        <button 
                          onClick={() => setReadingStory(story)}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl transition-colors text-xs text-center"
                        >
                          Read Now
                        </button>
                        {story.audioUrl && (
                          <button 
                            onClick={() => setReadingStory(story)}
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors"
                          >
                            <Headphones size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'ai-writer' && (
        <div className="animate-in fade-in duration-300">
          <AuthorPanel />
        </div>
      )}

      {/* Reading Modal */}
      {readingStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{readingStory.title}</h2>
                <p className="text-slate-500 font-medium">By {readingStory.authorName}</p>
              </div>
              <button 
                onClick={() => setReadingStory(null)}
                className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              {readingStory.imageUrl && (
                <img src={readingStory.imageUrl} alt={readingStory.title} className="w-full h-64 object-cover rounded-2xl mb-8 shadow-sm" />
              )}
              
              <div className="prose prose-indigo max-w-none">
                {readingStory.content.split('\n').map((paragraph: string, i: number) => (
                  <p key={i} className="mb-4 text-lg text-slate-800 leading-relaxed">{paragraph}</p>
                ))}
              </div>
            </div>
            
            {readingStory.audioUrl && (
              <div className="p-6 border-t border-slate-100 bg-white">
                <p className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <Headphones size={16} className="text-indigo-600" /> Audio Narration
                </p>
                <audio controls src={readingStory.audioUrl} className="w-full h-12 rounded-full" autoPlay />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

