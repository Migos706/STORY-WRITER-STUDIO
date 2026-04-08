import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import { doc, updateDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { User, BookOpen, Clock, CheckCircle2, Loader2 } from 'lucide-react';

export default function UserPanel() {
  const { user, profile } = useAuth();
  const [applying, setApplying] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;
      try {
        const q = query(
          collection(db, 'users', user.uid, 'history'),
          orderBy('viewedAt', 'desc'),
          limit(10)
        );
        const snapshot = await getDocs(q);
        setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching history:", error);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [user]);

  if (!profile) return null;

  const handleApplyAuthor = async () => {
    setApplying(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        authorStatus: 'pending'
      });
    } catch (error) {
      console.error("Error applying for author:", error);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
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
            <BookOpen className="text-indigo-600" /> Become an Author
          </h2>
          <p className="text-slate-600 mb-6">
            Want to publish your own stories and share them with the world? Apply to become an author in Story Studio!
          </p>
          
          {profile.authorStatus === 'none' && (
            <button 
              onClick={handleApplyAuthor}
              disabled={applying}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
            >
              {applying ? 'Applying...' : 'Apply Now'}
            </button>
          )}
          
          {profile.authorStatus === 'pending' && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-3 rounded-xl font-medium border border-amber-200">
              <Clock size={20} /> Your application is pending admin approval.
            </div>
          )}

          {profile.authorStatus === 'approved' && (
            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-3 rounded-xl font-medium border border-emerald-200">
              <CheckCircle2 size={20} /> You are an approved author!
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
  );
}
