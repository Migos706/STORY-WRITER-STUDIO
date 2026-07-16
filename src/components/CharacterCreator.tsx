import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../App';
import { Sparkles, User, Loader2, Trash2, Shield, Copy, Check, RefreshCw } from 'lucide-react';
import { getApiUrl } from '../utils/api';

interface Character {
  id: string;
  name: string;
  age: string;
  gender: string;
  personality: string;
  abilities: string;
  genre: string;
  bio: string;
  background: string;
  imagePrompt: string;
  imageUrl?: string;
  createdAt?: any;
}

export default function CharacterCreator() {
  const { user } = useAuth();
  
  // Form States
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Kiume');
  const [personality, setPersonality] = useState('');
  const [abilities, setAbilities] = useState('');
  const [genre, setGenre] = useState('Fantasy');

  // Generation & List States
  const [isGenerating, setIsGenerating] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCharacters();
  }, [user]);

  const fetchCharacters = async () => {
    if (!user) return;
    setLoadingList(true);
    const path = `users/${user.uid}/characters`;
    try {
      const q = query(collection(db, path), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setCharacters(snap.docs.map(d => ({ id: d.id, ...d.data() } as Character)));
    } catch (error) {
      console.error("Error fetching characters:", error);
    } finally {
      setLoadingList(false);
    }
  };

  const handleGenerateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setMessage({ type: 'error', text: 'Tafadhali ingia ili uweze kutengeneza mhusika.' });
      return;
    }
    if (!name.trim()) {
      setMessage({ type: 'error', text: 'Tafadhali weka jina la mhusika.' });
      return;
    }

    setIsGenerating(true);
    setMessage(null);

    try {
      const response = await fetch(getApiUrl('/api/ai/generate-character'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          age,
          gender,
          personality,
          abilities,
          genre
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate character from server.");
      }

      const data = await response.json();

      // Save to Firestore
      const newCharData = {
        name,
        age: age || 'Hajulikani',
        gender,
        personality: personality || 'Inavutia',
        abilities: abilities || 'Kawaida',
        genre,
        bio: data.bio || '',
        background: data.background || '',
        imagePrompt: data.imagePrompt || '',
        imageUrl: data.imageUrl || '',
        createdAt: new Date().toISOString()
      };

      const path = `users/${user.uid}/characters`;
      const docRef = await addDoc(collection(db, path), newCharData);

      const createdChar: Character = { id: docRef.id, ...newCharData };
      setCharacters(prev => [createdChar, ...prev]);
      setSelectedChar(createdChar);
      setMessage({ type: 'success', text: `Mhusika ${name} ametengenezwa kikamilifu na AI!` });

      // Clear Form
      setName('');
      setAge('');
      setPersonality('');
      setAbilities('');
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: 'Imeshindwa kutengeneza mhusika: ' + error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteCharacter = async (charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    if (!window.confirm("Je, una uhakika unataka kufuta mhusika huyu?")) return;

    const path = `users/${user.uid}/characters/${charId}`;
    try {
      await deleteDoc(doc(db, path));
      setCharacters(prev => prev.filter(c => c.id !== charId));
      if (selectedChar?.id === charId) {
        setSelectedChar(null);
      }
      setMessage({ type: 'success', text: 'Mhusika amefutwa mafanikio.' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Imeshindwa kufuta mhusika.' });
    }
  };

  const handleCopyDetails = (char: Character) => {
    const details = `Mhusika: ${char.name}
Umri: ${char.age}
Jinsia: ${char.gender}
Aina: ${char.genre}
Sifa: ${char.personality}
Uwezo: ${char.abilities}
Kujihusu: ${char.bio}
Historia: ${char.background}`;

    navigator.clipboard.writeText(details);
    setCopiedId(char.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Creation Form */}
        <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-200 dark:border-slate-800 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-md">
              <Sparkles size={22} />
            </div>
            <h3 className="font-black text-slate-900 dark:text-white text-xl">Unda Mhusika Mpya</h3>
          </div>

          {message && (
            <div className={`p-4 mb-6 rounded-xl font-medium text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleGenerateCharacter} className="space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Jina la Mhusika</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold dark:text-white"
                placeholder="Mfano: Kingo, Lilian, Kiroboto..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Umri</label>
                <input 
                  type="text" 
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  className="w-full p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold dark:text-white"
                  placeholder="Mfano: Miaka 25"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Jinsia</label>
                <select 
                  value={gender}
                  onChange={e => setGender(e.target.value)}
                  className="w-full p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold dark:text-white"
                >
                  <option value="Kiume">Kiume</option>
                  <option value="Kike">Kike</option>
                  <option value="Kiumbe wa Ajabu">Kiumbe wa Ajabu</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Mada/Aina ya Hadithi (Genre)</label>
              <select 
                value={genre}
                onChange={e => setGenre(e.target.value)}
                className="w-full p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold dark:text-white"
              >
                <option value="Fantasy">Njozi (Fantasy)</option>
                <option value="Sci-Fi">Sayansi (Sci-Fi)</option>
                <option value="Romance">Mahaba (Romance)</option>
                <option value="Mystery">Siri (Mystery)</option>
                <option value="Education">Elimu (Education)</option>
                <option value="Comedy">Vichekesho (Comedy)</option>
                <option value="Horror">Kutisha (Horror)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Sifa za Tabia (Personality)</label>
              <input 
                type="text" 
                value={personality}
                onChange={e => setPersonality(e.target.value)}
                className="w-full p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold dark:text-white"
                placeholder="Mfano: Mnyenyekevu, jasiri, mcheshi"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Uwezo au Ustadi Maalum</label>
              <input 
                type="text" 
                value={abilities}
                onChange={e => setAbilities(e.target.value)}
                className="w-full p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold dark:text-white"
                placeholder="Mfano: Kutabiri baadae, kupaa, au mwerevu"
              />
            </div>

            <button 
              type="submit"
              disabled={isGenerating}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 px-6 rounded-2xl font-black transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95 mt-6"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  AI Inatengeneza...
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  Tengeneza kwa AI
                </>
              )}
            </button>
          </form>
        </div>

        {/* Character Directory List and Selected Details */}
        <div className="lg:col-span-7 space-y-6">
          
          {selectedChar ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-[2rem] shadow-sm space-y-6 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                {selectedChar.imageUrl ? (
                  <img src={selectedChar.imageUrl} alt={selectedChar.name} className="w-32 h-32 rounded-2xl object-cover shadow-md border dark:border-slate-700 shrink-0 mx-auto sm:mx-0" />
                ) : (
                  <div className="w-32 h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-300 shrink-0 mx-auto sm:mx-0">
                    <User size={48} />
                  </div>
                )}
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white">{selectedChar.name}</h3>
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => handleCopyDetails(selectedChar)}
                        className="p-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-600 rounded-xl transition-all shadow-sm flex items-center gap-1.5 text-xs font-bold"
                        title="Copy properties for Story Generator"
                      >
                        {copiedId === selectedChar.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                        {copiedId === selectedChar.id ? 'Copied!' : 'Copy details'}
                      </button>
                      <button 
                        onClick={() => setSelectedChar(null)}
                        className="p-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded-xl transition-all text-xs font-black"
                      >
                        Funga dondoo
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1 rounded-md font-bold uppercase">{selectedChar.genre}</span>
                    <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-md font-bold uppercase">{selectedChar.gender}</span>
                    <span className="text-[10px] bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 px-3 py-1 rounded-md font-bold uppercase">{selectedChar.age}</span>
                  </div>

                  <p className="mt-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-bold italic">
                    "{selectedChar.bio}"
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                <h4 className="font-black text-slate-800 dark:text-slate-300 mb-2 uppercase text-xs tracking-wider">Kuhusu yeye & Background</h4>
                <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed space-y-4 whitespace-pre-line font-serif">
                  {selectedChar.background}
                </div>
              </div>
            </div>
          ) : null}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-[2rem] shadow-sm">
            <h4 className="font-black text-slate-900 dark:text-white mb-6 flex items-center gap-2 text-lg">
              <User size={22} className="text-indigo-600" />
              Saraka ya Wahusika Wako ({characters.length})
            </h4>

            {loadingList ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>
            ) : characters.length === 0 ? (
              <div className="text-center py-12 text-slate-400 border-2 border-dashed rounded-2xl border-slate-100 dark:border-slate-800">
                <User className="mx-auto opacity-10 mb-2" size={40} />
                <p className="text-sm font-medium">Bado haujatengeneza mhusika hata mmoja.</p>
                <p className="text-xs text-slate-500 mt-1">Unda mhusika kwa kutumia fomu ya AI hapo kushoto.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {characters.map(char => (
                  <div 
                    key={char.id} 
                    onClick={() => setSelectedChar(char)}
                    className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-all group shadow-sm relative"
                  >
                    {char.imageUrl ? (
                      <img src={char.imageUrl} alt={char.name} className="w-16 h-16 rounded-xl object-cover shadow-sm shrink-0 border dark:border-slate-700" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 shrink-0">
                        <User size={24} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h5 className="font-black text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{char.name}</h5>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{char.genre} • {char.gender}</p>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteCharacter(char.id, e)}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      title="Futa mhusika"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
