import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { 
  BookOpen, 
  MessageCircle, 
  MessageSquare,
  Home, 
  Settings, 
  ChevronRight, 
  Play, 
  Mic, 
  Send,
  Volume2,
  Trophy,
  Calendar,
  Sparkles,
  Lock,
  Unlock,
  LogOut,
  User as UserIcon,
  Zap,
  X,
  Send as SendIcon,
  AlertTriangle,
  ExternalLink,
  Copy,
  Download,
  CheckCircle2,
  PlusCircle,
  Users,
  Search,
  Key,
  Youtube,
  GripVertical,
  Check,
  LifeBuoy,
  Shield,
  Trash2,
  HelpCircle
} from 'lucide-react';
import { cn } from './lib/utils';
import { geminiService } from './services/geminiService';
import { ChatMessage, Lesson, UserProfile, Tutor, LessonRequest, VideoSuggestion } from './types';
import { getSupabase } from './lib/supabase';
import Markdown from 'react-markdown';
import { Quiz } from './components/Quiz';
import { GoogleGenAI } from "@google/genai";

// Mock initial static data for demonstration
const VideoPlayer = ({ url }: { url: string }) => {
  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const videoId = getYoutubeId(url);

  if (!videoId) return null;

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-lg border border-ios-blue/10">
      <iframe
        className="absolute inset-0 w-full h-full"
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      ></iframe>
    </div>
  );
};

const INITIAL_LESSONS: Lesson[] = [
  // Month 1 - Week 1
  {
    id: 'd1',
    title: 'Greetings & Presence',
    description: 'Automate the greeting loop. Essential for every social interaction in Madeira.',
    level: 1,
    day: 1,
    category: 'social',
    patterns: ['Bom dia! Tudo bem?', 'Tudo bem, obrigado.', 'E você?', 'Tenha um bom dia!'],
    vocabulary: [
      { word: 'Bom dia', translation: 'Good morning' },
      { word: 'Boa tarde', translation: 'Good afternoon' },
      { word: 'Boa noite', translation: 'Good evening/night' },
      { word: 'Tudo bem?', translation: 'Everything OK?' },
      { word: 'Obrigado/a', translation: 'Thank you' },
    ],
    is_static: true,
    goals: [
      'Master the basic greeting loop',
      'Understand the "Tudo bem" response pattern',
      'Practice pronunciation of nasal vowels'
    ],
    explanation: 'In Madeira, greetings are more than just words; they are a social ritual. Always respond to "Tudo bem?" with "Tudo bem, obrigado/a" before asking back.',
    video_url: 'https://www.youtube.com/watch?v=S2_YmG_l-p4'
  },
  {
    id: 'd2',
    title: 'Ordering in a Café',
    description: 'Learn to order coffee, bread, and pastries in a local snack bar.',
    level: 1,
    day: 2,
    category: 'daily',
    patterns: ['Queria um café, por favor.', 'Uma bica, se faz favor.', 'Quanto é?', 'P\'ra já!'],
    vocabulary: [
      { word: 'Bica', translation: 'Espresso' },
      { word: 'Pequeno-almoço', translation: 'Breakfast' },
      { word: 'Pastel de nata', translation: 'Custard tart' },
      { word: 'A conta', translation: 'The bill' },
    ],
    is_static: true,
    goals: [
      'Order coffee and snacks confidently',
      'Learn the names of local coffee variations',
      'Practice polite requests using "Queria"'
    ],
    explanation: 'Ordering coffee in Madeira is specific. A "bica" is your standard espresso. If you want a bit of milk, ask for a "garoto".'
  },
  {
    id: 'd3',
    title: 'Numbers 1-10 + Connectors',
    description: 'Master basic numbers and start connecting your thoughts with "e", "mas", "porque".',
    level: 1,
    day: 3,
    category: 'daily',
    patterns: ['Queria dois cafés.', 'Um, dois, três...', '...porque prefiro assim.', 'Um bocado.'],
    vocabulary: [
      { word: 'Um bocado', translation: 'A little bit' },
      { word: 'Então', translation: 'So / Then' },
      { word: 'Mas', translation: 'But' },
      { word: 'Porque', translation: 'Because' },
    ],
    is_static: true,
    goals: [
      'Count to 10 fluently',
      'Use basic conjunctions to form longer sentences',
      'Understand prices in shops'
    ],
    explanation: 'Numbers are the backbone of daily transactions. Connectors like "porque" help you explain your choices, making you sound more natural.'
  },
  {
    id: 'd4',
    title: 'Confusion & Clarification',
    description: 'Build your escape hatch. Learn how to handle fast speech and ask for repetition.',
    level: 1,
    day: 4,
    category: 'social',
    patterns: ['Diz?', 'Não percebi.', 'Pode repetir?', 'Mais devagar, se faz favor.'],
    vocabulary: [
      { word: 'Diz?', translation: 'What? / Pardon?' },
      { word: 'Percebi', translation: 'Understood' },
      { word: 'Devagar', translation: 'Slowly' },
      { word: 'Paciência', translation: 'Patience' },
    ],
    is_static: true
  },
  {
    id: 'd5',
    title: 'Locations & Directions',
    description: 'Navigate Madeira. Ask where things are and understand "em cima" and "em baixo".',
    level: 1,
    day: 5,
    category: 'travel',
    patterns: ['Onde fica...?', 'Fica aqui perto?', 'Sempre em frente.', 'Vire à esquerda.'],
    vocabulary: [
      { word: 'Em cima', translation: 'Up / Uphill' },
      { word: 'Em baixo', translation: 'Down / Downhill' },
      { word: 'Esquina', translation: 'Corner' },
      { word: 'Ali', translation: 'There' },
    ],
    is_static: true
  },
  {
    id: 'd6',
    title: 'Opinions & Preferences',
    description: 'Express what you think. Use "acho que", "parece-me" and "gosto imenso".',
    level: 1,
    day: 6,
    category: 'social',
    patterns: ['Gosto imenso!', 'Parece-me bem.', 'É uma maravilha.', 'Pois é!'],
    vocabulary: [
      { word: 'Imenso', translation: 'Very much / A lot' },
      { word: 'Óptimo', translation: 'Great' },
      { word: 'Maravilha', translation: 'Wonderful' },
      { word: 'Mesmo', translation: 'Really / Exactly' },
    ],
    is_static: true
  },
  {
    id: 'd7',
    title: 'Week 1 Stress Test',
    description: 'Consolidate everything from Week 1. Performance under pressure.',
    level: 1,
    day: 7,
    category: 'social',
    patterns: ['Full Week 1 Review'],
    vocabulary: [],
    is_static: true
  },
  // Month 1 - Week 2
  {
    id: 'd8',
    title: 'Self-Introduction',
    description: 'Introduce yourself: name, origin, occupation, and reason for being in Madeira.',
    level: 1,
    day: 8,
    category: 'social',
    patterns: ['Chamo-me...', 'Sou de...', 'Estou cá há...', 'Mudei-me para...'],
    vocabulary: [
      { word: 'Chamo-me', translation: 'My name is' },
      { word: 'Cá', translation: 'Here (local)' },
      { word: 'Reformado/a', translation: 'Retired' },
      { word: 'Trabalho', translation: 'Work' },
    ],
    is_static: true
  },
  {
    id: 'd9',
    title: 'Time: Days & Hours',
    description: 'Learn days of the week, clock times, and the critical "há" vs "daqui a".',
    level: 1,
    day: 9,
    category: 'daily',
    patterns: ['Que horas são?', 'Às oito da manhã.', 'Segunda-feira.', 'Daqui a uma semana.'],
    vocabulary: [
      { word: 'Hoje', translation: 'Today' },
      { word: 'Amanhã', translation: 'Tomorrow' },
      { word: 'Ontem', translation: 'Yesterday' },
      { word: 'Meia', translation: 'Half (time)' },
    ],
    is_static: true
  },
  {
    id: 'd10',
    title: 'Numbers 11-100 + Prices',
    description: 'Handle any price in any shop. Master European Portuguese number forms.',
    level: 1,
    day: 10,
    category: 'daily',
    patterns: ['Quanto custa?', 'São dezasseis euros.', 'Pode pagar com cartão?', 'Multibanco.'],
    vocabulary: [
      { word: 'Dezasseis', translation: 'Sixteen (EU)' },
      { word: 'Catorze', translation: 'Fourteen (EU)' },
      { word: 'Troco', translation: 'Change' },
      { word: 'Dinheiro', translation: 'Cash' },
    ],
    is_static: true
  },
  {
    id: 'd11',
    title: 'First Past Tense',
    description: 'Start speaking about the past. Use "Eu" forms of high-frequency verbs.',
    level: 1,
    day: 11,
    category: 'daily',
    patterns: ['Hoje de manhã fui...', 'Comi um pastel.', 'Fiz uma caminhada.', 'Gostei imenso.'],
    vocabulary: [
      { word: 'Fui', translation: 'I went' },
      { word: 'Fiz', translation: 'I did/made' },
      { word: 'Comi', translation: 'I ate' },
      { word: 'Cheguei', translation: 'I arrived' },
    ],
    is_static: true
  },
  {
    id: 'd12',
    title: 'Adjectives + Ser/Estar',
    description: 'Describe the world. Master the permanent vs temporary "to be" distinction.',
    level: 1,
    day: 12,
    category: 'social',
    patterns: ['O café é bom.', 'O café está quente.', 'As pessoas são simpáticas.', 'Está fresco.'],
    vocabulary: [
      { word: 'Simpático/a', translation: 'Friendly' },
      { word: 'Fresco', translation: 'Fresh / Cool' },
      { word: 'Quente', translation: 'Hot' },
      { word: 'Barato', translation: 'Cheap' },
    ],
    is_static: true
  },
  {
    id: 'd13',
    title: 'Daily Routines',
    description: 'Describe your day using reflexive verbs and sequence connectors.',
    level: 1,
    day: 13,
    category: 'daily',
    patterns: ['Levanto-me às sete.', 'Tomo o pequeno-almoço.', 'Primeiro... depois...', 'Normalmente.'],
    vocabulary: [
      { word: 'Levanto-me', translation: 'I get up' },
      { word: 'Deito-me', translation: 'I go to bed' },
      { word: 'Caminhada', translation: 'Walk / Hike' },
      { word: 'Sempre', translation: 'Always' },
    ],
    is_static: true
  },
  {
    id: 'd14',
    title: 'Week 2 Stress Test',
    description: 'Consolidate Weeks 1 and 2. Performance under pressure.',
    level: 1,
    day: 14,
    category: 'social',
    patterns: ['Full Week 2 Review'],
    vocabulary: [],
    is_static: true
  },
  // Month 1 - Week 3
  {
    id: 'd15',
    title: 'Talking About Others',
    description: 'Master the third person (ele/ela/eles/elas) and irregular past forms.',
    level: 1,
    day: 15,
    category: 'social',
    patterns: ['O meu vizinho chama-se João.', 'Ele é da Madeira.', 'Eles são muito simpáticos.', 'Ela foi ao mercado.'],
    vocabulary: [
      { word: 'Vizinho/a', translation: 'Neighbour' },
      { word: 'Chama-se', translation: 'Is called' },
      { word: 'Foi', translation: 'He/She went/was' },
      { word: 'Fez', translation: 'He/She did/made' },
    ],
    is_static: true,
    goals: [
      'Describe other people and their activities',
      'Use third-person singular and plural correctly',
      'Master key irregular preterite forms'
    ],
    explanation: 'In Portugal, "ele" and "ela" are used freely, but often dropped when context is clear. "Foi" can mean both "he/she went" and "he/she was".',
    video_url: 'https://www.youtube.com/watch?v=S2_YmG_l-p4'
  },
  {
    id: 'd16',
    title: 'TER: Have, Need, Feel',
    description: 'Master the verb "ter" for possession, obligation, and physical states.',
    level: 1,
    day: 16,
    category: 'daily',
    patterns: ['Tenho fome.', 'Tenho que ir.', 'Tenho dor de cabeça.', 'Preciso de ajuda.'],
    vocabulary: [
      { word: 'Fome', translation: 'Hunger' },
      { word: 'Sede', translation: 'Thirst' },
      { word: 'Frio', translation: 'Cold' },
      { word: 'Calor', translation: 'Heat' },
      { word: 'Sono', translation: 'Sleepiness' },
      { word: 'Dor', translation: 'Pain' },
      { word: 'Febre', translation: 'Fever' },
      { word: 'Tosse', translation: 'Cough' },
      { word: 'Constipado/a', translation: 'A cold (not constipated!)' },
    ],
    is_static: true,
    goals: [
      'Express physical sensations and needs',
      'Use "ter que" for obligations',
      'Distinguish between "ter" and "precisar de"'
    ],
    explanation: '"Estou constipado/a" means you have a cold. It is a very common false friend for English speakers!',
    video_url: 'https://www.youtube.com/watch?v=XhY7X_Y_X_Y'
  },
  {
    id: 'd17',
    title: 'PODER & Polite Requests',
    description: 'Use "poder" for permission, offers, and polite requests.',
    level: 1,
    day: 17,
    category: 'social',
    patterns: ['Posso sentar aqui?', 'Pode ajudar-me?', 'Pode repetir?', 'Não consigo.'],
    vocabulary: [
      { word: 'Posso', translation: 'I can / may' },
      { word: 'Pode', translation: 'He/She/You can / may' },
      { word: 'Ajudar', translation: 'To help' },
      { word: 'Sentar', translation: 'To sit' },
      { word: 'Consigo', translation: 'I can (manage)' },
    ],
    is_static: true,
    goals: [
      'Make polite requests and ask for permission',
      'Offer help to others',
      'Distinguish between "poder" and "conseguir"'
    ],
    explanation: '"Pode" is the standard polite way to ask for things in Portugal. It is not rude; it is the engine of politeness.'
  },
  {
    id: 'd18',
    title: 'Shopping: Clothes & Colours',
    description: 'Shop for clothes, describe colours, and compare items.',
    level: 1,
    day: 18,
    category: 'daily',
    patterns: ['Tem esta camisola em azul?', 'Posso experimentar?', 'Fica-me bem.', 'Mais barato do que...'],
    vocabulary: [
      { word: 'Camisola', translation: 'Jumper / Sweatshirt' },
      { word: 'Calças', translation: 'Trousers' },
      { word: 'Casaco', translation: 'Jacket / Coat' },
      { word: 'Sapatos', translation: 'Shoes' },
      { word: 'Tamanho', translation: 'Size' },
      { word: 'Experimentar', translation: 'To try on' },
      { word: 'Maior', translation: 'Bigger' },
      { word: 'Mais pequeno', translation: 'Smaller' },
    ],
    is_static: true,
    goals: [
      'Ask for clothing items, sizes, and colours',
      'Use the fitting room and decide on purchases',
      'Make basic comparisons between items'
    ],
    explanation: 'Colours must agree with the gender of the noun. "Uma camisola vermelha" but "Um casaco vermelho".'
  },
  {
    id: 'd19',
    title: 'Health & Pharmacy',
    description: 'Describe symptoms, understand dosages, and handle pharmacy visits.',
    level: 1,
    day: 19,
    category: 'daily',
    patterns: ['Dói-me a garganta.', 'Tenho alergia a...', 'Quantas vezes por dia?', 'Antes das refeições.'],
    vocabulary: [
      { word: 'Garganta', translation: 'Throat' },
      { word: 'Estômago', translation: 'Stomach' },
      { word: 'Costas', translation: 'Back' },
      { word: 'Receita', translation: 'Prescription' },
      { word: 'Comprimido', translation: 'Tablet' },
      { word: 'Refeições', translation: 'Meals' },
    ],
    is_static: true,
    goals: [
      'Describe physical symptoms and pain',
      'Understand medication instructions and dosages',
      'Explain allergies and medical history'
    ],
    explanation: '"Dói-me a cabeça" literally means "the head hurts me". This is the most natural way to express pain in Portuguese.'
  },
  {
    id: 'd20',
    title: 'Stronger Connectors',
    description: 'Add depth to your speech with "portanto", "aliás", and "afinal".',
    level: 1,
    day: 20,
    category: 'social',
    patterns: ['Portanto fui a outro.', 'Aliás, é o melhor!', 'Afinal não fui.', 'Mesmo assim gostei.'],
    vocabulary: [
      { word: 'Portanto', translation: 'So / Therefore' },
      { word: 'Aliás', translation: 'Actually / In fact' },
      { word: 'Afinal', translation: 'After all / In the end' },
      { word: 'Mesmo assim', translation: 'Even so' },
      { word: 'Até', translation: 'Even / Actually' },
      { word: 'Embora', translation: 'Although' },
    ],
    is_static: true,
    goals: [
      'Use sophisticated connectors to link complex thoughts',
      'Express hesitation, contradiction, and emphasis',
      'Sound more like a native speaker with "portanto"'
    ],
    explanation: '"Portanto" is used constantly in Madeira, often as a filler or thinking pause, similar to "so" in English.'
  },
  {
    id: 'd21',
    title: 'Week 3 Stress Test',
    description: 'Consolidate everything from Week 3. Performance under pressure.',
    level: 1,
    day: 21,
    category: 'social',
    patterns: ['Full Week 3 Review'],
    vocabulary: [],
    is_static: true,
    goals: [
      'Review all Week 3 patterns and vocabulary',
      'Practice complex multi-scenario dialogues',
      'Test fluency and response speed'
    ],
    explanation: 'You can now hold a sophisticated 3-minute conversation on any everyday topic. Parabéns!'
  },
  // Month 1 - Week 4
  {
    id: 'd22',
    title: 'The Imperfect Tense',
    description: 'Describe ongoing past states, habitual past actions, and how things used to be.',
    level: 1,
    day: 22,
    category: 'daily',
    patterns: ['Estava muito cansado quando cheguei.', 'Antes trabalhava em Londres.', 'Estava a ler quando o telefone tocou.'],
    vocabulary: [
      { word: 'era', translation: 'was' },
      { word: 'estava', translation: 'was (temp)' },
      { word: 'tinha', translation: 'had' },
      { word: 'havia', translation: 'there was' }
    ],
    is_static: true,
    goals: ['Master the imperfect tense', 'Contrast preterite and imperfect', 'Use havia correctly'],
    explanation: 'The imperfect describes ongoing past states or habits. Contrast it with the preterite (specific events).'
  },
  {
    id: 'd23',
    title: 'The Future: Going To & Will',
    description: 'Speak about the future confidently using ir + infinitive and simple future forms.',
    level: 1,
    day: 23,
    category: 'daily',
    patterns: ['Amanhã vou ao mercado.', 'Farei isso amanhã.', 'Tenciono aprender português.'],
    vocabulary: [
      { word: 'amanhã', translation: 'tomorrow' },
      { word: 'em breve', translation: 'soon' },
      { word: 'logo', translation: 'later/soon' }
    ],
    is_static: true
  },
  {
    id: 'd24',
    title: 'Wishes, Conditionals & Polite Requests',
    description: 'Express wishes, hypotheticals, and polished polite requests.',
    level: 1,
    day: 24,
    category: 'social',
    patterns: ['Gostava de ficar em Madeira.', 'Se tivesse mais tempo...', 'Oxalá que sim!'],
    vocabulary: [
      { word: 'Oxalá', translation: 'I hope so / God willing' },
      { word: 'Tomara', translation: 'I wish / I hope so' },
      { word: 'Quem dera', translation: 'I wish / If only' }
    ],
    is_static: true
  },
  {
    id: 'd25',
    title: 'Restaurant: Ordering a Full Meal',
    description: 'Handle a complete restaurant interaction from start to finish.',
    level: 1,
    day: 25,
    category: 'social',
    patterns: ['Gostava de uma mesa para dois.', 'Para começar, queria as lapas.', 'Pode trazer a conta?'],
    vocabulary: [
      { word: 'ementa', translation: 'menu' },
      { word: 'espada com banana', translation: 'scabbardfish with banana' },
      { word: 'espetada', translation: 'beef skewers' },
      { word: 'bolo do caco', translation: 'flat bread with garlic butter' }
    ],
    is_static: true
  },
  {
    id: 'd26',
    title: 'Describing Your Home',
    description: 'Describe where you live, your apartment, and the neighbourhood.',
    level: 1,
    day: 26,
    category: 'daily',
    patterns: ['Vivo num apartamento pequeno.', 'Fica no terceiro andar.', 'É uma zona sossegada.'],
    vocabulary: [
      { word: 'apartamento', translation: 'apartment' },
      { word: 'andar', translation: 'floor' },
      { word: 'vista para o mar', translation: 'sea view' },
      { word: 'bairro', translation: 'neighbourhood' }
    ],
    is_static: true
  },
  {
    id: 'd27',
    title: 'Numbers 100+ & Years',
    description: 'Handle numbers above 100 fluently: hundreds, thousands, years, and large quantities.',
    level: 1,
    day: 27,
    category: 'daily',
    patterns: ['A renda é oitocentos euros.', 'Madeira foi descoberta em 1419.', 'Há duzentas mil pessoas.'],
    vocabulary: [
      { word: 'cem', translation: '100' },
      { word: 'duzentos', translation: '200' },
      { word: 'mil', translation: '1000' },
      { word: 'milhão', translation: '1,000,000' }
    ],
    is_static: true
  },
  {
    id: 'd28',
    title: 'Week 4 Stress Test',
    description: 'Consolidate everything from Week 4. Performance under pressure.',
    level: 1,
    day: 28,
    category: 'social',
    patterns: ['Full Week 4 Review'],
    vocabulary: [],
    is_static: true
  },
  // Month 2 - Week 5
  {
    id: 'd29',
    title: 'Tu vs Você: Informal/Formal',
    description: 'Navigate the social distinction between tu (informal) and você (formal).',
    level: 2,
    day: 29,
    category: 'social',
    patterns: ['Como estás? Tudo bem?', 'De onde és?', 'O que fazes aqui?'],
    vocabulary: [
      { word: 'és', translation: 'you are (tu)' },
      { word: 'estás', translation: 'you are (temp, tu)' },
      { word: 'tens', translation: 'you have (tu)' },
      { word: 'vais', translation: 'you go (tu)' }
    ],
    is_static: true
  },
  {
    id: 'd30',
    title: 'All Persons: Complete Present Tense',
    description: 'Complete the present tense with nós (we) and a gente.',
    level: 2,
    day: 30,
    category: 'daily',
    patterns: ['Nós vamos ao café.', 'A gente gosta imenso.', 'Não sabemos bem.'],
    vocabulary: [
      { word: 'somos', translation: 'we are' },
      { word: 'estamos', translation: 'we are (temp)' },
      { word: 'temos', translation: 'we have' },
      { word: 'vamos', translation: 'we go' }
    ],
    is_static: true
  },
  {
    id: 'd31',
    title: 'All Persons: Preterite + Imperfect',
    description: 'Complete the past paradigm with tu and nós forms.',
    level: 2,
    day: 31,
    category: 'daily',
    patterns: ['O que fizeste ontem?', 'Nós fomos ao norte.', 'Estávamos cansados.'],
    vocabulary: [
      { word: 'foste', translation: 'you went (tu)' },
      { word: 'fizeste', translation: 'you did (tu)' },
      { word: 'fomos', translation: 'we went' },
      { word: 'estávamos', translation: 'we were' }
    ],
    is_static: true
  },
  {
    id: 'd32',
    title: 'Telephone & Formal Messages',
    description: 'Handle telephone calls, voicemail, and formal written messages.',
    level: 2,
    day: 32,
    category: 'daily',
    patterns: ['Estou sim, com quem falo?', 'Queria marcar uma consulta.', 'O meu número de utente é...'],
    vocabulary: [
      { word: 'Estou?', translation: 'Hello? (phone)' },
      { word: 'ligar', translation: 'to call' },
      { word: 'consulta', translation: 'appointment' },
      { word: 'número de utente', translation: 'health number' }
    ],
    is_static: true
  },
  {
    id: 'd33',
    title: 'Opinions: Agreeing & Disagreeing',
    description: 'Agree enthusiastically, disagree politely, and express nuanced views.',
    level: 2,
    day: 33,
    category: 'social',
    patterns: ['Tens razão.', 'Concordo totalmente.', 'Acho que não é bem assim.'],
    vocabulary: [
      { word: 'Concordo', translation: 'I agree' },
      { word: 'Exatamente', translation: 'Exactly' },
      { word: 'Depende', translation: 'It depends' }
    ],
    is_static: true
  },
  {
    id: 'd34',
    title: 'Collaborative Future',
    description: 'Make plans, negotiate arrangements, and coordinate with others.',
    level: 2,
    day: 34,
    category: 'social',
    patterns: ['Vamos juntos?', 'Que tal ir ao...', 'Combinado!'],
    vocabulary: [
      { word: 'Combinado', translation: 'Agreed / Deal' },
      { word: 'Boa ideia', translation: 'Good idea' },
      { word: 'Tanto faz', translation: 'It doesn\'t matter' }
    ],
    is_static: true
  },
  {
    id: 'd35',
    title: 'Week 5 Stress Test',
    description: 'Consolidate everything from Week 5. Performance under pressure.',
    level: 2,
    day: 35,
    category: 'social',
    patterns: ['Full Week 5 Review'],
    vocabulary: [],
    is_static: true
  },
  // Month 2 - Week 6
  {
    id: 'd36',
    title: 'The Present Perfect',
    description: 'Describe actions that happened in the recent past and connect to the present.',
    level: 2,
    day: 36,
    category: 'daily',
    patterns: ['Tenho adorado estar cá.', 'Tenho visto coisas incríveis.', 'Ainda não tenho ido.'],
    vocabulary: [
      { word: 'feito', translation: 'done/made' },
      { word: 'visto', translation: 'seen' },
      { word: 'vindo', translation: 'come' },
      { word: 'dito', translation: 'said' }
    ],
    is_static: true
  },
  {
    id: 'd37',
    title: 'Reflexive Verbs All Persons',
    description: 'Extend reflexive verbs to all persons in present and past tenses.',
    level: 2,
    day: 37,
    category: 'daily',
    patterns: ['Levanto-me às sete.', 'Já me sinto em casa.', 'Não te preocupes.'],
    vocabulary: [
      { word: 'lembrar-se', translation: 'to remember' },
      { word: 'esquecer-se', translation: 'to forget' },
      { word: 'habituar-se', translation: 'to get used to' }
    ],
    is_static: true
  },
  {
    id: 'd38',
    title: 'Emotions, Empathy & Comfort',
    description: 'Express and respond to emotional states naturally.',
    level: 2,
    day: 38,
    category: 'social',
    patterns: ['Estou com saudade.', 'Que pena!', 'Fiquei sem palavras!'],
    vocabulary: [
      { word: 'saudade', translation: 'longing/nostalgia' },
      { word: 'feliz', translation: 'happy' },
      { word: 'triste', translation: 'sad' },
      { word: 'emocionado', translation: 'moved/emotional' }
    ],
    is_static: true
  },
  {
    id: 'd39',
    title: 'Madeiran Geography & Culture',
    description: 'Speak about Madeira with depth and specificity.',
    level: 2,
    day: 39,
    category: 'travel',
    patterns: ['É uma ilha única no mundo.', 'A paisagem é de cortar a respiração.', 'As levadas atravessam a ilha.'],
    vocabulary: [
      { word: 'ilha', translation: 'island' },
      { word: 'laurissilva', translation: 'laurel forest' },
      { word: 'miradouro', translation: 'viewpoint' },
      { word: 'bordado', translation: 'embroidery' }
    ],
    is_static: true
  },
  {
    id: 'd40',
    title: 'Complex Sentences',
    description: 'Use embedded clauses, relative clauses, and causal chains.',
    level: 2,
    day: 40,
    category: 'daily',
    patterns: ['É um café que fica perto.', 'Desde que vim, gosto imenso.', 'Como não sabia, perguntei.'],
    vocabulary: [
      { word: 'que', translation: 'that/which' },
      { word: 'onde', translation: 'where' },
      { word: 'quando', translation: 'when' },
      { word: 'desde que', translation: 'since' }
    ],
    is_static: true
  },
  {
    id: 'd41',
    title: 'Giving Explanations',
    description: 'Explain things, follow explanations, and check understanding.',
    level: 2,
    day: 41,
    category: 'social',
    patterns: ['Deixa-me explicar.', 'Ou seja...', 'Faz sentido?'],
    vocabulary: [
      { word: 'basicamente', translation: 'basically' },
      { word: 'ou seja', translation: 'in other words' },
      { word: 'por exemplo', translation: 'for example' }
    ],
    is_static: true
  },
  {
    id: 'd42',
    title: 'Week 6 Stress Test',
    description: 'Consolidate everything from Week 6. Performance under pressure.',
    level: 2,
    day: 42,
    category: 'social',
    patterns: ['Full Week 6 Review'],
    vocabulary: [],
    is_static: true
  },
  // Month 2 - Week 7
  {
    id: 'd43',
    title: 'Vocês: Addressing Groups',
    description: 'Address groups of people correctly using vocês.',
    level: 2,
    day: 43,
    category: 'social',
    patterns: ['Vocês querem café?', 'Sentem-se, por favor!', 'Vocês gostaram?'],
    vocabulary: [
      { word: 'são', translation: 'you all are' },
      { word: 'estão', translation: 'you all are (temp)' },
      { word: 'têm', translation: 'you all have' },
      { word: 'vão', translation: 'you all go' }
    ],
    is_static: true
  },
  {
    id: 'd44',
    title: 'Future Subjunctive',
    description: 'Use natural fixed phrases for future conditionals and time clauses.',
    level: 2,
    day: 44,
    category: 'daily',
    patterns: ['Quando vier a Madeira...', 'Se puderes...', 'Assim que chegares...'],
    vocabulary: [
      { word: 'vier', translation: 'come (fut subj)' },
      { word: 'tiver', translation: 'have (fut subj)' },
      { word: 'puder', translation: 'can (fut subj)' },
      { word: 'for', translation: 'be/go (fut subj)' }
    ],
    is_static: true
  },
  {
    id: 'd45',
    title: 'The Personal Infinitive',
    description: 'Use the personal infinitive for actions with different subjects.',
    level: 2,
    day: 45,
    category: 'daily',
    patterns: ['Antes de irmos...', 'Para podermos ir...', 'É importante falarmos.'],
    vocabulary: [
      { word: 'irmos', translation: 'for us to go' },
      { word: 'falarmos', translation: 'for us to speak' },
      { word: 'comermos', translation: 'for us to eat' }
    ],
    is_static: true
  },
  {
    id: 'd46',
    title: 'Abstract Topics: Work & Decisions',
    description: 'Discuss professional topics, decisions, and plans.',
    level: 2,
    day: 46,
    category: 'daily',
    patterns: ['Trabalho por conta própria.', 'Decidi mudar de vida.', 'Não me arrependo.'],
    vocabulary: [
      { word: 'teletrabalho', translation: 'remote work' },
      { word: 'negócio', translation: 'business' },
      { word: 'esgotamento', translation: 'burnout' }
    ],
    is_static: true
  },
  {
    id: 'd47',
    title: 'Formal Writing & Funchal',
    description: 'Draft formal messages and discuss Funchal local geography.',
    level: 2,
    day: 47,
    category: 'social',
    patterns: ['Venho por este meio...', 'Agradecia se pudesse...', 'Com os melhores cumprimentos,'],
    vocabulary: [
      { word: 'Sé', translation: 'Cathedral district' },
      { word: 'zona velha', translation: 'old town' },
      { word: 'teleférico', translation: 'cable car' }
    ],
    is_static: true
  },
  {
    id: 'd48',
    title: 'Local Beaches & Hiking',
    description: 'Speak about Madeiran outdoor life with genuine local knowledge.',
    level: 2,
    day: 48,
    category: 'travel',
    patterns: ['Para praia de areia, recomendo Calheta.', 'Leva sempre capa de chuva.', 'Em maio as flores estão em pleno.'],
    vocabulary: [
      { word: 'praia de seixo', translation: 'pebble beach' },
      { word: 'cascata', translation: 'waterfall' },
      { word: 'trilho', translation: 'trail' }
    ],
    is_static: true
  },
  {
    id: 'd49',
    title: 'Week 7 Stress Test',
    description: 'Consolidate everything from Week 7. Performance under pressure.',
    level: 2,
    day: 49,
    category: 'social',
    patterns: ['Full Week 7 Review'],
    vocabulary: [],
    is_static: true
  },
  // Month 3 - Week 8
  {
    id: 'd50',
    title: 'Speed & Automaticity',
    description: 'Everything from Weeks 1-2 at maximum speed. Eliminate hesitation.',
    level: 3,
    day: 50,
    category: 'daily',
    patterns: ['Bom dia! Queria uma bica.', 'Chamo-me... Sou de...', 'Levanto-me às sete.'],
    vocabulary: [
      { word: 'pequeno-almoço', translation: 'breakfast' },
      { word: 'dezasseis', translation: 'sixteen' },
      { word: 'catorze', translation: 'fourteen' }
    ],
    is_static: true
  },
  {
    id: 'd51',
    title: 'Tense System Mastery',
    description: 'Switch between all six tenses across all persons fluidly.',
    level: 3,
    day: 51,
    category: 'daily',
    patterns: ['Antes trabalhava...', 'Mudei-me...', 'Tenho adorado...'],
    vocabulary: [
      { word: 'estava', translation: 'was (imperfect)' },
      { word: 'estive', translation: 'was (preterite)' },
      { word: 'estaria', translation: 'would be (conditional)' }
    ],
    is_static: true
  },
  {
    id: 'd52',
    title: 'Register & Social Fluency',
    description: 'Navigate tu, você, and vocês organically based on social cues.',
    level: 3,
    day: 52,
    category: 'social',
    patterns: ['Como estás? (tu)', 'Como está? (você)', 'Vocês querem...?'],
    vocabulary: [
      { word: 'tu', translation: 'you (informal)' },
      { word: 'você', translation: 'you (formal)' },
      { word: 'vocês', translation: 'you all (plural)' }
    ],
    is_static: true
  },
  {
    id: 'd53',
    title: 'Professional & Formal',
    description: 'Master formal written communication and abstract reasoning.',
    level: 3,
    day: 53,
    category: 'work',
    patterns: ['Venho por este meio...', 'Trabalho por conta própria.', 'Decidi mudar de vida.'],
    vocabulary: [
      { word: 'esgotamento', translation: 'burnout' },
      { word: 'objectivo', translation: 'goal' },
      { word: 'consultoria', translation: 'consultancy' }
    ],
    is_static: true
  },
  {
    id: 'd54',
    title: 'Madeira in Depth',
    description: 'Speak about Madeira with genuine local knowledge and emotional resonance.',
    level: 3,
    day: 54,
    category: 'travel',
    patterns: ['A floresta laurissilva é UNESCO.', 'O Pico é de cortar a respiração.', 'Fiquei sem palavras.'],
    vocabulary: [
      { word: 'inesquecível', translation: 'unforgettable' },
      { word: 'saudade', translation: 'longing/nostalgia' },
      { word: 'arquipélago', translation: 'archipelago' }
    ],
    is_static: true
  },
  {
    id: 'd55',
    title: 'Complex Structures',
    description: 'Eliminate hesitation from relative clauses, temporal chains, and subjunctives.',
    level: 3,
    day: 55,
    category: 'daily',
    patterns: ['É uma ilha que me apaixonou.', 'Desde que vim...', 'Quando vier, vai adorar.'],
    vocabulary: [
      { word: 'que', translation: 'that/which' },
      { word: 'onde', translation: 'where' },
      { word: 'enquanto', translation: 'while' }
    ],
    is_static: true
  },
  {
    id: 'd56',
    title: 'The Grand Stress Test',
    description: 'Months 1 & 2 Combined. 10-minute unscripted conversation on any topic.',
    level: 3,
    day: 56,
    category: 'social',
    patterns: ['Full Months 1 & 2 Review'],
    vocabulary: [],
    is_static: true
  }
];

const TUTORS: Tutor[] = [
  {
    id: 't1',
    name: 'Maria',
    age: 28,
    gender: 'female',
    description: 'Young and energetic, Maria loves teaching slang and modern Madeiran culture.',
    avatar: 'https://picsum.photos/seed/maria/200/200',
    personality: 'Friendly, uses lots of emojis, very encouraging and patient.'
  },
  {
    id: 't2',
    name: 'João',
    age: 45,
    gender: 'male',
    description: 'A traditionalist who focuses on perfect grammar and formal etiquette.',
    avatar: 'https://picsum.photos/seed/joao/200/200',
    personality: 'Professional, structured, focuses on precision and historical context.'
  },
  {
    id: 't3',
    name: 'Ana',
    age: 62,
    gender: 'female',
    description: 'Like a Madeiran grandmother, Ana teaches through stories and traditional recipes.',
    avatar: 'https://picsum.photos/seed/ana/200/200',
    personality: 'Warm, maternal, tells many anecdotes, focuses on cultural nuances.'
  },
  {
    id: 't4',
    name: 'Ricardo',
    age: 35,
    gender: 'male',
    description: 'A local guide who knows every levada and hidden spot in Madeira.',
    avatar: 'https://picsum.photos/seed/ricardo/200/200',
    personality: 'Adventurous, practical, focuses on travel and outdoor vocabulary.'
  },
  {
    id: 't5',
    name: 'Sofia',
    age: 22,
    gender: 'female',
    description: 'A university student who can help you sound like a local youth.',
    avatar: 'https://picsum.photos/seed/sofia/200/200',
    personality: 'Casual, fast-paced, uses current slang and social media terms.'
  }
];

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-ios-bg p-6 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-ios-black mb-2">Something went wrong</h1>
          <p className="text-ios-gray mb-8 max-w-md">
            We've encountered an unexpected error. Don't worry, your progress is safe.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg shadow-ios-blue/20 active:scale-95 transition-transform"
          >
            Reload Application
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-8 p-4 bg-black/5 rounded-xl text-left text-xs overflow-auto max-w-full text-red-600">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// Confirmation Modal Component
const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "Confirm", 
  cancelText = "Cancel",
  isDestructive = false
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  title: string, 
  message: string, 
  confirmText?: string, 
  cancelText?: string,
  isDestructive?: boolean
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl"
      >
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <p className="text-ios-gray mb-6">{message}</p>
        <div className="flex flex-col space-y-3">
          <button 
            onClick={() => { onConfirm(); onClose(); }}
            className={cn(
              "w-full py-4 rounded-2xl font-bold text-white shadow-lg",
              isDestructive ? "bg-red-500 shadow-red-500/20" : "bg-ios-blue shadow-ios-blue/20"
            )}
          >
            {confirmText}
          </button>
          <button 
            onClick={onClose}
            className="w-full py-4 bg-ios-bg text-ios-black rounded-2xl font-bold"
          >
            {cancelText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'learning' | 'chat' | 'settings'>('home');
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>(INITIAL_LESSONS);
  const [customLessons, setCustomLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatSession, setChatSession] = useState<any>(null);
  const [unlockKey, setUnlockKey] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'reset' | 'verifyOtp' | 'updatePassword' | 'none'>('none');
  const [authMethod, setAuthMethod] = useState<'password' | 'magiclink'>('password');
  const [skipVerification, setSkipVerification] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [isAIPracticeOpen, setIsAIPracticeOpen] = useState(false);
  const isAIPracticeOpenRef = useRef(isAIPracticeOpen);
  useEffect(() => {
    isAIPracticeOpenRef.current = isAIPracticeOpen;
  }, [isAIPracticeOpen]);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('is_sound_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [aiMessage, setAiMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [videoSuggestions, setVideoSuggestions] = useState<VideoSuggestion[]>([]);
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
  const [suggestionUrl, setSuggestionUrl] = useState('');
  const [suggestionNote, setSuggestionNote] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [globalVoiceLimit, setGlobalVoiceLimit] = useState(() => {
    const saved = localStorage.getItem('global_voice_limit');
    return saved ? parseInt(saved) : 5;
  });
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [requestTheme, setRequestTheme] = useState('');
  const [requestDesc, setRequestDesc] = useState('');
  const [isTutorSelectionOpen, setIsTutorSelectionOpen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    const saved = localStorage.getItem('playback_speed');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [sessionStartTime] = useState(Date.now());
  const [totalTimeInSeconds, setTotalTimeInSeconds] = useState(0);
  const [isVocabModalOpen, setIsVocabModalOpen] = useState(false);
  const [vocabQuery, setVocabQuery] = useState('');
  const [vocabResult, setVocabResult] = useState<any>(null);
  const [isVocabLoading, setIsVocabLoading] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [isCorrectionLoading, setIsCorrectionLoading] = useState(false);
  const [isUserManualOpen, setIsUserManualOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDescription, setSupportDescription] = useState('');
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [hasAcceptedAI, setHasAcceptedAI] = useState(false);
  const [isHelpMode, setIsHelpMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const supabase = getSupabase();

  console.log('App Render:', { activeTab, user: !!user, authMode, isAuthLoading });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    console.log('Showing toast:', { message, type });
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    console.log('App Supabase Check:', { 
      hasSupabase: !!supabase,
      hasAuth: !!supabase?.auth,
      authMethods: supabase?.auth ? Object.keys(supabase.auth) : 'none'
    });
    if (!supabase) {
      console.log('Supabase not found, stopping auth check');
      setIsAuthLoading(false);
      return;
    }

    const fetchApprovedVideos = async () => {
      try {
        const { data: suggestionsData } = await supabase
          .from('video_suggestions')
          .select('*')
          .eq('status', 'approved');

        if (suggestionsData && suggestionsData.length > 0) {
          setLessons(prev => {
            return prev.map(lesson => {
              const suggestion = suggestionsData
                .filter(s => s.lesson_id === lesson.id)
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
              
              if (suggestion) {
                return { ...lesson, video_url: suggestion.video_url };
              }
              return lesson;
            });
          });
        }
      } catch (err) {
        console.error('Error fetching approved videos:', err);
      }
    };

    const checkUser = async () => {
      const timeout = setTimeout(() => {
        console.log('Auth check timed out');
        setIsAuthLoading(false);
      }, 5000);

      try {
        console.log('Checking current user...');
        const { data: { user } } = await supabase.auth.getUser();
        console.log('Current user check result:', user?.id);
        setUser(user);
        if (user) {
          const fetchedProfile = await fetchProfile(user.id);
          await fetchCustomLessons(user.id, fetchedProfile?.role);
        }
      } catch (err) {
        console.error('Error in checkUser:', err);
      } finally {
        clearTimeout(timeout);
        setIsAuthLoading(false);
      }
    };

    fetchApprovedVideos();
    checkUser();

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('updatePassword');
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setAuthMode('none');
        return;
      }

      const currentUser = session?.user || null;
      setUser(currentUser);
      if (currentUser) {
        const fetchedProfile = await fetchProfile(currentUser.id);
        await fetchCustomLessons(currentUser.id, fetchedProfile?.role);
      } else {
        setProfile(null);
      }
    });

    return () => {
      if (data?.subscription) {
        console.log('Unsubscribing from auth state changes');
        data.subscription.unsubscribe();
      }
    };
  }, []);

  // Sync settings to localStorage and Supabase
  useEffect(() => {
    localStorage.setItem('playback_speed', playbackSpeed.toString());
    if (user && profile) {
      const updateProfile = async () => {
        if (!supabase) return;
        await supabase
          .from('profiles')
          .update({ playback_speed: playbackSpeed })
          .eq('id', user.id);
      };
      updateProfile();
    }
  }, [playbackSpeed, user, profile]);

  useEffect(() => {
    localStorage.setItem('is_sound_enabled', isSoundEnabled.toString());
    if (user && profile) {
      const updateProfile = async () => {
        if (!supabase) return;
        await supabase
          .from('profiles')
          .update({ is_sound_enabled: isSoundEnabled })
          .eq('id', user.id);
      };
      updateProfile();
    }
  }, [isSoundEnabled, user, profile]);

  useEffect(() => {
    localStorage.setItem('global_voice_limit', globalVoiceLimit.toString());
    if (profile?.role === 'admin') {
      const updateGlobalSettings = async () => {
        if (!supabase) return;
        // Try to update global settings table if it exists
        await supabase
          .from('global_settings')
          .upsert({ key: 'voice_limit', value: globalVoiceLimit.toString() });
      };
      updateGlobalSettings();
    }
  }, [globalVoiceLimit, profile]);

  // Fetch global settings on mount
  useEffect(() => {
    const fetchGlobalSettings = async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from('global_settings')
        .select('*')
        .eq('key', 'voice_limit')
        .single();
      
      if (data) {
        setGlobalVoiceLimit(parseInt(data.value));
      }
    };
    fetchGlobalSettings();
  }, []);
  useEffect(() => {
    const initChat = async () => {
      console.log('Initializing chat...');
      try {
        const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
        const session = await geminiService.startChat(tutor);
        setChatSession(session);
        // Don't set initial message here anymore, let the UI handle the empty state
        console.log('Chat initialized');
      } catch (err) {
        console.error('Chat initialization failed:', err);
      }
    };
    if (user && profile) {
      initChat();
    }
  }, [user, profile?.selected_tutor_id]);

  useEffect(() => {
    if (scrollRef.current && chatMessages.length > 1) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const [isRecording, setIsRecording] = useState(false);
  const [currentlySpeakingIndex, setCurrentlySpeakingIndex] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const inactivityTimerRef = useRef<any>(null);

  const getLevelName = (level: number) => {
    const levels: Record<number, string> = {
      1: "Absolute Beginner",
      2: "Beginner",
      3: "Elementary",
      4: "Pre-Intermediate",
      5: "Intermediate",
      6: "Upper-Intermediate",
      7: "Advanced",
      8: "Proficient"
    };
    return levels[level] || "Student";
  };

  const initSpeechRecognition = () => {
    if (recognitionRef.current) return recognitionRef.current;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-PT';

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsRecording(true);
      showToast("Listening...", "success");
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        if (isAIPracticeOpenRef.current) {
          setAiMessage(prev => prev + (prev ? ' ' : '') + finalTranscript);
        } else {
          setInputText(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }

        // Increment voice usage
        if (profile && supabase) {
          const today = new Date().toISOString().split('T')[0];
          const currentUsage = profile.last_voice_usage_date === today ? (profile.voice_usage_today || 0) : 0;
          
          const updatedProfile = {
            ...profile,
            voice_usage_today: currentUsage + 1,
            last_voice_usage_date: today
          };
          
          setProfile(updatedProfile);
          supabase.from('profiles').update({
            voice_usage_today: currentUsage + 1,
            last_voice_usage_date: today
          }).eq('id', profile.id).then(({ error }) => {
            if (error) handleSupabaseError(error, 'updateVoiceUsage', 'profiles');
          });
        }
      }
    };

    recognition.onnomatch = () => {
      console.log('No match found');
      showToast("Could not understand. Try again.", "error");
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        showToast("Microphone access denied. Please check your browser settings.", "error");
      } else if (event.error === 'no-speech') {
        showToast("No speech detected. Try again.", "error");
      } else {
        showToast(`Microphone error: ${event.error}`, "error");
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    return recognition;
  };

  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!isAIPracticeOpenRef.current) return;

    inactivityTimerRef.current = setTimeout(async () => {
      if (isAIPracticeOpenRef.current && !isAiLoading && chatSession && chatHistory.length > 0) {
        const lastMsg = chatHistory[chatHistory.length - 1];
        if (lastMsg.role === 'model') {
          try {
            const response = await chatSession.sendMessage({ 
              message: "(The user has been silent for a while. Prompt them to continue the lesson or ask if they have questions in a friendly, encouraging way.)" 
            });
            const newMsg = { role: 'model' as const, text: response.text };
            setChatHistory(prev => [...prev, newMsg]);
            if (isSoundEnabled) {
              playMessageInChunks(response.text, chatHistory.length);
            }
          } catch (err) {
            console.error('Inactivity prompt error:', err);
          }
        }
      }
    }, 45000); // 45 seconds of silence
  };

  const toggleRecording = () => {
    // Check voice limit
    const today = new Date().toISOString().split('T')[0];
    const usage = profile?.last_voice_usage_date === today ? (profile?.voice_usage_today || 0) : 0;
    const limit = profile?.voice_limit ?? globalVoiceLimit;

    if (usage >= limit && profile?.subscription_tier !== 'unlimited' && profile?.role !== 'admin') {
      showToast(`Daily voice limit (${limit}) reached. Upgrade to Premium for unlimited practice!`, "error");
      setIsUpgradeModalOpen(true);
      return;
    }

    const recognition = initSpeechRecognition();
    if (!recognition) {
      showToast("Speech recognition not supported in this browser.", "error");
      return;
    }

    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
        setIsRecording(true);
      } catch (e) {
        console.error('Failed to start recognition:', e);
        // If it's already started, just update state
        if (e instanceof Error && e.message.includes('already started')) {
          setIsRecording(true);
        } else {
          setIsRecording(false);
        }
      }
    }
  };

  const playMessageInChunks = async (text: string, index: number) => {
    const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
    setCurrentlySpeakingIndex(index);
    
    // Split by sentences or chunks for better pacing
    const chunks = text.split(/(?<=[.!?])\s+/);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].trim();
      if (!chunk) continue;
      
      // Check if we should still be playing
      if (!isAIPracticeOpenRef.current) break;

      await new Promise<void>((resolve) => {
        geminiService.playSpeech(chunk, tutor, playbackSpeed, () => {
          // Add a small pause between sentences to let it sink in
          setTimeout(resolve, 600);
        });
      });
    }
    
    setCurrentlySpeakingIndex(null);
    resetInactivityTimer();
  };

  const closeAIPractice = () => {
    setIsAIPracticeOpen(false);
    geminiService.stopSpeech();
    setCurrentlySpeakingIndex(null);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    setIsHelpMode(false);
    setChatSession(null);
    setChatHistory([]);
  };

  const handleSupabaseError = (error: any, operation: string, path: string) => {
    const errInfo = {
      error: error?.message || String(error),
      operationType: operation,
      path: path,
      authInfo: {
        userId: user?.id,
        email: user?.email,
      }
    };
    console.error(`Supabase Error [${operation}]:`, JSON.stringify(errInfo));
    showToast(error?.message || "Database operation failed", "error");
    return error;
  };

  const fetchProfile = async (userId: string) => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          const newProfile: UserProfile = {
            id: userId,
            email: user?.email || '',
            streak: 0,
            xp: 0,
            unlocked_level: 1,
            completed_lessons: [],
            last_active: new Date().toISOString(),
            playback_speed: playbackSpeed,
            is_sound_enabled: isSoundEnabled
          };
          const { data: created, error: insertError } = await supabase.from('profiles').insert(newProfile).select().single();
          if (insertError) throw insertError;
          setProfile(created);
          return created;
        } else {
          throw error;
        }
      } else if (data) {
        setProfile(data);
        if (data.playback_speed) setPlaybackSpeed(data.playback_speed);
        if (data.is_sound_enabled !== undefined) setIsSoundEnabled(data.is_sound_enabled);
        return data;
      }
    } catch (err) {
      handleSupabaseError(err, 'fetchProfile', 'profiles');
    }
    return null;
  };

  const fetchCustomLessons = async (userId: string, userRole?: string) => {
    if (!supabase) return;
    
    // Fetch custom lessons
    const { data: customLessonsData } = await supabase
      .from('lessons')
      .select('*')
      .eq('user_id', userId);
      
    // Fetch video suggestions
    let suggestionsQuery = supabase.from('video_suggestions').select('*');
    if (userRole !== 'admin') {
      suggestionsQuery = suggestionsQuery.or(`status.eq.approved,user_id.eq.${userId}`);
    }
    const { data: suggestionsData } = await suggestionsQuery;

    if (suggestionsData) {
      setVideoSuggestions(suggestionsData);
    }

    let mergedLessons = [...INITIAL_LESSONS];
    if (customLessonsData) {
      mergedLessons = [...mergedLessons, ...customLessonsData];
    }
    
    // Apply approved video suggestions to lessons
    if (suggestionsData) {
      const approvedSuggestions = suggestionsData.filter(s => s.status === 'approved');
      mergedLessons = mergedLessons.map(lesson => {
        // Find the most recently approved suggestion for this lesson
        const suggestion = approvedSuggestions
          .filter(s => s.lesson_id === lesson.id)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        
        if (suggestion) {
          return { ...lesson, video_url: suggestion.video_url };
        }
        return lesson;
      });
    }
    
    setLessons(mergedLessons);
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    console.log('Handling login for:', email);
    if (!supabase) return;
    if (!email || !password) {
      setAuthError("Please enter email and password");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      handleSupabaseError(error, 'handleLogin', 'auth');
      setAuthError(error.message);
    } else {
      console.log('Login successful');
      setAuthError(null);
    }
  };

  const handleSignup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);
    
    if (!hasAcceptedTerms || !hasAcceptedAI) {
      setAuthError("Please accept the Terms of Service and AI Usage Policy");
      showToast("Please accept the Terms and AI Policy", "error");
      return;
    }

    console.log('Handling signup for:', email);
    if (!supabase) return;
    if (!email || !password) {
      setAuthError("Please enter email and password");
      return;
    }
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          has_accepted_terms: hasAcceptedTerms,
          has_accepted_ai_usage: hasAcceptedAI
        }
      }
    });
    if (error) {
      handleSupabaseError(error, 'handleSignup', 'auth');
      setAuthError(error.message);
    } else {
      console.log('Signup successful', data);
      setAuthError(null);
      if (data.session && skipVerification) {
        showToast("Welcome to FalaMadeira!", "success");
      } else {
        showToast("Account created! Please check your email for confirmation.", "success");
        if (data.session) await supabase.auth.signOut();
      }
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!supabase) return;
    if (!email) {
      setAuthError("Please enter your email");
      return;
    }
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      }
    });

    if (error) {
      handleSupabaseError(error, 'handleMagicLink', 'auth');
      setAuthError(error.message);
    } else {
      showToast("Magic link sent! Check your email.", "success");
    }
  };

  const startAIPractice = async (lesson: Lesson, isHelp: boolean = false) => {
    setSelectedLesson(lesson);
    setIsAIPracticeOpen(true);
    setChatHistory([]);
    setIsAiLoading(true);
    setIsHelpMode(isHelp);

    // Add a small delay to make the transition feel less rushed
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
      const chat = await geminiService.startChat(tutor, isHelp);
      setChatSession(chat);
      
      if (isHelp) {
        setChatHistory([{ role: 'model', text: "Olá! I'm your FalaMadeira App Guide. How can I help you today? I can explain how to use the curriculum, practice with AI tutors, or manage your settings." }]);
      } else {
        const context = `Context: Month ${selectedMonth} of the learning plan. 
        Current Lesson: Day ${lesson.day} - ${lesson.title}. 
        Description: ${lesson.description}
        Focus Patterns: ${lesson.patterns.join(', ')}. 
        Vocabulary: ${lesson.vocabulary.map(v => v.word).join(', ')}.
        Lesson Goals: ${lesson.goals?.join(', ') || ''}
        Cultural/Grammar Context: ${lesson.explanation || ''}
        
        INSTRUCTION: You are the tutor. 
        1. Start the lesson by greeting the user warmly in Portuguese and English.
        2. Take a moment to explain exactly what we are going to do today. Be clear and encouraging.
        3. Do not rush. Introduce the goals of today's lesson one by one.
        4. Start with the first pattern or vocabulary word only after the introduction.
        5. Use clear Markdown formatting with double line breaks between sections.
        6. IMPORTANT: You are the guide. Lead the user through the lesson step-by-step. 
        7. Do not ask "What would you like to talk about?". Instead, say "Let's start with [Pattern/Word]. Can you repeat after me?" or similar.
        8. For each pattern/word, provide the Portuguese, a phonetic pronunciation guide, and the English translation.`;
        
        const response = await chat.sendMessage({ message: context });
        setChatHistory([{ role: 'model', text: response.text }]);
        
        if (isSoundEnabled) {
          playMessageInChunks(response.text, 0);
        }
      }
      resetInactivityTimer();
    } catch (err) {
      console.error('Start AI Practice error:', err);
      showToast("Failed to start AI tutor", "error");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAIPractice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiMessage.trim() || isAiLoading || !chatSession) return;

    const userMsg = aiMessage;
    setAiMessage('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsAiLoading(true);

    try {
      const response = await chatSession.sendMessage({ 
        message: userMsg + "\n\n(Remember to use clear Markdown formatting with double line breaks between sections and separate Portuguese/English clearly.)"
      });
      const newIndex = chatHistory.length + 1;
      setChatHistory(prev => [...prev, { role: 'model', text: response.text }]);
      
      if (isSoundEnabled) {
        playMessageInChunks(response.text, newIndex);
      } else {
        resetInactivityTimer();
      }
    } catch (err) {
      console.error('AI Practice error:', err);
      showToast("Failed to connect to AI tutor", "error");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleRequestLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestTheme.trim() || !requestDesc.trim()) return;

    if (supabase && user) {
      const { error } = await supabase.from('lesson_requests').insert({
        user_id: user.id,
        theme: requestTheme,
        description: requestDesc,
        status: 'pending'
      });

      if (error) {
        handleSupabaseError(error, 'handleRequestLesson', 'lesson_requests');
      } else {
        showToast("Request submitted successfully!", "success");
        setIsRequestModalOpen(false);
        setRequestTheme('');
        setRequestDesc('');
      }
    } else {
      // Mock success if no supabase
      showToast("Request submitted (Demo Mode)", "success");
      setIsRequestModalOpen(false);
    }
  };

  const handleSelectTutor = async (tutorId: string) => {
    if (supabase && user) {
      const { error } = await supabase.from('profiles').update({ selected_tutor_id: tutorId }).eq('id', user.id);
      if (error) {
        handleSupabaseError(error, 'handleSelectTutor', 'profiles');
      } else {
        setProfile(prev => prev ? { ...prev, selected_tutor_id: tutorId } : null);
        showToast("Tutor selected!", "success");
        setIsTutorSelectionOpen(false);
      }
    } else {
      setProfile(prev => prev ? { ...prev, selected_tutor_id: tutorId } : {
        id: 'guest',
        email: 'guest@example.com',
        streak: 0,
        xp: 0,
        unlocked_level: 1,
        completed_lessons: [],
        last_active: new Date().toISOString(),
        selected_tutor_id: tutorId,
        role: 'user'
      });
      setIsTutorSelectionOpen(false);
    }
  };

  const handleOpenTicket = async () => {
    if (!supabase || !user) return;
    if (!supportSubject || !supportDescription) {
      showToast("Please fill in all fields", "error");
      return;
    }

    setIsSubmittingSupport(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .insert({
          user_id: user.id,
          subject: supportSubject,
          description: supportDescription,
          status: 'open',
          priority: 'medium',
          created_at: new Date().toISOString()
        });

      if (error) throw error;
      
      showToast("Ticket submitted successfully!", "success");
      setIsSupportModalOpen(false);
      setSupportSubject('');
      setSupportDescription('');
    } catch (error: any) {
      handleSupabaseError(error, 'handleOpenTicket', 'tickets');
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  const handleCollectLogs = async () => {
    if (!supabase || !user) return;
    
    setConfirmModal({
      isOpen: true,
      title: "Collect Logs?",
      message: "This will collect anonymized app state and logs to help us diagnose issues. Do you permit this?",
      confirmText: "Yes, Collect",
      cancelText: "No, Cancel",
      onConfirm: async () => {
        try {
          const logs = {
            userAgent: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            activeTab,
            profile: {
              streak: profile?.streak,
              xp: profile?.xp,
              level: profile?.unlocked_level
            },
            chatHistoryLength: chatHistory.length,
            timestamp: new Date().toISOString()
          };
          
          const { error } = await supabase
            .from('logs')
            .insert({
              user_id: user.id,
              event: 'user_report',
              details: JSON.stringify(logs),
              timestamp: new Date().toISOString(),
              device_info: navigator.userAgent
            });

          if (error) throw error;
          showToast("Logs collected and sent!", "success");
        } catch (error: any) {
          handleSupabaseError(error, 'handleSendLogs', 'logs');
        }
      }
    });
  };

  const handleActivateMonth = async (month: number) => {
    if (supabase && user) {
      const { error } = await supabase.from('profiles').update({ active_month: month }).eq('id', user.id);
      if (error) {
        handleSupabaseError(error, 'handleActivateMonth', 'profiles');
      } else {
        setProfile(prev => prev ? { ...prev, active_month: month } : null);
        showToast(`Month ${month} activated! Local audio cache cleared for new month.`, "success");
        // Clear audio cache for new month
        import('./lib/audioCache').then(({ audioCache }) => audioCache.clear());
        // In a real app, we would trigger a background download here
        localStorage.setItem(`active_lessons_month_${month}`, JSON.stringify(lessons.filter(l => l.level === month)));
      }
    } else {
      setProfile(prev => prev ? { ...prev, active_month: month } : null);
      localStorage.setItem(`active_lessons_month_${month}`, JSON.stringify(lessons.filter(l => l.level === month)));
      showToast(`Month ${month} activated! Local audio cache cleared.`, "success");
      import('./lib/audioCache').then(({ audioCache }) => audioCache.clear());
    }
  };

  const sortedLessons = useMemo(() => {
    const monthLessons = lessons.filter(l => l.level === selectedMonth);
    if (!profile?.completed_lessons_order) return monthLessons.sort((a, b) => (a.day || 0) - (b.day || 0));

    const completed = monthLessons.filter(l => profile.completed_lessons.includes(l.id));
    const others = monthLessons.filter(l => !profile.completed_lessons.includes(l.id));

    const orderedCompleted = [...completed].sort((a, b) => {
      const aIdx = profile.completed_lessons_order!.indexOf(a.id);
      const bIdx = profile.completed_lessons_order!.indexOf(b.id);
      if (aIdx === -1 && bIdx === -1) return (a.day || 0) - (b.day || 0);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    return [...orderedCompleted, ...others.sort((a, b) => (a.day || 0) - (b.day || 0))];
  }, [lessons, selectedMonth, profile?.completed_lessons, profile?.completed_lessons_order]);

  const handleReorder = (newOrder: Lesson[]) => {
    if (!profile) return;
    
    // Only update order for completed lessons
    const completedIds = newOrder
      .filter(l => profile.completed_lessons.includes(l.id))
      .map(l => l.id);
      
    setProfile({ ...profile, completed_lessons_order: completedIds });
  };

  const handleSuggestVideo = async () => {
    if (!selectedLesson || !suggestionUrl.trim() || !supabase || !user) return;
    
    const newSuggestion = {
      lesson_id: selectedLesson.id,
      user_id: user.id,
      video_url: suggestionUrl,
      note: suggestionNote,
      status: 'pending'
    };
    
    try {
      const { data, error } = await supabase
        .from('video_suggestions')
        .insert(newSuggestion)
        .select()
        .single();
        
      if (error) throw error;
      
      setVideoSuggestions([data, ...videoSuggestions]);
      setIsSuggestionModalOpen(false);
      setSuggestionUrl('');
      setSuggestionNote('');
      showToast('Suggestion submitted for review!', 'success');
    } catch (err) {
      handleSupabaseError(err, 'insert', 'video_suggestions');
    }
  };

  const handleApproveSuggestion = async (suggestion: VideoSuggestion) => {
    if (!supabase) return;
    
    try {
      const { error } = await supabase
        .from('video_suggestions')
        .update({ status: 'approved' })
        .eq('id', suggestion.id);
        
      if (error) throw error;
      
      // Update lesson with new video URL
      setLessons(prev => prev.map(l => 
        l.id === suggestion.lesson_id ? { ...l, video_url: suggestion.video_url } : l
      ));
      
      // Update suggestion status
      setVideoSuggestions(prev => prev.map(s => 
        s.id === suggestion.id ? { ...s, status: 'approved' } : s
      ));
      showToast('Video approved and added to lesson!', 'success');
    } catch (err) {
      handleSupabaseError(err, 'update', 'video_suggestions');
    }
  };

  const handleRejectSuggestion = async (suggestion: VideoSuggestion) => {
    if (!supabase) return;
    
    try {
      const { error } = await supabase
        .from('video_suggestions')
        .update({ status: 'rejected' })
        .eq('id', suggestion.id);
        
      if (error) throw error;
      
      setVideoSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      showToast('Suggestion rejected', 'success');
    } catch (err) {
      handleSupabaseError(err, 'update', 'video_suggestions');
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionText.trim() || !selectedLesson || isCorrectionLoading) return;

    setIsCorrectionLoading(true);
    if (supabase && user) {
      const { error } = await supabase.from('lesson_corrections').insert({
        lesson_id: selectedLesson.id,
        user_id: user.id,
        correction_text: correctionText,
        status: 'pending'
      });

      if (error) {
        handleSupabaseError(error, 'handleSubmitCorrection', 'lesson_corrections');
      } else {
        showToast("Correction submitted for review!", "success");
        setIsCorrectionModalOpen(false);
        setCorrectionText('');
      }
    } else {
      showToast("Correction submitted (Demo Mode)", "success");
      setIsCorrectionModalOpen(false);
      setCorrectionText('');
    }
    setIsCorrectionLoading(false);
  };

  const handleVocabLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vocabQuery.trim() || isVocabLoading) return;

    setIsVocabLoading(true);
    setVocabResult(null);
    try {
      const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
      const result = await geminiService.translateWord(vocabQuery, tutor);
      setVocabResult(result);
    } catch (err) {
      console.error('Vocab lookup error:', err);
      showToast("Failed to lookup word", "error");
    } finally {
      setIsVocabLoading(false);
    }
  };

  const learningPlan = [
    { month: 1, title: "Foundations & Daily Life", focus: "Greetings, Past Tense, Shopping, Health", details: "Master basic interactions, talk about your day, shop for clothes, and handle medical situations." },
    { month: 2, title: "Deepening Skills", focus: "Complex Grammar, Levadas, Local Culture", details: "Navigate complex social situations, explore the island's natural beauty, and dive deeper into Madeiran traditions." },
    { month: 3, title: "Past & Future", focus: "Storytelling, Travel Plans", details: "Talk about your weekend in Porto Moniz and plan your next trip to Porto Santo." },
    { month: 4, title: "Local Slang", focus: "Regionalisms, Subjunctive", details: "Master the 'Modo de Falar' and complex grammar for deeper conversations." },
    { month: 5, title: "Social Mastery", focus: "Dinner Parties, Traditions", details: "Discuss 'Espetada' traditions and participate in local 'Arraiais'." },
    { month: 6, title: "Full Immersion", focus: "History, Politics, Debate", details: "Understand the history of the archipelago and express complex opinions fluently." },
  ];

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!supabase) return;
    
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      handleSupabaseError(error, 'handleResetPassword', 'auth');
      setAuthError(error.message);
    } else {
      showToast("Check email for 6-digit code", "success");
      setAuthMode('verifyOtp');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!supabase) return;

    const { data, error } = await supabase.auth.verifyOtp({ 
      email, 
      token: otpCode, 
      type: 'recovery' 
    });

    if (error) {
      handleSupabaseError(error, 'handleVerifyOtp', 'auth');
      setAuthError(error.message);
    } else {
      showToast("Code verified!", "success");
      setAuthMode('updatePassword');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!supabase) return;

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      handleSupabaseError(error, 'handleUpdatePassword', 'auth');
      setAuthError(error.message);
    } else {
      showToast("Password updated successfully!", "success");
      setAuthMode('login');
      setPassword('');
      setEmail('');
      setOtpCode('');
    }
  };

  const handleLogout = async () => {
    console.log('Initiating logout process...');
    if (!supabase) {
      console.error('Supabase client not available for logout');
      return;
    }
    
    try {
      // Force local state clearing immediately for better UX
      setUser(null);
      setProfile(null);
      setAuthMode('none');
      setEmail('');
      setPassword('');
      setChatHistory([]);
      setChatSession(null);
      setIsAIPracticeOpen(false);
      setLessons([]);
      setCustomLessons([]);
      setTotalTimeInSeconds(0);
      setAiMessage('');
      setChatMessages([]);
      setIsAdminMode(false);
      
      // Attempt server-side sign out
      const { error } = await supabase.auth.signOut();
      if (error) {
        handleSupabaseError(error, 'handleLogout', 'auth');
      } else {
        showToast("Signed out successfully", "success");
      }
      
      console.log('Logout process completed successfully');
    } catch (error: any) {
      console.error('Critical logout error:', error);
      showToast("Signed out with errors", "error");
    }
  };

  const handleUnlockLevel = async () => {
    if (!supabase || !user) return;
    if (unlockKey.toUpperCase() === 'MADEIRA2026') {
      const nextLevel = (profile?.unlocked_level || 1) + 1;
      const { error } = await supabase
        .from('profiles')
        .update({ unlocked_level: nextLevel })
        .eq('id', user.id);
      
      if (!error) {
        setProfile(prev => prev ? { ...prev, unlocked_level: nextLevel } : null);
        showToast(`Level ${nextLevel} unlocked!`, "success");
        setUnlockKey('');
        setIsUnlockModalOpen(false);
      } else {
        showToast(error.message, "error");
      }
    } else {
      showToast("Invalid key. Try 'MADEIRA2026' for demo.", "error");
    }
  };

  const saveGeneratedLesson = async (lessonData: any) => {
    if (!supabase || !user) return;
    const newLesson: Partial<Lesson> & { user_id: string } = {
      ...lessonData,
      user_id: user.id,
      is_static: false,
      level: profile?.unlocked_level || 1,
      category: 'custom'
    };

    const { data, error } = await supabase.from('lessons').insert(newLesson).select().single();
    if (data) {
      setLessons(prev => [...prev, data]);
      showToast("Lesson saved to your library!", "success");
    } else if (error) {
      handleSupabaseError(error, 'saveGeneratedLesson', 'lessons');
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !chatSession) return;

    const userMsg: ChatMessage = { role: 'user', text: inputText, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const result = await chatSession.sendMessage({ message: inputText });
      const modelMsg: ChatMessage = { role: 'model', text: result.text, timestamp: Date.now() };
      setChatMessages(prev => [...prev, modelMsg]);
    } catch (error: any) {
      console.error("Chat error:", error);
      showToast(error?.message || "AI Tutor is temporarily unavailable", "error");
    } finally {
      setIsTyping(false);
    }
  };

  const lastPlayTimeRef = useRef(0);
  const playSpeech = async (text: string) => {
    const now = Date.now();
    if (now - lastPlayTimeRef.current < 300) return;
    lastPlayTimeRef.current = now;

    try {
      setIsAudioPlaying(true);
      const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
      await geminiService.playSpeech(text, tutor, playbackSpeed, () => {
        setIsAudioPlaying(false);
      });
    } catch (err: any) {
      console.error('Play speech error:', err);
      showToast(err?.message || "Audio playback failed", "error");
      setIsAudioPlaying(false);
    }
  };

  // Time tracking
  useEffect(() => {
    const interval = setInterval(() => {
      setTotalTimeInSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Sync time to profile periodically
  useEffect(() => {
    const syncTime = async () => {
      if (supabase && user && totalTimeInSeconds > 0 && totalTimeInSeconds % 60 === 0) {
        const newTotal = (profile?.total_time_spent || 0) + 60;
        const { error } = await supabase.from('profiles').update({ total_time_spent: newTotal }).eq('id', user.id);
        if (error) {
          handleSupabaseError(error, 'syncTime', 'profiles');
        } else {
          setProfile(prev => prev ? { ...prev, total_time_spent: newTotal } : null);
        }
      }
    };
    syncTime();
  }, [totalTimeInSeconds, user, profile?.total_time_spent]);

  // Setup Guide for Supabase
  if (!supabase && !isAuthLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-8 bg-ios-bg space-y-8 text-center">
        <div className="w-20 h-20 bg-orange-100 rounded-3xl flex items-center justify-center text-orange-600">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">Supabase Setup Required</h1>
          <p className="text-ios-gray text-sm leading-relaxed max-w-xs mx-auto">
            To enable user accounts, progress tracking, and lesson saving, you need to configure your Supabase credentials.
          </p>
        </div>
        
        <div className="w-full max-w-sm bg-white p-6 rounded-3xl ios-shadow space-y-6 text-left">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-ios-blue text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
              <p className="text-sm">Go to <a href="https://supabase.com/dashboard" target="_blank" className="text-ios-blue font-bold inline-flex items-center">Supabase Dashboard <ExternalLink className="w-3 h-3 ml-1" /></a></p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-ios-blue text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
              <p className="text-sm">Copy your <b>Project URL</b> and <b>Anon Key</b> from Settings &gt; API.</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-ios-blue text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
              <p className="text-sm">Add them to the <b>Secrets</b> panel in AI Studio:</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="p-3 bg-ios-bg rounded-xl flex items-center justify-between font-mono text-[10px]">
              <span>VITE_SUPABASE_URL</span>
              <Copy className="w-3 h-3 text-ios-gray" />
            </div>
            <div className="p-3 bg-ios-bg rounded-xl flex items-center justify-between font-mono text-[10px]">
              <span>VITE_SUPABASE_ANON_KEY</span>
              <Copy className="w-3 h-3 text-ios-gray" />
            </div>
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg shadow-ios-blue/20"
          >
            I've added the keys, refresh
          </button>
        </div>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-ios-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ios-blue" />
      </div>
    );
  }

  if (!user || authMode === 'updatePassword') {
    const getTitle = () => {
      switch(authMode) {
        case 'login': return 'Welcome Back';
        case 'signup': return 'Create Account';
        case 'reset': return 'Reset Password';
        case 'updatePassword': return 'New Password';
        default: return 'FalaMadeira';
      }
    };

    return (
      <div className="h-screen flex flex-col items-center justify-center p-8 bg-ios-bg space-y-8">
        {authMode === 'none' && (
          <>
            <div className="w-24 h-24 bg-ios-blue rounded-3xl flex items-center justify-center text-white shadow-2xl">
              <MessageCircle className="w-12 h-12" />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">FalaMadeira</h1>
              <p className="text-ios-gray">Master the Madeiran dialect.</p>
            </div>
          </>
        )}

        {authMode === 'none' ? (
          <div className="w-full max-w-xs space-y-4">
            <button 
              onClick={() => {
                console.log('Login mode selected');
                setAuthMode('login');
              }} 
              className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg shadow-ios-blue/20"
            >
              Log In
            </button>
            <button 
              onClick={() => {
                console.log('Signup mode selected');
                setAuthMode('signup');
              }} 
              className="w-full py-4 bg-white text-ios-blue border border-ios-blue rounded-2xl font-bold"
            >
              Sign Up
            </button>
          </div>
        ) : (
          <motion.form 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (authMethod === 'magiclink' && (authMode === 'login' || authMode === 'signup')) {
                handleMagicLink(e);
              } else if (authMode === 'login') {
                handleLogin(e);
              } else if (authMode === 'signup') {
                handleSignup(e);
              } else if (authMode === 'reset') {
                handleResetPassword(e);
              } else if (authMode === 'verifyOtp') {
                handleVerifyOtp(e);
              } else {
                handleUpdatePassword(e);
              }
            }}
            className="w-full max-w-xs space-y-4 bg-white p-6 rounded-3xl ios-shadow"
          >
            <h2 className="text-xl font-bold text-center">{getTitle()}</h2>
            
            {(authMode === 'login' || authMode === 'signup') && (
              <div className="flex p-1 bg-ios-bg rounded-xl">
                <button 
                  type="button"
                  onClick={() => setAuthMethod('password')}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    authMethod === 'password' ? "bg-white shadow-sm text-ios-blue" : "text-ios-gray"
                  )}
                >
                  Password
                </button>
                <button 
                  type="button"
                  onClick={() => setAuthMethod('magiclink')}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    authMethod === 'magiclink' ? "bg-white shadow-sm text-ios-blue" : "text-ios-gray"
                  )}
                >
                  Magic Link
                </button>
              </div>
            )}

            {authError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start space-x-2 text-red-600 text-xs animate-pulse">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-3">
              {(authMode === 'login' || authMode === 'signup' || authMode === 'reset') && (
                <input 
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-3 bg-ios-bg rounded-xl outline-none text-sm"
                  required
                />
              )}
              {authMethod === 'password' && (authMode === 'login' || authMode === 'signup' || authMode === 'updatePassword') && (
                <input 
                  type="password"
                  placeholder={authMode === 'updatePassword' ? "New Password" : "Password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 bg-ios-bg rounded-xl outline-none text-sm"
                  required
                />
              )}
              {authMode === 'verifyOtp' && (
                <input 
                  type="text"
                  placeholder="6-digit code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full p-3 bg-ios-bg rounded-xl outline-none text-sm"
                  required
                />
              )}
            </div>

            {authMode === 'signup' && (
              <div className="flex items-center justify-between p-3 bg-ios-bg rounded-xl">
                <span className="text-xs font-medium text-ios-gray">Skip Email Verification</span>
                <button 
                  type="button"
                  onClick={() => setSkipVerification(!skipVerification)}
                  className={cn(
                    "w-10 h-5 rounded-full relative transition-colors",
                    skipVerification ? "bg-ios-blue" : "bg-ios-gray/30"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                    skipVerification ? "left-6" : "left-1"
                  )} />
                </button>
              </div>
            )}

            {authMode === 'signup' && (
              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative flex items-center mt-0.5">
                    <input 
                      type="checkbox" 
                      checked={hasAcceptedTerms}
                      onChange={(e) => setHasAcceptedTerms(e.target.checked)}
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-ios-gray/30 bg-ios-bg transition-all checked:bg-ios-blue checked:border-ios-blue"
                    />
                    <Check className="absolute left-1/2 top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                  <span className="text-[11px] leading-tight text-ios-gray group-hover:text-ios-blue transition-colors">
                    I agree to the <button type="button" className="underline font-bold">Terms of Service</button> and <button type="button" className="underline font-bold">Privacy Policy</button> (GDPR compliant).
                  </span>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative flex items-center mt-0.5">
                    <input 
                      type="checkbox" 
                      checked={hasAcceptedAI}
                      onChange={(e) => setHasAcceptedAI(e.target.checked)}
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-ios-gray/30 bg-ios-bg transition-all checked:bg-ios-blue checked:border-ios-blue"
                    />
                    <Check className="absolute left-1/2 top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                  <span className="text-[11px] leading-tight text-ios-gray group-hover:text-ios-blue transition-colors">
                    I understand that I am interacting with an AI system (EU AI Act disclosure). My data will be used to personalize my learning experience.
                  </span>
                </label>
              </div>
            )}

            <button 
              type="submit" 
              className="w-full py-3 bg-ios-blue text-white rounded-xl font-bold"
            >
              {authMethod === 'magiclink' && (authMode === 'login' || authMode === 'signup') ? 'Send Magic Link' : 
               authMode === 'login' ? 'Log In' : 
               authMode === 'signup' ? 'Sign Up' : 
               authMode === 'reset' ? 'Send Reset Link' : 
               authMode === 'verifyOtp' ? 'Verify Code' :
               'Update Password'}
            </button>

            {authMode === 'login' && authMethod === 'password' && (
              <button 
                type="button"
                onClick={() => setAuthMode('reset')}
                className="w-full text-xs text-ios-blue font-bold"
              >
                Forgot Password?
              </button>
            )}

            {authMode === 'signup' && (
              <div className="p-3 bg-blue-50 rounded-xl space-y-2">
                <p className="text-[10px] text-blue-700 font-medium leading-tight">
                  💡 <b>Note:</b> If you can't access your email, remember to disable <b>"Confirm Email"</b> in your Supabase Auth Settings.
                </p>
              </div>
            )}

            <button 
              type="button" 
              onClick={() => {
                setAuthMode('none');
                setAuthError(null);
              }}
              className="w-full text-sm text-ios-gray font-medium"
            >
              Cancel
            </button>
          </motion.form>
        )}

        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white text-sm font-bold shadow-xl z-50",
              toast.type === 'success' ? "bg-green-500" : "bg-red-500"
            )}
          >
            {toast.message}
          </motion.div>
        )}
      </div>
    );
  }

  const renderHome = () => (
    <div className="p-6 space-y-6 overflow-y-auto h-full pb-32">
      <header className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Olá, {user.email?.split('@')[0]}!</h1>
            <div className="flex items-center space-x-2">
              <p className="text-ios-gray">{getLevelName(profile?.unlocked_level || 1)}</p>
              <button 
                onClick={() => setIsUnlockModalOpen(true)}
                className="p-1.5 bg-ios-bg rounded-full text-ios-blue hover:bg-ios-blue/10 transition-colors"
                title="Unlock Next Level"
              >
                <Key className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        <button onClick={() => setActiveTab('settings')} className="w-12 h-12 rounded-full bg-ios-blue/10 flex items-center justify-center text-ios-blue">
          <UserIcon className="w-6 h-6" />
        </button>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="bg-white p-3 rounded-2xl ios-shadow flex items-center space-x-3">
          <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Trophy className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <span className="text-lg font-bold block leading-none">{profile?.streak || 0}</span>
            <span className="text-[10px] text-ios-gray uppercase font-bold">Streak</span>
          </div>
        </div>
        <div className="bg-white p-3 rounded-2xl ios-shadow flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-ios-blue" />
          </div>
          <div>
            <span className="text-lg font-bold block leading-none">{profile?.xp || 0}</span>
            <span className="text-[10px] text-ios-gray uppercase font-bold">Total XP</span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Today's Lesson</h2>
        <div className="bg-ios-blue p-6 rounded-[32px] text-white shadow-xl relative overflow-hidden group active:scale-95 transition-all">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <Zap className="w-24 h-24" />
          </div>
          <div className="relative z-10 space-y-4">
            <div>
              <h3 className="text-2xl font-bold">Ready for Day {profile?.unlocked_level || 1}?</h3>
              <p className="text-blue-100 text-sm opacity-90">Continue your journey with your AI tutor.</p>
            </div>
            <button 
              onClick={() => {
                const nextLesson = lessons.find(l => l.day === (profile?.unlocked_level || 1)) || lessons[0];
                startAIPractice(nextLesson);
              }}
              className="px-6 py-3 bg-white text-ios-blue rounded-2xl font-bold text-sm shadow-lg flex items-center space-x-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Today's Lesson</span>
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Continue Learning</h2>
          <button onClick={() => setActiveTab('learning')} className="text-ios-blue text-sm font-medium">See All</button>
        </div>
        <div 
          onClick={() => { setSelectedLesson(lessons[0]); setActiveTab('learning'); }}
          className="bg-white p-5 rounded-2xl ios-shadow flex items-center justify-between cursor-pointer active:scale-95 transition-transform"
        >
          <div className="flex items-center">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-green-600 mr-4">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold">{lessons[0].title}</h3>
              <p className="text-sm text-ios-gray">Month {lessons[0].level} • {lessons[0].category}</p>
            </div>
          </div>
          <ChevronRight className="text-ios-gray" />
        </div>
      </section>
    </div>
  );

  const renderLearning = () => (
    <div className="p-6 space-y-6 overflow-y-auto h-full pb-32 no-scrollbar">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Learning Plan</h1>
        <button 
          onClick={() => setIsAIPracticeOpen(true)}
          className="p-3 bg-ios-blue text-white rounded-full shadow-lg active:scale-95 transition-transform"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      </div>

      <div className="bg-white rounded-3xl p-6 ios-shadow">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">6-Month Roadmap</h2>
          <button 
            onClick={() => setIsRequestModalOpen(true)}
            className="flex items-center space-x-1 text-ios-blue text-xs font-bold"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Request Theme</span>
          </button>
        </div>
        <div className="flex space-x-4 overflow-x-auto pb-4 no-scrollbar">
          {learningPlan.map((p) => (
            <button
              key={p.month}
              onClick={() => setSelectedMonth(p.month)}
              className={cn(
                "flex-shrink-0 w-24 h-24 rounded-2xl flex flex-col items-center justify-center transition-all relative",
                selectedMonth === p.month ? "bg-ios-blue text-white scale-105 shadow-md" : "bg-ios-bg text-ios-gray"
              )}
            >
              {profile?.active_month === p.month && (
                <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full p-1 shadow-sm">
                  <CheckCircle2 className="w-3 h-3" />
                </div>
              )}
              <span className="text-[10px] font-bold uppercase">Month</span>
              <span className="text-2xl font-black">{p.month}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={selectedMonth}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-white rounded-3xl p-6 ios-shadow space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-ios-blue">{learningPlan[selectedMonth-1].title}</h3>
            <div className="flex items-center space-x-2">
              {profile?.active_month === selectedMonth ? (
                <span className="flex items-center space-x-1 text-green-500 text-[10px] font-bold uppercase">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Active</span>
                </span>
              ) : (
                <button 
                  onClick={() => handleActivateMonth(selectedMonth)}
                  className="flex items-center space-x-1 text-ios-blue text-[10px] font-bold uppercase bg-ios-bg px-2 py-1 rounded-full"
                >
                  <Download className="w-3 h-3" />
                  <span>Activate</span>
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-ios-gray leading-relaxed">
            {learningPlan[selectedMonth-1].details}
          </p>
          <div className="p-4 bg-ios-bg rounded-2xl">
            <h4 className="text-[10px] font-bold text-ios-gray uppercase mb-2">Focus Areas</h4>
            <p className="text-sm font-medium">{learningPlan[selectedMonth-1].focus}</p>
          </div>
          
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-ios-gray uppercase">Daily Curriculum</h4>
              <button 
                onClick={() => setIsReviewMode(!isReviewMode)}
                className={cn(
                  "text-[10px] font-bold uppercase px-2 py-1 rounded-full transition-colors",
                  isReviewMode ? "bg-ios-blue text-white" : "bg-ios-bg text-ios-gray"
                )}
              >
                {isReviewMode ? "Finish Review" : "Review Mode"}
              </button>
            </div>

            <Reorder.Group axis="y" values={sortedLessons} onReorder={handleReorder} className="space-y-3">
              {sortedLessons.map(lesson => {
                const isCompleted = profile?.completed_lessons.includes(lesson.id);
                const canDrag = isReviewMode && isCompleted;

                return (
                  <Reorder.Item 
                    key={lesson.id} 
                    value={lesson}
                    dragListener={canDrag}
                    className={cn(
                      "flex items-center justify-between p-4 bg-ios-bg rounded-2xl cursor-pointer active:scale-[0.98] transition-all",
                      canDrag && "border-2 border-dashed border-ios-blue/30"
                    )}
                    onClick={() => !isReviewMode && setSelectedLesson(lesson)}
                  >
                    <div className="flex items-center">
                      {canDrag && <GripVertical className="w-4 h-4 text-ios-gray mr-2" />}
                      <div className="w-10 h-10 rounded-xl bg-white flex flex-col items-center justify-center text-ios-blue mr-3 shadow-sm border border-ios-blue/10">
                        <span className="text-[8px] font-bold uppercase leading-none">Day</span>
                        <span className="text-sm font-black leading-none">{lesson.day}</span>
                      </div>
                      <div>
                        <span className="text-sm font-bold block">{lesson.title}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-ios-gray font-medium">{lesson.category}</span>
                          {lesson.video_url && <Youtube className="w-3 h-3 text-red-500" />}
                          {isCompleted && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                        </div>
                      </div>
                    </div>
                    {!isReviewMode && <ChevronRight className="w-4 h-4 text-ios-gray" />}
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>

          <button 
            onClick={() => {
              const monthLessons = lessons.filter(l => l.level === selectedMonth).sort((a, b) => (a.day || 0) - (b.day || 0));
              const nextLesson = monthLessons.find(l => !profile?.completed_lessons.includes(l.id)) || monthLessons[0];
              if (nextLesson) {
                startAIPractice(nextLesson);
              }
            }}
            className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-[0.98] transition-all mt-4"
          >
            Start Today's Lesson
          </button>
        </motion.div>
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-3xl ios-shadow flex flex-col items-center text-center space-y-2">
          <div className="w-10 h-10 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold uppercase text-ios-gray">Vocabulary</span>
          <span className="text-lg font-black">{profile?.completed_lessons?.length || 0 * 12}</span>
        </div>
        <div className="bg-white p-4 rounded-3xl ios-shadow flex flex-col items-center text-center space-y-2">
          <div className="w-10 h-10 bg-green-100 text-green-500 rounded-full flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold uppercase text-ios-gray">Streak</span>
          <span className="text-lg font-black">{profile?.streak || 0} Days</span>
        </div>
      </div>

      {/* Lesson Detail Modal */}
      <AnimatePresence>
        {selectedLesson && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end justify-center"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-md h-[90vh] rounded-t-[40px] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-ios-bg flex items-center justify-between">
                <h2 className="text-xl font-bold">Lesson Details</h2>
                <button onClick={() => setSelectedLesson(null)} className="p-2 bg-ios-bg rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                {selectedLesson.video_url && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-ios-gray uppercase tracking-wider flex items-center">
                      <Youtube className="w-3 h-3 mr-1 text-red-500" />
                      <span>Video Lesson</span>
                    </h4>
                    <VideoPlayer url={selectedLesson.video_url} />
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">{selectedLesson.title}</h3>
                  <p className="text-ios-gray">{selectedLesson.description}</p>
                </div>

                {selectedLesson.goals && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">Lesson Goals</h4>
                    <ul className="space-y-2">
                      {selectedLesson.goals.map((goal, i) => (
                        <li key={i} className="flex items-start space-x-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{goal}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedLesson.explanation && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">Background & Context</h4>
                    <div className="p-4 bg-ios-bg rounded-2xl text-sm leading-relaxed">
                      {selectedLesson.explanation}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">Common Patterns</h4>
                  <div className="space-y-2">
                    {selectedLesson.patterns.map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-ios-bg rounded-2xl">
                        <span className="font-medium text-sm">{p}</span>
                        <button onClick={() => playSpeech(p)} className="text-ios-blue">
                          <Volume2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">Vocabulary</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {selectedLesson.vocabulary.map((v, i) => (
                      <div key={i} className="flex items-center justify-between p-4 border-b border-ios-bg last:border-0">
                        <div>
                          <p className="font-bold text-sm">{v.word}</p>
                          <p className="text-xs text-ios-gray">{v.translation}</p>
                        </div>
                        <button onClick={() => playSpeech(v.word)} className="text-ios-blue">
                          <Volume2 className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-6 bg-white border-t border-ios-bg space-y-3">
                <button 
                  onClick={() => {
                    if (selectedLesson) startAIPractice(selectedLesson);
                  }}
                  className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
                >
                  Start Practice Session
                </button>
                <button 
                  onClick={() => setIsQuizOpen(true)}
                  className="w-full py-4 bg-ios-bg text-ios-blue rounded-2xl font-bold active:scale-95 transition-transform"
                >
                  Start Practice Quiz
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={() => setIsVocabModalOpen(true)}
                    className="py-3 bg-ios-bg text-ios-blue rounded-xl font-bold text-[10px] flex flex-col items-center justify-center space-y-1"
                  >
                    <Search className="w-4 h-4" />
                    <span>Vocab</span>
                  </button>
                  <button 
                    onClick={() => setIsSuggestionModalOpen(true)}
                    className="py-3 bg-ios-bg text-ios-blue rounded-xl font-bold text-[10px] flex flex-col items-center justify-center space-y-1"
                  >
                    <Youtube className="w-4 h-4" />
                    <span>Suggest Video</span>
                  </button>
                  <button 
                    onClick={() => setIsCorrectionModalOpen(true)}
                    className="py-3 bg-ios-bg text-ios-gray rounded-xl font-bold text-[10px] flex flex-col items-center justify-center space-y-1"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Correction</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const renderChat = () => (
    <div className="flex flex-col h-full relative">
      <header className="p-4 border-b bg-white/80 ios-blur sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-ios-blue flex items-center justify-center text-white mr-3 overflow-hidden">
            <img 
              src={TUTORS.find(t => t.id === profile?.selected_tutor_id)?.avatar || TUTORS[0].avatar} 
              alt="AI Tutor" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h2 className="font-bold">AI {TUTORS.find(t => t.id === profile?.selected_tutor_id)?.name || 'Maria'}</h2>
            <p className="text-xs text-green-500 font-medium">Online • Madeiran Accent</p>
          </div>
        </div>
        <button className="p-2 text-ios-blue">
          <Settings className="w-5 h-5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {chatMessages.length === 0 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="p-8 bg-gradient-to-br from-ios-blue/10 to-ios-blue/5 rounded-[32px] border border-ios-blue/10 space-y-6 text-center">
              <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto mb-4 rotate-3">
                <Sparkles className="w-10 h-10 text-ios-blue" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-ios-blue tracking-tight">Bem-vindo ao seu Tutor!</h3>
                <p className="text-sm text-ios-gray leading-relaxed">
                  I'm your AI language partner, specialized in Madeiran Portuguese. 
                  Ready to level up your skills?
                </p>
              </div>
              
              <div className="grid gap-3 pt-4">
                <button 
                  onClick={() => {
                    const nextLesson = lessons.find(l => l.day === (profile?.unlocked_level || 1)) || lessons[0];
                    startAIPractice(nextLesson);
                  }}
                  className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold text-sm shadow-lg shadow-ios-blue/20 active:scale-95 transition-all flex items-center justify-center space-x-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Today's Lesson (Day {profile?.unlocked_level || 1})</span>
                </button>
                
                <button 
                  onClick={() => {
                    const tutor = TUTORS.find(t => t.id === profile?.selected_tutor_id) || TUTORS[0];
                    setChatMessages([{
                      role: 'model',
                      text: `Olá! I'm ${tutor.name}. I'm here and ready to chat. We can talk about anything, or I can help you with specific questions about Portuguese. What's on your mind?`,
                      timestamp: Date.now()
                    }]);
                  }}
                  className="w-full py-4 bg-white text-ios-blue border border-ios-blue/20 rounded-2xl font-bold text-sm active:scale-95 transition-all"
                >
                  Just Want to Chat
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 px-2">
              <div className="p-4 bg-ios-bg rounded-2xl space-y-2">
                <div className="w-8 h-8 bg-ios-blue/10 rounded-lg flex items-center justify-center text-ios-blue">
                  <Mic className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-xs">Voice Practice</h4>
                <p className="text-[10px] text-ios-gray">Speak naturally and I'll help with your pronunciation.</p>
              </div>
              <div className="p-4 bg-ios-bg rounded-2xl space-y-2">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                  <BookOpen className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-xs">Vocabulary</h4>
                <p className="text-[10px] text-ios-gray">Ask me for translations or explanations of words.</p>
              </div>
            </div>
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <motion.div 
            key={`chat-${i}`}
            initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "flex items-end space-x-2",
              msg.role === 'user' ? "flex-row-reverse space-x-reverse" : "flex-row"
            )}
          >
            <div className={cn(
              "max-w-[95%] p-4 rounded-2xl text-sm",
              msg.role === 'user' 
                ? "bg-ios-blue text-white rounded-tr-none" 
                : "bg-white ios-shadow rounded-tl-none"
            )}>
              <div className="prose prose-sm max-w-none">
                <Markdown>{msg.text}</Markdown>
              </div>
              {msg.role === 'model' && (
                <div className="flex space-x-2 mt-2">
                  <button 
                    onClick={() => playSpeech(msg.text)}
                    className="text-ios-blue flex items-center space-x-1"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span className="text-xs font-bold">Listen</span>
                  </button>
                  {msg.text.includes('{') && msg.text.includes('}') && (
                    <button 
                      onClick={() => {
                        try {
                          const json = JSON.parse(msg.text.substring(msg.text.indexOf('{'), msg.text.lastIndexOf('}') + 1));
                          saveGeneratedLesson(json);
                        } catch(e) {}
                      }}
                      className="text-purple-600 flex items-center space-x-1"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span className="text-xs font-bold">Save Lesson</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <div className="bg-white ios-shadow p-4 rounded-2xl mr-auto rounded-tl-none flex space-x-1">
            <div className="w-2 h-2 bg-ios-gray/40 rounded-full animate-bounce" />
            <div className="w-2 h-2 bg-ios-gray/40 rounded-full animate-bounce [animation-delay:0.2s]" />
            <div className="w-2 h-2 bg-ios-gray/40 rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3 bg-white/90 ios-blur border-t safe-area-bottom">
        <div className="flex items-center space-x-2">
          <div className="flex-1 relative">
            <input 
              value={isAIPracticeOpen ? aiMessage : inputText}
              onChange={(e) => isAIPracticeOpen ? setAiMessage(e.target.value) : setInputText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type in Portuguese..."
              className="w-full bg-ios-bg pl-4 pr-10 py-2.5 rounded-2xl outline-none text-sm border border-ios-bg focus:border-ios-blue/30 transition-all"
            />
            <button 
              type="button"
              onClick={toggleRecording}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all active:scale-95",
                isRecording ? "bg-red-500 text-white animate-pulse" : "text-ios-gray hover:text-ios-blue"
              )}
            >
              <Mic className="w-4 h-4" />
            </button>
          </div>
          <button 
            onClick={handleSendMessage}
            disabled={!(isAIPracticeOpen ? aiMessage.trim() : inputText.trim())}
            className="p-2.5 bg-ios-blue text-white rounded-full disabled:opacity-50 shadow-sm active:scale-95 transition-all"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="p-6 space-y-8 overflow-y-auto h-full pb-32">
      <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
      
      <div className="bg-white p-6 rounded-3xl ios-shadow flex flex-col items-center space-y-4">
        <div className="w-24 h-24 bg-ios-blue/10 rounded-full flex items-center justify-center text-ios-blue">
          <UserIcon className="w-12 h-12" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold">{user.email}</h2>
          <p className="text-ios-gray">Member since 2026</p>
          <div className="mt-4 flex items-center justify-center space-x-4">
            <div className="bg-ios-bg px-4 py-2 rounded-2xl">
              <p className="text-[10px] uppercase tracking-wider font-bold text-ios-gray">Time Spent</p>
              <p className="text-lg font-bold text-ios-blue">
                {Math.floor(((profile?.total_time_spent || 0) + totalTimeInSeconds) / 60)}m
              </p>
            </div>
            <div className="bg-ios-bg px-4 py-2 rounded-2xl">
              <p className="text-[10px] uppercase tracking-wider font-bold text-ios-gray">Streak</p>
              <p className="text-lg font-bold text-orange-500">{profile?.streak || 0}d</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl ios-shadow space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Volume2 className="w-5 h-5 mr-3 text-ios-blue" />
            <span className="font-bold">Audio Speed</span>
          </div>
          <span className="text-sm font-bold text-ios-blue">{playbackSpeed}x</span>
        </div>
        <input 
          type="range" 
          min="0.5" 
          max="1.5" 
          step="0.1" 
          value={playbackSpeed} 
          onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
          className="w-full accent-ios-blue"
        />
        <div className="flex justify-between text-[10px] font-bold text-ios-gray uppercase tracking-widest">
          <span>Slower</span>
          <span>Normal</span>
          <span>Faster</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl ios-shadow overflow-hidden space-y-px">
        {profile?.role === 'admin' && (
          <button 
            onClick={() => setIsAdminMode(!isAdminMode)}
            className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
          >
            <div className="flex items-center">
              <Shield className={cn("w-5 h-5 mr-3", isAdminMode ? "text-ios-blue" : "text-ios-gray")} />
              Admin Mode
            </div>
            <div className={cn(
              "w-10 h-5 rounded-full transition-colors relative",
              isAdminMode ? "bg-ios-blue" : "bg-ios-gray/20"
            )}>
              <div className={cn(
                "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                isAdminMode ? "right-0.5" : "left-0.5"
              )} />
            </div>
          </button>
        )}

        {isAdminMode && profile?.role === 'admin' && (
          <div className="p-4 bg-purple-50 space-y-4 border-b border-ios-bg">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="font-bold text-xs text-purple-800">Global Voice Limit</p>
                <p className="text-[10px] text-purple-600">Daily free messages for users</p>
              </div>
              <div className="flex items-center space-x-3 bg-white p-1 rounded-xl border border-purple-100">
                <button 
                  onClick={() => setGlobalVoiceLimit(Math.max(0, globalVoiceLimit - 1))}
                  className="w-8 h-8 flex items-center justify-center text-purple-600 font-bold hover:bg-purple-50 rounded-lg transition-colors"
                >-</button>
                <span className="font-bold text-purple-800 w-6 text-center text-sm">{globalVoiceLimit}</span>
                <button 
                  onClick={() => setGlobalVoiceLimit(globalVoiceLimit + 1)}
                  className="w-8 h-8 flex items-center justify-center text-purple-600 font-bold hover:bg-purple-50 rounded-lg transition-colors"
                >+</button>
              </div>
            </div>
          </div>
        )}
        {deferredPrompt && (
          <button 
            onClick={handleInstallClick} 
            className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
          >
            <div className="flex items-center">
              <Download className="w-5 h-5 mr-3" />
              Install App
            </div>
            <ChevronRight className="w-4 h-4 text-ios-gray" />
          </button>
        )}
        <button 
          onClick={() => setIsTutorSelectionOpen(true)} 
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <Users className="w-5 h-5 mr-3" />
            Switch AI Tutor
          </div>
          <div className="flex items-center">
            <span className="text-xs text-ios-gray mr-2">
              {TUTORS.find(t => t.id === profile?.selected_tutor_id)?.name || 'Maria'}
            </span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
        <button 
          onClick={() => setIsSupportModalOpen(true)}
          className="w-full p-4 flex items-center text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <LifeBuoy className="w-5 h-5 mr-3 text-ios-blue" />
          Support & Feedback
        </button>

        <button 
          onClick={() => setIsUserManualOpen(true)} 
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <BookOpen className="w-5 h-5 mr-3" />
            User Manual
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button 
          onClick={() => { setShowTutorial(true); setTutorialStep(0); }} 
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <Sparkles className="w-5 h-5 mr-3" />
            App Tutorial
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button 
          onClick={() => setAuthMode('updatePassword')} 
          className="w-full p-4 flex items-center justify-between text-ios-blue font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <div className="flex items-center">
            <Lock className="w-5 h-5 mr-3" />
            Change Password
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button 
          onClick={() => {
            setConfirmModal({
              isOpen: true,
              title: "Delete Account?",
              message: "Are you sure you want to delete your account and all associated data? This action cannot be undone.",
              confirmText: "Delete Everything",
              cancelText: "Keep My Account",
              isDestructive: true,
              onConfirm: () => {
                supabase?.auth.admin.deleteUser(user.id).then(({ error }) => {
                  if (error) showToast(error.message, "error");
                  else {
                    showToast("Account deleted", "success");
                    handleLogout();
                  }
                });
              }
            });
          }}
          className="w-full p-4 flex items-center text-red-500 font-medium active:bg-ios-bg border-b border-ios-bg"
        >
          <Trash2 className="w-5 h-5 mr-3" />
          Delete Account & Data
        </button>

        <button onClick={handleLogout} className="w-full p-4 flex items-center justify-between text-red-500 font-medium active:bg-ios-bg">
          <div className="flex items-center">
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </div>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen max-w-md mx-auto bg-ios-bg border-x relative overflow-hidden">
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">{renderHome()}</motion.div>}
          {activeTab === 'learning' && <motion.div key="learning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">{renderLearning()}</motion.div>}
          {activeTab === 'chat' && <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">{renderChat()}</motion.div>}
          {activeTab === 'settings' && <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">{renderSettings()}</motion.div>}
        </AnimatePresence>
      </main>

      {/* AI Practice Modal */}
      <AnimatePresence>
        {isAIPracticeOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-lg h-[98vh] rounded-t-[32px] sm:rounded-[40px] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-ios-bg flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-12 h-12 rounded-full bg-ios-blue flex items-center justify-center text-white mr-4 overflow-hidden shadow-sm">
                    <img 
                      src={TUTORS.find(t => t.id === profile?.selected_tutor_id)?.avatar || TUTORS[0].avatar} 
                      alt="AI Tutor" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">AI {TUTORS.find(t => t.id === profile?.selected_tutor_id)?.name || 'Maria'} Tutor</h2>
                    <p className="text-xs text-ios-gray font-medium">Practicing: {learningPlan[selectedMonth-1].title}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => {
                      setIsHelpMode(!isHelpMode);
                      if (!isHelpMode) {
                        setChatHistory(prev => [...prev, { role: 'model', text: "Olá! I'm in Help Mode now. How can I help you navigate FalaMadeira? I can explain the Dashboard, Curriculum, or how to use the AI Tutor." }]);
                      }
                    }}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      isHelpMode ? "bg-orange-100 text-orange-600" : "bg-ios-bg text-ios-gray"
                    )}
                    title="Get Help"
                  >
                    <HelpCircle className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      isSoundEnabled ? "bg-ios-blue/10 text-ios-blue" : "bg-ios-bg text-ios-gray"
                    )}
                  >
                    {isSoundEnabled ? <Volume2 className="w-5 h-5" /> : <X className="w-5 h-5" />}
                  </button>
                  <button 
                    onClick={closeAIPractice}
                    className="p-2 bg-ios-bg rounded-full active:scale-95 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                {chatHistory.length === 0 && (
                  <div className="text-center py-12 space-y-4">
                    <div className="w-16 h-16 bg-ios-blue/10 text-ios-blue rounded-full flex items-center justify-center mx-auto">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <p className="text-sm text-ios-gray px-8">
                      Olá! I'm {TUTORS.find(t => t.id === profile?.selected_tutor_id)?.name || 'Maria'}. Let's practice some Portuguese from Month {selectedMonth}. I'll guide you through today's lesson!
                    </p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={`history-${i}`} className={cn(
                    "flex items-start space-x-2",
                    msg.role === 'user' ? "flex-row-reverse space-x-reverse" : "flex-row"
                  )}>
                    <div className={cn(
                      "max-w-[96%] p-5 rounded-2xl text-sm relative group break-words transition-all duration-300",
                      msg.role === 'user' ? "bg-ios-blue text-white rounded-tr-none" : "bg-ios-bg text-black rounded-tl-none",
                      currentlySpeakingIndex === i && msg.role === 'model' ? "ring-2 ring-ios-blue ring-offset-2 scale-[1.02] shadow-lg" : ""
                    )}>
                      <div className="markdown-body">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                      {msg.role === 'model' && (
                        <button 
                          onClick={() => playMessageInChunks(msg.text, i)}
                          className={cn(
                            "absolute -right-10 top-0 p-2 bg-ios-bg rounded-full transition-all text-ios-blue shadow-sm",
                            currentlySpeakingIndex === i ? "opacity-100 scale-110" : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          <Volume2 className={cn("w-4 h-4", currentlySpeakingIndex === i && "animate-pulse")} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {isAiLoading && (
                  <div className="flex flex-col items-start space-y-2">
                    <div className="bg-ios-bg p-4 rounded-2xl rounded-tl-none flex space-x-1">
                      <div className="w-1.5 h-1.5 bg-ios-gray rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-ios-gray rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-ios-gray rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                    <p className="text-[10px] text-ios-gray font-medium ml-1 animate-pulse">Tutor is preparing your lesson...</p>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleAIPractice} className="p-4 bg-ios-bg/30 border-t">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 relative">
                    <input 
                      type="text"
                      value={aiMessage}
                      onChange={(e) => setAiMessage(e.target.value)}
                      placeholder="Type in Portuguese..."
                      className="w-full p-3 bg-white rounded-2xl outline-none text-sm shadow-sm border border-transparent focus:border-ios-blue/30 transition-all"
                    />
                    <button
                      type="button"
                      onClick={toggleRecording}
                      className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all active:scale-95",
                        isRecording ? "bg-red-500 text-white animate-pulse" : "text-ios-gray hover:text-ios-blue"
                      )}
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  </div>
                  <button 
                    type="submit"
                    disabled={isAiLoading || isRecording || !aiMessage.trim()}
                    className="p-3 bg-ios-blue text-white rounded-2xl shadow-md active:scale-95 transition-all disabled:opacity-50"
                  >
                    <SendIcon className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unlock Level Modal */}
      <AnimatePresence>
        {isUnlockModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-ios-bg flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Key className="w-5 h-5 text-ios-blue" />
                  <h2 className="text-xl font-bold">Unlock Level</h2>
                </div>
                <button onClick={() => setIsUnlockModalOpen(false)} className="p-2 bg-ios-bg rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-ios-gray leading-relaxed">
                  Enter your access key to unlock Month { (profile?.unlocked_level || 1) + 1 } and all its lessons.
                </p>
                
                <div className="bg-ios-bg/50 p-4 rounded-2xl space-y-2">
                  <h3 className="text-[10px] font-bold text-ios-gray uppercase">Level Guide</h3>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="flex items-center space-x-1">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      <span className="text-ios-gray">L1: Absolute Beginner</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                      <span className="text-ios-gray">L2: Beginner</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                      <span className="text-ios-gray">L3: Elementary</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                      <span className="text-ios-gray">L4: Pre-Intermediate</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-ios-gray italic">
                    Levels are unlocked sequentially using access keys provided by your instructor or through progress.
                  </p>
                </div>

                <div className="space-y-2">
                  <input 
                    value={unlockKey}
                    onChange={(e) => setUnlockKey(e.target.value)}
                    placeholder="Enter Key..."
                    className="w-full bg-ios-bg p-4 rounded-2xl outline-none text-sm border-2 border-transparent focus:border-ios-blue transition-all"
                  />
                  <p className="text-[10px] text-ios-gray text-center">
                    Demo Key: <span className="font-bold">MADEIRA2026</span>
                  </p>
                </div>
                <button 
                  onClick={handleUnlockLevel}
                  className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-[0.98] transition-all"
                >
                  Unlock Level
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isRequestModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-ios-bg flex items-center justify-between">
                <h2 className="text-xl font-bold">Request Lesson</h2>
                <button onClick={() => setIsRequestModalOpen(false)} className="p-2 bg-ios-bg rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleRequestLesson} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-ios-gray uppercase ml-1">Theme / Subject</label>
                  <input 
                    type="text"
                    value={requestTheme}
                    onChange={(e) => setRequestTheme(e.target.value)}
                    placeholder="e.g., Wine Tasting, Football..."
                    className="w-full p-4 bg-ios-bg rounded-2xl outline-none text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-ios-gray uppercase ml-1">Description</label>
                  <textarea 
                    value={requestDesc}
                    onChange={(e) => setRequestDesc(e.target.value)}
                    placeholder="What would you like to learn?"
                    className="w-full p-4 bg-ios-bg rounded-2xl outline-none text-sm h-32 resize-none"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
                >
                  Submit Request
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tutor Selection Modal */}
      <AnimatePresence>
        {isTutorSelectionOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-md h-[80vh] rounded-t-[40px] sm:rounded-[40px] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-ios-bg flex items-center justify-between">
                <h2 className="text-xl font-bold">Choose Your Tutor</h2>
                <button onClick={() => setIsTutorSelectionOpen(false)} className="p-2 bg-ios-bg rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                {TUTORS.map((t) => (
                  <button 
                    key={t.id}
                    onClick={() => handleSelectTutor(t.id)}
                    className={cn(
                      "w-full p-4 rounded-3xl flex items-center space-x-4 transition-all border-2",
                      profile?.selected_tutor_id === t.id ? "border-ios-blue bg-ios-blue/5" : "border-transparent bg-ios-bg"
                    )}
                  >
                    <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 shadow-sm">
                      <img src={t.avatar} alt={t.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="text-left flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold">{t.name}, {t.age}</h3>
                        {profile?.selected_tutor_id === t.id && <CheckCircle2 className="w-5 h-5 text-ios-blue" />}
                      </div>
                      <p className="text-xs text-ios-gray line-clamp-2">{t.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="h-20 bg-white/80 ios-blur border-t flex items-center justify-around safe-area-bottom z-20">
        <button 
          onClick={() => {
            console.log('Nav: home');
            setActiveTab('home');
          }}
          className={cn("flex flex-col items-center space-y-1", activeTab === 'home' ? "text-ios-blue" : "text-ios-gray")}
        >
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Home</span>
        </button>
        <button 
          onClick={() => {
            console.log('Nav: learning');
            setActiveTab('learning');
          }}
          className={cn("flex flex-col items-center space-y-1", activeTab === 'learning' ? "text-ios-blue" : "text-ios-gray")}
        >
          <BookOpen className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Learning</span>
        </button>
        <button 
          onClick={() => {
            console.log('Nav: chat');
            setActiveTab('chat');
          }}
          className={cn("flex flex-col items-center space-y-1", activeTab === 'chat' ? "text-ios-blue" : "text-ios-gray")}
        >
          <MessageCircle className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Tutor</span>
        </button>
        <button 
          onClick={() => {
            console.log('Nav: settings');
            setActiveTab('settings');
          }}
          className={cn("flex flex-col items-center space-y-1", activeTab === 'settings' ? "text-ios-blue" : "text-ios-gray")}
        >
          <Settings className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase">Profile</span>
        </button>
      </nav>

      <AnimatePresence>
        {isVocabModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[32px] overflow-hidden flex flex-col ios-shadow"
            >
              <div className="p-6 border-b border-ios-bg flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight">Vocabulary Lookup</h2>
                <button 
                  onClick={() => {
                    setIsVocabModalOpen(false);
                    setVocabResult(null);
                    setVocabQuery('');
                  }}
                  className="p-2 bg-ios-bg rounded-full active:scale-95 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <form onSubmit={handleVocabLookup} className="space-y-4">
                  <div className="relative">
                    <input 
                      value={vocabQuery}
                      onChange={(e) => setVocabQuery(e.target.value)}
                      placeholder="Enter a word or phrase..."
                      className="w-full bg-ios-bg p-4 rounded-2xl outline-none text-sm pr-12"
                    />
                    <button 
                      type="submit"
                      disabled={isVocabLoading}
                      className="absolute right-2 top-2 p-2 bg-ios-blue text-white rounded-xl disabled:opacity-50"
                    >
                      {isVocabLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Search className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </form>

                {vocabResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4 p-4 bg-ios-bg rounded-2xl"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-bold text-ios-blue">{vocabQuery}</h3>
                        <p className="text-sm font-medium">{vocabResult.translation}</p>
                      </div>
                      <button 
                        onClick={() => playSpeech(vocabQuery)}
                        className="p-2 bg-white rounded-xl text-ios-blue shadow-sm active:scale-95 transition-transform"
                      >
                        <Volume2 className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-xs text-ios-gray font-bold uppercase tracking-widest">Explanation</p>
                      <p className="text-sm leading-relaxed">{vocabResult.explanation}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs text-ios-gray font-bold uppercase tracking-widest">Example</p>
                      <div className="bg-white p-3 rounded-xl border border-ios-blue/10">
                        <p className="text-sm font-bold italic">"{vocabResult.example_pt}"</p>
                        <p className="text-xs text-ios-gray mt-1">{vocabResult.example_en}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {!vocabResult && !isVocabLoading && (
                  <div className="text-center py-8 space-y-3">
                    <div className="w-16 h-16 bg-ios-blue/5 text-ios-blue/30 rounded-full flex items-center justify-center mx-auto">
                      <Search className="w-8 h-8" />
                    </div>
                    <p className="text-sm text-ios-gray px-8">
                      Type any Portuguese word or phrase to get an AI-powered translation and Madeiran context.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
        {isCorrectionModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[32px] overflow-hidden flex flex-col ios-shadow"
            >
              <div className="p-6 border-b border-ios-bg flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight">Report Correction</h2>
                <button 
                  onClick={() => {
                    setIsCorrectionModalOpen(false);
                    setCorrectionText('');
                  }}
                  className="p-2 bg-ios-bg rounded-full active:scale-95 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <p className="text-sm text-ios-gray">
                    Found an error in this lesson? Please describe the correction below. Our team will review it.
                  </p>
                  <textarea 
                    value={correctionText}
                    onChange={(e) => setCorrectionText(e.target.value)}
                    placeholder="Describe the correction needed..."
                    className="w-full bg-ios-bg p-4 rounded-2xl outline-none text-sm min-h-[120px] resize-none"
                  />
                </div>

                <div className="flex space-x-3">
                  <button 
                    onClick={() => {
                      setIsCorrectionModalOpen(false);
                      setCorrectionText('');
                    }}
                    className="flex-1 py-4 bg-ios-bg text-ios-gray rounded-2xl font-bold active:scale-95 transition-transform"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSubmitCorrection}
                    disabled={isCorrectionLoading || !correctionText.trim()}
                    className="flex-1 py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {isCorrectionLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                    ) : (
                      "Submit"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Support Modal */}
      <AnimatePresence>
        {isSupportModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[40px] overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-ios-bg flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight">Support & Feedback</h2>
                <button onClick={() => setIsSupportModalOpen(false)} className="p-2 bg-ios-bg rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto">
                <div className="space-y-4">
                  <div className="p-4 bg-ios-blue/5 rounded-2xl border border-ios-blue/10">
                    <p className="text-sm text-ios-blue font-medium">
                      Need help or found a bug? Open a ticket or send us your app logs to help us investigate.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ios-gray uppercase tracking-wider ml-1">Subject</label>
                    <input 
                      type="text"
                      value={supportSubject}
                      onChange={(e) => setSupportSubject(e.target.value)}
                      placeholder="e.g., Audio not playing"
                      className="w-full p-4 bg-ios-bg rounded-2xl outline-none text-sm border border-transparent focus:border-ios-blue/30 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ios-gray uppercase tracking-wider ml-1">Description</label>
                    <textarea 
                      value={supportDescription}
                      onChange={(e) => setSupportDescription(e.target.value)}
                      placeholder="Please describe the issue in detail..."
                      rows={4}
                      className="w-full p-4 bg-ios-bg rounded-2xl outline-none text-sm border border-transparent focus:border-ios-blue/30 transition-all resize-none"
                    />
                  </div>

                  <button 
                    onClick={handleOpenTicket}
                    disabled={isSubmittingSupport}
                    className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSubmittingSupport ? "Submitting..." : "Submit Ticket"}
                  </button>
                </div>

                <div className="pt-6 border-t border-ios-bg space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm">Diagnostic Logs</h3>
                      <p className="text-xs text-ios-gray">Help us fix issues faster by sharing app state</p>
                    </div>
                    <button 
                      onClick={handleCollectLogs}
                      className="px-4 py-2 bg-ios-bg text-ios-blue rounded-xl text-xs font-bold active:scale-95 transition-all"
                    >
                      Send Logs
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Manual Modal */}
        <AnimatePresence>
          {isUserManualOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-md h-[80vh] rounded-[32px] overflow-hidden flex flex-col ios-shadow"
              >
                <div className="p-6 border-b border-ios-bg flex items-center justify-between">
                  <h2 className="text-xl font-bold tracking-tight">User Manual</h2>
                  <button onClick={() => setIsUserManualOpen(false)} className="p-2 bg-ios-bg rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
                  <div className="space-y-6">
                    <section className="space-y-2">
                      <h3 className="text-ios-blue font-bold text-lg">The Learning Philosophy</h3>
                      <p className="text-sm text-ios-gray leading-relaxed">
                        FalaMadeira isn't just about grammar; it's about **culture and connection**. Our curriculum is designed to take you from zero to conversational in 6 months, focusing on the specific phonetic nuances and vocabulary of the Madeira archipelago.
                      </p>
                    </section>

                    <section className="space-y-2">
                      <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Your Daily Ritual</h4>
                      <ul className="space-y-3">
                        <li className="flex items-start space-x-3">
                          <div className="w-5 h-5 bg-ios-blue/10 rounded-full flex items-center justify-center text-ios-blue mt-0.5">
                            <Check className="w-3 h-3" />
                          </div>
                          <p className="text-sm text-ios-gray flex-1">**The Dashboard:** Every day, you'll see a featured lesson. We recommend following the sequence.</p>
                        </li>
                        <li className="flex items-start space-x-3">
                          <div className="w-5 h-5 bg-ios-blue/10 rounded-full flex items-center justify-center text-ios-blue mt-0.5">
                            <Check className="w-3 h-3" />
                          </div>
                          <p className="text-sm text-ios-gray flex-1">**Streak & XP:** Consistency is key. Your streak tracks consecutive days of practice.</p>
                        </li>
                      </ul>
                    </section>

                    <section className="space-y-2">
                      <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">AI Practice: Your 24/7 Tutor</h4>
                      <p className="text-sm text-ios-gray leading-relaxed">
                        This is the heart of FalaMadeira. Speak naturally using the microphone icon. Your tutor knows exactly which lesson you're on and will guide you through the specific patterns of that day.
                      </p>
                    </section>

                    <section className="space-y-2">
                      <h4 className="font-bold text-sm uppercase tracking-wider text-ios-gray">Premium Benefits</h4>
                      <div className="p-4 bg-gradient-to-br from-ios-blue/5 to-ios-blue/10 rounded-2xl border border-ios-blue/10">
                        <ul className="space-y-2">
                          <li className="text-xs font-medium text-ios-blue flex items-center space-x-2">
                            <Sparkles className="w-3 h-3" />
                            <span>Unlimited Voice Practice</span>
                          </li>
                          <li className="text-xs font-medium text-ios-blue flex items-center space-x-2">
                            <Sparkles className="w-3 h-3" />
                            <span>Advanced Dialect Training</span>
                          </li>
                        </ul>
                      </div>
                    </section>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tutorial Overlay */}
        <AnimatePresence>
          {showTutorial && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-sm rounded-[40px] p-10 space-y-8 text-center ios-shadow border border-ios-bg"
              >
                <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 bg-ios-blue/10 rounded-[32px] blur-xl animate-pulse" />
                  <div className="relative w-24 h-24 bg-white text-ios-blue rounded-[32px] flex items-center justify-center shadow-xl border border-ios-bg">
                    {tutorialStep === 0 && <Sparkles className="w-12 h-12" />}
                    {tutorialStep === 1 && <Home className="w-12 h-12" />}
                    {tutorialStep === 2 && <BookOpen className="w-12 h-12" />}
                    {tutorialStep === 3 && <Mic className="w-12 h-12" />}
                    {tutorialStep === 4 && <Settings className="w-12 h-12" />}
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h2 className="text-3xl font-bold tracking-tight text-ios-blue">
                    {tutorialStep === 0 && "Welcome"}
                    {tutorialStep === 1 && "Dashboard"}
                    {tutorialStep === 2 && "Curriculum"}
                    {tutorialStep === 3 && "AI Tutor"}
                    {tutorialStep === 4 && "Settings"}
                  </h2>
                  <p className="text-base text-ios-gray leading-relaxed px-2">
                    {tutorialStep === 0 && "Welcome to FalaMadeira. Let's take a quick tour of your new language learning companion."}
                    {tutorialStep === 1 && "Your daily hub. Track your streak, earn XP, and jump straight into today's lesson."}
                    {tutorialStep === 2 && "A structured 6-month roadmap. Complete quizzes to unlock new challenges and master the dialect."}
                    {tutorialStep === 3 && "The heart of the app. Speak naturally with our AI tutors to perfect your pronunciation."}
                    {tutorialStep === 4 && "Choose your tutor, adjust playback speed, and manage your profile with ease."}
                  </p>
                </div>
                
                <div className="flex flex-col space-y-3 pt-4">
                  <button 
                    onClick={() => {
                      if (tutorialStep < 4) {
                        setTutorialStep(prev => prev + 1);
                      } else {
                        setShowTutorial(false);
                      }
                    }}
                    className="w-full py-5 bg-ios-blue text-white rounded-3xl font-bold text-lg shadow-xl shadow-ios-blue/20 active:scale-95 transition-all"
                  >
                    {tutorialStep < 4 ? "Continue" : "Start Learning"}
                  </button>
                  {tutorialStep > 0 && (
                    <button 
                      onClick={() => setTutorialStep(prev => prev - 1)}
                      className="w-full py-4 text-ios-gray font-bold text-sm active:scale-95 transition-all"
                    >
                      Go Back
                    </button>
                  )}
                </div>
                
                <div className="flex justify-center space-x-1.5 pt-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        tutorialStep === i ? "w-6 bg-ios-blue" : "w-1.5 bg-ios-bg"
                      )} 
                    />
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upgrade Modal */}
      <AnimatePresence>
        {isUpgradeModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-6 bg-gradient-to-br from-ios-blue to-blue-600 text-white relative">
                <button 
                  onClick={() => setIsUpgradeModalOpen(false)}
                  className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold">Unlock Premium</h2>
                <p className="text-blue-100 text-sm">Level up your Portuguese with unlimited voice practice.</p>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                      <Check className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">Unlimited Voice Practice</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                      <Check className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">Advanced Madeiran Dialect Training</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                      <Check className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">Custom Learning Paths</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => {
                      showToast("Redirecting to Stripe...", "success");
                      // In a real app, you'd call a backend to create a Stripe session
                    }}
                    className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg shadow-ios-blue/20 active:scale-95 transition-all"
                  >
                    Upgrade Now - €9.99/mo
                  </button>
                  <p className="text-[10px] text-center text-ios-gray">
                    Secure payment via Stripe. Cancel anytime.
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
        <AnimatePresence>
          {isSuggestionModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-sm rounded-[32px] p-6 space-y-6 ios-shadow"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold tracking-tight">Suggest a Video</h2>
                  <button onClick={() => setIsSuggestionModalOpen(false)} className="p-2 bg-ios-bg rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">YouTube URL</label>
                    <input 
                      type="text" 
                      value={suggestionUrl}
                      onChange={(e) => setSuggestionUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full p-4 bg-ios-bg rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ios-gray uppercase tracking-wider">Note (Optional)</label>
                    <textarea 
                      value={suggestionNote}
                      onChange={(e) => setSuggestionNote(e.target.value)}
                      placeholder="Why is this video good for this lesson?"
                      className="w-full p-4 bg-ios-bg rounded-2xl text-sm h-24 focus:outline-none focus:ring-2 focus:ring-ios-blue/20 resize-none"
                    />
                  </div>
                </div>
                
                <button 
                  onClick={handleSuggestVideo}
                  className="w-full py-4 bg-ios-blue text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-transform"
                >
                  Submit Suggestion
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Admin Panel (Simplified) */}
        <AnimatePresence>
          {isAdminMode && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-24 left-6 right-6 z-40 bg-white rounded-3xl p-6 ios-shadow border-2 border-ios-blue"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold flex items-center">
                  <Lock className="w-4 h-4 mr-2 text-ios-blue" />
                  Admin Panel
                </h2>
                <button onClick={() => setIsAdminMode(false)} className="text-xs font-bold text-ios-gray">Close</button>
              </div>
              
              <div className="space-y-4 max-h-64 overflow-y-auto no-scrollbar">
                <h3 className="text-xs font-bold text-ios-gray uppercase">Pending Video Suggestions</h3>
                {videoSuggestions.filter(s => s.status === 'pending').length === 0 ? (
                  <p className="text-xs text-ios-gray italic">No pending suggestions</p>
                ) : (
                  videoSuggestions.filter(s => s.status === 'pending').map(suggestion => (
                    <div key={suggestion.id} className="p-3 bg-ios-bg rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-ios-blue">Lesson: {lessons.find(l => l.id === suggestion.lesson_id)?.title}</span>
                        <div className="flex space-x-2">
                          <button onClick={() => handleApproveSuggestion(suggestion)} className="p-1 bg-green-100 text-green-600 rounded">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleRejectSuggestion(suggestion)} className="p-1 bg-red-100 text-red-600 rounded">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] truncate">{suggestion.video_url}</p>
                      {suggestion.note && <p className="text-[10px] text-ios-gray italic">"{suggestion.note}"</p>}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {isQuizOpen && selectedLesson && (
          <Quiz 
            lesson={selectedLesson}
            onComplete={(score) => {
              showToast(`Quiz completed! Score: ${score}`, "success");
              setIsQuizOpen(false);
              // Mark lesson as completed if score is good?
              if (score >= 3) {
                const updatedCompleted = [...(profile?.completed_lessons || []), selectedLesson.id];
                setProfile(prev => ({ ...prev!, completed_lessons: updatedCompleted }));
                if (supabase && user) {
                  supabase.from('profiles').update({ completed_lessons: updatedCompleted }).eq('id', user.id).then(({ error }) => {
                    if (error) handleSupabaseError(error, 'updateCompletedLessons', 'profiles');
                  });
                }
              }
            }}
            onClose={() => setIsQuizOpen(false)}
            playSpeech={(text) => playSpeech(text)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmModal.isOpen && (
          <ConfirmationModal 
            isOpen={confirmModal.isOpen}
            onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            onConfirm={confirmModal.onConfirm}
            title={confirmModal.title}
            message={confirmModal.message}
            confirmText={confirmModal.confirmText}
            cancelText={confirmModal.cancelText}
            isDestructive={confirmModal.isDestructive}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white text-sm font-bold shadow-xl z-50",
              toast.type === 'success' ? "bg-green-500" : "bg-red-500"
            )}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}
