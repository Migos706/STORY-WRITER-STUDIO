import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../App';
import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, Image as ImageIcon, Send, BookOpen, CheckCircle2, ArrowRight, ArrowLeft, Plus, Trash2, Globe, Sparkles, Wand2 } from 'lucide-react';
import { locales, Language } from '../locales';
import { getApiUrl } from '../utils/api';

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
      userId: undefined,
      email: undefined,
      emailVerified: undefined,
      isAnonymous: undefined,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Genre Options for Step 4
const GENRES = ['Njozi (Fantasy)', 'Sayansi (Sci-Fi)', 'Mahaba (Romance)', 'Siri (Mystery)', 'Elimu (Education)', 'Vichekesho (Comedy)', 'Kutisha (Horror)', 'Adventure (Adventures)', 'Poetry (Mashairi)'];
const MOODS = ['Furaha (Joyful)', 'Huzuni (Melancholy)', 'Hamasa (Inspiring)', 'Utulivu (Calm)', 'Changamfu (Energetic)', 'Kivutio (Seductive)', 'Giza (Dark)', 'Linalovutia (Suspenseful)'];

export default function AuthorPanel() {
  const { profile, user, language } = useAuth();
  const t = locales[language || 'sw'];

  const [subTab, setSubTab] = useState<'create' | 'manage'>('create');
  
  // --- Story Wizard Configuration States ---
  const [wizardStep, setWizardStep] = useState(1);

  // Step 1: Story Information
  const [premise, setPremise] = useState('');
  const [title, setTitle] = useState('');
  const [writingStyle, setWritingStyle] = useState('styleDramatic'); // Poetic, Suspense, Simple, Dramatic
  const [targetAudience, setTargetAudience] = useState('audienceTeenagers'); // Children, Teenagers, Adults

  // Step 2: Characters Cast
  const [cast, setCast] = useState<any[]>([]);
  const [charForm, setCharForm] = useState({
    name: '',
    role: 'Hero', // Hero, Villain, Friend, Mentor
    age: '',
    gender: 'Male',
    appearance: '',
    weaknesses: '',
    goals: '',
    relationships: ''
  });
  const [isAutocompletingChar, setIsAutocompletingChar] = useState(false);

  // Step 3: World Building
  const [world, setWorld] = useState({
    name: '',
    locations: '',
    timePeriod: '',
    culture: '',
    rules: '',
    magicSystem: '',
    technology: '',
    environment: ''
  });

  // Step 4: Literary Genre & General Mood
  const [mainGenre, setMainGenre] = useState(GENRES[0]);
  const [selectedSubGenres, setSelectedSubGenres] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState(MOODS[2]); // Inspiring
  const [storyLanguage, setStoryLanguage] = useState<Language>(language || 'sw');

  // Step 5: AI Engine Settings
  const [storyLength, setStoryLength] = useState<'short' | 'medium' | 'long' | 'epic'>('medium');
  const [illustratedStory, setIllustratedStory] = useState(true);
  const [visualStyle, setVisualStyle] = useState('Fantasy'); // Anime, Cartoon, Realistic, Fantasy, Children

  // Step 6: Compilation & Progression States
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    chapterIndex: number;
    totalChapters: number;
    log: string;
  }>({ chapterIndex: 0, totalChapters: 0, log: '' });

  // Finished Generated Work State
  const [generatedChapters, setGeneratedChapters] = useState<any[]>([]);
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [generatedCover, setGeneratedCover] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // --- Chapter Management Panel States (SubTab === 'manage') ---
  const [authorStories, setAuthorStories] = useState<any[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [selectedManageStory, setSelectedManageStory] = useState<any | null>(null);
  
  const [chapters, setChapters] = useState<any[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [chapterOrder, setChapterOrder] = useState<number>(1);
  const [isSavingChapter, setIsSavingChapter] = useState(false);

  const canPublish = profile?.role === 'author' || profile?.role === 'admin';

  useEffect(() => {
    if (subTab === 'manage') {
      fetchAuthorStories();
    }
  }, [subTab]);

  const fetchAuthorStories = async () => {
    if (!profile) return;
    setLoadingStories(true);
    const path = 'stories';
    try {
      const q = query(collection(db, path), where('authorId', '==', profile.uid), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setAuthorStories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.LIST, path);
    } finally {
      setLoadingStories(false);
    }
  };

  const fetchChapters = async (storyId: string) => {
    setLoadingChapters(true);
    const path = `stories/${storyId}/chapters`;
    try {
      const q = query(collection(db, path), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChapters(list);
      setChapterOrder(list.length + 1);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.LIST, path);
    } finally {
      setLoadingChapters(false);
    }
  };

  const handleSelectStoryForChapters = (story: any) => {
    setSelectedManageStory(story);
    fetchChapters(story.id);
  };

  const handleSaveChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManageStory || !chapterTitle.trim() || !chapterContent.trim()) return;
    setIsSavingChapter(true);
    const storyId = selectedManageStory.id;
    const path = editingChapterId 
      ? `stories/${storyId}/chapters/${editingChapterId}` 
      : `stories/${storyId}/chapters`;
      
    try {
      if (editingChapterId) {
        await updateDoc(doc(db, `stories/${storyId}/chapters`, editingChapterId), {
          title: chapterTitle,
          content: chapterContent,
          order: Number(chapterOrder)
        });
        setSuccessMessage('Sura imesasishwa kikamilifu!');
      } else {
        await addDoc(collection(db, `stories/${storyId}/chapters`), {
          storyId,
          title: chapterTitle,
          content: chapterContent,
          order: Number(chapterOrder),
          createdAt: new Date().toISOString()
        });
        setSuccessMessage('Sura mpya imeongezwa kikamilifu!');
      }
      
      setChapterTitle('');
      setChapterContent('');
      setEditingChapterId(null);
      fetchChapters(storyId);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, editingChapterId ? OperationType.UPDATE : OperationType.CREATE, path);
    } finally {
      setIsSavingChapter(false);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!selectedManageStory) return;
    if (!window.confirm("Je, una uhakika unataka kufuta sura hii?")) return;
    const storyId = selectedManageStory.id;
    const path = `stories/${storyId}/chapters/${chapterId}`;
    try {
      await deleteDoc(doc(db, `stories/${storyId}/chapters`, chapterId));
      setSuccessMessage('Sura imefutwa mafanikio.');
      fetchChapters(storyId);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleStartEditChapter = (chap: any) => {
    setEditingChapterId(chap.id);
    setChapterTitle(chap.title);
    setChapterContent(chap.content);
    setChapterOrder(chap.order);
  };

  const handleCancelEditChapter = () => {
    setEditingChapterId(null);
    setChapterTitle('');
    setChapterContent('');
    setChapterOrder(chapters.length + 1);
  };

  // --- Character AI Autocomplete ---
  const handleAutocompleteCharacter = async () => {
    if (!charForm.name.trim()) {
      setErrorMessage("Please enter a character name first.");
      return;
    }
    setIsAutocompletingChar(true);
    setErrorMessage('');
    try {
      const response = await fetch(getApiUrl('/api/ai/generate-character'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: charForm.name,
          role: charForm.role,
          age: charForm.age,
          gender: charForm.gender,
          personality: charForm.personality,
          abilities: charForm.abilities,
          genre: mainGenre
        })
      });

      if (!response.ok) {
        throw new Error("Failed to autocomplete character.");
      }

      const data = await response.json();
      setCharForm(prev => ({
        ...prev,
        bio: data.bio || '',
        appearance: prev.appearance || "A striking individual matching their backstory",
        weaknesses: prev.weaknesses || "Too trusting of strangers",
        goals: prev.goals || "To restore peace to their homeland",
        relationships: prev.relationships || "Loyal companion to allies",
        abilities: prev.abilities || "Exquisite tactical intellect"
      }));

      // Add portrait to charForm data
      (charForm as any).imageUrl = data.imageUrl;

      setSuccessMessage("Character background and portrait autocompleted with AI!");
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Character autocomplete failed: " + err.message);
    } finally {
      setIsAutocompletingChar(false);
    }
  };

  const handleAddCharacterToCast = () => {
    if (!charForm.name.trim()) return;
    setCast([...cast, { id: Date.now().toString(), ...charForm }]);
    setCharForm({
      name: '',
      role: 'Hero',
      age: '',
      gender: 'Male',
      appearance: '',
      weaknesses: '',
      goals: '',
      relationships: ''
    });
    setSuccessMessage("Character added to story cast!");
  };

  const handleRemoveCharacterFromCast = (id: string) => {
    setCast(cast.filter(c => c.id !== id));
  };

  const handleNextStep = () => {
    if (wizardStep === 1 && !premise.trim()) {
      setErrorMessage("Story premise is required to formulate the plot!");
      return;
    }
    setErrorMessage('');
    setWizardStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setErrorMessage('');
    setWizardStep(prev => prev - 1);
  };

  // --- Wizard Step 6: Progressive Story Generation ---
  const handleBeginStoryGeneration = async () => {
    setIsGenerating(true);
    setErrorMessage('');
    setSuccessMessage('');
    setGeneratedChapters([]);
    
    let totalChapters = 2;
    if (storyLength === 'short') totalChapters = 2;
    else if (storyLength === 'medium') totalChapters = 3;
    else if (storyLength === 'long') totalChapters = 4;
    else if (storyLength === 'epic') totalChapters = 5;

    setGenerationProgress({
      chapterIndex: 0,
      totalChapters,
      log: 'Initializing professional AI Writer engine...'
    });

    const accumulatedChapters: any[] = [];
    let bookTitle = title || '';

    try {
      for (let i = 1; i <= totalChapters; i++) {
        setGenerationProgress(prev => ({
          ...prev,
          chapterIndex: i,
          log: `AI Novelist is composing Chapter ${i} of ${totalChapters}... Please wait, writing detailed narrative prose.`
        }));

        // Call server API for chapter generation
        const chapterRes = await fetch(getApiUrl('/api/ai/generate-chapter'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            premise,
            title: bookTitle,
            genre: mainGenre,
            mood: selectedMood,
            style: writingStyle,
            audience: targetAudience,
            characters: cast,
            world,
            chapterNumber: i,
            totalChapters,
            previousChapters: accumulatedChapters.map(c => ({
              chapterNumber: c.order,
              title: c.title,
              content: c.content
            })),
            language: storyLanguage,
            visualStyle
          })
        });

        if (!chapterRes.ok) {
          throw new Error(`Failed to generate Chapter ${i}.`);
        }

        const chapterData = await chapterRes.json();
        if (i === 1 && !bookTitle) {
          bookTitle = chapterData.title || 'AI Masterpiece';
        }

        let chapterImageUrl = '';
        if (illustratedStory && chapterData.imagePrompt) {
          setGenerationProgress(prev => ({
            ...prev,
            log: `Chapter ${i} written successfully! Now painting illustration using "${visualStyle}" art style...`
          }));

          const imgRes = await fetch(getApiUrl('/api/ai/generate-chapter-illustration'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imagePrompt: chapterData.imagePrompt,
              visualStyle
            })
          });

          if (imgRes.ok) {
            const imgData = await imgRes.json();
            chapterImageUrl = imgData.imageUrl;
          }
        }

        accumulatedChapters.push({
          order: i,
          title: chapterData.title || `Chapter ${i}`,
          content: chapterData.content || '',
          imageUrl: chapterImageUrl || ''
        });

        setGeneratedChapters([...accumulatedChapters]);
      }

      setGeneratedTitle(bookTitle || 'Siri ya Hadithi');
      // Set book cover image to the first chapter's illustration
      if (accumulatedChapters[0]?.imageUrl) {
        setGeneratedCover(accumulatedChapters[0].imageUrl);
      }

      setGenerationProgress(prev => ({
        ...prev,
        log: 'Polishing literary prose, checking structural compliance, and completing compilation!'
      }));

      setSuccessMessage("Your multi-chapter professional book has been successfully crafted!");
      setWizardStep(7); // Show finished preview
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Generation failed: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Save / Publish Compiled Book ---
  const handleSaveAndPublishCompiledStory = async (isDraft: boolean) => {
    if (!generatedTitle || generatedChapters.length === 0) return;
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      let finalCover = generatedCover;

      // Prepare story data
      const storyPayload = {
        authorId: profile?.uid || user?.uid || 'anonymous',
        authorName: profile?.displayName || 'Author AI',
        title: generatedTitle,
        content: generatedChapters[0]?.content?.substring(0, 500) + "...", // Intro summary
        genre: mainGenre,
        mood: selectedMood,
        imageUrl: finalCover || '',
        status: isDraft ? 'draft' : (profile?.role === 'admin' ? 'approved' : 'pending'),
        safetyStatus: 'unchecked',
        createdAt: new Date().toISOString()
      };

      // Add to Firestore stories collection
      const storiesRef = collection(db, 'stories');
      const docRef = await addDoc(storiesRef, storyPayload);

      // Now create each chapter in subcollection
      for (const chap of generatedChapters) {
        await addDoc(collection(db, `stories/${docRef.id}/chapters`), {
          storyId: docRef.id,
          title: chap.title,
          content: chap.content,
          imageUrl: chap.imageUrl || '',
          order: chap.order,
          createdAt: new Date().toISOString()
        });
      }

      setSuccessMessage(isDraft ? t.draftSuccess : t.publishSuccess);
      // Reset wizard
      setWizardStep(1);
      setPremise('');
      setTitle('');
      setCast([]);
      setGeneratedChapters([]);
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Failed to save and persist story: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center text-slate-500">
        <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
        <p className="text-xl font-bold">Inapakia profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto bg-white dark:bg-slate-900 p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 transition-colors animate-in fade-in duration-500">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 dark:border-slate-800 pb-8 mb-8 gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="text-indigo-600 dark:text-indigo-400 animate-pulse" size={40} />
            {t.wizardTitle}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t.wizardSubtitle}</p>
        </div>

        {/* Tab Selection */}
        {canPublish && (
          <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setSubTab('create')}
              className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${subTab === 'create' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
            >
              Uandishi Mpya (Wizard)
            </button>
            <button
              onClick={() => setSubTab('manage')}
              className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${subTab === 'manage' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
            >
              Simamia Sura (Chapters)
            </button>
          </div>
        )}
      </div>

      {/* Alert Messages */}
      {successMessage && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 p-6 rounded-2xl mb-8 border border-emerald-100 dark:border-emerald-900/40 flex items-center gap-3 font-bold">
          <CheckCircle2 size={24} />
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400 p-6 rounded-2xl mb-8 border border-rose-100 dark:border-rose-900/40 flex items-center gap-3 font-bold">
          <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
          {errorMessage}
        </div>
      )}

      {/* ==================== SUBTAB: CREATE (WIZARD FLOW) ==================== */}
      {subTab === 'create' && (
        <div>
          {/* Steps Progress Visual Bar */}
          {wizardStep <= 6 && (
            <div className="mb-12">
              <div className="grid grid-cols-6 gap-2 text-center text-xs font-black uppercase tracking-wider text-slate-400">
                {[1, 2, 3, 4, 5, 6].map((step) => (
                  <div key={step} className="flex flex-col items-center">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center border font-bold transition-all mb-2 ${wizardStep === step ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/30' : wizardStep > step ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                      {step}
                    </span>
                    <span className={`hidden md:inline ${wizardStep === step ? 'text-indigo-600 dark:text-indigo-400 font-black' : ''}`}>
                      {t[`step${step}` as keyof typeof t] || `Step ${step}`}
                    </span>
                  </div>
                ))}
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full mt-6 overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-500" 
                  style={{ width: `${((wizardStep - 1) / 5) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* STEP 1: Story Information */}
          {wizardStep === 1 && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="p-8 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-2xl font-black mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <Sparkles className="text-indigo-600" />
                  {t.storyIdeaPremise}
                </h3>
                <p className="text-sm text-slate-500 mb-6">{t.storyIdeaPremisePlaceholder}</p>
                <textarea
                  required
                  value={premise}
                  onChange={(e) => setPremise(e.target.value)}
                  className="w-full p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2rem] outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-950 text-lg dark:text-white font-medium h-40 resize-none transition-all"
                  placeholder="Elezea wazo lako kuu au jinsi gani mwanzo wa hadithi unapaswa kuwa..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-widest">{t.storyTitlePref}</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-lg dark:text-white font-bold transition-all"
                    placeholder={t.storyTitlePlaceholder}
                  />
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-widest">{t.writingStyle}</label>
                  <select
                    value={writingStyle}
                    onChange={(e) => setWritingStyle(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-lg dark:text-white font-bold transition-all"
                  >
                    <option value="stylePoetic">{t.stylePoetic}</option>
                    <option value="styleSuspense">{t.styleSuspense}</option>
                    <option value="styleSimple">{t.styleSimple}</option>
                    <option value="styleDramatic">{t.styleDramatic}</option>
                  </select>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={handleNextStep}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
                >
                  {t.next} <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Character Creation */}
          {wizardStep === 2 && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="p-8 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-2xl font-black mb-2 text-slate-800 dark:text-slate-100">{t.charSetupTitle}</h3>
                <p className="text-sm text-slate-500">{t.charSetupSubtitle}</p>
              </div>

              {/* Added characters list */}
              {cast.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {cast.map((c) => (
                    <div key={c.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl flex flex-col justify-between group relative overflow-hidden">
                      <div>
                        {c.imageUrl && (
                          <img src={c.imageUrl} alt={c.name} className="w-16 h-16 rounded-full object-cover mb-4 ring-4 ring-indigo-50 shadow-md" />
                        )}
                        <h4 className="font-black text-lg text-slate-900 dark:text-white">{c.name}</h4>
                        <span className="inline-block text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md mt-1 mb-3">{c.role}</span>
                        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mt-2">{c.bio || c.appearance}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveCharacterFromCast(c.id)}
                        className="absolute top-4 right-4 p-2 bg-rose-50 text-rose-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Form to add a character */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-3xl p-8 space-y-6">
                <h4 className="text-xl font-black flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <Plus className="text-indigo-600" /> Unda na Ongeza Mhusika Mpya
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">{t.charName}</label>
                    <input
                      type="text"
                      value={charForm.name}
                      onChange={(e) => setCharForm({...charForm, name: e.target.value})}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold dark:text-white"
                      placeholder="e.g., Juma, Sarah"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">{t.charRole}</label>
                    <select
                      value={charForm.role}
                      onChange={(e) => setCharForm({...charForm, role: e.target.value})}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold dark:text-white"
                    >
                      <option value="Hero">{t.charRoleHero}</option>
                      <option value="Villain">{t.charRoleVillain}</option>
                      <option value="Friend">{t.charRoleFriend}</option>
                      <option value="Mentor">{t.charRoleMentor}</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={isAutocompletingChar || !charForm.name.trim()}
                      onClick={handleAutocompleteCharacter}
                      className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-black p-4 rounded-2xl transition-all border border-indigo-100/40 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                      {isAutocompletingChar ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                      Kamilisha wasifu na Picha kwa AI
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">{t.charAppearance}</label>
                    <textarea
                      value={charForm.appearance}
                      onChange={(e) => setCharForm({...charForm, appearance: e.target.value})}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none font-medium dark:text-white"
                      placeholder="Mrefu, amevalia kanzu ya kijivu, macho yenye mwangaza..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase mb-2">{t.charWeaknesses}</label>
                    <textarea
                      value={charForm.weaknesses}
                      onChange={(e) => setCharForm({...charForm, weaknesses: e.target.value})}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none font-medium dark:text-white"
                      placeholder="Mwepesi wa hasira, anaamini kila mtu..."
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleAddCharacterToCast}
                    disabled={!charForm.name.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8 py-3 rounded-xl transition-all shadow-md flex items-center gap-1 active:scale-95 disabled:opacity-50"
                  >
                    <Plus size={18} /> {t.addCharBtn}
                  </button>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                <button
                  onClick={handlePrevStep}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black px-8 py-4 rounded-2xl transition-all flex items-center gap-2"
                >
                  <ArrowLeft size={20} /> {t.prev}
                </button>
                <button
                  onClick={handleNextStep}
                  disabled={cast.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {t.next} <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: World Building */}
          {wizardStep === 3 && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="p-8 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-2xl font-black mb-2 text-slate-800 dark:text-slate-100">{t.worldBuildingTitle}</h3>
                <p className="text-sm text-slate-500">{t.worldBuildingSubtitle}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">{t.worldName}</label>
                  <input
                    type="text"
                    value={world.name}
                    onChange={(e) => setWorld({...world, name: e.target.value})}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold dark:text-white"
                    placeholder="e.g., Milima ya Giza, Kisiwa cha Kwanza"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">{t.worldTimePeriod}</label>
                  <input
                    type="text"
                    value={world.timePeriod}
                    onChange={(e) => setWorld({...world, timePeriod: e.target.value})}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold dark:text-white"
                    placeholder="e.g., Zama za Kati, Nyakati za Kale"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">{t.worldCulture}</label>
                  <textarea
                    value={world.culture}
                    onChange={(e) => setWorld({...world, culture: e.target.value})}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 h-28 resize-none font-medium dark:text-white"
                    placeholder="Mila na tamaduni za ulimwengu huu..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">{t.worldRules}</label>
                  <textarea
                    value={world.rules}
                    onChange={(e) => setWorld({...world, rules: e.target.value})}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 h-28 resize-none font-medium dark:text-white"
                    placeholder="Sheria za maisha, fizikia au miiko ya jamii..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">{t.worldMagicSystem}</label>
                  <textarea
                    value={world.magicSystem}
                    onChange={(e) => setWorld({...world, magicSystem: e.target.value})}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 h-28 resize-none font-medium dark:text-white"
                    placeholder="Mihuri, uganga, au sayansi iliyopitiliza ya miujiza..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">{t.worldEnvironment}</label>
                  <textarea
                    value={world.environment}
                    onChange={(e) => setWorld({...world, environment: e.target.value})}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 h-28 resize-none font-medium dark:text-white"
                    placeholder="Hali ya hewa, milima, vyanzo vya maji na mazingira..."
                  />
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                <button
                  onClick={handlePrevStep}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black px-8 py-4 rounded-2xl transition-all flex items-center gap-2"
                >
                  <ArrowLeft size={20} /> {t.prev}
                </button>
                <button
                  onClick={handleNextStep}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-2 hover:-translate-y-0.5"
                >
                  {t.next} <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Literary Genre & General Mood */}
          {wizardStep === 4 && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="p-8 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-2xl font-black mb-2 text-slate-800 dark:text-slate-100">{t.genreMoodTitle}</h3>
                <p className="text-sm text-slate-500">{t.genreMoodSubtitle}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-widest">{t.mainGenreLabel}</label>
                  <select
                    value={mainGenre}
                    onChange={(e) => setMainGenre(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold dark:text-white"
                  >
                    {GENRES.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-widest">{t.moodLabel}</label>
                  <select
                    value={selectedMood}
                    onChange={(e) => setSelectedMood(e.target.value)}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold dark:text-white"
                  >
                    {MOODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-widest">{t.languageLabel}</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setStoryLanguage('sw')}
                    className={`flex-1 p-4 rounded-2xl border font-black transition-all flex items-center justify-center gap-2 ${storyLanguage === 'sw' ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                  >
                    <Globe size={18} /> Swahili (Kiswahili kisanifu)
                  </button>
                  <button
                    onClick={() => setStoryLanguage('en')}
                    className={`flex-1 p-4 rounded-2xl border font-black transition-all flex items-center justify-center gap-2 ${storyLanguage === 'en' ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                  >
                    <Globe size={18} /> English (US / UK Literary)
                  </button>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                <button
                  onClick={handlePrevStep}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black px-8 py-4 rounded-2xl transition-all flex items-center gap-2"
                >
                  <ArrowLeft size={20} /> {t.prev}
                </button>
                <button
                  onClick={handleNextStep}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-2 hover:-translate-y-0.5"
                >
                  {t.next} <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: AI Engine Settings */}
          {wizardStep === 5 && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="p-8 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800">
                <h3 className="text-2xl font-black mb-2 text-slate-800 dark:text-slate-100">{t.aiOptionsTitle}</h3>
                <p className="text-sm text-slate-500">{t.aiOptionsSubtitle}</p>
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-4 uppercase tracking-widest">{t.storyLengthLabel}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => setStoryLength('short')}
                    className={`p-6 rounded-2xl border text-left transition-all flex flex-col justify-between ${storyLength === 'short' ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 ring-2 ring-indigo-500/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                  >
                    <span className="font-black text-lg text-slate-800 dark:text-slate-100">Hadithi Fupi</span>
                    <p className="text-xs text-slate-400 mt-2">{t.lengthShort}</p>
                  </button>
                  <button
                    onClick={() => setStoryLength('medium')}
                    className={`p-6 rounded-2xl border text-left transition-all flex flex-col justify-between ${storyLength === 'medium' ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 ring-2 ring-indigo-500/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                  >
                    <span className="font-black text-lg text-slate-800 dark:text-slate-100">Hadithi ya Kati</span>
                    <p className="text-xs text-slate-400 mt-2">{t.lengthMedium}</p>
                  </button>
                  <button
                    onClick={() => setStoryLength('long')}
                    className={`p-6 rounded-2xl border text-left transition-all flex flex-col justify-between ${storyLength === 'long' ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 ring-2 ring-indigo-500/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                  >
                    <span className="font-black text-lg text-slate-800 dark:text-slate-100">Hadithi Ndefu</span>
                    <p className="text-xs text-slate-400 mt-2">{t.lengthLong}</p>
                  </button>
                  <button
                    onClick={() => setStoryLength('epic')}
                    className={`p-6 rounded-2xl border text-left transition-all flex flex-col justify-between ${storyLength === 'epic' ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 ring-2 ring-indigo-500/20' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                  >
                    <span className="font-black text-lg text-slate-800 dark:text-slate-100">Riwaya ya Kijasiri (Epic Novel)</span>
                    <p className="text-xs text-slate-400 mt-2">{t.lengthEpic}</p>
                  </button>
                </div>
              </div>

              {/* Illustrated story configuration */}
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-[2rem] p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-lg text-slate-800 dark:text-slate-100">{t.illustratedStoryLabel}</h4>
                    <p className="text-sm text-slate-500 mt-1">{t.illustratedStoryDesc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={illustratedStory}
                    onChange={(e) => setIllustratedStory(e.target.checked)}
                    className="w-12 h-6 bg-slate-200 rounded-full cursor-pointer relative appearance-none checked:bg-indigo-600 transition-all after:content-[''] after:absolute after:w-5 after:h-5 after:rounded-full after:bg-white after:top-0.5 after:left-0.5 checked:after:left-6.5 after:transition-all"
                  />
                </div>

                {illustratedStory && (
                  <div className="pt-6 border-t border-slate-200/50 dark:border-slate-700/50">
                    <label className="block text-xs font-black text-slate-400 uppercase mb-3">{t.visualStyleLabel}</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                      {[
                        { id: 'Anime', label: t.styleAnime },
                        { id: 'Cartoon', label: t.styleCartoon },
                        { id: 'Realistic', label: t.styleRealistic },
                        { id: 'Fantasy', label: t.styleFantasy },
                        { id: 'Children', label: t.styleChildren }
                      ].map((styleOption) => (
                        <button
                          key={styleOption.id}
                          onClick={() => setVisualStyle(styleOption.id)}
                          className={`p-4 rounded-xl border font-black text-xs transition-all text-center ${visualStyle === styleOption.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                        >
                          {styleOption.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                <button
                  onClick={handlePrevStep}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black px-8 py-4 rounded-2xl transition-all flex items-center gap-2"
                >
                  <ArrowLeft size={20} /> {t.prev}
                </button>
                <button
                  onClick={handleNextStep}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-2 hover:-translate-y-0.5"
                >
                  {t.next} <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: Review & Final Synthesis */}
          {wizardStep === 6 && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="p-8 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 text-center">
                <h3 className="text-3xl font-black mb-2 text-slate-800 dark:text-slate-100">{t.compileTitle}</h3>
                <p className="text-sm text-slate-500 max-w-lg mx-auto">{t.compileSubtitle}</p>
              </div>

              {/* Review card summary */}
              <div className="bg-slate-50 dark:bg-slate-800/30 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 space-y-6">
                <h4 className="text-xl font-black text-indigo-600 dark:text-indigo-400 border-b border-slate-100 dark:border-slate-800 pb-4">Story configuration overview</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <p><strong>Wazo la Hadithi:</strong> {premise}</p>
                  <p><strong>Title:</strong> {title || 'Uamuzi wa AI'}</p>
                  <p><strong>Genre & Mood:</strong> {mainGenre} • {selectedMood}</p>
                  <p><strong>Language:</strong> {storyLanguage === 'en' ? 'English' : 'Kiswahili kisanifu'}</p>
                  <p><strong>Cast count:</strong> {cast.length} characters added</p>
                  <p><strong>Style:</strong> {visualStyle} Illustrated ({storyLength} chapters)</p>
                </div>
              </div>

              {/* Composition Progressive Log UI */}
              {isGenerating && (
                <div className="bg-slate-900 text-slate-100 p-8 rounded-[2rem] border border-slate-800 space-y-6 animate-pulse">
                  <div className="flex items-center gap-4">
                    <Loader2 className="animate-spin text-indigo-400" size={32} />
                    <div>
                      <h4 className="font-bold text-lg text-white">{t.generatingNovelist}</h4>
                      <p className="text-xs text-slate-400">Chapter {generationProgress.chapterIndex} of {generationProgress.totalChapters}</p>
                    </div>
                  </div>
                  <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 font-mono text-xs text-indigo-300/90 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
                    {generationProgress.log}
                  </div>
                </div>
              )}

              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                <button
                  disabled={isGenerating}
                  onClick={handlePrevStep}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black px-8 py-4 rounded-2xl transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <ArrowLeft size={20} /> {t.prev}
                </button>
                <button
                  disabled={isGenerating}
                  onClick={handleBeginStoryGeneration}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black px-12 py-5 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-2 active:scale-95 hover:brightness-110 disabled:opacity-50 text-lg"
                >
                  {isGenerating ? <Loader2 className="animate-spin" size={24} /> : <Wand2 size={24} />}
                  {t.startGenerationBtn}
                </button>
              </div>
            </div>
          )}

          {/* STEP 7: Completed Book Preview and Save / Publish */}
          {wizardStep === 7 && (
            <div className="space-y-10 animate-in fade-in duration-500">
              <div className="bg-slate-50 dark:bg-slate-800/40 p-8 rounded-[2.5rem] text-center border border-slate-100 dark:border-slate-800">
                <h3 className="text-3xl font-black text-emerald-600 mb-2 flex items-center justify-center gap-2">
                  <CheckCircle2 /> Kitabu Kimeandikwa Kikamilifu!
                </h3>
                <p className="text-slate-500 max-w-md mx-auto">Tazama kazi ya uandishi ya AI hapa chini na uchague hatua ya kuihifadhi kwenye Maktaba.</p>
              </div>

              {/* Story visual representation */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-8 md:p-12 rounded-[3rem] shadow-lg max-w-4xl mx-auto space-y-12">
                <div className="text-center">
                  <h2 className="text-4xl font-black text-slate-900 dark:text-white leading-tight">{generatedTitle}</h2>
                  <p className="text-slate-400 uppercase tracking-widest text-xs font-black mt-2">Kazi ya Fasihi • Mwandishi: AI Novelist</p>
                </div>

                {generatedCover && (
                  <img src={generatedCover} alt="Story cover" className="w-full h-96 object-cover rounded-[2rem] shadow-md" />
                )}

                {/* Chapter by chapter scroll */}
                <div className="space-y-16">
                  {generatedChapters.map((chap, idx) => (
                    <div key={idx} className="border-t border-slate-100 dark:border-slate-800 pt-10 space-y-8">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
                          Sura ya {chap.order}: {chap.title}
                        </h3>
                      </div>

                      {chap.imageUrl && (
                        <img src={chap.imageUrl} alt={chap.title} className="w-full h-80 object-cover rounded-2xl shadow-sm" />
                      )}

                      <div className="prose prose-indigo dark:prose-invert max-w-none text-slate-700 dark:text-slate-300">
                        {chap.content.split('\n\n').map((para: string, pIdx: number) => (
                          <p key={pIdx} className="mb-6 text-xl leading-relaxed font-serif">{para}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit panel */}
              <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 justify-end">
                <button
                  onClick={() => setWizardStep(1)}
                  disabled={isSaving}
                  className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black px-8 py-4 rounded-xl transition-all disabled:opacity-50"
                >
                  Unda Kitabu Kingine
                </button>

                <button
                  onClick={() => handleSaveAndPublishCompiledStory(true)}
                  disabled={isSaving}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-black px-8 py-4 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="animate-spin" /> : t.saveDraftBtn}
                </button>

                {canPublish && (
                  <button
                    onClick={() => handleSaveAndPublishCompiledStory(false)}
                    disabled={isSaving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-10 py-4 rounded-xl transition-all shadow-xl shadow-indigo-600/20 active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="animate-spin" /> : t.saveAndPublishBtn}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== SUBTAB: MANAGE (CHAPTERS MANAGER) ==================== */}
      {subTab === 'manage' && (
        <div className="space-y-10 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Story selector column */}
            <div className="border-r border-slate-100 dark:border-slate-800 pr-4 space-y-4">
              <h3 className="font-black text-slate-800 dark:text-slate-200 text-lg uppercase tracking-wider mb-4">Mkusanyiko wa Vitabu Zako</h3>
              {loadingStories ? (
                <div className="py-10 text-center"><Loader2 className="animate-spin text-indigo-600 mx-auto" /></div>
              ) : authorStories.length === 0 ? (
                <p className="text-sm text-slate-400">Bado haujachapisha kitabu chochote.</p>
              ) : (
                <div className="space-y-3">
                  {authorStories.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectStoryForChapters(s)}
                      className={`w-full text-left p-4 rounded-xl font-bold text-sm transition-all border ${selectedManageStory?.id === s.id ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 text-indigo-600' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-500 hover:bg-slate-100'}`}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Chapters management column */}
            <div className="md:col-span-2 space-y-8">
              {selectedManageStory ? (
                <div className="space-y-8">
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">Vipengele vya: {selectedManageStory.title}</h3>
                    <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">Hariri, ongeza, au futa sura mbalimbali za hadithi hii.</p>
                  </div>

                  {/* Chapters List */}
                  {loadingChapters ? (
                    <div className="py-10 text-center"><Loader2 className="animate-spin text-indigo-600 mx-auto" /></div>
                  ) : chapters.length === 0 ? (
                    <p className="text-sm text-slate-400 bg-slate-50 p-6 rounded-xl border border-dashed border-slate-200">Kitabu hiki bado hakina sura zozote zilizohifadhiwa.</p>
                  ) : (
                    <div className="space-y-4">
                      {chapters.map((chap) => (
                        <div key={chap.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 hover:bg-slate-50 transition-all">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">Chapter {chap.order}</span>
                            <h4 className="font-bold text-slate-800 dark:text-white mt-1.5">{chap.title}</h4>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleStartEditChapter(chap)}
                              className="px-3.5 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-black rounded-lg hover:bg-indigo-100 transition-all"
                            >
                              Hariri
                            </button>
                            <button
                              onClick={() => handleDeleteChapter(chap.id)}
                              className="p-1.5 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add / Edit Chapter Form */}
                  <form onSubmit={handleSaveChapter} className="border border-slate-100 dark:border-slate-800 rounded-3xl p-8 space-y-6">
                    <h4 className="text-lg font-black text-slate-800 dark:text-slate-100">
                      {editingChapterId ? 'Hariri Sura Iliyopo' : 'Ongeza Sura Mpya (Manual Add)'}
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="md:col-span-3">
                        <label className="block text-xs font-black text-slate-400 uppercase mb-2">Kichwa cha Sura (Chapter Title)</label>
                        <input
                          type="text"
                          required
                          value={chapterTitle}
                          onChange={(e) => setChapterTitle(e.target.value)}
                          className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold dark:text-white"
                          placeholder="e.g., Kuingia Kwenye Pango la Ajabu"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase mb-2">Sura ya ngapi? (Order)</label>
                        <input
                          type="number"
                          required
                          value={chapterOrder}
                          onChange={(e) => setChapterOrder(Number(e.target.value))}
                          className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase mb-2">Maudhui ya Sura (Content)</label>
                      <textarea
                        required
                        value={chapterContent}
                        onChange={(e) => setChapterContent(e.target.value)}
                        className="w-full p-5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2rem] outline-none focus:ring-2 focus:ring-indigo-500 h-64 resize-none font-medium dark:text-white leading-relaxed"
                        placeholder="Andika riwaya au simulizi ya sura hii..."
                      />
                    </div>

                    <div className="flex justify-end gap-3">
                      {editingChapterId && (
                        <button
                          type="button"
                          onClick={handleCancelEditChapter}
                          className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black px-6 py-3 rounded-xl transition-all"
                        >
                          Ghairi (Cancel)
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSavingChapter}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8 py-3 rounded-xl transition-all shadow-md flex items-center gap-2 active:scale-95 disabled:opacity-50"
                      >
                        {isSavingChapter && <Loader2 className="animate-spin" size={16} />}
                        {editingChapterId ? 'Hifadhi Mabadiliko' : 'Ongeza Sura'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="py-20 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/20 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-800">
                  <BookOpen size={48} className="mx-auto opacity-20 mb-4" />
                  <p className="font-bold text-lg text-slate-600 dark:text-slate-400">Tafadhali chagua kitabu upande wa kushoto ili kusimamia sura zake.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
