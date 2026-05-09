import React, { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Loader2, BookOpen, User, Shield, LogOut, LogIn, Moon, Sun } from 'lucide-react';

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
  authorApplication?: {
    pseudonym: string;
    authorType: string;
    bio: string;
    agreedToCompliance: boolean;
    appliedAt: number;
  };
}

// --- Auth Context ---
interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  logOut: () => Promise<void>;
  openAuthModal: () => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
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
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

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
    <AuthContext.Provider value={{ user, profile, loading, logOut, openAuthModal, darkMode, toggleDarkMode }}>
      {children}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </AuthContext.Provider>
  );
};

// --- Layout Component ---
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, logOut, openAuthModal, darkMode, toggleDarkMode } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col transition-colors duration-300">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xl">
            <BookOpen size={24} />
            Story Studio
          </Link>
          <nav className="flex items-center gap-4">
            <button 
              onClick={toggleDarkMode}
              className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {user && profile ? (
              <>
                <Link to="/user" className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold flex items-center gap-1.5 transition-colors">
                  <User size={18} /> Profaili
                </Link>
                {profile.role === 'author' && (
                  <Link to="/author" className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold flex items-center gap-1.5 transition-colors">
                    <BookOpen size={18} /> Mwandishi
                  </Link>
                )}
                {profile.role === 'admin' && (
                  <Link to="/admin" className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold flex items-center gap-1.5 transition-colors">
                    <Shield size={18} /> Admin
                  </Link>
                )}
                <button onClick={logOut} className="text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-90" title="Ondoka">
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              <button 
                onClick={openAuthModal} 
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
              >
                <LogIn size={18} /> Ingia Sasa
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
