import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, addDoc, onSnapshot, orderBy, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { BookOpen, Headphones, Search, Filter, X, Bookmark, BookmarkCheck, Loader2, MessageCircle, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../App';

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

const GENRES = ['All', 'Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Education', 'Comedy', 'Horror'];

export default function Home() {
  const { user } = useAuth();
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [readingStory, setReadingStory] = useState<any | null>(null);
  const [savedStoryIds, setSavedStoryIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const { profile } = useAuth();

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
        handleFirestoreError(error, OperationType.LIST, path);
      }
    };

    fetchStories();
    fetchSavedStories();
  }, [user]);

  const handleReadStory = async (story: any) => {
    setReadingStory(story);
    setLoadingComments(true);
    setComments([]);
    
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
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }

    return unsubscribe;
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
        authorId: readingStory.authorId // Useful for notifications or filtering
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
    if (!window.confirm("Je, una uhakika unataka kufuta maoni haya?")) return;

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

  const filteredStories = stories.filter(story => {
    const matchesSearch = story.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          story.authorName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = selectedGenre === 'All' || story.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  if (loading) return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="bg-indigo-600 rounded-3xl p-8 md:p-16 text-center text-white shadow-xl shadow-indigo-600/20 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%23ffffff\\' fill-opacity=\\'1\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')" }}></div>
        <div className="relative z-10">
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6">Welcome to Story Studio</h1>
          <p className="text-lg md:text-xl text-indigo-100 max-w-2xl mx-auto mb-8">
            Discover, listen, and immerse yourself in amazing stories created by our talented authors. From thrilling sci-fi to calming educational pieces.
          </p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Search stories or authors..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0" style={{ scrollbarWidth: 'none' }}>
          <Filter className="text-slate-400 hidden md:block mr-2" size={20} />
          {GENRES.map(genre => (
            <button
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl font-medium text-sm transition-colors ${
                selectedGenre === genre 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {/* Stories Grid */}
      {filteredStories.length === 0 ? (
        <div className="text-center text-slate-500 py-16 bg-white rounded-3xl border border-slate-200">
          <BookOpen size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-lg font-medium">No stories found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStories.map(story => (
            <div key={story.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow group">
              {story.imageUrl ? (
                <div className="relative h-48 overflow-hidden">
                  <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                </div>
              ) : (
                <div className="w-full h-48 bg-indigo-100 flex items-center justify-center text-indigo-300">
                  <BookOpen size={48} />
                </div>
              )}
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{story.genre}</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{story.mood}</span>
                  </div>
                  {user && (
                    <button 
                      onClick={() => handleSaveStory(story)}
                      disabled={savingId === story.id}
                      className={`p-2 rounded-full transition-colors ${
                        savedStoryIds.has(story.id) 
                          ? 'text-emerald-600 bg-emerald-50' 
                          : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                      }`}
                      title={savedStoryIds.has(story.id) ? "Saved" : "Save for Later"}
                    >
                      {savingId === story.id ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : savedStoryIds.has(story.id) ? (
                        <BookmarkCheck size={18} />
                      ) : (
                        <Bookmark size={18} />
                      )}
                    </button>
                  )}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2 line-clamp-2">{story.title}</h3>
                <p className="text-sm text-slate-500 mb-4 font-medium">By {story.authorName}</p>
                
                <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                  <button 
                    onClick={() => handleReadStory(story)}
                    className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-xl transition-colors text-sm text-center"
                  >
                    Read Story
                  </button>
                  {story.audioUrl ? (
                    <button 
                      onClick={() => handleReadStory(story)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
                    >
                      <Headphones size={16} /> Listen
                    </button>
                  ) : (
                    <div className="flex-1 text-xs text-slate-400 flex items-center justify-center gap-1">
                      <Headphones size={14} /> No audio
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
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
              
              <div className="prose prose-indigo max-w-none mb-12">
                {readingStory.content.split('\n').map((paragraph: string, i: number) => (
                  <p key={i} className="mb-4 text-lg text-slate-800 leading-relaxed">{paragraph}</p>
                ))}
              </div>

              {/* Comments Section */}
              <div className="mt-12 pt-12 border-t border-slate-200">
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <MessageCircle className="text-indigo-600" size={24} />
                  Maoni ya Wasomaji ({comments.length})
                </h3>

                {user ? (
                  <form onSubmit={handlePostComment} className="mb-8 relative">
                    <textarea 
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Andika maoni yako hapa..."
                      className="w-full p-4 pr-14 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-24 shadow-sm"
                      required
                    />
                    <button 
                      type="submit"
                      disabled={postingComment || !newComment.trim()}
                      className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                    >
                      {postingComment ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                    </button>
                  </form>
                ) : (
                  <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 text-center mb-8">
                    <p className="text-sm text-indigo-700 font-medium">Ingia (Sign In) ili uweze kutoa maoni yako.</p>
                  </div>
                )}

                <div className="space-y-4">
                  {loadingComments ? (
                    <div className="flex justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-indigo-600" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-center text-slate-400 py-8 italic">Hakuna maoni bado. Kuwa wa kwanza kutoa maoni!</p>
                  ) : (
                    comments.map((comment) => (
                      <div key={comment.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm group">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                              {comment.userName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{comment.userName}</p>
                              <p className="text-[10px] text-slate-400">
                                {comment.createdAt?.toDate ? new Date(comment.createdAt.toDate()).toLocaleDateString() : 'Hivi sasa'}
                              </p>
                            </div>
                          </div>
                          
                          {user && (profile?.role === 'admin' || user.uid === comment.userId || user.uid === readingStory.authorId) && (
                            <button 
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-50"
                              title="Futa maoni"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                        <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line pl-10">
                          {comment.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
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
