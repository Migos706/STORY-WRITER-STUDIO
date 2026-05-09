import React, { useState, useRef } from 'react';
import { useAuth } from '../App';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { GoogleGenAI, Modality } from '@google/genai';
import { Loader2, Image as ImageIcon, Mic, Send, BookOpen, CheckCircle2, Upload, Globe, Shield } from 'lucide-react';

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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const GENRES = ['Njozi (Fantasy)', 'Sayansi (Sci-Fi)', 'Mahaba (Romance)', 'Siri (Mystery)', 'Elimu (Education)', 'Vichekesho (Comedy)', 'Kutisha (Horror)'];
const MOODS = ['Furaha', 'Huzuni', 'Hamasa', 'Utulivu', 'Changamfu', 'Kivutio', 'Giza', 'Linalovutia'];
const NARRATION_STYLES = ['Nafasi ya Kwanza (Mimi)', 'Nafasi ya Tatu (Yeye)', 'Msimulizi Anayejua Yote', 'Jarida (Letters/Journal)', 'Kishairi (Poetic)'];
const VOICES = [
  { id: 'Charon', label: 'Msemaji wa Habari', description: 'Sauti yenye mamlaka' },
  { id: 'Kore', label: 'Sauti ya Utulivu', description: 'Inatuliza na kupumzisha' },
  { id: 'Fenrir', label: 'Mwasilishaji Hamasa', description: 'Sauti changamfu' },
  { id: 'Zephyr', label: 'Msimulizi', description: 'Sauti inayovutia na kuelezea' },
  { id: 'Puck', label: 'Mwenyeji Rafiki', description: 'Sauti ya kirafiki na mazungumzo' },
];

function createWavBlob(pcmData: Int16Array, sampleRate: number): Blob {
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = pcmData.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcmData.length; i++, offset += 2) {
    view.setInt16(offset, pcmData[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

export default function AuthorPanel() {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [genre, setGenre] = useState(GENRES[0]);
  const [mood, setMood] = useState(MOODS[0]);
  const [narrationStyle, setNarrationStyle] = useState(NARRATION_STYLES[1]);
  const [selectedVoice, setSelectedVoice] = useState(VOICES[3].id);
  
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storyPrompt, setStoryPrompt] = useState('');
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // If user is not author or admin, they can still use the AI writer but not publish directly
  const canPublish = profile?.role === 'author' || profile?.role === 'admin';

  if (!profile) return null;

  const handleGenerateImage = async () => {
    if (!title || !content) {
      setMessage({ type: 'error', text: 'Please provide a title and content first.' });
      return;
    }
    setIsGeneratingImage(true);
    setMessage(null);
    try {
      const prompt = `Immerse yourself as a world-class novelist. Use Swahili if possible or deep English. Title: ${title}. Genre: ${genre}. Mood: ${mood}. Context: ${content.substring(0, 200)}...`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
      });
      
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          setImageUrl(`data:image/png;base64,${base64EncodeString}`);
          break;
        }
      }
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to generate image: ' + error.message });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateAIStory = async () => {
    if (!storyPrompt && !title) {
      setMessage({ type: 'error', text: 'Please provide a story idea or a title first.' });
      return;
    }
    setIsGeneratingStory(true);
    setMessage(null);
    try {
      const prompt = `You are a world-class novelist and professional creative storyteller with the creative depth of Gemini 1.5 Pro and ChatGPT-4. 
      Your goal is to write a deeply immersive, high-quality, and meaningful story that feels alive.
      
      Author's Intent/Context: ${storyPrompt || 'Write an original literary masterpiece'}
      Title: ${title || 'Suggest a fitting title'}
      Genre: ${genre}
      Mood/Atmosphere: ${mood}
      Narration Style/Perspective: ${narrationStyle}
      
      CORE LITERARY INSTRUCTIONS:
      1. GENRE FAITHFULNESS: Strictly adhere to the tropes and expectations of the ${genre} genre, while adding unique twists.
      2. MOOD EMBODIMENT: The prose itself must reflect the ${mood} mood. If it's Dark, use shadows and heavy metaphors. If it's Happy, use light and rhythmic sentences.
      3. NARRATION: Use the ${narrationStyle} perspective consistently. Deeply explore the internal state of characters if it's First Person or Limited Third.
      4. LENGTH & DETAIL: Write an EXTREMELY long story. We are aiming for a novella-length experience (at least 3-5 full pages of text). NEVER summarize "they went there." Describe the journey, the sights, and the conversations.
      5. ENVIRONMENTALLY RICH: Spend significant time on world-building and environmental description. The setting should be a character itself.
      6. THEME: Ensure the story has a deep moral or philosophical dhumuni (purpose).
      
      Structure the output as a JSON object: {"title": "The Captured Title", "content": "The full, exhaustive, and deeply detailed story content..."}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
          systemInstruction: "You are a master novelist. Your writing is expansive, poetic, and structurally sound. You never write short summaries; you write complete books with deep environmental and character analysis."
        }
      });
      
      const text = response.text.trim().replace(/```json/g, '').replace(/```/g, '');
      const result = JSON.parse(text);
      
      if (result.title) setTitle(result.title);
      if (result.content) setContent(result.content);
      setMessage({ type: 'success', text: 'AI amekamilisha kuandika hadithi! Ipungue na kuiboresha hapa chini.' });
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: 'Imeshindwa kutengeneza hadithi: ' + error.message });
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const handleExpandStory = async () => {
    if (!content) {
      setMessage({ type: 'error', text: 'Tadhali tengeneza au andika maudhui kwanza.' });
      return;
    }
    setIsGeneratingStory(true);
    setMessage(null);
    try {
      const prompt = `Current Story Progress (Title: "${title}"):
      
      ${content}
      
      TASK: Continue and EXPAND this story significantly. 
      1. Add more depth to the current scene or start the next chapter.
      2. Focus heavily on character internal monologue and environmental descriptions.
      3. Ensure it flows perfectly from the last sentence.
      4. Avoid repetition.
      
      Reply with a JSON object: {"content": "The additional story content ONLY to be appended..."}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
          systemInstruction: "You are a master novelist continuing a work in progress. Your goal is to add more depth, length, and detail without summarizing."
        }
      });
      
      const text = response.text.trim().replace(/```json/g, '').replace(/```/g, '');
      const result = JSON.parse(text);
      
      if (result.content) {
        setContent(prev => prev + "\n\n" + result.content);
        setMessage({ type: 'success', text: 'AI amepanua hadithi yako na kuongeza maelezo zaidi!' });
      }
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: 'Imeshindwa kupanua hadithi: ' + error.message });
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const handleGenerateRealWorldStory = async () => {
    setIsGeneratingStory(true);
    setMessage(null);
    try {
      const prompt = `Search the web for a fascinating recent news event, scientific discovery, or interesting real-world fact. Then, write a creative short story based on this real information. 
      Reply strictly with a JSON object in this format: {"title": "Story Title", "content": "The story content..."}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      
      const text = response.text.trim().replace(/```json/g, '').replace(/```/g, '');
      const result = JSON.parse(text);
      
      if (result.title) setTitle(result.title);
      if (result.content) setContent(result.content);
      setMessage({ type: 'success', text: 'Generated a story based on real-world information!' });
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to generate story: ' + error.message });
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!content) {
      setMessage({ type: 'error', text: 'Please provide content first.' });
      return;
    }
    setIsGeneratingAudio(true);
    setMessage(null);
    setAudioFile(null); // Clear any uploaded file
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: content }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const pcmData = new Int16Array(bytes.buffer);
        const wavBlob = createWavBlob(pcmData, 24000);
        
        // In a real app, we would upload this Blob to Firebase Storage.
        // For this demo, we'll store the base64 string directly in Firestore (WARNING: Firestore has a 1MB limit).
        // To stay within limits, we'll just use the base64 string directly if it's small enough, or simulate it.
        // Actually, storing base64 audio in Firestore is risky due to 1MB limit.
        // Let's store it as a data URL for simplicity in this prototype.
        const reader = new FileReader();
        reader.onloadend = () => {
          setAudioUrl(reader.result as string);
        };
        reader.readAsDataURL(wavBlob);
      }
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to generate audio: ' + error.message });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setMessage({ type: 'error', text: 'Audio file must be less than 10MB.' });
        return;
      }
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setMessage(null);
    }
  };

  const uploadBase64ToStorage = async (dataUrl: string, path: string) => {
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Failed to upload base64 to storage", error);
      return dataUrl; // fallback, though it might fail Firestore limits if too large
    }
  };

  const handleSubmit = async () => {
    if (!title || !content) {
      setMessage({ type: 'error', text: 'Title and content are required.' });
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      let finalAudioUrl = audioUrl;
      let finalImageUrl = imageUrl;

      // Upload generated image to Storage if it's a base64 data URL
      if (imageUrl && imageUrl.startsWith('data:image')) {
        finalImageUrl = await uploadBase64ToStorage(imageUrl, `images/${profile.uid}/${Date.now()}_cover.png`);
      }

      // If they uploaded a file, try to upload to Firebase Storage
      if (audioFile) {
        try {
          const storageRef = ref(storage, `audio/${profile.uid}/${Date.now()}_${audioFile.name}`);
          await uploadBytes(storageRef, audioFile);
          finalAudioUrl = await getDownloadURL(storageRef);
        } catch (storageError) {
          console.warn("Firebase Storage upload failed, falling back to base64 if possible", storageError);
          // Fallback to base64 if storage fails (e.g. missing rules)
          const reader = new FileReader();
          finalAudioUrl = await new Promise((resolve) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(audioFile);
          });
        }
      } else if (audioUrl && audioUrl.startsWith('data:audio')) {
        // Upload generated audio to Storage if it's a base64 data URL
        finalAudioUrl = await uploadBase64ToStorage(audioUrl, `audio/${profile.uid}/${Date.now()}_generated.wav`);
      }

      if (canPublish) {
        const path = 'stories';
        try {
          await addDoc(collection(db, path), {
            authorId: profile.uid,
            authorName: profile.displayName,
            title,
            content,
            genre,
            mood,
            imageUrl: finalImageUrl || '',
            audioUrl: finalAudioUrl || '',
            status: profile.role === 'admin' ? 'approved' : 'pending', // Auto-approve for admins
            safetyStatus: 'unchecked',
            createdAt: new Date().toISOString()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
        setMessage({ type: 'success', text: profile.role === 'admin' ? 'Story published successfully!' : 'Story submitted successfully for review!' });
      } else {
        // Regular users save to their personal collection
        const path = `users/${profile.uid}/savedStories`;
        try {
          await addDoc(collection(db, path), {
            authorId: profile.uid,
            authorName: profile.displayName,
            title,
            content,
            genre,
            mood,
            imageUrl: finalImageUrl || '',
            audioUrl: finalAudioUrl || '',
            status: 'draft',
            safetyStatus: 'unchecked',
            createdAt: new Date().toISOString(),
            savedAt: new Date().toISOString()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
        setMessage({ type: 'success', text: 'Story saved to your "Saved Stories" section!' });
      }
      setTitle('');
      setContent('');
      setImageUrl(null);
      setAudioUrl(null);
      setAudioFile(null);
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to submit story: ' + error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 p-8 md:p-12 rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-800 transition-colors animate-in fade-in duration-500">
      <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-10 flex items-center gap-4">
        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-600/20">
          {canPublish ? <BookOpen size={32} /> : <Mic size={32} />}
        </div>
        {canPublish ? 'Tunga Hadithi Mpya' : 'AI Story Writer'}
      </h1>

      {!canPublish && (
        <div className="mb-10 p-6 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-[1.5rem] text-amber-800 dark:text-amber-300">
          <p className="font-black mb-2 flex items-center gap-2 text-lg">
            <Shield size={20} /> Huduma ya Maandishi ya AI
          </p>
          <p className="leading-relaxed">Unaweza kutumia injini ya AI kutengeneza hadishi zako binafsi. Hadithi hizi zitahifadhiwa kwenye maktaba yako ya "Saved Stories". Ikiwa unataka kuchapisha hadithi kwa wasomaji wote, tafadhali omba ruhusa ya kuwa Mwandishi (Author) kwenye profaili yako.</p>
        </div>
      )}

      {message && (
        <div className={`p-4 mb-6 rounded-xl font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-slate-950 dark:to-indigo-950/20 p-8 rounded-[2rem] border border-indigo-100 dark:border-indigo-900/40 space-y-6 shadow-inner transition-colors">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
              <Send size={24} />
            </div>
            <h3 className="font-black text-indigo-900 dark:text-indigo-300 text-xl">AI Story Generator</h3>
          </div>
          
          <div>
            <label className="block text-sm font-black text-indigo-700 dark:text-indigo-400 mb-3 uppercase tracking-widest">Hadithi yako inahusu nini? (Dhumuni/Wazo)</label>
            <textarea 
              value={storyPrompt}
              onChange={(e) => setStoryPrompt(e.target.value)}
              className="w-full p-5 bg-white/90 dark:bg-slate-900/90 border border-indigo-200 dark:border-indigo-900/40 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-32 dark:text-white text-lg transition-all"
              placeholder="Mfano: Hadithi ya kijana anayegundua siri ya zamani iliyojificha kwenye msitu wa giza..."
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <button 
              onClick={handleGenerateAIStory}
              disabled={isGeneratingStory}
              className="w-full sm:w-auto bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 active:scale-95"
            >
              {isGeneratingStory ? <Loader2 size={24} className="animate-spin" /> : <BookOpen size={24} />}
              Andika Hadithi Kamili (Master AI)
            </button>
            <button 
              onClick={handleExpandStory}
              disabled={isGeneratingStory || !content}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-amber-600/20 flex items-center justify-center gap-2 active:scale-95"
              title="Ongeza sura mpya na undani zaidi"
            >
              {isGeneratingStory ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
              Panua Hadithi (Expand)
            </button>
            <button 
              onClick={handleGenerateRealWorldStory}
              disabled={isGeneratingStory}
              className="w-full sm:w-auto bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40 px-8 py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              {isGeneratingStory ? <Loader2 size={24} className="animate-spin" /> : <Globe size={24} />}
              Daily Inspiration
            </button>
          </div>
          <p className="text-xs text-indigo-500 dark:text-indigo-400/60 italic font-medium">Inatumia teknolojia ya kisasa ya Maandishi ya Gemini 3.1 Pro kwa matokeo bora zaidi.</p>
        </div>

        <div>
          <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-widest">Kichwa cha Hadithi (Title)</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-xl font-bold dark:text-white transition-colors"
            placeholder="Weka jina la hadithi..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-widest">Aina (Genre)</label>
            <select 
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-bold transition-colors"
            >
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-widest">Mood</label>
            <select 
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-bold transition-colors"
            >
              {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-widest">Style</label>
            <select 
              value={narrationStyle}
              onChange={(e) => setNarrationStyle(e.target.value)}
              className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white font-bold transition-colors"
            >
              {NARRATION_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-widest">Maudhui (Content)</label>
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-80 p-6 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2rem] focus:ring-2 focus:ring-indigo-500 outline-none resize-none dark:text-white text-xl font-serif leading-relaxed transition-colors scrollbar-thin dark:scrollbar-thumb-slate-700"
            placeholder="Andika hadithi yako hapa..."
          />
        </div>

        <div>
          <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2 uppercase tracking-widest">
            <Mic size={20} className="text-indigo-500" />
            Sauti ya Masimulizi (Narration)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {VOICES.map((voice) => {
              const isSelected = selectedVoice === voice.id;
              return (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={`text-left p-5 rounded-2xl border-2 transition-all relative overflow-hidden group ${
                    isSelected 
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 shadow-md ring-2 ring-indigo-500/10' 
                      : 'border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-4 right-4 text-indigo-600 dark:text-indigo-400">
                      <CheckCircle2 size={20} />
                    </div>
                  )}
                  <div className={`font-black mb-1 text-lg ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-300'}`}>
                    {voice.label}
                  </div>
                  <div className={`text-xs font-bold ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
                    {voice.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-100 dark:border-slate-800">
          {/* Image Generation */}
          <div className="space-y-4">
            <button 
              onClick={handleGenerateImage}
              disabled={isGeneratingImage}
              className="w-full flex items-center justify-center gap-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-6 py-4 rounded-2xl font-black transition-all active:scale-95"
            >
              {isGeneratingImage ? <Loader2 size={24} className="animate-spin" /> : <ImageIcon size={24} />}
              Tengeneza Picha ya Jalada
            </button>
            {imageUrl && (
              <img src={imageUrl} alt="Generated Cover" className="w-full h-64 object-cover rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-lg animate-in fade-in duration-500" />
            )}
          </div>

          {/* Audio Generation / Upload */}
          <div className="space-y-4">
            <label className="block text-sm font-black text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-widest">Sauti (Audio Narration)</label>
            <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-[2rem] border-2 border-dashed border-slate-300 dark:border-slate-800 space-y-6 transition-colors">
              <div className="flex flex-col gap-4">
                <button 
                  onClick={handleGenerateAudio}
                  disabled={isGeneratingAudio}
                  className="w-full flex items-center justify-center gap-3 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-6 py-4 rounded-2xl font-black transition-all text-sm border border-indigo-200 dark:border-indigo-900/30 shadow-sm active:scale-95"
                >
                  {isGeneratingAudio ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} />}
                  Tengeneza Sauti ya AI
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 px-6 py-4 rounded-2xl font-black transition-all text-sm border border-slate-200 dark:border-slate-800 shadow-sm active:scale-95"
                >
                  <Upload size={20} className="text-indigo-600 dark:text-indigo-400" />
                  Pakia Sauti (Upload)
                </button>
                <input 
                  type="file" 
                  accept="audio/*" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleAudioUpload}
                />
              </div>
              
              {audioUrl ? (
                <div className="space-y-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sikiliza Preview</span>
                    {audioFile && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-3 py-1 rounded-full font-black">Uploaded</span>}
                  </div>
                  <audio controls src={audioUrl} className="w-full h-12" />
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-xs text-slate-400 dark:text-slate-600 font-bold">Hakuna sauti. Tengeneza na AI au pakia faili lako.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pt-10">
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white px-10 py-5 rounded-[1.5rem] font-black text-xl transition-all shadow-2xl shadow-indigo-600/30 active:scale-95"
          >
            {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
            {isSubmitting ? 'Inatuma...' : (canPublish ? (profile.role === 'admin' ? 'Chapisha Hadithi' : 'Tuma Uhakiki') : 'Hifadhi kwenye Maktaba')}
          </button>
        </div>
      </div>
    </div>
  );
}
