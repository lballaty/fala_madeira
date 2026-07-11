// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/data/lessons.ts
// Description: Static seed lesson content (56 lessons, Months 1-2) extracted verbatim from App.tsx. Interim structure; later phase loads this as DB seed content.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { Lesson } from '../types';

export const INITIAL_LESSONS: Lesson[] = [
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
    // Replaced dead S2_YmG_l-p4 (404) with the oEmbed-verified EU-PT greetings video
    // curated for sit-d1 in the content pack (author-tracks step).
    video_url: 'https://www.youtube.com/watch?v=pgC1ofHxm7s'
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
    // Replaced dead S2_YmG_l-p4 (404) with the oEmbed-verified EU-PT describing-people
    // video curated for sit-d15 in the content pack (author-tracks step).
    video_url: 'https://www.youtube.com/watch?v=6F1ld7zv7yM'
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
