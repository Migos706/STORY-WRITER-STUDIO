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

const GENRES = ['Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Education', 'Comedy', 'Horror'];
const MOODS = ['Happy', 'Sad', 'Suspenseful', 'Calm', 'Energetic', 'Romantic', 'Dark', 'Mystical'];
const NARRATION_STYLES = ['First Person (I)', 'Third Person Limited (He/She)', 'Third Person Omniscient', 'Epistolary (Letters/Journal)', 'Poetic/Lyric'];
const VOICES = [
  { id: 'Charon', label: 'News Anchor', description: 'Authoritative and clear' },
  { id: 'Kore', label: 'Calm Voice', description: 'Soothing and relaxed' },
  { id: 'Fenrir', label: 'Energetic Announcer', description: 'Upbeat and dynamic' },
  { id: 'Zephyr', label: 'Storyteller', description: 'Expressive and engaging' },
  { id: 'Puck', label: 'Friendly Host', description: 'Warm and conversational' },
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
      const prompt = `A beautiful cover illustration for a story titled "${title}". Genre: ${genre}. Mood: ${mood}. Story context: ${content.substring(0, 200)}...`;
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
      setMessage({ type: 'success', text: 'AI has crafted an expansive story! Review and edit it below.' });
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to generate story: ' + error.message });
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const handleExpandStory = async () => {
    if (!content) {
      setMessage({ type: 'error', text: 'Please generate or write some content first.' });
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
        setMessage({ type: 'success', text: 'AI has expanded your story with more chapters and details!' });
      }
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to expand story: ' + error.message });
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
    <div className="max-w-4xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
      <h1 className="text-3xl font-bold text-slate-900 mb-8 flex items-center gap-2">
        {canPublish ? <BookOpen className="text-indigo-600" /> : <Mic className="text-indigo-600" />}
        {canPublish ? 'Create New Story' : 'AI Story Writer'}
      </h1>

      {!canPublish && (
        <div className="mb-8 p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-800 text-sm">
          <p className="font-bold mb-1 flex items-center gap-2">
            <Shield size={16} /> Personal AI Writer Mode
          </p>
          <p>You can use this tool to generate stories for yourself. They will be saved to your "Saved Stories" section. To publish stories for everyone to see, please apply for Author status in your profile.</p>
        </div>
      )}

      {message && (
        <div className={`p-4 mb-6 rounded-xl font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-3xl border border-indigo-100 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Send className="text-indigo-600" size={20} />
            <h3 className="font-bold text-indigo-900 text-lg">AI Story Generator</h3>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-indigo-700 mb-2">What is your story about? (Intent/Plot)</label>
            <textarea 
              value={storyPrompt}
              onChange={(e) => setStoryPrompt(e.target.value)}
              className="w-full p-4 bg-white/80 border border-indigo-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-24"
              placeholder="e.g. A young girl discovers a hidden door in her library that leads to a world where books are alive..."
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button 
              onClick={handleGenerateAIStory}
              disabled={isGeneratingStory}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              {isGeneratingStory ? <Loader2 size={18} className="animate-spin" /> : <BookOpen size={18} />}
              Write My Full Story (Master AI)
            </button>
            <button 
              onClick={handleExpandStory}
              disabled={isGeneratingStory || !content}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2"
              title="Add more chapters and depth to the current story"
            >
              {isGeneratingStory ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Expand Story (Add More)
            </button>
            <button 
              onClick={handleGenerateRealWorldStory}
              disabled={isGeneratingStory}
              className="w-full sm:w-auto bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 px-6 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
            >
              {isGeneratingStory ? <Loader2 size={18} className="animate-spin" /> : <Globe size={18} />}
              Daily Inspiration (Facts)
            </button>
          </div>
          <p className="text-xs text-indigo-500 italic">Advanced Literary Engine (Gemini 3.1 Pro) enabled: Designed for multi-page, deep narrative creation.</p>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Title</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="Enter story title..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Genre</label>
            <select 
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Mood</label>
            <select 
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Narration Style</label>
            <select 
              value={narrationStyle}
              onChange={(e) => setNarrationStyle(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {NARRATION_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Content</label>
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            placeholder="Write your story here..."
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Mic size={18} className="text-indigo-500" />
            Select Narration Voice (If Generating)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {VOICES.map((voice) => {
              const isSelected = selectedVoice === voice.id;
              return (
                <button
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={`text-left p-4 rounded-xl border-2 transition-all relative overflow-hidden ${
                    isSelected 
                      ? 'border-indigo-600 bg-indigo-50 shadow-sm' 
                      : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 text-indigo-600">
                      <CheckCircle2 size={18} />
                    </div>
                  )}
                  <div className={`font-bold mb-1 ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                    {voice.label}
                  </div>
                  <div className={`text-xs ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`}>
                    {voice.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
          {/* Image Generation */}
          <div className="space-y-4">
            <button 
              onClick={handleGenerateImage}
              disabled={isGeneratingImage}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl font-bold transition-colors"
            >
              {isGeneratingImage ? <Loader2 className="animate-spin" /> : <ImageIcon />}
              Generate Cover Image
            </button>
            {imageUrl && (
              <img src={imageUrl} alt="Generated Cover" className="w-full h-48 object-cover rounded-xl border border-slate-200" />
            )}
          </div>

          {/* Audio Generation / Upload */}
          <div className="space-y-4">
            <label className="block text-sm font-bold text-slate-700 mb-1">Story Audio (Narration)</label>
            <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={handleGenerateAudio}
                  disabled={isGeneratingAudio}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-3 rounded-xl font-bold transition-colors text-sm border border-indigo-200"
                >
                  {isGeneratingAudio ? <Loader2 className="animate-spin" size={18} /> : <Mic size={18} />}
                  Generate AI Voice
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-3 rounded-xl font-bold transition-colors text-sm border border-slate-200 shadow-sm"
                >
                  <Upload size={18} className="text-indigo-600" />
                  Upload Audio File
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
                <div className="space-y-3 p-3 bg-white rounded-xl border border-slate-100 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Audio Preview</span>
                    {audioFile && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Uploaded</span>}
                  </div>
                  <audio controls src={audioUrl} className="w-full h-10" />
                  {audioFile && <p className="text-[10px] text-center text-slate-400">File: {audioFile.name}</p>}
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-xs text-slate-400">No audio added yet. Generate one with AI or upload your own narration.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pt-8">
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-xl font-bold text-lg transition-colors shadow-lg shadow-indigo-600/20"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
            {isSubmitting ? 'Submitting...' : (canPublish ? (profile.role === 'admin' ? 'Publish Story' : 'Submit for Review') : 'Save to My Stories')}
          </button>
        </div>
      </div>
    </div>
  );
}
