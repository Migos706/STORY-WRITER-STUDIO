import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';
import { Loader2, X, Mail, Lock, User as UserIcon, Shield } from 'lucide-react';
import { useAuth } from '../App';
import { locales } from '../locales';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { language } = useAuth();
  const t = locales[language];

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
        setError(language === 'sw' 
          ? "Imezuiliwa na kivinjari chako. Tafadhali ruhusu popup au fungua programu kwenye tabo mpya."
          : "Popup blocked by your browser. Please allow popups or open the app in a new tab.");
      } else if (err.code === 'auth/network-request-failed') {
        setError(language === 'sw'
          ? "Hitilafu ya mtandao. Tafadhali fungua programu kwenye tabo mpya au angalia cookies zako."
          : "Network error. If you are in the preview window, your browser might be blocking third-party cookies. Please open the app in a new tab.");
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
      setError(language === 'sw' ? "Tafadhali weka barua pepe na nenosiri." : "Please enter both username and password.");
      return;
    }

    if (!isLogin && !agreedToTerms) {
      setError(language === 'sw' ? "Lazima ukubaliane na sheria na kanuni zetu." : "You must agree to the Privacy Policy and Terms of Service.");
      return;
    }

    setLoading(true);
    setError(null);

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

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
        setError(language === 'sw' ? "Barua pepe au nenosiri sio sahihi." : "Invalid username or password.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError(language === 'sw' ? "Jina la mtumiaji tayari limechukuliwa." : "Username is already taken.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 p-2 rounded-full transition-colors"
        >
          <X size={20} />
        </button>

        <div className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2">
              {isLogin ? t.authTitleLogin : t.authTitleRegister}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
              {t.authSubtitle}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-4 rounded-2xl text-sm font-bold mb-6 text-center border border-red-100 dark:border-red-950/30 flex items-center justify-center gap-2">
              <Shield size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-5 mb-6">
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-widest">{language === 'sw' ? 'Mtumiaji / Barua Pepe' : 'Username / Email'}</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-900 dark:text-white"
                  placeholder={language === 'sw' ? 'Mfano: mwendwa@email.com' : 'e.g., baraka@email.com'}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-widest">{t.passwordLabel}</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-900 dark:text-white"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {!isLogin && (
              <div className="flex items-start gap-4 pt-2 bg-indigo-50/50 dark:bg-indigo-950/10 p-4 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/20">
                <input 
                  type="checkbox" 
                  id="terms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 w-6 h-6 text-indigo-600 border-indigo-200 rounded-lg focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="terms" className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-bold">
                  {language === 'sw' ? (
                    <>
                      Ninakubaliana na <button type="button" onClick={() => setShowTerms(true)} className="text-indigo-600 dark:text-indigo-400 font-black hover:underline">Masharti ya Huduma</button>. 
                      Ninaelewa kuwa lugha chafu na maudhui yasiyofaa ni marufuku kabisa.
                    </>
                  ) : (
                    <>
                      I agree to the <button type="button" onClick={() => setShowTerms(true)} className="text-indigo-600 dark:text-indigo-400 font-black hover:underline">Terms of Service & Privacy Policy</button>. 
                      I understand that offensive language or inappropriate content is strictly banned.
                    </>
                  )}
                </label>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 px-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3 active:scale-95 text-lg disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={24} /> : null}
              {isLogin ? t.loginBtn : t.registerBtn}
            </button>
          </form>

          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
            </div>
            <div className="relative bg-white dark:bg-slate-900 px-4 text-xs text-slate-400 font-black tracking-widest">
              {language === 'sw' ? 'AU' : 'OR'}
            </div>
          </div>

          <button 
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200 font-black py-4 px-4 rounded-2xl transition-all flex items-center justify-center gap-4 shadow-sm active:scale-95 text-sm"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {language === 'sw' ? 'Endelea na Google' : 'Continue with Google'}
          </button>

          <div className="mt-8 text-center text-sm font-bold text-slate-500">
            {isLogin ? (language === 'sw' ? "Huna akaunti bado? " : "Don't have an account? ") : (language === 'sw' ? "Tayari unayo akaunti? " : "Already have an account? ")}
            <button 
              onClick={() => setIsLogin(!isLogin)}
              className="text-indigo-600 dark:text-indigo-400 font-black hover:underline"
            >
              {isLogin ? (language === 'sw' ? 'Jisajili Hapa' : 'Register Here') : (language === 'sw' ? 'Ingia Hapa' : 'Login Here')}
            </button>
          </div>
        </div>
      </div>

      {showTerms && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Privacy & Terms of Service</h3>
              <button 
                onClick={() => setShowTerms(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              <section>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2">1. Agreement to Terms</h4>
                <p>By registering on Story Studio, you agree to these terms of service. If you do not agree to any part, you may not use the platform.</p>
              </section>
              <section>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2 text-red-600">2. Content Guidelines (Critical)</h4>
                <p className="bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-100 dark:border-red-950/30 font-medium text-red-700 dark:text-red-400">
                  We maintain extreme standard guidelines. Banned topics include: vulgar language, sexualized themes, profanity, harassment, adult romance content, and violence. 
                  Violation will result in immediate and permanent account suspension.
                </p>
              </section>
              <section>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2">3. Intellectual Property</h4>
                <p>You retain copyrights to your authored stories. By publishing here, you grant us permission to host and display the content to our users.</p>
              </section>
              <section>
                <h4 className="font-bold text-slate-900 dark:text-white mb-2">4. Privacy Policy</h4>
                <p>Your privacy is strictly guarded. We do not sell or share your personal emails or details with external parties.</p>
              </section>
              <p className="pt-4 border-t border-slate-100 dark:border-slate-800 italic text-slate-400 text-xs">Version 1.1 - Story Studio Compliance</p>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-center bg-slate-50 dark:bg-slate-900/50">
              <button 
                onClick={() => setShowTerms(false)}
                className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-colors"
              >
                {language === 'sw' ? 'Nimeelewa na Kukubali' : 'I Understand & Accept'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
