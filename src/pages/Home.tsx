import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc, serverTimestamp, addDoc, onSnapshot, orderBy, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { BookOpen, Headphones, Search, Filter, X, Bookmark, BookmarkCheck, Loader2, MessageCircle, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../App';
import StoryGenerator from '../components/StoryGenerator';
import { locales } from '../locales';

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

const GENRES = ['All', 'Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Education', 'Comedy', 'Horror', 'Poetry', 'Adventure'];

export default function Home() {
  const { user, profile, language } = useAuth();
  const t = locales[language || 'sw'];

  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [readingStory, setReadingStory] = useState<any | null>(null);
  const [savedStoryIds, setSavedStoryIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

  // Chapter and Progress tracking states
  const [readingChapters, setReadingChapters] = useState<any[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

  const [recentProgress, setRecentProgress] = useState<any[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(false);

  useEffect(() => {
    const fetchProgress = async () => {
      if (!user) {
        setRecentProgress([]);
        return;
      }
      setLoadingProgress(true);
      const path = `users/${user.uid}/readingProgress`;
      try {
        const q = query(collection(db, path), orderBy('updatedAt', 'desc'));
        const snap = await getDocs(q);
        setRecentProgress(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.warn("Could not fetch reading progress:", err);
        setRecentProgress([]);
      } finally {
        setLoadingProgress(false);
      }
    };
    fetchProgress();
  }, [user, readingStory]);

  useEffect(() => {
    const fetchStories = async () => {
      try {
        const q = query(collection(db, 'stories'), where('status', '==', 'approved'));
        const snapshot = await getDocs(q);
        const fetchedStories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        // Sort by newest first
        fetchedStories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setStories(fetchedStories);
      } catch (error) {
        console.error("Error fetching stories:", error);
      } finally {
        setLoading(false);
      }
    };

    const fetchSavedStories = async () => {
      if (!user) return;
      const path = `users/${user.uid}/savedStories`;
      try {
        const snapshot = await getDocs(collection(db, path));
        setSavedStoryIds(new Set(snapshot.docs.map(doc => doc.id)));
      } catch (error) {
        console.warn("Could not fetch saved stories:", error);
      }
    };

    fetchStories();
    fetchSavedStories();
  }, [user]);

  const saveReadingProgress = async (index: number, chaptersList: any[], story: any) => {
    if (!user || !story || chaptersList.length === 0) return;
    const progressPercent = Math.round(((index + 1) / chaptersList.length) * 100);
    const chapter = chaptersList[index];
    const path = `users/${user.uid}/readingProgress/${story.id}`;
    try {
      await setDoc(doc(db, path), {
        storyId: story.id,
        storyTitle: story.title,
        lastReadChapterId: chapter.id,
        lastReadChapterTitle: chapter.title,
        lastReadChapterIndex: index,
        percentage: progressPercent,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Error saving reading progress:", error);
    }
  };

  const handleReadStory = async (story: any) => {
    setReadingStory(story);
    setLoadingComments(true);
    setComments([]);
    setReadingChapters([]);
    setLoadingChapters(true);
    setCurrentChapterIndex(0);

    // Setup real-time listener for comments
    const commentsPath = `stories/${story.id}/comments`;
    const q = query(collection(db, commentsPath), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      setComments(fetchedComments);
      setLoadingComments(false);
    }, (error) => {
      console.error("Comments listener error:", error);
      setLoadingComments(false);
    });

    // Fetch chapters
    const chaptersPath = `stories/${story.id}/chapters`;
    try {
      const qChapters = query(collection(db, chaptersPath), orderBy('order', 'asc'));
      const chaptersSnap = await getDocs(qChapters);
      const list = chaptersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReadingChapters(list);
      
      // Load saved reading progress for this story if logged in
      if (user && list.length > 0) {
        const progressPath = `users/${user.uid}/readingProgress/${story.id}`;
        const progressDoc = await getDoc(doc(db, progressPath));
        if (progressDoc.exists()) {
          const data = progressDoc.data();
          if (typeof data.lastReadChapterIndex === 'number' && data.lastReadChapterIndex < list.length) {
            setCurrentChapterIndex(data.lastReadChapterIndex);
          }
        } else {
          // Save initial progress
          await saveReadingProgress(0, list, story);
        }
      }
    } catch (error) {
      console.error("Error loading chapters:", error);
    } finally {
      setLoadingChapters(false);
    }

    if (user) {
      const path = `users/${user.uid}/history/${story.id}`;
      try {
        await setDoc(doc(db, path), {
          title: story.title,
          authorName: story.authorName,
          genre: story.genre,
          imageUrl: story.imageUrl || null,
          viewedAt: serverTimestamp()
        });
      } catch (error) {
        console.warn("Could not save to history:", error);
      }
    }

    return unsubscribe;
  };

  const handleNextChapter = () => {
    if (currentChapterIndex < readingChapters.length - 1) {
      const nextIndex = currentChapterIndex + 1;
      setCurrentChapterIndex(nextIndex);
      saveReadingProgress(nextIndex, readingChapters, readingStory);
    }
  };

  const handlePrevChapter = () => {
    if (currentChapterIndex > 0) {
      const prevIndex = currentChapterIndex - 1;
      setCurrentChapterIndex(prevIndex);
      saveReadingProgress(prevIndex, readingChapters, readingStory);
    }
  };

  const handleSelectChapter = (index: number) => {
    setCurrentChapterIndex(index);
    saveReadingProgress(index, readingChapters, readingStory);
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || !readingStory) return;

    setPostingComment(true);
    const path = `stories/${readingStory.id}/comments`;
    try {
      await addDoc(collection(db, path), {
        userId: user.uid,
        userName: profile?.displayName || 'User',
        text: newComment.trim(),
        createdAt: serverTimestamp(),
        authorId: readingStory.authorId
      });
      setNewComment('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!readingStory) return;
    if (!window.confirm(language === 'sw' ? "Je, una uhakika unataka kufuta maoni haya?" : "Are you sure you want to delete this comment?")) return;

    const path = `stories/${readingStory.id}/comments/${commentId}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleSaveStory = async (story: any) => {
    if (!user) return;
    setSavingId(story.id);
    const path = `users/${user.uid}/savedStories/${story.id}`;
    try {
      await setDoc(doc(db, path), {
        ...story,
        savedAt: serverTimestamp()
      });
      setSavedStoryIds(prev => new Set(prev).add(story.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setSavingId(null);
    }
  };

  const filteredStories = stories
    .filter(story => {
      const matchesSearch = story.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            story.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (story.content && story.content.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesGenre = selectedGenre === 'All' || story.genre === selectedGenre;
      return matchesSearch && matchesGenre;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === 'alphabetical') return a.title.localeCompare(b.title);
      return 0;
    });

  if (loading) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="bg-indigo-600 rounded-[3rem] p-12 md:p-24 text-center text-white shadow-2xl shadow-indigo-600/30 relative overflow-hidden transition-all animate-in zoom-in duration-1000">
        <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%23ffffff\\' fill-opacity=\\'1\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')" }}></div>
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-xl rounded-[2.5rem] flex items-center justify-center mb-8 border border-white/20 shadow-inner">
            <BookOpen size={40} className="text-white" />
          </div>
          <h1 className="text-5xl md:text-7xl font-black mb-8 leading-tight tracking-tighter shadow-sm">
            {t.heroTitle}
          </h1>
          <p className="text-xl md:text-2xl text-indigo-100 max-w-2xl mx-auto mb-10 leading-relaxed font-bold opacity-90 italic">
            {t.heroSubtitle}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <span className="bg-white/10 backdrop-blur-md px-6 py-2 rounded-full text-sm font-black uppercase tracking-widest border border-white/20">
              #Imani
            </span>
            <span className="bg-white/10 backdrop-blur-md px-6 py-2 rounded-full text-sm font-black uppercase tracking-widest border border-white/20">
              #Elimu
            </span>
            <span className="bg-white/10 backdrop-blur-md px-6 py-2 rounded-full text-sm font-black uppercase tracking-widest border border-white/20">
              #Burudani
            </span>
          </div>
        </div>
      </div>

      {/* AI Story Generator */}
      <StoryGenerator />

      {/* Endelea Kusoma (Recently Read with progress) */}
      {user && recentProgress.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/50 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 animate-in fade-in duration-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md">
              <BookOpen size={20} />
            </div>
            <h3 className="font-black text-slate-900 dark:text-white text-2xl">{t.continueReading}</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentProgress.slice(0, 3).map((prog) => {
              const fullStory = stories.find(s => s.id === prog.storyId);
              return (
                <div key={prog.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-indigo-200 dark:hover:border-indigo-950 transition-colors">
                  <div>
                    <h4 className="font-black text-slate-900 dark:text-white text-lg line-clamp-1">{prog.storyTitle}</h4>
                    <p className="text-xs text-slate-500 mt-1">{t.lastReadChapter}: <span className="font-bold text-slate-700 dark:text-slate-300">{prog.lastReadChapterTitle || `Sura ya ${prog.lastReadChapterIndex + 1}`}</span></p>
                    
                    {/* Progress bar */}
                    <div className="mt-4 bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden relative shadow-inner">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${prog.percentage}%` }}></div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.progress}</span>
                      <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{prog.percentage}%</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      if (fullStory) {
                        handleReadStory(fullStory);
                      } else {
                        handleReadStory({ id: prog.storyId, title: prog.storyTitle, content: '' });
                      }
                    }}
                    className="mt-5 w-full bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 font-black py-2.5 rounded-xl text-sm transition-all text-center"
                  >
                    {t.next}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
        <div className="relative w-full lg:w-[32rem]">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
          <input 
            type="text" 
            placeholder={t.searchPlaceholder} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-16 pr-6 py-5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2rem] focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white transition-all text-lg font-bold placeholder:font-medium placeholder:text-slate-400"
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-6 w-full lg:w-auto items-center">
          <div className="flex items-center gap-4 bg-slate-100 dark:bg-slate-800 p-2 rounded-[1.8rem] w-full sm:w-auto border border-slate-200 dark:border-slate-700">
            <select 
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-black text-slate-600 dark:text-slate-300 px-6 py-2 cursor-pointer focus:ring-0 appearance-none"
            >
              {GENRES.map(g => <option key={g} value={g} className="bg-white dark:bg-slate-900">{g === 'All' ? t.allGenres : g}</option>)}
            </select>
            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-black text-slate-600 dark:text-slate-300 px-6 py-2 cursor-pointer focus:ring-0 appearance-none"
            >
              <option value="newest" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{language === 'sw' ? 'Mpya Zaidi' : 'Newest'}</option>
              <option value="oldest" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{language === 'sw' ? 'Za Zamani' : 'Oldest'}</option>
              <option value="alphabetical" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">A-Z</option>
            </select>
            <Filter size={18} className="mr-4 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Stories Grid */}
      {filteredStories.length === 0 ? (
        <div className="text-center text-slate-500 dark:text-slate-400 py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 transition-colors">
          <BookOpen size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
          <p className="text-lg font-medium">{t.noStoriesFound}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredStories.map(story => (
            <div key={story.id} className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col hover:shadow-xl dark:hover:shadow-indigo-900/10 transition-all duration-300 group">
              {story.imageUrl ? (
                <div className="relative h-56 overflow-hidden">
                  <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white bg-indigo-600 px-2 py-1 rounded-md">{story.genre}</span>
                  </div>
                </div>
              ) : (
                <div className="w-full h-56 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center text-indigo-200 dark:text-indigo-900/30">
                  <BookOpen size={64} />
                </div>
              )}
              <div className="p-8 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-900/30 shadow-sm">{story.mood}</span>
                  {user && (
                    <button 
                      onClick={() => handleSaveStory(story)}
                      disabled={savingId === story.id}
                      className={`p-3 rounded-2xl transition-all shadow-sm ${
                        savedStoryIds.has(story.id) 
                          ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' 
                          : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800'
                      }`}
                      title={savedStoryIds.has(story.id) ? t.saved : t.savedStoriesBtn}
                    >
                      {savingId === story.id ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : savedStoryIds.has(story.id) ? (
                        <BookmarkCheck size={24} />
                      ) : (
                        <Bookmark size={24} />
                      )}
                    </button>
                  )}
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-3 line-clamp-2 leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{story.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 font-bold flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                  Na <span className="font-black text-slate-800 dark:text-slate-200">{story.authorName}</span>
                </p>
                
                <div className="mt-auto pt-8 border-t border-slate-50 dark:border-slate-800 flex items-center gap-4">
                  <button 
                    onClick={() => handleReadStory(story)}
                    className="flex-1 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white font-black py-4 px-6 rounded-[1.5rem] transition-all text-sm shadow-xl shadow-indigo-600/30 active:scale-95"
                  >
                    {language === 'sw' ? 'Soma Hadithi' : 'Read Story'}
                  </button>
                  {story.audioUrl && (
                    <button 
                      onClick={() => handleReadStory(story)}
                      className="w-14 h-14 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 rounded-2xl transition-all flex items-center justify-center shadow-inner active:scale-95"
                      title={language === 'sw' ? 'Sikiliza Masimulizi' : 'Listen Narration'}
                    >
                      <Headphones size={24} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reading Modal */}
      {readingStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">{readingStory.title}</h2>
                <p className="text-slate-500 dark:text-slate-400 font-medium">By {readingStory.authorName} • {readingStory.genre}</p>
              </div>
              <button 
                onClick={() => setReadingStory(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 p-2 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-950 scrollbar-thin scrollbar-thumb-indigo-200 dark:scrollbar-thumb-indigo-900">
              {readingStory.imageUrl && (
                <img src={readingStory.imageUrl} alt={readingStory.title} className="w-full h-80 object-cover rounded-3xl mb-10 shadow-lg" />
              )}
              
              <div className="max-w-3xl mx-auto">
                {loadingChapters ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="animate-spin text-indigo-600 mb-2" size={32} />
                    <p className="text-slate-500 font-bold text-sm">{t.loading}</p>
                  </div>
                ) : readingChapters.length > 0 ? (
                  <div className="animate-in fade-in duration-300">
                    {/* Chapter selector */}
                    <div className="mb-6 flex flex-col sm:flex-row items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 gap-4 shadow-sm">
                      <div className="text-sm font-black text-slate-600 dark:text-slate-400">
                        {t.chapterTitleLabel} <span className="text-indigo-600 font-black">{currentChapterIndex + 1}</span> kati ya <span className="text-slate-800 dark:text-white">{readingChapters.length}</span>
                      </div>
                      <select
                        value={currentChapterIndex}
                        onChange={(e) => handleSelectChapter(Number(e.target.value))}
                        className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-black dark:text-white outline-none cursor-pointer"
                      >
                        {readingChapters.map((chap, idx) => (
                          <option key={chap.id} value={idx}>{t.chapterTitleLabel} {chap.order}: {chap.title}</option>
                        ))}
                      </select>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-8 bg-slate-200 dark:bg-slate-850 h-2.5 rounded-full overflow-hidden relative shadow-inner">
                      <div 
                        className="bg-indigo-600 h-full transition-all duration-500 rounded-full"
                        style={{ width: `${Math.round(((currentChapterIndex + 1) / readingChapters.length) * 100)}%` }}
                      ></div>
                    </div>

                    <div className="prose prose-indigo dark:prose-invert max-w-none mb-12 text-slate-800 dark:text-slate-200">
                      <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-6 font-sans">
                        {t.chapterTitleLabel} {readingChapters[currentChapterIndex].order}: {readingChapters[currentChapterIndex].title}
                      </h3>
                      {readingChapters[currentChapterIndex].content.split('\n').map((paragraph: string, i: number) => (
                        <p key={i} className="mb-6 text-xl leading-relaxed font-serif">{paragraph}</p>
                      ))}
                    </div>

                    {/* Navigation */}
                    <div className="mb-16 flex items-center justify-between border-t border-b border-slate-150 dark:border-slate-800 py-6">
                      <button
                        onClick={handlePrevChapter}
                        disabled={currentChapterIndex === 0}
                        className="px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 disabled:opacity-40 rounded-xl text-sm font-black text-slate-700 dark:text-slate-300 transition-all cursor-pointer disabled:cursor-not-allowed"
                      >
                        ← {t.prevChapter}
                      </button>
                      <div className="text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                        {t.chapterTitleLabel} {currentChapterIndex + 1} ({Math.round(((currentChapterIndex + 1) / readingChapters.length) * 100)}% {t.completionPercentage})
                      </div>
                      <button
                        onClick={handleNextChapter}
                        disabled={currentChapterIndex === readingChapters.length - 1}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl text-sm font-black text-white transition-all cursor-pointer shadow-md shadow-indigo-600/20 disabled:cursor-not-allowed"
                      >
                        {t.nextChapter} →
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Fallback for old single-document stories to maintain backwards compatibility */
                  <div className="prose prose-indigo dark:prose-invert max-w-none mb-16 text-slate-800 dark:text-slate-200">
                    {readingStory.content && readingStory.content.split('\n').map((paragraph: string, i: number) => (
                      <p key={i} className="mb-6 text-xl leading-relaxed font-serif">{paragraph}</p>
                    ))}
                  </div>
                )}

                {/* Comments Section */}
                <div className="mt-20 pt-12 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-8 flex items-center gap-3">
                    <MessageCircle className="text-indigo-600 dark:text-indigo-400" size={28} />
                    {t.commentsSection} ({comments.length})
                  </h3>

                  {user ? (
                    <form onSubmit={handlePostComment} className="mb-10 relative">
                      <textarea 
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder={t.addCommentPlaceholder}
                        className="w-full p-5 pr-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-32 shadow-sm dark:text-white transition-all text-lg"
                        required
                      />
                      <button 
                        type="submit"
                        disabled={postingComment || !newComment.trim()}
                        className="absolute bottom-5 right-5 bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-2xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 active:scale-95"
                      >
                        {postingComment ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
                      </button>
                    </form>
                  ) : (
                    <div className="bg-indigo-50 dark:bg-indigo-950/20 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-900/40 text-center mb-10">
                      <p className="text-indigo-700 dark:text-indigo-300 font-bold">Tafadhali ingia ili uweze kutoa maoni yako.</p>
                    </div>
                  )}

                  <div className="space-y-6 pb-12">
                    {loadingComments ? (
                      <div className="flex justify-center py-12">
                        <Loader2 size={32} className="animate-spin text-indigo-600" />
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="text-center py-12 text-slate-400 dark:text-slate-600 flex flex-col items-center gap-3">
                        <MessageCircle size={48} className="opacity-20" />
                        <p className="italic text-lg">{t.noCommentsYet}</p>
                      </div>
                    ) : (
                      comments.map((comment) => (
                        <div key={comment.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm group transition-all hover:border-indigo-100 dark:hover:border-indigo-900/30">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-xl shadow-inner">
                                {comment.userName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white text-lg">{comment.userName}</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                  {comment.createdAt?.toDate ? new Date(comment.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : 'Hivi sasa'}
                                </p>
                              </div>
                            </div>
                            
                            {user && (profile?.role === 'admin' || user.uid === comment.userId || user.uid === readingStory.authorId) && (
                              <button 
                                onClick={() => handleDeleteComment(comment.id)}
                                className="text-slate-300 dark:text-slate-700 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30"
                                title="Futa maoni"
                              >
                                <Trash2 size={20} />
                              </button>
                            )}
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 text-lg leading-relaxed whitespace-pre-line pl-1 shadow-sm">
                            {comment.text}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {readingStory.audioUrl && (
              <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center gap-6">
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                      <Headphones size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Audio Narration</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Punguza/Ongeza Sauti hapa</p>
                    </div>
                  </div>
                  <audio controls src={readingStory.audioUrl} className="w-full h-12 rounded-full shadow-inner" autoPlay />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
