import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';
import { Loader2, X, Mail, Lock, User as UserIcon } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked') {
        setError("Popup blocked by your browser. Please allow popups or open the app in a new tab.");
      } else if (err.code === 'auth/network-request-failed') {
        setError("Network error. If you are in the preview window, your browser might be blocking third-party cookies. Please open the app in a new tab.");
      } else if (err.code !== 'auth/cancelled-popup-request' && err.code !== 'auth/popup-closed-by-user') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }

    if (!isLogin && !agreedToTerms) {
      setError("You must agree to the Privacy Policy and Terms of Service.");
      return;
    }

    setLoading(true);
    setError(null);

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    // Use the input directly if it looks like an email, otherwise map to a dummy email
    const email = trimmedUsername.includes('@') 
      ? trimmedUsername 
      : `${trimmedUsername.toLowerCase().replace(/[^a-z0-9]/g, '')}@storystudio.app`;

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, trimmedPassword);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, trimmedPassword);
        await updateProfile(userCredential.user, { displayName: trimmedUsername });
      }
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError("Invalid username or password.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("Username is already taken.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors"
        >
          <X size={20} />
        </button>

        <div className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-2">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-slate-500">
              {isLogin ? 'Sign in to continue to Story Studio' : 'Join Story Studio to start listening'}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium mb-6 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Email or Username</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="Enter your email or username"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {!isLogin && (
              <div className="flex items-start gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="terms" className="text-xs text-slate-600 leading-relaxed">
                  I agree to the <button type="button" onClick={() => setShowTerms(true)} className="text-indigo-600 font-bold hover:underline">Privacy Policy & Terms of Service</button>. 
                  I understand that offensive language, insults, and adult content are strictly prohibited.
                </label>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : null}
              {isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative bg-white px-4 text-sm text-slate-500 font-medium">
              OR
            </div>
          </div>

          <button 
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <div className="mt-8 text-center text-sm text-slate-600">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="text-indigo-600 font-bold hover:underline"
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Privacy & Terms of Service</h3>
              <button 
                onClick={() => setShowTerms(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-slate-600 text-sm leading-relaxed">
              <section>
                <h4 className="font-bold text-slate-900 mb-2">1. Kabuliana na Masharti</h4>
                <p>Kwa kujiunga na Story Studio, unakubaliana na masharti haya ya huduma. Ikiwa hukubaliani na sehemu yoyote ya masharti haya, hupaswi kutumia studio hii.</p>
              </section>
              <section>
                <h4 className="font-bold text-slate-900 mb-2 text-red-600">2. Maadili na Maudhui (Muhimu)</h4>
                <p className="bg-red-50 p-3 rounded-lg border border-red-100 font-medium text-red-700">
                  Tunazingatia maadili ya juu. Ni marufuku kabisa kutumia lugha chafu, matusi, kashfa, herufi au maneno yasiyo na staha, na maudhui yoyote ya kiutuuzima (adult content) au yasiyo na maadili. 
                  Ukiukaji wa sheria hii utasababisha kufungiwa kwa akaunti yako mara moja bila taarifa.
                </p>
              </section>
              <section>
                <h4 className="font-bold text-slate-900 mb-2">3. Umiliki wa Maudhui</h4>
                <p>Waandishi wanamiliki hakimiliki ya kazi zao, lakini kwa kuziweka hapa, wanatupa ruhusa ya kuzihifadhi na kuzionyesha kwa watumiaji wetu.</p>
              </section>
              <section>
                <h4 className="font-bold text-slate-900 mb-2">4. Faragha (Privacy)</h4>
                <p>Tunachukua usalama wa data zako kwa umakini. Barua pepe yako na taarifa zako hazitauzwa wala kushirikishwa kwa watu baki bila idhini yako.</p>
              </section>
              <p className="pt-4 border-t border-slate-100 italic text-slate-400 text-xs">Toleo la 1.0 - Story Studio Compliance</p>
            </div>
            <div className="p-4 border-t border-slate-100 text-center">
              <button 
                onClick={() => setShowTerms(false)}
                className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-colors"
              >
                Nimeelewa na Kukubali
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
