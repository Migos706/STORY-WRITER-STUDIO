import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Sparkles, 
  BookOpen, 
  User, 
  Shuffle, 
  Volume2, 
  VolumeX, 
  Copy, 
  Check, 
  Loader2, 
  Bookmark, 
  BookmarkCheck,
  RefreshCw, 
  ChevronRight, 
  Globe 
} from 'lucide-react';
import { useAuth } from '../App';
import { motion, AnimatePresence } from 'motion/react';
import { getApiUrl } from '../utils/api';

const SHUFFLE_PROMPTS = [
  {
    sw: "Simba mdogo mwoga aliyelazimika kulinda msitu baada ya simba wote wakubwa kupotea mazingira ya ajabu.",
    en: "A young, cowardly lion who must defend the savanna after all the adult lions mysteriously disappear."
  },
  {
    sw: "Msichana anayegundua kuwa bibi mlemavu wa kijiji ana uwezo wa kusafiri kwenda nyakati za kale kupitia kikapu cha sufu.",
    en: "A young girl discovering that the village's quiet elder has the power to travel to ancient times using a wool basket."
  },
  {
    sw: "Safari ya kijana mashuhuri kwenda mwezini kupitia mfano wa puto iliyotiwa nishati ya siri ya mimea yenye kung'aa.",
    en: "A legendary youth's journey to the moon utilizing a massive balloon powered by the glowing energy of ancient plants."
  },
  {
    sw: "Nyakati za jua kali ambapo kijiji kilikausha maji yote, lakini mtoto mmoja alijitolea kutafuta mlima mkubwa uliojaa theluji.",
    en: "A severe drought has dried up a remote village, but one child is determined to find a mystical snow-capped peak."
  },
  {
    sw: "Roboti wa kale anayeamka misituni na kukuta ndege wa rangi zote wanampenda na kumfundisha lugha yao takatifu.",
    en: "An ancient robot wakes up in the middle of a vibrant jungle and finds the local birds teaching him their sacred language."
  }
];

const GENRES = [
  { id: 'Fantasy', sw: 'Njozi (Fantasy)', en: 'Fantasy' },
  { id: 'Sci-Fi', sw: 'Sayansi (Sci-Fi)', en: 'Sci-Fi' },
  { id: 'Romance', sw: 'Mahaba (Romance)', en: 'Romance' },
  { id: 'Mystery', sw: 'Siri (Mystery)', en: 'Mystery' },
  { id: 'Education', sw: 'Elimu (Education)', en: 'Education' },
  { id: 'Comedy', sw: 'Vichekesho (Comedy)', en: 'Comedy' },
  { id: 'Horror', sw: 'Kutisha (Horror)', en: 'Horror' }
];

const MOODS = [
  { id: 'Happy', sw: 'Furaha', en: 'Happy' },
  { id: 'Sad', sw: 'Huzuni', en: 'Sad' },
  { id: 'Suspenseful', sw: 'Hamasa', en: 'Suspenseful' },
  { id: 'Calm', sw: 'Utulivu', en: 'Calm' },
  { id: 'Energetic', sw: 'Changamfu', en: 'Energetic' },
  { id: 'Dark', sw: 'Giza', en: 'Dark' }
];

const LOADING_STEPS = [
  { sw: "Inachambua sifa za mhusika na wazo lako...", en: "Analyzing character details and your premise..." },
  { sw: "AI inatengeneza mtiririko mzuri wa kisa...", en: "AI is sculpting a gripping storytelling arcs..." },
  { sw: "Inajaza misamiati yenye miguso na hisia kali...", en: "Weaving rich vocabulary and deep emotional touchpoints..." },
  { sw: "Inapitia usalama wa maudhui na kurekebisha sarufi...", en: "Ensuring content safety checks and polishing grammar..." },
  { sw: "Kila kitu tayari! Karibu usome...", en: "Done! Your masterpiece is fully assembled..." }
];

export default function StoryGenerator() {
  const { user, openAuthModal } = useAuth();
  
  // Form States
  const [premise, setPremise] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('Fantasy');
  const [selectedMood, setSelectedMood] = useState('Happy');
  const [language, setLanguage] = useState<'sw' | 'en'>('sw');
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  
  // Generation States
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [generatedStory, setGeneratedStory] = useState<{ title: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Audio & Utility States
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [synth, setSynth] = useState<SpeechSynthesis | null>(null);
  const [utterance, setUtterance] = useState<SpeechSynthesisUtterance | null>(null);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      setSynth(window.speechSynthesis);
    }
    
    // Cleanup synthesis on unmount
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Cycle loading messages when loading
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleShufflePrompt = () => {
    const randomIndex = Math.floor(Math.random() * SHUFFLE_PROMPTS.length);
    const selected = SHUFFLE_PROMPTS[randomIndex];
    setPremise(language === 'sw' ? selected.sw : selected.en);
    
    // Choose a random protagonist name if none exists
    if (!characterName) {
      const names = language === 'sw' 
        ? ['Mwendwa', 'Baraka', 'Neema', 'Juma', 'Kingo', 'Zuwena', 'Lulu']
        : ['Leo', 'Sophia', 'Lucas', 'Emma', 'Kai', 'Amara', 'Zephyr'];
      setCharacterName(names[Math.floor(Math.random() * names.length)]);
    }
  };

  const handleGenerateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!premise.trim()) return;

    setLoading(true);
    setError(null);
    setGeneratedStory(null);
    setIsSaved(false);
    
    // Stop any speech
    if (synth) {
      synth.cancel();
      setIsPlaying(false);
    }

    try {
      const gName = GENRES.find(g => g.id === selectedGenre)?.[language === 'sw' ? 'sw' : 'en'] || selectedGenre;
      const mName = MOODS.find(m => m.id === selectedMood)?.[language === 'sw' ? 'sw' : 'en'] || selectedMood;
      
      const response = await fetch(getApiUrl('/api/ai/generate-interactive-story'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          premise,
          characterName: characterName || 'An unnamed hero',
          genre: gName,
          mood: mName,
          language,
          length
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate story from server.");
      }

      const parsed = await response.json();
      
      if (!parsed.title || !parsed.content) {
        throw new Error("Missing parameters on parsed response");
      }
      
      setGeneratedStory(parsed);
    } catch (err: any) {
      console.error("AI Generation Error: ", err);
      setError(language === 'sw' 
        ? `Imeshindwa kuzalisha hadithi: ${err.message || 'Hitilafu isiyojulikana'}`
        : `Could not generate story: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!generatedStory) return;
    const fullText = `${generatedStory.title}\n\n${generatedStory.content}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReadAloud = () => {
    if (!generatedStory || !synth) return;

    if (isPlaying) {
      synth.cancel();
      setIsPlaying(false);
      return;
    }

    const fullTextToRead = `${generatedStory.title}. ${generatedStory.content}`;
    const newUtterance = new SpeechSynthesisUtterance(fullTextToRead);
    
    // Language matching
    newUtterance.lang = language === 'sw' ? 'sw-TZ' : 'en-US';
    
    // Choose appropriate rate
    newUtterance.rate = 0.95;

    newUtterance.onend = () => {
      setIsPlaying(false);
    };

    newUtterance.onerror = (e) => {
      console.error(e);
      setIsPlaying(false);
    };

    setUtterance(newUtterance);
    setIsPlaying(true);
    synth.speak(newUtterance);
  };

  const handleSaveToLibrary = async () => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (!generatedStory || saving) return;

    setSaving(true);
    const storyId = `custom_${Date.now()}`;
    const path = `users/${user.uid}/savedStories/${storyId}`;
    
    try {
      await setDoc(doc(db, path), {
        id: storyId,
        title: generatedStory.title,
        content: generatedStory.content,
        genre: selectedGenre,
        mood: selectedMood,
        authorName: "AI Creative Engine",
        isAICustom: true,
        createdAt: new Date().toISOString(),
        savedAt: serverTimestamp()
      });
      setIsSaved(true);
    } catch (err) {
      console.error("Error saving story to Firestore: ", err);
      alert(language === 'sw' 
        ? 'Imeshindwa kuhifadhi hadithi katika maktaba yako ya wingu.'
        : 'Failed to save the story into your cloud library.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-[2.5rem] p-6 md:p-10 shadow-sm transition-colors" id="ai-story-generator-section">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-extrabold text-sm uppercase tracking-widest mb-1">
            <Sparkles size={16} /> Hadithi Yako Maalum (Interactive)
          </div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white leading-tight">
            {language === 'sw' ? 'Tengeneza Hadithi Isiyo na Mfano' : 'Generate a Personalized Story'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-xl">
            {language === 'sw' 
              ? 'Weka wazo lako, jina la shujaa au mhusika anayevutiwa naye, kisha mruhusu Gemini aunde kitabu chako maalum papo hapo.'
              : 'Supply any premise, name your protagonist, configure the themes, and let Gemini weave a completely bespoke novel.'}
          </p>
        </div>
        
        {/* Language Toggler */}
        <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-800 p-1.5 rounded-[1.2rem] border border-slate-300/40 dark:border-slate-700/50">
          <button 
            type="button"
            onClick={() => setLanguage('sw')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${language === 'sw' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <Globe size={14} /> Swahili
          </button>
          <button 
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${language === 'en' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
          >
            <Globe size={14} /> English
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        
        {/* Left Side: Parameters Form */}
        <form onSubmit={handleGenerateStory} className="lg:col-span-5 flex flex-col gap-6 bg-white dark:bg-slate-900/60 p-6 rounded-[2rem] border border-slate-200/60 dark:border-slate-800/60">
          
          {/* Main Idea Premise with Shuffle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {language === 'sw' ? 'Wazo la Hadithi (Premise)' : 'Core Idea / Plot Premise'}
              </label>
              <button
                type="button"
                onClick={handleShufflePrompt}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 hover:text-indigo-700 active:scale-95 transition-all"
                title="Badilisha Wazo la Hadithi"
              >
                <Shuffle size={13} /> {language === 'sw' ? 'Bahatisha' : 'Shuffle'}
              </button>
            </div>
            
            <textarea
              required
              rows={3}
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              placeholder={language === 'sw' ? 'Mfano: Swila mweusi anayeishi jangwani anapewa jukumu la kulinda ufunguo wa dhahabu wa jiji la kale...' : 'e.g. A tiny green caterpillar dreams of flying over the highest mountains, and seeks help from a wise old owl...'}
              className="w-full text-sm p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none h-28 resize-none font-medium text-slate-900 dark:text-white transition-colors placeholder:text-slate-400 placeholder:font-normal"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Protagonist Name */}
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                {language === 'sw' ? 'Shujaa / Jina la Mhusika' : 'Protagonist / Hero Name'}
              </label>
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  required
                  placeholder={language === 'sw' ? 'Mfano: Kingo, Lulu' : 'e.g. Amara, Leo'}
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-white font-bold"
                />
              </div>
            </div>

            {/* Length parameter */}
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                {language === 'sw' ? 'Urefu wa Hadithi' : 'Story Length'}
              </label>
              <select
                value={length}
                onChange={(e) => setLength(e.target.value as any)}
                className="w-full py-3 px-4 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
              >
                <option value="short">{language === 'sw' ? 'Fupi' : 'Short'}</option>
                <option value="medium">{language === 'sw' ? 'Kati (Medium)' : 'Medium'}</option>
                <option value="long">{language === 'sw' ? 'Ndefu sana (Epic)' : 'Epic / Long'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Genre */}
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                {language === 'sw' ? 'Aina (Genre)' : 'Genre Category'}
              </label>
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="w-full py-3 px-4 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
              >
                {GENRES.map(g => (
                  <option key={g.id} value={g.id}>
                    {language === 'sw' ? g.sw : g.en}
                  </option>
                ))}
              </select>
            </div>

            {/* Mood */}
            <div>
              <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                {language === 'sw' ? 'Hisia (Mood)' : 'Story Tone'}
              </label>
              <select
                value={selectedMood}
                onChange={(e) => setSelectedMood(e.target.value)}
                className="w-full py-3 px-4 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
              >
                {MOODS.map(m => (
                  <option key={m.id} value={m.id}>
                    {language === 'sw' ? m.sw : m.en}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 active:scale-95 text-md disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span>{language === 'sw' ? 'Inatayarisha...' : 'Compiling...'}</span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span>{language === 'sw' ? 'Tengeneza Hadithi Leo' : 'Compose My Bespoke Story'}</span>
              </>
            )}
          </button>
        </form>

        {/* Right Side: Interactive Story Output Stage */}
        <div className="lg:col-span-7 flex flex-col bg-white dark:bg-slate-950 p-6 md:p-8 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-inner min-h-[400px]">
          <AnimatePresence mode="wait">
            {loading ? (
              /* Generation Loader Stage */
              <motion.div 
                key="loader"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-6"
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin"></div>
                  <Sparkles size={24} className="absolute inset-0 m-auto text-indigo-500 animate-pulse" />
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-extrabold text-slate-800 dark:text-white text-lg animate-pulse">
                    {language === 'sw' ? 'AI Inatunga Hadithi Yako' : 'AI Authoring Engine is Writing...'}
                  </h4>
                  <p className="text-slate-400 text-sm font-medium transition-colors max-w-sm">
                    {LOADING_STEPS[loadingStep][language]}
                  </p>
                </div>
                
                {/* Visual loading bars */}
                <div className="w-48 bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full transition-all duration-1000"
                    style={{ width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%` }}
                  />
                </div>
              </motion.div>
            ) : error ? (
              /* Error Display Mode */
              <motion.div 
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4"
              >
                <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-600 rounded-full">
                  <VolumeX size={32} />
                </div>
                <div className="space-y-1">
                  <h4 className="font-black text-slate-900 dark:text-red-400 text-lg">
                    {language === 'sw' ? 'Oops! Hitilafu Imetokea' : 'Error Occurred'}
                  </h4>
                  <p className="text-sm font-medium text-slate-400 max-w-md">{error}</p>
                </div>
                <button 
                  onClick={handleGenerateStory}
                  className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-6 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
                >
                  <RefreshCw size={14} /> {language === 'sw' ? 'Jaribu Tena' : 'Retry'}
                </button>
              </motion.div>
            ) : generatedStory ? (
              /* Render Generated Story Stage */
              <motion.div 
                key="story-outcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex-1 flex flex-col justify-between"
              >
                {/* Header Actions Panel */}
                <div className="border-b border-slate-100 dark:border-slate-800/80 pb-4 mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 font-black tracking-widest uppercase px-3 py-1 rounded-md border border-emerald-100 dark:border-emerald-900/30">
                       {language === 'sw' ? 'Imekamilika' : 'Generated'}
                    </span>
                    <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                      <BookOpen size={13} /> {selectedGenre}
                    </span>
                  </div>
                  
                  {/* Tooldeck */}
                  <div className="flex items-center gap-2">
                    {/* Speech Aloud Toggle */}
                    <button
                      onClick={handleReadAloud}
                      type="button"
                      className={`p-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1 text-xs font-bold active:scale-95 ${isPlaying ? 'bg-indigo-600 text-white shadow-indigo-600/10' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                      title={isPlaying ? "Stop" : "Soma kwa Sauti"}
                    >
                      {isPlaying ? <VolumeX size={15} /> : <Volume2 size={15} />}
                      <span>{isPlaying ? (language === 'sw' ? 'Nyamazisha' : 'Mute') : (language === 'sw' ? 'Soma' : 'AI Speech')}</span>
                    </button>

                    {/* Copy to Clipboard */}
                    <button
                      onClick={handleCopyToClipboard}
                      type="button"
                      className={`p-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1 text-xs font-bold active:scale-95 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700`}
                      title="Nakili Hadithi"
                    >
                      {isCopied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                      <span>{isCopied ? (language === 'sw' ? 'Imenakiliwa' : 'Copied!') : (language === 'sw' ? 'Nakili' : 'Copy')}</span>
                    </button>

                    {/* Save to library */}
                    <button
                      onClick={handleSaveToLibrary}
                      type="button"
                      disabled={saving || isSaved}
                      className={`p-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1 text-xs font-bold active:scale-95 ${isSaved ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-100 dark:border-emerald-900/30' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                      title="Hifadhi Maktabani"
                    >
                      {saving ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : isSaved ? (
                        <BookmarkCheck size={15} className="text-emerald-600" />
                      ) : (
                        <Bookmark size={15} />
                      )}
                      <span>
                        {saving 
                          ? (language === 'sw' ? 'Inahifadhi...' : 'Saving...') 
                          : isSaved 
                          ? (language === 'sw' ? 'Imehifadhiwa' : 'Saved') 
                          : (language === 'sw' ? 'Hifadhi' : 'Save')}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Story Body Stage */}
                <div className="flex-1 overflow-y-auto pr-0 md:pr-2 max-h-[380px] space-y-4 font-sans select-text scrollbar-thin">
                  <h3 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white-100 tracking-tight leading-tight">
                    {generatedStory.title}
                  </h3>
                  
                  <div className="text-slate-700 dark:text-slate-300 text-md leading-relaxed whitespace-pre-line font-medium space-y-3">
                    {generatedStory.content}
                  </div>
                </div>
                
                {/* CTA / Reset options */}
                <div className="border-t border-slate-50 dark:border-slate-800/60 pt-4 mt-6 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl">
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-bold">
                    {language === 'sw' 
                      ? '© Story Studio Custom Maker' 
                      : '© Bespoke AI Creative Library'}
                  </span>
                  
                  <button 
                    type="button"
                    onClick={() => {
                      setGeneratedStory(null);
                      if (synth) synth.cancel();
                      setIsPlaying(false);
                    }}
                    className="text-xs font-black text-indigo-600 dark:text-indigo-400 p-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl transition-all flex items-center gap-1"
                  >
                    <RefreshCw size={12} /> {language === 'sw' ? 'Andika Mpya' : 'Write Another'}
                  </button>
                </div>
              </motion.div>
            ) : (
              /* Idle Empty State */
              <motion.div 
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4"
              >
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl flex items-center justify-center text-indigo-500 shadow-inner">
                  <Sparkles size={28} className="animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-lg">
                    {language === 'sw' ? 'Hadithi Yako ya Kipekee Itatokea Hapa' : 'Your Customized Story Appears Here'}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm leading-relaxed font-bold">
                    {language === 'sw' 
                      ? 'Katibu wetu wa kufikiria bado anasubiri kupata maagizo yako hapo kushoto. Mpe wazo ambalo hajapata kusikia hapo awali!'
                      : 'Our creative writing engine is resting quietly, waiting for your instruction on the left side. Inspire him to compose!'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleShufflePrompt}
                  className="bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black tracking-widest text-[11px] uppercase py-2.5 px-6 rounded-xl transition-all flex items-center gap-1.5 border border-indigo-100/50 dark:border-indigo-900/50 active:scale-95"
                >
                  <Shuffle size={12} /> {language === 'sw' ? 'Nipe Hadithi ya Kubahatisha' : 'Give Me a Random Prompt'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
