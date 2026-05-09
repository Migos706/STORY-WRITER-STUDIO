import React, { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Loader2, BookOpen, User, Shield, LogOut, LogIn } from 'lucide-react';

import Home from './pages/Home';
import UserPanel from './pages/UserPanel';
import AuthorPanel from './pages/AuthorPanel';
import AdminPanel from './pages/AdminPanel';
import AuthModal from './components/AuthModal';

// --- Types ---
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'author' | 'user';
  authorStatus: 'none' | 'pending' | 'approved';
}

// --- Auth Context ---
interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  logOut: () => Promise<void>;
  openAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = null;
      }

      setUser(currentUser);
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
          const isSpecialAdmin = currentUser.email === 'migosking706@gmail.com' || currentUser.email === 'admin@storystudio.app' || currentUser.email === 'elizabethkumburu90@gmail.com';
          const newProfile: UserProfile = {
            uid: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || 'Anonymous',
            role: isSpecialAdmin ? 'admin' : 'user',
            authorStatus: 'none',
          };
          await setDoc(userDocRef, newProfile);
          setProfile(newProfile);
        } else {
          setProfile(userDoc.data() as UserProfile);
        }

        // Listen for profile changes
        unsubSnapshot = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            setProfile(doc.data() as UserProfile);
          }
        }, (error) => {
          console.error("Profile snapshot error:", error);
        });
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  const logOut = async () => {
    await signOut(auth);
  };

  const openAuthModal = () => setIsAuthModalOpen(true);

  return (
    <AuthContext.Provider value={{ user, profile, loading, logOut, openAuthModal }}>
      {children}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </AuthContext.Provider>
  );
};

// --- Layout Component ---
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, logOut, openAuthModal } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-indigo-600 font-bold text-xl">
            <BookOpen size={24} />
            Story Studio
          </Link>
          <nav className="flex items-center gap-4">
            {user && profile ? (
              <>
                <Link to="/user" className="text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1">
                  <User size={18} /> Panel
                </Link>
                {profile.role === 'author' && (
                  <Link to="/author" className="text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1">
                    <BookOpen size={18} /> Author
                  </Link>
                )}
                {profile.role === 'admin' && (
                  <Link to="/admin" className="text-slate-600 hover:text-indigo-600 font-medium flex items-center gap-1">
                    <Shield size={18} /> Admin
                  </Link>
                )}
                <button onClick={logOut} className="text-slate-500 hover:text-red-600 p-2 rounded-full hover:bg-slate-100 transition-colors">
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              <button 
                onClick={openAuthModal} 
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                <LogIn size={18} /> Sign In
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>
    </div>
  );
};

// --- App Component ---
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/user" element={<UserPanel />} />
            <Route path="/author" element={<AuthorPanel />} />
            <Route path="/admin" element={<AdminPanel />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}
